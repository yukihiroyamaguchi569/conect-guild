import type { MemberId, TilePos } from '../guild.config';
import { inScene, trackEnd, type Director } from './director';
import { homeWalk, type IdlePose } from './idle';
import { PLACES } from './map';
import { SUMMONS } from './metrics';
import { MS_PER_TILE, staySegment, walkSegment, type Segment } from './motion';
import { findPath } from './path';
import type { Track } from './scenes';

/**
 * かなめ goes to the king to hear his order (Issue #87). Pure: the stage time is passed in.
 * After the king's "！" she walks from her counter to the side of the throne (PLACES.throneSide),
 * stays there while he whispers "ゴニョゴニョ" and she answers "はっ！", then walks back. Her part
 * is a track of the director, so a scroll or a chest that needs her waits until she is back, as
 * for any scene (director.castFreeAt). She only goes when she is free at her counter when the call
 * starts; in a scene, out playing or walking back from play she answers where she is (Issue #28).
 */

export interface Visit {
  readonly track: Track;
  /** The walk from the counter to the side of the throne. */
  readonly out: Segment;
  /** The walk back to the counter. */
  readonly home: Segment;
  /** She is at the side of the throne: the king starts whispering. */
  readonly arrive: number;
  /** She is back at her counter: the call is over. */
  readonly back: number;
}

const KANAME: MemberId = 'kaname';

/**
 * The visit of a call that starts at `start`: out after the "！", a stay through the whisper and
 * the answer, and back. Null when there is no way between her seat and the side of the throne.
 */
export function planVisit(start: number, seat: TilePos): Visit | null {
  const there = findPath(seat, PLACES.throneSide);
  const back = findPath(PLACES.throneSide, seat);
  if (there === null || back === null || there.length < 2) return null;
  const out = walkSegment(there, start + SUMMONS.callMs);
  const stay = staySegment(PLACES.throneSide, out.end, SUMMONS.murmurMs + SUMMONS.replyMs);
  const home = walkSegment(back, stay.end);
  return {
    track: { actor: KANAME, segments: [out, stay, home] },
    out,
    home,
    arrive: out.end,
    back: home.end,
  };
}

/** True when the idle spell (idle.ts) has her at her seat: dozing or asleep there, not away. */
function idleAtSeat(idle: IdlePose | undefined, seat: TilePos): boolean {
  if (idle === undefined) return true;
  const { from, to } = idle.step;
  return (
    from.col === seat.col && from.row === seat.row && to.col === seat.col && to.row === seat.row
  );
}

/**
 * The visit for a call to `members` that starts at `start`, or null: かなめ is not called, or she is
 * taken then (a scene or a walk back from play running or to come, or confetti over her) or out
 * playing (`idle`, her long idle spell now).
 */
export function visitFor(
  members: readonly MemberId[],
  start: number,
  stage: {
    readonly director: Director;
    readonly idle: IdlePose | undefined;
    readonly seat: TilePos;
  },
): Visit | null {
  const { director, idle, seat } = stage;
  if (!members.includes(KANAME)) return null;
  if ((director.busyUntil.kaname ?? start) > start || inScene(director, KANAME, start)) return null;
  if (!idleAtSeat(idle, seat)) return null;
  return planVisit(start, seat);
}

/** The director with her visit: scenes that need her wait until she is back. */
export function withVisit(director: Director, visit: Visit): Director {
  return {
    ...director,
    tracks: [...director.tracks, visit.track],
    busyUntil: {
      ...director.busyUntil,
      kaname: Math.max(visit.back, director.busyUntil.kaname ?? visit.back),
    },
  };
}

/** Her walk back to `seat` from where she is at `t` on her way out (idle.homeWalk). */
function turnBack(out: Segment, seat: TilePos, t: number): Segment | null {
  const progress = (t - out.start) / MS_PER_TILE;
  const step = Math.min(Math.floor(progress), out.path.length - 2);
  const from = out.path[step] ?? out.path[0];
  const to = out.path[step + 1] ?? from;
  return homeWalk({ from, to, progress: progress - step }, seat, t);
}

/** Where she walks back from at `t` when the visit is cut then; null when it never started. */
function walkBackAt(visit: Visit, seat: TilePos, t: number): Segment | null {
  if (t <= visit.out.start) return null;
  if (t < visit.out.end) return turnBack(visit.out, seat, t);
  const back = findPath(PLACES.throneSide, seat);
  return back === null ? null : walkSegment(back, t);
}

/**
 * The director with the visit cut at `t` (the call was dropped: the screen halted): one not started
 * goes, one under way turns back to the counter now, one already on the way back goes on. Nothing
 * changes when its track is no longer there (dropped with the scenes while the canvas was hidden).
 */
export function cutVisit(director: Director, visit: Visit, t: number): Director {
  if (t >= visit.home.start || !director.tracks.includes(visit.track)) return director;
  const walk = walkBackAt(visit, seat(visit), t);
  const others = director.tracks.filter((track) => track !== visit.track);
  const tracks = walk === null ? others : [...others, { actor: KANAME, segments: [walk] }];
  const ends = tracks.filter((track) => track.actor === KANAME).map(trackEnd);
  const busyUntil = { ...director.busyUntil };
  if (ends.length === 0) delete busyUntil.kaname;
  else busyUntil.kaname = Math.max(...ends);
  return { ...director, tracks, busyUntil };
}

/** The seat she left from: the first tile of her walk out. */
function seat(visit: Visit): TilePos {
  return visit.out.path[0];
}
