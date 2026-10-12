import { bubbleShape, tailSpans, type Shape, type Spot, type Voice } from './bubbleShape';
import { BUBBLE, DETAIL_SCALE, OVERHEAD_OFFSET } from './metrics';
import type { Point } from './path';

/**
 * Canvas side effects only (bubbleShape.ts decides the shape, overheadPlace.ts the place): a bubble
 * in detail px. Each colour is one path of overlapping rectangles filled once, so the canvas's
 * scaling to the screen (not a whole number) leaves no hairline between the rows.
 */

export const BUBBLE_COLORS = {
  ink: '#1d1a2e',
  paper: '#ffffff',
  shadow: 'rgba(20, 16, 40, 0.45)',
  /** A shout's fill: a pale yellow, so the king's call stands out. */
  shoutPaper: '#fff6d0',
  /** A whisper's words: grey, quieter than the dark ink. */
  whisperInk: '#55506a',
} as const;
const { ink: INK, paper: PAPER, shadow: SHADOW } = BUBBLE_COLORS;

/** What drawing a bubble needs of a 2D context (tests pass a recording one). */
export type BubbleContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'beginPath'
  | 'rect'
  | 'fill'
  | 'fillStyle'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'fillText'
>;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A box with corners stepped by `steps` (inset per row from the top and the bottom), as rects. */
function boxPath(ctx: BubbleContext, r: Rect, steps: readonly number[]): void {
  steps.forEach((inset, i) => {
    ctx.rect(r.x + inset, r.y + i, r.w - 2 * inset, r.h - 2 * i);
  });
  ctx.rect(r.x, r.y + steps.length, r.w, r.h - 2 * steps.length);
}

/** The tail's rows narrowed by `k` at each end, moved by `d` down and right. */
function tailPath(ctx: BubbleContext, shape: Shape, k: number, d = 0): void {
  const top = shape.y + shape.h - shape.border;
  tailSpans(shape).forEach(([l, r], j) => {
    if (r - k < l + k) return;
    // A little over 1 row high: the rows overlap, so no hairline shows between them.
    ctx.rect(l + k + d, top + j + d, r - l + 1 - 2 * k, 1.02);
  });
}

/** Layer k of the bubble (0: the outer border): the box and the tail narrowed by k, one path. */
function fillLayer(ctx: BubbleContext, shape: Shape, k: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const box = { x: shape.x + k, y: shape.y + k, w: shape.w - 2 * k, h: shape.h - 2 * k };
  boxPath(ctx, box, k === 0 ? [2, 1] : [1]);
  tailPath(ctx, shape, k);
  ctx.fill();
}

function shadow(ctx: BubbleContext, shape: Shape): void {
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  boxPath(ctx, { x: shape.x + 1, y: shape.y + 1, w: shape.w, h: shape.h }, [2, 1]);
  tailPath(ctx, shape, 0, 1);
  ctx.fill();
}

/** A shout's spikes: 3 px rays from the corners, the sides and the top, outlined in ink. */
function spikes(ctx: BubbleContext, shape: Shape, paper: string): void {
  const { x, y, w, h } = shape;
  const points: [number, number][] = [];
  const ray = (px: number, py: number, dx: number, dy: number): void => {
    for (let i = 1; i <= 3; i++) points.push([px + dx * i, py + dy * i]);
  };
  ray(x + 2, y + 2, -1, -1);
  ray(x + w - 3, y + 2, 1, -1);
  ray(x + w - 3, y + h - 3, 1, 1);
  ray(x + 2, y + h - 3, -1, 1);
  ray(x, y + Math.floor(h / 2), -1, 0);
  ray(x + w - 1, y + Math.floor(h / 2), 1, 0);
  const tops = w > 24 ? [w / 3, (2 * w) / 3] : [w / 2];
  for (const f of tops) ray(x + Math.floor(f), y, 0, -1);
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (const [px, py] of points) ctx.rect(px - 1, py - 1, 3, 3);
  ctx.fill();
  ctx.fillStyle = paper;
  ctx.beginPath();
  for (const [px, py] of points) ctx.rect(px, py, 1, 1);
  ctx.fill();
}

/** A whisper's border: every other pixel of its straight parts and of the tail let through. */
function dots(ctx: BubbleContext, shape: Shape): void {
  const { x, y, w, h } = shape;
  const [first] = tailSpans(shape);
  const tail = first ?? [x, x];
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (let px = x + 3; px < x + w - 3; px += 2) {
    ctx.rect(px, y, 1, 1);
    if (px < tail[0] || px > tail[1]) ctx.rect(px, y + h - 1, 1, 1);
  }
  for (let py = y + 3; py < y + h - 3; py += 2) {
    ctx.rect(x, py, 1, 1);
    ctx.rect(x + w - 1, py, 1, 1);
  }
  // The tail's border too: every other row under the box, the 2 px tip left whole.
  const rows = tailSpans(shape);
  const top = y + h - shape.border;
  for (let j = shape.border + 1; j < rows.length - 1; j += 2) {
    const [l, r] = rows[j] ?? [x, x];
    ctx.rect(l, top + j, 1, 1);
    ctx.rect(r, top + j, 1, 1);
  }
  ctx.fill();
}

export interface BubbleText {
  readonly text: string;
  /** The ink of the words (a whisper's are grey whatever this is). */
  readonly color: string;
  readonly voice: Voice;
  /** How many characters the bubble is sized for (a glyph: 1). */
  readonly chars: number;
}

/** A bubble for `text` over feet at `feet`, at `spot` (bubbleShape.ts). */
export function drawBubble(ctx: BubbleContext, bubble: BubbleText, feet: Point, spot: Spot): void {
  const { voice } = bubble;
  const shape = bubbleShape(voice, bubble.chars, spot);
  const paper = voice === 'shout' ? BUBBLE_COLORS.shoutPaper : PAPER;
  ctx.save();
  ctx.translate(Math.round(feet.x), Math.round(feet.y - OVERHEAD_OFFSET));
  ctx.scale(DETAIL_SCALE, DETAIL_SCALE);
  if (voice === 'shout') spikes(ctx, shape, paper);
  shadow(ctx, shape);
  for (let k = 0; k < shape.border; k++) fillLayer(ctx, shape, k, INK);
  fillLayer(ctx, shape, shape.border, paper);
  if (voice === 'whisper') dots(ctx, shape);
  ctx.font = `bold ${String(voice === 'glyph' ? BUBBLE.glyphPx : BUBBLE.textPx)}px sans-serif`;
  ctx.fillStyle = voice === 'whisper' ? BUBBLE_COLORS.whisperInk : bubble.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bubble.text, shape.x + shape.w / 2, shape.y + shape.h / 2 + 0.5);
  ctx.restore();
}
