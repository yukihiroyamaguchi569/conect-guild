import type { KeyValueStore } from '../adapters/storage';
import { isToastTime, toastDaySchema } from '../domain/toast';
import { dayKey } from '../domain/visitors';
import type { MemberId, TilePos } from '../guild.config';
import type { AmbientMoods } from './ambient';
import { isAnimating, type Director } from './director';
import type { IdlePoses } from './idle';
import { DEFAULT_SEATS } from './scenes';
import { planToast, releaseFromToast, toasters, withToast, type Toast } from './toast';

/**
 * The toast the loop keeps (Issue #193): whether it was raised this Friday, kept in localStorage as
 * the local date only (`conect-guild:toast-day`, read with zod), and the toast on the stage, so
 * that its members can be released. It starts once the stage is quiet: no scene, no call, not
 * halted, no visitor in the room. Fewer than two free hands: it waits for more that evening. The day
 * is read again just before it starts, so two tabs do not both raise it.
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
      /** A visitor is in the room (visitorStage.ts): the toast waits until it has gone. */
      readonly visiting: boolean;
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

/** The local time a gathering is planned at: localDayOf, and the epoch ms it was read from. */
type LocalTime = ReturnType<typeof localDayOf> & { readonly wall: number };

/**
 * What tells one gathering of the free hands from another (the toast; the month's, Issue #214):
 * where the day it was held is kept, when it is time, and how it goes.
 */
export interface Gathering {
  /** The localStorage key of the date it was held last (the local date only, read with zod). */
  readonly key: string;
  /** True when it is time at `local`, held last on `lastDay` (a dayKey, or null for never). */
  isTime(local: LocalTime, lastDay: string | null): boolean;
  /** It for `ids` from stage time `start`, as of `local`; null when it cannot be held. */
  plan(
    ids: readonly MemberId[],
    start: number,
    seats: Readonly<Record<MemberId, TilePos>>,
    local: LocalTime,
  ): Toast | null;
}

/** The Friday toast (Issue #193). */
const TOAST_GATHERING: Gathering = {
  key: TOAST_DAY_KEY,
  isTime: isToastTime,
  plan: (ids, start, seats) => planToast(ids, start, seats),
};

export function createToastStage(
  store: KeyValueStore,
  wallNow: () => number = () => Date.now(),
): ToastStage {
  return createGatheringStage(store, TOAST_GATHERING, wallNow);
}

/**
 * The stage of `gathering` (the toast's rules, Issue #193): it starts when it is time and the stage
 * is quiet, once that day (kept in `store`, read again just before it starts), with two free hands
 * at least; those in it can be released.
 */
export function createGatheringStage(
  store: KeyValueStore,
  gathering: Gathering,
  wallNow: () => number = () => Date.now(),
): ToastStage {
  const stored = (): string | null => {
    const read = store.read(gathering.key, toastDaySchema);
    return read.ok ? read.value : null;
  };
  let lastDay = stored();
  let toast: Toast | null = null;
  return {
    start(director, at) {
      const { t } = at;
      if (at.halted || at.calling || at.visiting || isAnimating(director, t)) return director;
      const wall = wallNow();
      const local = { ...localDayOf(wall), wall };
      if (!gathering.isTime(local, lastDay)) return director;
      // Another tab may have raised it since this one was opened.
      lastDay = stored() ?? lastDay;
      if (!gathering.isTime(local, lastDay)) return director;
      const ids = toasters(director, t, { moods: at.moods, idle: at.idle, seats: DEFAULT_SEATS });
      const planned = gathering.plan(ids, t, DEFAULT_SEATS, local);
      if (planned === null) return director;
      lastDay = local.day;
      // A write that fails still keeps the day for this page.
      store.write(gathering.key, local.day);
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
