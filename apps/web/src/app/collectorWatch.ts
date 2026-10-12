import type { CollectorFailureKind, CollectorStatus } from '@conect-guild/snapshot';
import { shallowRef, type Ref } from 'vue';
import type { CollectorStatusRead } from '../adapters/collectorStatus';
import {
  AUTO_DEMO_NOTICE,
  collectorFailureNotice,
  collectorFailureOf,
} from '../domain/collectorStatus';

/** Where the hints go: the browser console. Never `error` (the E2E counts console errors). */
export interface ConsoleSink {
  info(text: string): void;
  warn(text: string): void;
}

export interface CollectorWatchOptions {
  readonly loadStatus: () => Promise<CollectorStatusRead>;
  readonly now: () => number;
  readonly console: ConsoleSink;
}

export interface CollectorWatch {
  /** The failure the automatic demo's banner shows; null for the banner as before. */
  readonly failure: Readonly<Ref<CollectorFailureKind | null>>;
  /** The automatic demo starts: one hint in the console, and a first read of the status. */
  start(): Promise<void>;
  /** Reads the status again; a warning goes to the console when the failure shown changes. */
  refresh(): Promise<void>;
  /** The automatic demo ends: forgets the status; a read in flight then changes nothing. */
  stop(): void;
}

/** The collector's status during the automatic demo (Issue #74). */
export function createCollectorWatch(options: CollectorWatchOptions): CollectorWatch {
  const failure = shallowRef<CollectorFailureKind | null>(null);
  let status: CollectorStatus | null = null;
  let generation = 0;

  function show(next: CollectorFailureKind | null): void {
    const notice = collectorFailureNotice(failure.value, next);
    if (notice !== null) options.console[notice.level](notice.text);
    failure.value = next;
  }

  async function refresh(): Promise<void> {
    const started = generation;
    const read = await options.loadStatus();
    if (started !== generation) return;
    // An unreadable status keeps the last one, so one bad read does not flicker the banner.
    if (read.kind === 'absent') status = null;
    else if (read.kind === 'status') status = read.status;
    show(collectorFailureOf(status, options.now()));
  }

  function stop(): void {
    generation += 1;
    status = null;
    failure.value = null;
  }

  return {
    failure,
    start() {
      stop();
      options.console[AUTO_DEMO_NOTICE.level](AUTO_DEMO_NOTICE.text);
      return refresh();
    },
    refresh,
    stop,
  };
}
