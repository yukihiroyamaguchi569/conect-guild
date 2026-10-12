import type { CollectorFailureKind } from '@conect-guild/snapshot';
import { shallowRef, type Ref } from 'vue';
import { loadCollectorStatus, type CollectorStatusRead } from '../adapters/collectorStatus';
import { defaultExpectedRepo, loadSnapshot, type SnapshotLoadResult } from '../adapters/snapshot';
import { createCollectorWatch, type CollectorWatch, type ConsoleSink } from './collectorWatch';
import { createDemoSession, isDemoQuery, type DemoSession } from './demo';
import { REFRESH_INTERVAL_MS, type GuildStoreOptions } from './guildStore';
import { globalScheduler, type Cancel, type Scheduler } from './scheduler';

/**
 * Which screen the page shows (Issue #67):
 * - 'live': the collector's data at /snapshot.json
 * - 'demo': `?demo=1`, the fictional script after はじめる (Issue #49)
 * - 'auto-demo': the same script, started by itself, while /snapshot.json is not there yet (204:
 *   the collector has never run). /snapshot.json is still read in the background, and the page
 *   turns live as soon as it answers anything else.
 */
export type ScreenMode = 'live' | 'demo' | 'auto-demo';

export function initialScreenMode(search: string): ScreenMode {
  return isDemoQuery(search) ? 'demo' : 'live';
}

/**
 * True when a read of /snapshot.json during the automatic demo ends it. Only "not collected yet"
 * keeps the demo; anything else (a snapshot, or an error to show) is for the live screen.
 */
export function endsAutoDemo(result: SnapshotLoadResult): boolean {
  return result.ok || result.reason !== 'not-collected';
}

/**
 * The live store's options after the automatic demo: the read that ended it is its first result
 * (an error is shown, not read again and maybe lost), and the first snapshot is a new baseline
 * (an old stored one would bring a burst of events). None for the first live screen.
 */
export function liveGuildOptions(handoff: SnapshotLoadResult | null): GuildStoreOptions {
  return handoff === null ? {} : { firstResult: handoff, freshBaseline: true };
}

export interface ScreenModeOptions {
  /** The page's query (`location.search`). */
  readonly search: string;
  readonly loadSnapshot?: () => Promise<SnapshotLoadResult>;
  /** Reads /collector-status.json during the automatic demo (Issue #74). */
  readonly loadCollectorStatus?: () => Promise<CollectorStatusRead>;
  /** The browser console by default. */
  readonly console?: ConsoleSink;
  readonly scheduler?: Scheduler;
  /** How often /snapshot.json is read during the automatic demo; the live refresh by default. */
  readonly intervalMs?: number;
  readonly now?: () => number;
}

export interface ScreenModeState {
  readonly mode: Readonly<Ref<ScreenMode>>;
  /** The demo session of 'demo' and 'auto-demo'; null while live. A new one for each demo. */
  readonly demo: Readonly<Ref<DemoSession | null>>;
  /** The read that ended the automatic demo, for the live screen after it; else null. */
  readonly handoff: Readonly<Ref<SnapshotLoadResult | null>>;
  /** Bumped on every change of mode, so the screen is built anew (nothing carries over). */
  readonly generation: Readonly<Ref<number>>;
  /**
   * The collector's failure during the automatic demo, for its banner (Issue #74); null when it
   * has not run, succeeded, stopped long ago, or the page is not in the automatic demo.
   */
  readonly collectorFailure: Readonly<Ref<CollectorFailureKind | null>>;
  /**
   * The live screen found nothing collected before its first snapshot: the automatic demo starts.
   * Ignored unless live.
   */
  notCollected(): void;
  /** Stops reading /snapshot.json in the background. */
  dispose(): void;
}

/** Runs `task` every `ms`, skipping a beat while the last run is still going. */
function everyWithoutOverlap(scheduler: Scheduler, ms: number, task: () => Promise<void>): Cancel {
  let inFlight = false;
  return scheduler.every(ms, () => {
    if (inFlight) return;
    inFlight = true;
    void task().finally(() => {
      inFlight = false;
    });
  });
}

/** The collector's status, read during the automatic demo only (Issue #74). */
function collectorWatchFor(options: ScreenModeOptions, now: () => number): CollectorWatch {
  return createCollectorWatch({
    loadStatus: options.loadCollectorStatus ?? (() => loadCollectorStatus()),
    now,
    console: options.console ?? globalThis.console,
  });
}

export function createScreenMode(options: ScreenModeOptions): ScreenModeState {
  const load =
    options.loadSnapshot ?? (() => loadSnapshot({ expectedRepo: defaultExpectedRepo() }));
  const scheduler = options.scheduler ?? globalScheduler;
  const now = options.now ?? Date.now;
  const initial = initialScreenMode(options.search);
  const mode = shallowRef<ScreenMode>(initial);
  const demo = shallowRef<DemoSession | null>(initial === 'demo' ? createDemoSession(now) : null);
  const handoff = shallowRef<SnapshotLoadResult | null>(null);
  const generation = shallowRef(0);
  const collector = collectorWatchFor(options, now);
  let cancelWatch: Cancel | null = null;
  // Bumped when the watch stops, so a read in flight then cannot switch the screen.
  let watchGeneration = 0;

  function switchTo(
    next: ScreenMode,
    session: DemoSession | null,
    handed: SnapshotLoadResult | null = null,
  ): void {
    mode.value = next;
    demo.value = session;
    handoff.value = handed;
    generation.value += 1;
  }

  function stopWatch(): void {
    watchGeneration += 1;
    cancelWatch?.();
    cancelWatch = null;
    collector.stop();
  }

  function watchForSnapshot(): void {
    const started = watchGeneration;
    const intervalMs = options.intervalMs ?? REFRESH_INTERVAL_MS;
    cancelWatch = everyWithoutOverlap(scheduler, intervalMs, async () => {
      const result = await load();
      if (started !== watchGeneration) return;
      if (endsAutoDemo(result)) {
        stopWatch();
        switchTo('live', null, result);
        return;
      }
      // Still nothing collected: has the collector run and failed?
      // Not awaited: a status that does not answer must not hold up the next snapshot read.
      void collector.refresh();
    });
  }

  return {
    mode,
    demo,
    handoff,
    generation,
    collectorFailure: collector.failure,
    notCollected() {
      if (mode.value !== 'live') return;
      switchTo('auto-demo', createDemoSession(now, { auto: true }));
      void collector.start();
      watchForSnapshot();
    },
    dispose: stopWatch,
  };
}
