import type { MemberId } from '../guild.config';
import type { Spot } from './bubbleShape';
import type { Bubbles } from './bubbles';
import type { StageFrame } from './director';
import type { IdleMark } from './idle';
import type { LevelTag } from './levelTags';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import type { Held } from './motion';
import {
  bubbleBox,
  bubbleOf,
  meet,
  overheadLift,
  overheadOf,
  overheadSide,
  tagBox,
  WINDOWS,
  wordsOf,
  type BubbleOf,
  type Box,
  type Overhead,
  type OverheadSources,
} from './overhead';
import type { SpokenLines } from './lines';
import type { Point } from './path';
import type { Speeches } from './summons';

/**
 * Where each thing over a head is drawn this frame (Issue #77). A bubble goes over the head (the
 * upper right, or the upper left under a window: overhead.overheadSide), lifted over the 「Lv N」
 * tags (overhead.overheadLift). Words said while holding an item up go beside the item at the
 * head's height, the tail down to the head: on the right, else on the left, wherever they meet no
 * other member, no other bubble, no tag and no window and stay on the canvas; else over the item.
 * Pure: drawOverhead and the "LEVEL UP" words (drawLevelUp.ts) place from the same frame alike.
 */

export interface OverheadMember {
  readonly id: MemberId;
  readonly pose: { readonly point: Point; readonly held: Held | null };
  readonly inScene: boolean;
  readonly mark: IdleMark | null;
}

export interface Placed {
  readonly id: MemberId;
  readonly shown: Overhead;
  /** The bubble, or null for the 「Z」 of a sleeper. */
  readonly bubble: BubbleOf | null;
  readonly spot: Spot;
  /** The feet the bubble is drawn from: the member's, lifted for a spot over the head. */
  readonly feet: Point;
}

/**
 * The spot kept for the words over a member while they last (one line: the same speaker, words and
 * kind, shown frame after frame), so a bubble does not jump from over the item to beside it when a
 * neighbour walks off. The loop keeps it from one painted frame to the next (rememberPlaces).
 */
export interface Kept {
  readonly kind: Overhead['kind'];
  readonly words: string;
  readonly spot: Spot;
}

export type PlaceMemory = Readonly<Partial<Record<MemberId, Kept>>>;

export const NO_PLACES: PlaceMemory = {};

/** What to keep for the next frame: the spot of every member's words placed now. */
export function rememberPlaces(placed: readonly Placed[]): PlaceMemory {
  const kept: Partial<Record<MemberId, Kept>> = {};
  for (const one of placed) {
    const words = wordsOf(one.shown);
    if (words !== null) kept[one.id] = { kind: one.shown.kind, words, spot: one.spot };
  }
  return kept;
}

/**
 * Where another member stands, logical px: the feet up to the top of the hair (the sprites are
 * 80 px frames with the head about 70 px up), 16 px each side of the middle.
 */
export function bodyBox(point: Point): Box {
  return { left: point.x - 16, right: point.x + 16, top: point.y - 72, bottom: point.y };
}

function onCanvas(box: Box): boolean {
  return (
    box.left >= 0 && box.top >= 0 && box.right <= LOGICAL_WIDTH && box.bottom <= LOGICAL_HEIGHT
  );
}

/** Over the head, as every bubble: the side and the lift of overhead.ts. */
function overHead(member: OverheadMember, shown: Overhead, tags: readonly LevelTag[]): Placed {
  const bubble = bubbleOf(shown);
  const words = wordsOf(shown);
  const spot = overheadSide(member.pose, words, bubble);
  const lift = overheadLift(member.pose, words, tags, bubble);
  const { x, y } = member.pose.point;
  return { id: member.id, shown, bubble, spot, feet: { x, y: y - lift } };
}

const BESIDE: readonly Spot[] = ['beside-right', 'beside-left'];

/**
 * The spot beside the item for words held up, or null for over it: the one kept for this line if
 * any (beside only while it still fits), else the first free one.
 */
function besideOrOver(
  member: OverheadMember,
  said: { readonly what: Overhead; readonly bubble: BubbleOf },
  blockers: readonly Box[],
  memory: PlaceMemory,
): Spot | null {
  const point = member.pose.point;
  const kept = keptFor(member, said.what, memory);
  if (kept !== null && !BESIDE.includes(kept)) return null;
  if (kept !== null && stillFits(point, said.bubble, kept)) return kept;
  return besideSpot(point, said.bubble, blockers);
}

