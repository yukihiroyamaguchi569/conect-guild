import type { MemberId } from '../guild.config';
import { bubbleShape, shapeExtent, type Spot, type Voice } from './bubbleShape';
import { bubbleShown, type BubbleKind, type Bubbles } from './bubbles';
import type { IdleMark } from './idle';
import type { LevelTag } from './levelTags';
import type { SpokenLine } from './lineBook';
import type { SpokenLines } from './lines';
import { LOGICAL_WIDTH, TALLEST_WINDOW_EXTENTS } from './map';
import { DETAIL_SCALE, LINES, OVERHEAD_OFFSET } from './metrics';
import type { Held } from './motion';
import type { Point } from './path';
import type { SpeechLine, Speeches } from './summons';

/**
 * What shows over a member's head: one thing at a time (docs/DESIGN.md 4.12, Issue #47). The first
 * that is there wins: the words of the king's call (summons.ts), a line of a scene (lines.ts), a
 * line on starting to wait (remarks.ts), the waiting bubble (bubbles.ts), a murmur (murmurs.ts),
 * the sign of a long idle spell (idle.ts). Those below are hidden
 * meanwhile, not delayed: each keeps its own times.
 */
export type Overhead =
  | { readonly kind: 'speech'; readonly words: SpeechLine }
  | { readonly kind: 'line'; readonly words: SpokenLine }
  | { readonly kind: 'murmur'; readonly words: SpokenLine }
  | { readonly kind: 'bubble'; readonly bubble: BubbleKind }
  | { readonly kind: 'mark'; readonly mark: IdleMark };

/** What each member may show this frame. */
export interface OverheadSources {
  readonly speeches: Speeches;
  readonly lines: SpokenLines;
  /** Lines on starting to wait: like the waiting bubble, only at the seat out of scenes. */
  readonly remarks: SpokenLines;
  readonly bubbles: Bubbles;
  /** Murmurs while nothing happens: hidden in a scene, like the remarks. */
  readonly murmurs: SpokenLines;
}

export function overheadOf(
  member: { readonly id: MemberId; readonly inScene: boolean; readonly mark: IdleMark | null },
  sources: OverheadSources,
): Overhead | null {
  const speech = sources.speeches[member.id];
  if (speech !== undefined) return { kind: 'speech', words: speech };
  const line = sources.lines[member.id];
  if (line !== undefined) return { kind: 'line', words: line };
  const remark = member.inScene ? undefined : sources.remarks[member.id];
  if (remark !== undefined) return { kind: 'line', words: remark };
  const bubble = bubbleShown(sources.bubbles, member);
  if (bubble !== null) return { kind: 'bubble', bubble };
  const murmur = member.inScene ? undefined : sources.murmurs[member.id];
  if (murmur !== undefined) return { kind: 'murmur', words: murmur };
  return member.mark === null ? null : { kind: 'mark', mark: member.mark };
}

/** What words are over the head, if any: they make the bubble as wide as they are. */
export function wordsOf(shown: Overhead): string | null {
  return shown.kind === 'speech' || shown.kind === 'line' || shown.kind === 'murmur'
    ? shown.words
    : null;
}

/**
 * How the bubble speaks (bubbleShape.ts, Issue #77): the king's 「！」 shouts, 「ゴニョゴニョ」 and
 * murmurs whisper, other words are said; a waiting bubble and the idle signs 「…」「♪」 are glyphs.
 * null: the 「Z」 of a sleeper, which floats with no bubble.
 */
export function voiceOf(shown: Overhead): Voice | null {
  if (shown.kind === 'speech') {
    if (shown.words === '！') return 'shout';
    return shown.words === 'ゴニョゴニョ' ? 'whisper' : 'say';
  }
  if (shown.kind === 'murmur') return 'whisper';
  if (shown.kind === 'line') return 'say';
  if (shown.kind === 'mark' && shown.mark.kind === 'z') return null;
  return 'glyph';
}

/** A bubble before it is placed: how it speaks and how many characters it holds. */
export interface BubbleOf {
  readonly voice: Voice;
  readonly chars: number;
}

/** The bubble of what is shown, or null for the 「Z」 (no bubble). */
export function bubbleOf(shown: Overhead): BubbleOf | null {
  const voice = voiceOf(shown);
  if (voice === null) return null;
  const words = wordsOf(shown);
  return { voice, chars: words === null ? 1 : Array.from(words).length };
}

