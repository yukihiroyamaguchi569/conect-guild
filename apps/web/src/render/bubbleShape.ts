import { BUBBLE } from './metrics';

/**
 * The shape of a bubble over a head (Issue #77), in detail px from the point OVERHEAD_OFFSET over
 * the feet: pure, so the drawing (drawBubble.ts) and the overlap checks (overhead.ts) agree.
 * A white box with stepped corners and a stepped tail leaning to the head; the king's call 「！」
 * shouts (a 2 px border and spikes), 「ゴニョゴニョ」 and murmurs whisper (a dotted border).
 */

/** How the words are said: the shape of the bubble follows it. A glyph is a waiting sign. */
export type Voice = 'say' | 'shout' | 'whisper' | 'glyph';

/**
 * Where the bubble goes: over the head to the upper right or left, or beside an item held up over
 * the head (at the head's height, right or left of the item).
 */
export type Spot = 'right' | 'left' | 'beside-right' | 'beside-left';

export interface Shape {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Border thickness: 2 for a shout. */
  readonly border: number;
  /** The left end of the tail's base, how far it leans per row (−: left) and how many rows. */
  readonly tailX: number;
  readonly lean: number;
  readonly tailRows: number;
}

/** A rectangle in detail px (left and top inclusive, right and bottom exclusive). */
export interface Extent {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** The width of the tail's base: 4 px inside and the border on each side. */
export function tailBase(border: number): number {
  return BUBBLE.tailInsidePx + 2 * border;
}

/** The size of the box: words are `chars` full-width characters of the 8 px font. */
function boxSize(voice: Voice, chars: number): { w: number; h: number; border: number } {
  const border = voice === 'shout' ? 2 : 1;
  const h = BUBBLE.textPx + 2 * BUBBLE.padYPx + 2 * border;
  if (voice === 'glyph') return { w: h, h, border };
  return { w: chars * BUBBLE.textPx + 2 * BUBBLE.padXPx + 2 * border, h, border };
}

export function bubbleShape(voice: Voice, chars: number, spot: Spot): Shape {
  const { w, h, border } = boxSize(voice, chars);
  const base = tailBase(border);
  const rows = BUBBLE.tailRows;
  if (spot === 'beside-right' || spot === 'beside-left') {
    // Beside the item over the head (centred, BUBBLE.itemHalfPx wide on each side), at the head's
    // height; the tail goes down steeply to the head.
    const right = spot === 'beside-right';
    const x = right ? BUBBLE.besideXPx : -BUBBLE.besideXPx - w;
    const tailX = right ? x + 1 : x + w - 1 - base;
    return {
      x,
      y: BUBBLE.besideBottomPx - h,
      w,
      h,
      border,
      tailX,
      lean: right ? -2 : 2,
      tailRows: rows,
    };
  }
  const right = spot === 'right';
  const x = right ? BUBBLE.overXPx : -BUBBLE.overXPx - w;
  const tailX = right ? x + 2 : x + w - 2 - base;
  return { x, y: -h, w, h, border, tailX, lean: right ? -1 : 1, tailRows: rows };
}

/** The tail's rows from the bubble's bottom border down: [left, right] inclusive. */
export function tailSpans(shape: Shape): readonly (readonly [number, number])[] {
  const { border, tailRows, lean, tailX } = shape;
  const base = tailBase(border);
  const spans: [number, number][] = [];
  for (let j = 0; j < border + tailRows; j++) {
    const below = Math.max(0, j - border + 1);
    // It narrows to 2 px (the border only) at the tip, leaning as it goes down.
    const shrink = Math.ceil((below * (base - 2)) / tailRows);
    const shift = below * lean;
    const left = tailX + shift + (lean > 0 ? shrink : 0);
    const right = tailX + base - 1 + shift - (lean < 0 ? shrink : 0);
    spans.push([left, right]);
  }
  return spans;
}

/** How far the spikes of a shout reach out of the box (drawBubble.ts: 3 px and their outline). */
export const SPIKE_PX = 4;

/** Everything drawn for the bubble: the box, the tail, the shadow 1 px down right, the spikes. */
export function shapeExtent(shape: Shape): Extent {
  const spans = tailSpans(shape);
  const tailLeft = Math.min(...spans.map(([l]) => l));
  const tailRight = Math.max(...spans.map(([, r]) => r)) + 1;
  const spike = shape.border === 2 ? SPIKE_PX : 0;
  const tailBottom = shape.y + shape.h - shape.border + spans.length;
  return {
    left: Math.min(shape.x - spike, tailLeft),
    right: Math.max(shape.x + shape.w + Math.max(1, spike), tailRight + 1),
    top: shape.y - spike,
    bottom: Math.max(shape.y + shape.h + Math.max(1, spike), tailBottom + 1),
  };
}
