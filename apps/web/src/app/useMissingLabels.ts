import { onBeforeUnmount, onMounted, type Ref } from 'vue';
import { loadCollectorStatus } from '../adapters/collectorStatus';
import type { MissingLabel } from '../domain/missingLabels';
import { REFRESH_INTERVAL_MS } from './guildStore';
import { createLabelWatch } from './labelWatch';
import { globalScheduler } from './scheduler';

/**
 * Issue #85: the department labels the collector found missing, for the live screen's banner.
 * Not read in a demo (`active` false): its data are fictional, and the automatic demo has a
 * banner of its own.
 */
export function useMissingLabels(active: boolean): Readonly<Ref<readonly MissingLabel[]>> {
  const watch = createLabelWatch({
    loadStatus: () => loadCollectorStatus(),
    now: Date.now,
    scheduler: globalScheduler,
    intervalMs: REFRESH_INTERVAL_MS,
  });
  onMounted(() => {
    if (active) watch.start();
  });
  onBeforeUnmount(() => {
    watch.stop();
  });
  return watch.missing;
}