/** A rectangle in logical px. */
export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Everything drawn for `bubble` over feet at `feet`, `lift` px up, at `spot` (bubbleShape.ts: the
 * box, its tail, its shadow and a shout's spikes), in logical px.
 */
export function bubbleBox(feet: Point, bubble: BubbleOf, spot: Spot, lift: number): Box {
  const extent = shapeExtent(bubbleShape(bubble.voice, bubble.chars, spot));
  const x = Math.round(feet.x);
  const y = Math.round(feet.y - OVERHEAD_OFFSET - lift);
  return {
    left: x + extent.left * DETAIL_SCALE,
    right: x + extent.right * DETAIL_SCALE,
    top: y + extent.top * DETAIL_SCALE,
    bottom: y + extent.bottom * DETAIL_SCALE,
  };
}

/** Which side of the head a bubble over it goes: the upper right, or the upper left. */
export type Side = 'right' | 'left';

/** Where words of `chars` characters said plainly are drawn over the head (bubbleBox). */
export function wordsBox(feet: Point, chars: number, lift: number, side: Side = 'right'): Box {
  return bubbleBox(feet, { voice: 'say', chars }, side, lift);
}

/** Where a 「Lv N」 tag is drawn (drawLevelTags.ts: bold 10 px, centred, a 1 px outline). */
export function tagBox(tag: LevelTag): Box {
  const half = (tag.text.length * 6) / 2 + 2;
  return { left: tag.x - half, right: tag.x + half, top: tag.y - 7, bottom: tag.y + 7 };
}

export function meet(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export const WINDOWS: readonly Box[] = Object.values(TALLEST_WINDOW_EXTENTS);

/** How far up what is over the head goes for an item held up over it. */
function raisedLift(held: Held | null): number {
  return held?.hold === 'raise' ? LINES.raisedLiftPx : 0;
}

/** The bubble of words said plainly, or null for no words (a glyph). */
function plainWords(words: string | null): BubbleOf | null {
  return words === null ? null : { voice: 'say', chars: Array.from(words).length };
}

/**
 * Which side of the head words go: the upper right as every bubble, unless they would go under an
 * HTML window there and not on the left (ささえ's seat is a few tiles left of the party column, so
 * longer lines reach under it), or off the right edge of the canvas (the month's gathering at the
 * ornament by the right wall, Issue #214). Other bubbles are one glyph wide and fit on the right.
 */
export function overheadSide(
  pose: { readonly point: Point; readonly held: Held | null },
  words: string | null,
  bubble: BubbleOf | null = plainWords(words),
): Side {
  if (words === null || bubble === null) return 'right';
  const lift = raisedLift(pose.held);
  const blocked = (side: Side): boolean => {
    const box = bubbleBox(pose.point, bubble, side, lift);
    return box.right > LOGICAL_WIDTH || WINDOWS.some((area) => meet(box, area));
  };
  return blocked('right') && !blocked('left') ? 'left' : 'right';
}

/**
 * How far up a bubble over the head goes: clear of an item held up over it (`raisedLiftPx`), and
 * for words, clear of the 「Lv N」 tags on the desks (levelTags.ts) too: a long line from a lower
 * seat reaches the tag on the counter or a desk up the room (ひらめ's to かなめ's, かなめ's to
 * ひびき's), and then goes up until its bottom is `tagGapPx` over the tag; again if it then meets
 * another one higher up (at most once per tag, as each step clears the highest one it meets).
 */
export function overheadLift(
  pose: { readonly point: Point; readonly held: Held | null },
  words: string | null,
  tags: readonly LevelTag[],
  bubble: BubbleOf | null = plainWords(words),
): number {
  const raised = raisedLift(pose.held);
  if (words === null || bubble === null) return raised;
  const side = overheadSide(pose, words, bubble);
  return liftOverTags(pose.point, { bubble, side }, raised, tags.map(tagBox));
}

/** `lift`, or more until the words meet none of `tags` (one step per tag). */
function liftOverTags(
  feet: Point,
  placed: { readonly bubble: BubbleOf; readonly side: Side },
  lift: number,
  tags: readonly Box[],
): number {
  const box = bubbleBox(feet, placed.bubble, placed.side, lift);
  const tops = tags.filter((tag) => meet(box, tag)).map((tag) => tag.top);
  if (tops.length === 0) return lift;
  const higher = lift + box.bottom - Math.min(...tops) + LINES.tagGapPx;
  // Now over the highest tag met, the bubble can only meet tags higher still: one step per tag.
  const rest = tags.filter((tag) => tag.top < Math.min(...tops));
  return liftOverTags(feet, placed, higher, rest);
}
