import type { KeyValueStore } from '../adapters/storage';
import { isToastTime, toastDaySchema } from '../domain/toast';
import { dayKey } from '../domain/visitors';
import type { MemberId } from '../guild.config';
import type { AmbientMoods } from './ambient';
import { isAnimating, type Director } from './director';
import type { IdlePoses } from './idle';
import { DEFAULT_SEATS } from './scenes';
import { planToast, releaseFromToast, toasters, withToast, type Toast } from './toast';

/**
 * The toast the loop keeps (Issue #193): whether it was raised this Friday, kept in localStorage as
 * the local date only (`conect-guild:toast-day`, read with zod), and the toast on the stage, so
 * that its members can be released. It starts once the stage is quiet: no scene, no call, not
 * halted. Fewer than two free hands: it waits for more that evening.
 */

export const TOAST_DAY_KEY = 'conect-guild:toast-day';

export interface ToastStage {
  /** The director with the toast started at `t` when it is time and the stage is quiet. */
  start(
    director: Director,
    at: {
      readonly t: number;
      readonly moods: AmbientMoods;
      readonly idle: IdlePoses;
      readonly calling: boolean;
      readonly halted: boolean;
    },
  ): Director;
  /** The director with `ids` out of the toast at `t` (toast.releaseFromToast). */
  release(director: Director, ids: readonly MemberId[], t: number): Director;
}

/** The local weekday, the hour (0 to 24) and the date (dayKey) of `epochMs`. */
export function localDayOf(epochMs: number): { weekday: number; hour: number; day: string } {
  const at = new Date(epochMs);
  const day = dayKey({ year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate() });
  return { weekday: at.getDay(), hour: at.getHours() + at.getMinutes() / 60, day };
}

export function createToastStage(
  store: KeyValueStore,
  wallNow: () => number = () => Date.now(),
): ToastStage {
  const read = store.read(TOAST_DAY_KEY, toastDaySchema);
  let lastDay = read.ok ? read.value : null;
  let toast: Toast | null = null;
  return {
    start(director, at) {
      const { t } = at;
      if (at.halted || at.calling || isAnimating(director, t)) return director;
      const local = localDayOf(wallNow());
      if (!isToastTime(local, lastDay)) return director;
      const ids = toasters(director, t, { moods: at.moods, idle: at.idle, seats: DEFAULT_SEATS });
      const planned = planToast(ids, t, DEFAULT_SEATS);
      if (planned === null) return director;
      lastDay = local.day;
      // A write that fails still keeps the day for this page.
      store.write(TOAST_DAY_KEY, local.day);
      toast = planned;
      return withToast(director, planned);
    },
    release(director, ids, t) {
      return toast === null
        ? director
        : releaseFromToast(director, toast, ids, { t, seats: DEFAULT_SEATS });
    },
  };
}
