import { PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import { MIN_TOASTERS } from '../domain/toast';
import { ACTIVE_MEMBER_IDS, type MemberId, type TilePos } from '../guild.config';
import type { AmbientMoods } from './ambient';
import { inScene, trackEnd, type Director } from './director';
import { homeWalk, type IdlePoses } from './idle';
import { SHARED_LINES } from './lineBook';
import { showMs, type Utterance } from './lines';
import { isWalkable } from './map';
import { carry, raise, staySegment, walkSegment, type Segment } from './motion';
import { findPath, tileToPoint } from './path';
import type { Track } from './scenes';
import { stepAt } from './visitors';

/**
 * The Friday evening toast on the stage (Issue #193), pure: those with nothing to do walk to the
 * red rug in front of the counter with a tankard, wait for one another, raise it together (the
 * one in the middle says 「かんぱーい！」), stand a while and walk back. Their parts are tracks of
 * the director, so a scene that needs one of them is not started on top of it: they are released
 * (walk back now from where they are) first. Times are the stage clock's.
 */

export const TOAST = {
  /** How long the tankards are up, from the moment all are there. */
  raiseMs: 3_000,
  /** From the moment all are there until they walk back: about a minute together. */
  stayMs: 60_000,
} as const;

/**
 * One line along the rug in front of the counter, the middle first and then a tile apart while
 * there is room, the same in every layout.
 */
const SPOT_COLS = [16, 14, 18, 13, 19, 15, 17] as const;
const SPOT_ROW = 11;
export const TOAST_SPOTS: readonly TilePos[] = SPOT_COLS.map((col) => ({
  col,
  row: SPOT_ROW,
})).filter(isWalkable);

/** What the first of them says as the tankards go up (lineBook.SHARED_LINES). */
const [TOAST_LINE] = SHARED_LINES.toast;

/** Moods of a member with nothing to do (ambient.ambientMoodOf): no work, no PR to look at. */
const FREE_MOODS: ReadonlySet<string> = new Set(['idle', 'fan']);

export interface Toast {
  readonly tracks: readonly Track[];
  readonly lines: readonly Utterance[];
}

/**
 * Who joins a toast at `t`, in the members' order: not the king, nothing to do (no work, not
 * waiting on a PR), out of scenes and none to come, and at the seat (dozing and asleep there count;
 * out playing does not).
 */
export function toasters(
  director: Director,
  t: number,
  stage: {
    readonly moods: AmbientMoods;
    readonly idle: IdlePoses;
    readonly seats: Readonly<Record<MemberId, TilePos>>;
  },
): MemberId[] {
  return ACTIVE_MEMBER_IDS.filter((id) => {
    const mood = stage.moods[id];
    if (id === PRESIDENT_ID || mood === undefined || !FREE_MOODS.has(mood)) return false;
    if (inScene(director, id, t) || (director.busyUntil[id] ?? t) > t) return false;
    const feet = stage.idle[id]?.feet;
    const seat = tileToPoint(stage.seats[id]);
    return feet === undefined || (feet.x === seat.x && feet.y === seat.y);
  });
}

/** Segments without the empty stays (a member who arrives last waits for no one). */
function timed(segments: readonly Segment[]): Segment[] {
  return segments.filter((segment) => segment.end > segment.start);
}

/**
 * The toast of `ids` from `start`, each to the next spot; those with no way there stay out. Null
 * when fewer than MIN_TOASTERS can come.
 */
export function planToast(
  ids: readonly MemberId[],
  start: number,
  seats: Readonly<Record<MemberId, TilePos>>,
): Toast | null {
  const walks = ids.flatMap((id, i) => {
    const spot = TOAST_SPOTS[i];
    const there = spot === undefined ? null : findPath(seats[id], spot);
    const back = spot === undefined ? null : findPath(spot, seats[id]);
    if (spot === undefined || there === null || back === null || there.length < 2) return [];
    return [{ id, spot, walkIn: walkSegment(there, start, carry('tankard')), back }];
  });
  if (walks.length < MIN_TOASTERS) return null;
  const all = Math.max(...walks.map(({ walkIn }) => walkIn.end));
  const tracks = walks.map(({ id, spot, walkIn, back }): Track => {
    const wait = staySegment(spot, walkIn.end, all - walkIn.end, carry('tankard'));
    const up = staySegment(spot, all, TOAST.raiseMs, raise('tankard'));
    const stay = staySegment(spot, up.end, TOAST.stayMs - TOAST.raiseMs, carry('tankard'));
    return { actor: id, segments: timed([walkIn, wait, up, stay, walkSegment(back, stay.end)]) };
  });
  // One says it for all: side by side, every bubble would cover the next.
  const lines = walks.slice(0, 1).map(({ id }): Utterance => ({
    actor: id,
    line: TOAST_LINE,
    start: all,
    end: all + showMs('toast'),
  }));
  return { tracks, lines };
}

/** The director with the toast: scenes that need its members wait until they are back. */
export function withToast(director: Director, toast: Toast): Director {
  const busyUntil = { ...director.busyUntil };
  for (const track of toast.tracks) {
    busyUntil[track.actor] = Math.max(trackEnd(track), busyUntil[track.actor] ?? 0);
  }
  return {
    ...director,
    tracks: [...director.tracks, ...toast.tracks],
    lines: [...director.lines, ...toast.lines],
    busyUntil,
  };
}

/** True while the track has not set off back to the seat (its last segment). */
function beforeWayBack(track: Track, t: number): boolean {
  const last = track.segments.at(-1);
  return last !== undefined && t < last.start;
}

/** The walk back to the seat from where the track has the member at `t`; null when on it. */
function walkBack(track: Track, seat: TilePos, t: number): Segment | null {
  const now = track.segments.find((segment) => segment.start <= t && t < segment.end);
  return now === undefined ? null : homeWalk(stepAt(now, t), seat, t);
}

/**
 * The director with `ids` out of the toast at `t`: each walks back to the seat now from where they
 * are, and their 「かんぱーい！」 still to show or showing is dropped. Those already on their way
 * back go on; a toast no longer in the director (dropped with the scenes) changes nothing.
 */
export function releaseFromToast(
  director: Director,
  toast: Toast,
  ids: readonly MemberId[],
  at: { readonly t: number; readonly seats: Readonly<Record<MemberId, TilePos>> },
): Director {
  let next = director;
  for (const track of toast.tracks) {
    if (!ids.includes(track.actor) || !next.tracks.includes(track)) continue;
    if (!beforeWayBack(track, at.t)) continue;
    const walk = walkBack(track, at.seats[track.actor], at.t);
    const tracks = next.tracks.filter((one) => one !== track);
    const lines = next.lines.filter(
      (said) => !(toast.lines.includes(said) && said.actor === track.actor),
    );
    const busyUntil = { ...next.busyUntil, [track.actor]: walk === null ? at.t : walk.end };
    next = {
      ...next,
      tracks: walk === null ? tracks : [...tracks, { actor: track.actor, segments: [walk] }],
      lines,
      busyUntil,
    };
  }
  return next;
}
