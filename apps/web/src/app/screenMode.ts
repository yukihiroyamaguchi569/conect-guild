import { shallowRef, type Ref } from 'vue';
import { defaultExpectedRepo, loadSnapshot, type SnapshotLoadResult } from '../adapters/snapshot';
import { createDemoSession, isDemoQuery, type DemoSession } from './demo';
import { REFRESH_INTERVAL_MS } from './guildStore';
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

export interface ScreenModeOptions {
  /** The page's query (`location.search`). */
  readonly search: string;
  readonly loadSnapshot?: () => Promise<SnapshotLoadResult>;
  readonly scheduler?: Scheduler;
  /** How often /snapshot.json is read during the automatic demo; the live refresh by default. */
  readonly intervalMs?: number;
  readonly now?: () => number;
}

export interface ScreenModeState {
  readonly mode: Readonly<Ref<ScreenMode>>;
  /** The demo session of 'demo' and 'auto-demo'; null while live. A new one for each demo. */
  readonly demo: Readonly<Ref<DemoSession | null>>;
  /** Bumped on every change of mode, so the screen is built anew (nothing carries over). */
  readonly generation: Readonly<Ref<number>>;
  /**
   * The live screen found nothing collected before its first snapshot: the automatic demo starts.
   * Ignored unless live.
   */
  notCollected(): void;
  /** Stops reading /snapshot.json in the background. */
  dispose(): void;
}

export function createScreenMode(options: ScreenModeOptions): ScreenModeState {
  const load =
    options.loadSnapshot ?? (() => loadSnapshot({ expectedRepo: defaultExpectedRepo() }));
  const scheduler = options.scheduler ?? globalScheduler;
  const now = options.now ?? Date.now;
  const initial = initialScreenMode(options.search);
  const mode = shallowRef<ScreenMode>(initial);
  const demo = shallowRef<DemoSession | null>(initial === 'demo' ? createDemoSession(now) : null);
  const generation = shallowRef(0);
  let cancelWatch: Cancel | null = null;
  // Bumped when the watch stops, so a read in flight then cannot switch the screen.
  let watchGeneration = 0;

  function switchTo(next: ScreenMode, session: DemoSession | null): void {
    mode.value = next;
    demo.value = session;
    generation.value += 1;
  }

  function stopWatch(): void {
    watchGeneration += 1;
    cancelWatch?.();
    cancelWatch = null;
  }

  function watchForSnapshot(): void {
    const started = watchGeneration;
    let inFlight = false;
    cancelWatch = scheduler.every(options.intervalMs ?? REFRESH_INTERVAL_MS, () => {
      if (inFlight) return;
      inFlight = true;
      void load()
        .then((result) => {
          if (started !== watchGeneration || !endsAutoDemo(result)) return;
          stopWatch();
          switchTo('live', null);
        })
        .finally(() => {
          inFlight = false;
        });
    });
  }

  return {
    mode,
    demo,
    generation,
    notCollected() {
      if (mode.value !== 'live') return;
      switchTo('auto-demo', createDemoSession(now, { auto: true }));
      watchForSnapshot();
    },
    dispose: stopWatch,
  };
}
