import { describe, expect, it } from 'vitest';
import { bubbleShape, shapeExtent, SPIKE_PX, tailBase, tailSpans, type Spot } from './bubbleShape';
import { BUBBLE, BUBBLE_RISE } from './metrics';

describe('bubbleShape: the box', () => {
  it('holds 8 px text with 3 px at the sides and 2 px over and under, in a 1 px border', () => {
    const shape = bubbleShape('say', 5, 'right');
    expect(shape.h).toBe(8 + 2 * 2 + 2);
    expect(shape.w).toBe(5 * 8 + 2 * 3 + 2);
    expect(shape.border).toBe(1);
  });

  it('sits over the point over the head, its top BUBBLE_RISE up', () => {
    const shape = bubbleShape('say', 3, 'right');
    expect(shape.y + shape.h).toBe(0);
    expect(-shape.y).toBe(BUBBLE_RISE);
  });

  it('makes a waiting sign a small square as high as words', () => {
    const glyph = bubbleShape('glyph', 1, 'right');
    expect(glyph.w).toBe(glyph.h);
    expect(glyph.h).toBe(bubbleShape('say', 1, 'right').h);
  });

  it('gives a shout a 2 px border, as much room inside, and a whisper the plain size', () => {
    const say = bubbleShape('say', 1, 'right');
    const shout = bubbleShape('shout', 1, 'right');
    expect(shout.border).toBe(2);
    expect(shout.w - say.w).toBe(2);
    expect(shout.h - say.h).toBe(2);
    expect(bubbleShape('whisper', 6, 'left')).toEqual(bubbleShape('say', 6, 'left'));
  });

  it('starts BUBBLE.overXPx right of the feet, or ends as far left of them', () => {
    const right = bubbleShape('say', 4, 'right');
    const left = bubbleShape('say', 4, 'left');
    expect(right.x).toBe(BUBBLE.overXPx);
    expect(left.x + left.w).toBe(-BUBBLE.overXPx);
  });

  it('goes beside a raised item at the head’s height, clear of the item', () => {
    for (const spot of ['beside-right', 'beside-left'] as const) {
      const shape = bubbleShape('say', 4, spot);
      expect(shape.y + shape.h).toBe(BUBBLE.besideBottomPx);
      // The item is 8 detail px each side of the middle.
      if (spot === 'beside-right') expect(shape.x).toBeGreaterThan(8);
      else expect(shape.x + shape.w).toBeLessThan(-8);
    }
  });
});

describe('bubbleShape: the tail', () => {
  const spots: readonly Spot[] = ['right', 'left', 'beside-right', 'beside-left'];

  it.each(spots)('%s: narrows row by row to the 2 px border at the tip', (spot) => {
    const shape = bubbleShape('say', 3, spot);
    const spans = tailSpans(shape);
    expect(spans).toHaveLength(shape.border + BUBBLE.tailRows);
    expect(spans[0]).toEqual([shape.tailX, shape.tailX + tailBase(1) - 1]);
    const widths = spans.map(([l, r]) => r - l + 1);
    for (let i = 1; i < widths.length; i++)
      expect(widths[i]).toBeLessThanOrEqual(widths[i - 1] ?? 0);
    expect(widths.at(-1)).toBe(2);
  });

  it.each(spots)('%s: leans to the head (the middle, x 0) and stops short of it', (spot) => {
    const shape = bubbleShape('say', 3, spot);
    const spans = tailSpans(shape);
    const centre = ([l, r]: readonly [number, number]) => (l + r) / 2;
    const [first] = spans;
    const tip = spans.at(-1);
    if (first === undefined || tip === undefined) throw new Error('no tail');
    expect(Math.abs(centre(tip))).toBeLessThan(Math.abs(centre(first)));
    // The tip is still over the head's top (the hair is about 5 detail px under the point).
    expect(shape.y + shape.h - shape.border + spans.length).toBeLessThanOrEqual(
      BUBBLE.besideBottomPx + BUBBLE.tailRows,
    );
  });

  it('starts within the box’s bottom edge', () => {
    for (const spot of spots) {
      const shape = bubbleShape('say', 1, spot);
      const [first] = tailSpans(shape);
      if (first === undefined) throw new Error('no tail');
      expect(first[0]).toBeGreaterThanOrEqual(shape.x + 1);
      expect(first[1]).toBeLessThanOrEqual(shape.x + shape.w - 2);
    }
  });
});

describe('shapeExtent', () => {
  it('covers the box, its shadow and the tail', () => {
    const shape = bubbleShape('say', 3, 'right');
    const extent = shapeExtent(shape);
    expect(extent.top).toBe(shape.y);
    expect(extent.right).toBe(shape.x + shape.w + 1);
    expect(extent.left).toBeLessThanOrEqual(shape.x);
    expect(extent.bottom).toBe(shape.y + shape.h + BUBBLE.tailRows + 1);
  });

  it('covers a shout’s spikes', () => {
    const shape = bubbleShape('shout', 1, 'right');
    const extent = shapeExtent(shape);
    expect(extent.top).toBe(shape.y - SPIKE_PX);
    expect(extent.left).toBe(shape.x - SPIKE_PX);
    expect(extent.right).toBe(shape.x + shape.w + SPIKE_PX);
  });
});
