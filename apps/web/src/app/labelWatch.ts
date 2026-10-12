import type { CollectorStatus } from '@conect-guild/snapshot';
import { shallowRef, type Ref } from 'vue';
import type { CollectorStatusRead } from '../adapters/collectorStatus';
import { missingLabelsOf, sameMissingLabels, type MissingLabel } from '../domain/missingLabels';
import type { Cancel, Scheduler } from './scheduler';

export interface LabelWatchOptions {
  readonly loadStatus: () => Promise<CollectorStatusRead>;
  readonly now: () => number;
  readonly scheduler: Scheduler;
  readonly intervalMs: number;
}

export interface LabelWatch {
  /** The department labels the repository lacks, for the banner; empty when none or unknown. */
  readonly missing: Readonly<Ref<readonly MissingLabel[]>>;
  /** Reads /collector-status.json now and then every `intervalMs`. */
  start(): void;
  /** Stops reading and forgets the status; a read in flight then changes nothing. */
  stop(): void;
}

/**
 * Issue #85: the collector's finding of missing department labels, on the live screen. An
 * unreadable status keeps the last one (no flicker); 204 (the collector never ran) clears it.
 */
export function createLabelWatch(options: LabelWatchOptions): LabelWatch {
  const missing = shallowRef<readonly MissingLabel[]>([]);
  let status: CollectorStatus | null = null;
  let cancel: Cancel | null = null;
  // Bumped by stop, so a read that ends after it is dropped.
  let generation = 0;
  let inFlight = false;

  async function readSafely(): Promise<CollectorStatusRead> {
    try {
      return await options.loadStatus();
    } catch {
      return { kind: 'unreadable' };
    }
  }

  async function refresh(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    const started = generation;
    const read = await readSafely();
    inFlight = false;
    if (started !== generation) return;
    if (read.kind !== 'unreadable') status = read.kind === 'absent' ? null : read.status;
    const next = missingLabelsOf(status, options.now());
    if (!sameMissingLabels(missing.value, next)) missing.value = next;
  }

  function stop(): void {
    generation += 1;
    cancel?.();
    cancel = null;
    status = null;
    missing.value = [];
  }

  return {
    missing,
    start() {
      stop();
      void refresh();
      cancel = options.scheduler.every(options.intervalMs, () => {
        void refresh();
      });
    },
    stop,
  };
}
