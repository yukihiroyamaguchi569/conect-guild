import { COMMANDER_ID } from '@conect-guild/snapshot/settings';
import type { PlannedVisit, VisitorKind } from '../domain/visitors';
import type { MemberId, TilePos } from '../guild.config';
import { homeWalk, type IdleStep } from './idle';
import { SELECTED_LAYOUT } from './layouts';
import { isWalkable, PLACES } from './map';
import {
  MS_PER_TILE,
  poseOnSegment,
  staySegment,
  walkSegment,
  type MoveFrame,
  type Segment,
} from './motion';
import { findPath, tileToPoint, type Point } from './path';
import { besideSeat } from './scenes';
import { faceThrone } from './summons';

/**
 * A visitor's trip (Issue #195), pure: in at the door, along the walkways to the member's seat
 * (beside it, as かなめ hands a scroll over; in front of the counter for かなめ), a few words facing
 * them, and out at the door. A trip cut short (a scene starts, the screen halts) turns back to the
 * door from where the visitor is, saying nothing more. Times are the stage clock's.
 */

/** The visitors' words: fixed, kana and a few signs only, at most 7 characters, as the lines. */
export const VISITOR_LINES = {
  merchant: ['やすいよ〜！', 'まいど〜！', 'かっていって！'],
  postman: ['おてがみです！', 'ゆうびんです〜', 'おとどけもの！'],
  bard: ['いっきょく♪', 'ららら〜♪', 'うたいます♪'],
  fortune: ['みえるぞよ…', 'きちじゃ！', 'よいひじゃのう'],
} as const satisfies Readonly<Record<VisitorKind, readonly string[]>>;
export type VisitorLine = (typeof VISITOR_LINES)[VisitorKind][number];

export const VISITOR = {
  /** How long the visitor stays and speaks at the seat. */
  talkMs: 2_400,
  /** How late a visit may still come (a busy room or a page opened later): no more. */
  graceMinutes: 10,
} as const;

export interface Trip {
  readonly kind: VisitorKind;
  readonly words: VisitorLine;
  /** The seat of the member spoken to: the visitor faces it while talking. */
  readonly seat: TilePos;
  readonly segments: readonly Segment[];
  /** The stay where the visitor speaks; null once the trip turned back. */
  readonly talk: Segment | null;
}

export interface VisitorView {
  readonly kind: VisitorKind;
  readonly feet: Point;
  readonly frame: MoveFrame;
  readonly flip: boolean;
  readonly words: VisitorLine | null;
}

/** Where visitors come in and go out: by the door (GuildLayout.offstage). */
export const DOOR: TilePos = SELECTED_LAYOUT.offstage;

const same = (a: TilePos, b: TilePos) => a.col === b.col && a.row === b.row;

/** The walkways, but not the guests' spots: a visitor never walks through a guest. */
function open(pos: TilePos): boolean {
  return isWalkable(pos) && !SELECTED_LAYOUT.guestSpots.some((spot) => same(spot, pos));
}

function wordsOf(visit: Pick<PlannedVisit, 'kind' | 'say'>): VisitorLine {
  const lines: readonly VisitorLine[] = VISITOR_LINES[visit.kind];
  return lines[Math.floor(visit.say * lines.length)] ?? VISITOR_LINES[visit.kind][0];
}

/** Where the visitor stands to speak to `id` on `seat`. */
export function spotFor(id: MemberId, seat: TilePos): TilePos {
  return id === COMMANDER_ID ? PLACES.counterFront : besideSeat(DOOR, seat);
}

/** The trip of `visit` to member `id` on `seat`, from `start`; null when there is no way. */
export function planTrip(
  visit: Pick<PlannedVisit, 'kind' | 'say'>,
  member: { readonly id: MemberId; readonly seat: TilePos },
  start: number,
): Trip | null {
  const spot = spotFor(member.id, member.seat);
  const there = findPath(DOOR, spot, open);
  const back = findPath(spot, DOOR, open);
  if (there === null || back === null || there.length < 2) return null;
  const walkIn = walkSegment(there, start);
  const talk = staySegment(spot, walkIn.end, VISITOR.talkMs);
  const segments = [walkIn, talk, walkSegment(back, talk.end)];
  return { kind: visit.kind, words: wordsOf(visit), seat: member.seat, segments, talk };
}

export function tripEnd(trip: Trip): number {
  return trip.segments.at(-1)?.end ?? Number.NEGATIVE_INFINITY;
}

function segmentAt(trip: Trip, t: number): Segment | undefined {
  return trip.segments.find((segment) => segment.start <= t && t < segment.end);
}

/** The visitor at `t`: walking, or facing the member and speaking; null before or after the trip. */
export function visitorAt(trip: Trip, t: number): VisitorView | null {
  const segment = segmentAt(trip, t);
  if (segment === undefined) return null;
  if (segment === trip.talk) {
    const spot = segment.path[0];
    const face = faceThrone(spot, trip.seat);
    return { kind: trip.kind, feet: tileToPoint(spot), ...face, words: trip.words };
  }
  const pose = poseOnSegment(segment, t);
  return { kind: trip.kind, feet: pose.point, frame: pose.frame, flip: pose.flip, words: null };
}

/**
 * The trip turned back to the door at `t`, from exactly where the feet are: a step under way is
 * finished first, so the feet never jump. No more words. A trip already on its way out goes on.
 */
export function cutTrip(trip: Trip, t: number): Trip {
  if (trip.talk === null || t >= trip.talk.end) return trip;
  // Not in yet: the visit is called off, nobody shows.
  if (t < (trip.segments[0]?.start ?? t)) return { ...trip, segments: [], talk: null };
  const walk = homeWalk(stepAt(segmentAt(trip, t) ?? trip.talk, t), DOOR, t, open);
  return { ...trip, segments: walk === null ? [] : [walk], talk: null };
}

/** The tiles the feet are between at `t` on `segment`, and how far (0 to 1) they are on the way. */
function stepAt(segment: Segment, t: number): IdleStep {
  const progress = Math.max(t - segment.start, 0) / MS_PER_TILE;
  const index = Math.min(Math.floor(progress), Math.max(segment.path.length - 2, 0));
  const from = segment.path[index] ?? segment.path[0];
  const to = segment.path[index + 1] ?? from;
  return { from, to, progress: same(from, to) ? 0 : progress - index };
}
