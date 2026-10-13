import type { CollectorStatus } from '@conect-guild/snapshot';
import { shallowRef, type Ref } from 'vue';
import type { CollectorStatusRead } from '../adapters/collectorStatus';
import { missingLabelsOf, sameMissingLabels, type MissingLabel } from '../domain/missingLabels';
import { mixupsOf, sameMixups, type MixupNotice } from '../domain/mixups';
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
  /** Issue #94: the departments suspected to be mixed up in the settings; empty when none. */
  readonly mixups: Readonly<Ref<readonly MixupNotice[]>>;
  /** Reads /collector-status.json now and then every `intervalMs`. */
  start(): void;
  /** Stops reading and forgets the status; a read in flight then changes nothing. */
  stop(): void;
}

/**
 * Issue #85: the collector's finding of missing department labels, on the live screen, and its
 * suspected mix-ups of departments (Issue #94) from the same status file. An unreadable status
 * keeps the last one (no flicker); 204 (the collector never ran) clears it.
 */
export function createLabelWatch(options: LabelWatchOptions): LabelWatch {
  const missing = shallowRef<readonly MissingLabel[]>([]);
  const mixups = shallowRef<readonly MixupNotice[]>([]);
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
    const nextMixups = mixupsOf(status, options.now());
    if (!sameMixups(mixups.value, nextMixups)) mixups.value = nextMixups;
  }

  function stop(): void {
    generation += 1;
    cancel?.();
    cancel = null;
    status = null;
    missing.value = [];
    mixups.value = [];
  }

  return {
    missing,
    mixups,
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
