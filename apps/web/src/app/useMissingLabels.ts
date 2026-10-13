import { onBeforeUnmount, onMounted } from 'vue';
import { loadCollectorStatus } from '../adapters/collectorStatus';
import { REFRESH_INTERVAL_MS } from './guildStore';
import { createLabelWatch, type LabelWatch } from './labelWatch';
import { globalScheduler } from './scheduler';

/**
 * Issue #85: the department labels the collector found missing, and the departments it suspects
 * are mixed up (Issue #94), for the live screen's banner. Not read in a demo (`active` false): its
 * data are fictional, and the automatic demo has a banner of its own.
 */
export function useMissingLabels(active: boolean): Pick<LabelWatch, 'missing' | 'mixups'> {
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
  return { missing: watch.missing, mixups: watch.mixups };
}