/** The first spot beside the raised item clear of `blockers` and on the canvas, if any. */
function besideSpot(point: Point, bubble: BubbleOf, blockers: readonly Box[]): Spot | null {
  for (const spot of BESIDE) {
    const box = bubbleBox(point, bubble, spot, 0);
    if (onCanvas(box) && !blockers.some((other) => meet(box, other))) return spot;
  }
  return null;
}

/** Still clear of the windows and on the canvas: then a kept spot beside the item stays. */
function stillFits(point: Point, bubble: BubbleOf, spot: Spot): boolean {
  const box = bubbleBox(point, bubble, spot, 0);
  return onCanvas(box) && !WINDOWS.some((area) => meet(box, area));
}

/** The spot kept for these words, if they are the line placed in the frame before. */
function keptFor(member: OverheadMember, what: Overhead, memory: PlaceMemory): Spot | null {
  const kept = memory[member.id];
  if (kept?.kind !== what.kind || kept.words !== wordsOf(what)) return null;
  return kept.spot;
}

function holdsUp(member: OverheadMember): boolean {
  return member.pose.held?.hold === 'raise';
}

/**
 * `memory`: the spots of the frame before (rememberPlaces). Words held up keep their spot for the
 * whole line: beside the item while it still fits clear of the windows and on the canvas (else
 * placed again), or over the item, even once a side frees up.
 */
export function placeOverheads(
  members: readonly OverheadMember[],
  sources: OverheadSources,
  tags: readonly LevelTag[],
  memory: PlaceMemory = NO_PLACES,
): Placed[] {
  const shown = members.flatMap((member) => {
    const what = overheadOf(member, sources);
    return what === null ? [] : [{ member, what }];
  });
  // Words said holding an item up are placed last, clear of the bubbles of everyone else.
  const beside = (m: OverheadMember, what: Overhead): boolean =>
    holdsUp(m) && wordsOf(what) !== null;
  const placed = new Map<MemberId, Placed>();
  for (const { member, what } of shown)
    if (!beside(member, what)) placed.set(member.id, overHead(member, what, tags));
  const fixed = [...WINDOWS, ...tags.map(tagBox)];
  for (const { member, what } of shown) {
    const bubble = bubbleOf(what);
    if (!beside(member, what) || bubble === null) continue;
    const blockers = [
      ...fixed,
      ...members.filter((m) => m.id !== member.id).map((m) => bodyBox(m.pose.point)),
      ...[...placed.values()].flatMap((p) => (p.bubble === null ? [] : [placedBox(p)])),
    ];
    const spot = besideOrOver(member, { what, bubble }, blockers, memory);
    placed.set(
      member.id,
      spot === null
        ? overHead(member, what, tags)
        : { id: member.id, shown: what, bubble, spot, feet: member.pose.point },
    );
  }
  return shown.flatMap(({ member }) => {
    const one = placed.get(member.id);
    return one === undefined ? [] : [one];
  });
}

/** Everything drawn for a placed bubble, logical px (an empty box at the feet for the 「Z」). */
export function placedBox(placed: Placed): Box {
  if (placed.bubble === null) {
    const { x, y } = placed.feet;
    return { left: x, right: x, top: y, bottom: y };
  }
  return bubbleBox(placed.feet, placed.bubble, placed.spot, 0);
}

/**
 * The top of everything drawn for the words over `id` (a shout's spikes too), or null when no
 * words are over the head (the king's call or a line). The words "LEVEL UP" of a level-up go over
 * it (levelUp.bannerPoint).
 */
export function wordsTop(placed: readonly Placed[], id: MemberId): number | null {
  const one = placed.find((p) => p.id === id);
  if (one === undefined) return null;
  const { kind } = one.shown;
  return kind === 'speech' || kind === 'line' ? placedBox(one).top : null;
}

/** What the bubbles over the heads (draw.ts) and the "LEVEL UP" words read of the stage. */
export interface OverheadStage {
  readonly frame: Pick<StageFrame, 'members' | 'lines'>;
  readonly bubbles: Bubbles;
  readonly speeches: Speeches;
  /** Lines on starting to wait (remarks.ts). */
  readonly remarks: SpokenLines;
  /** Murmurs while nothing happens (murmurs.ts). */
  readonly murmurs: SpokenLines;
  /** The 「Lv N」 tags on the desks, which bubbles keep clear of. */
  readonly tags: readonly LevelTag[];
}

/** Where everything over the heads goes this frame, keeping the spots of `memory`. */
export function overheadsOf(stage: OverheadStage, memory: PlaceMemory = NO_PLACES): Placed[] {
  const sources = { ...stage, lines: stage.frame.lines };
  return placeOverheads(stage.frame.members, sources, stage.tags, memory);
}
