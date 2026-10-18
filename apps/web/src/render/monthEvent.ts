import type { KeyValueStore } from '../adapters/storage';
import { isMonthEventTime } from '../domain/monthEvent';
import { MIN_TOASTERS } from '../domain/toast';
import type { MemberId, TilePos } from '../guild.config';
import { SELECTED_LAYOUT } from './layouts';
import { SHARED_LINES } from './lineBook';
import { showMs, type Utterance } from './lines';
import { isWalkable } from './map';
import { staySegment, walkSegment } from './motion';
import { monthAt } from './ornament';
import { timed, walksTo, type Toast } from './toast';
import {
  createGatheringStage,
  createToastStage,
  type Gathering,
  type ToastStage,
} from './toastStage';

/**
 * The month's gathering on the stage (Issue #214), the toast's way (Issue #193) without a tankard:
 * those with nothing to do walk to the floor in front of the month's ornament (Issue #192), wait for
 * one another, the first says the month's word (lineBook.SHARED_LINES.season), they stand a while
 * and walk back. No new picture. Pure but for the stage it keeps (createGatheringsStage).
 */

export const MONTH_EVENT = {
  /** From the moment all are there until they walk back. */
  stayMs: 20_000,
} as const;

/** The local date the month's gathering was held last (domain/monthEvent.ts). */
export const MONTH_EVENT_DAY_KEY = 'conect-guild:month-event-day';

const SPOT = SELECTED_LAYOUT.ornamentSpot;
/** How far the spots go: rows under the ornament, and columns out from either side of it. */
const REACH = { rows: 4, cols: 3 } as const;
/** How far `at` is from the front of the ornament (its bottom row, in the middle), in tiles. */
const fromFront = (at: TilePos): number =>
  Math.abs(at.col - (SPOT.col + (SPOT.w - 1) / 2)) + (at.row - (SPOT.row + SPOT.h - 1));

/**
 * The walkable floor in front of the ornament (the furniture under it leaves the walkway a row
 * further down), the nearest first; on a tie, the row nearer first, then from the left.
 */
export const MONTH_SPOTS: readonly TilePos[] = Array.from({ length: REACH.rows }, (_, i) =>
  Array.from({ length: SPOT.w + 2 * REACH.cols }, (_, j) => ({
    col: SPOT.col - REACH.cols + j,
    row: SPOT.row + SPOT.h + i,
  })),
)
  .flat()
  .filter(isWalkable)
  .sort((a, b) => fromFront(a) - fromFront(b) || a.row - b.row || a.col - b.col);

/** The word of `month` (1 to 12). */
export function seasonLine(month: number): (typeof SHARED_LINES.season)[number] {
  return SHARED_LINES.season[month - 1] ?? SHARED_LINES.season[0];
}

/**
 * The month's gathering of `ids` from `start` in `month`, each to the next spot; those with no way
 * there stay out. Null when fewer than MIN_TOASTERS can come.
 */
export function planMonthEvent(
  ids: readonly MemberId[],
  start: number,
  seats: Readonly<Record<MemberId, TilePos>>,
  month: number,
): Toast | null {
  const walks = walksTo(MONTH_SPOTS, ids, { start, seats, held: null });
  if (walks.length < MIN_TOASTERS) return null;
  const all = Math.max(...walks.map(({ walkIn }) => walkIn.end));
  const tracks = walks.map(({ id, spot, walkIn, back }) => {
    const wait = staySegment(spot, walkIn.end, all - walkIn.end);
    const stay = staySegment(spot, all, MONTH_EVENT.stayMs);
    return { actor: id, segments: timed([walkIn, wait, stay, walkSegment(back, stay.end)]) };
  });
  // One says it for all, as at the toast: side by side, every bubble would cover the next.
  const lines = walks.slice(0, 1).map(({ id }): Utterance => ({
    actor: id,
    line: seasonLine(month),
    start: all,
    end: all + showMs('season'),
  }));
  return { tracks, lines };
}

const MONTH_GATHERING: Gathering = {
  key: MONTH_EVENT_DAY_KEY,
  isTime: isMonthEventTime,
  plan: (ids, start, seats, local) => planMonthEvent(ids, start, seats, monthAt(local.wall)),
};

/**
 * The toast and the month's gathering, kept in `store`: the toast first when both could start (they
 * never are both due: domain/monthEvent.ts), and either releases its members.
 */
export function createGatheringsStage(
  store: KeyValueStore,
  wallNow: () => number = () => Date.now(),
): ToastStage {
  const stages = [
    createToastStage(store, wallNow),
    createGatheringStage(store, MONTH_GATHERING, wallNow),
  ];
  return {
    start: (director, at) =>
      stages.reduce((next, stage) => (next === director ? stage.start(next, at) : next), director),
    release: (director, ids, t) =>
      stages.reduce((next, stage) => stage.release(next, ids, t), director),
  };
}
