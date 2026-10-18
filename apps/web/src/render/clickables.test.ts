import { describe, expect, it } from 'vitest';
import {
  CLICKABLES,
  clickableAt,
  rectPercent,
  seatedSpriteRect,
  toLogical,
  type Clickable,
} from './clickables';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import { SEATING, SPRITE_SIZE } from './metrics';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';

/** What can be pressed on the canvas (Issue #187). */

const [KING] = CLICKABLES;
if (KING === undefined) throw new Error('the king cannot be pressed');
const { rect } = KING;
const MIDDLE = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };

/** The CSS offset of a logical point on a canvas `width` CSS px wide (16:9). */
function offsetOf(point: { x: number; y: number }, width: number) {
  const height = (width * LOGICAL_HEIGHT) / LOGICAL_WIDTH;
  return {
    offset: { x: (point.x * width) / LOGICAL_WIDTH, y: (point.y * height) / LOGICAL_HEIGHT },
    size: { width, height },
  };
}

describe('the king on the throne', () => {
  it('is his 80 px frame where he is drawn seated (sunk into the throne)', () => {
    const feet = tileToPoint(DEFAULT_SEATS.yukihiro);
    expect(rect).toEqual({
      left: feet.x - SPRITE_SIZE / 2,
      top: feet.y + SEATING.thronePx - SPRITE_SIZE,
      right: feet.x + SPRITE_SIZE / 2,
      bottom: feet.y + SEATING.thronePx,
    });
    expect(seatedSpriteRect(DEFAULT_SEATS.yukihiro)).toEqual(rect);
  });

  it('has an accessible name for its button', () => {
    expect(KING.label).toBe('王様に話しかける');
  });

  it('lies inside the canvas', () => {
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(LOGICAL_WIDTH);
    expect(rect.bottom).toBeLessThanOrEqual(LOGICAL_HEIGHT);
  });
});

describe('toLogical', () => {
  it('maps the corners of the canvas to the logical ones at any width', () => {
    for (const width of [1024, 2048, 1337.5, 777]) {
      const size = { width, height: (width * 9) / 16 };
      expect(toLogical({ x: 0, y: 0 }, size)).toEqual({ x: 0, y: 0 });
      const far = toLogical({ x: size.width, y: size.height }, size);
      expect(far?.x).toBeCloseTo(LOGICAL_WIDTH);
      expect(far?.y).toBeCloseTo(LOGICAL_HEIGHT);
    }
  });

  it('scales by a factor that is not whole', () => {
    // 1.3 times the logical size.
    const size = { width: LOGICAL_WIDTH * 1.3, height: LOGICAL_HEIGHT * 1.3 };
    const point = toLogical({ x: 130, y: 65 }, size);
    expect(point?.x).toBeCloseTo(100);
    expect(point?.y).toBeCloseTo(50);
  });

  it('gives nothing for a canvas with no size (narrow screens hide it)', () => {
    expect(toLogical({ x: 0, y: 0 }, { width: 0, height: 0 })).toBeNull();
    expect(toLogical({ x: 10, y: 10 }, { width: 100, height: 0 })).toBeNull();
  });
});

describe('clickableAt', () => {
  it('finds the king under a click on him, at whole and broken scales', () => {
    for (const width of [1024, 2048, 1333.33, 761]) {
      const { offset, size } = offsetOf(MIDDLE, width);
      expect(clickableAt(toLogical(offset, size))).toBe('king');
    }
  });

  it('finds nothing off him', () => {
    expect(clickableAt({ x: rect.left - 1, y: MIDDLE.y })).toBeNull();
    expect(clickableAt({ x: rect.right, y: MIDDLE.y })).toBeNull();
    expect(clickableAt({ x: MIDDLE.x, y: rect.top - 0.01 })).toBeNull();
    expect(clickableAt({ x: MIDDLE.x, y: rect.bottom })).toBeNull();
    expect(clickableAt({ x: 0, y: 0 })).toBeNull();
  });

  it('takes his left and top edges in', () => {
    expect(clickableAt({ x: rect.left, y: rect.top })).toBe('king');
    expect(clickableAt({ x: rect.right - 0.01, y: rect.bottom - 0.01 })).toBe('king');
  });

  it('finds an edge click at a broken scale as the logical point says', () => {
    // On a canvas 1.37 times the logical size, a CSS pixel is under a logical one.
    const width = LOGICAL_WIDTH * 1.37;
    const inside = offsetOf({ x: rect.left + 0.5, y: MIDDLE.y }, width);
    const outside = offsetOf({ x: rect.left - 0.5, y: MIDDLE.y }, width);
    expect(clickableAt(toLogical(inside.offset, inside.size))).toBe('king');
    expect(clickableAt(toLogical(outside.offset, outside.size))).toBeNull();
  });

  it('finds nothing for no point', () => {
    expect(clickableAt(null)).toBeNull();
  });

  it('takes the first of overlapping things (front first)', () => {
    const box = { left: 0, top: 0, right: 10, bottom: 10 };
    const front: Clickable = { id: 'king', rect: box, label: 'front' };
    expect(clickableAt({ x: 5, y: 5 }, [front, { ...front, label: 'back' }])).toBe('king');
    expect(clickableAt({ x: 5, y: 5 }, [])).toBeNull();
  });
});

describe('rectPercent', () => {
  it('places the button over the same spot in % of the canvas', () => {
    const at = rectPercent(rect);
    expect(at.left).toBeCloseTo((rect.left / LOGICAL_WIDTH) * 100);
    expect(at.top).toBeCloseTo((rect.top / LOGICAL_HEIGHT) * 100);
    expect(at.width).toBeCloseTo((SPRITE_SIZE / LOGICAL_WIDTH) * 100);
    expect(at.height).toBeCloseTo((SPRITE_SIZE / LOGICAL_HEIGHT) * 100);
  });

  it('covers the whole canvas for the whole canvas', () => {
    const whole = { left: 0, top: 0, right: LOGICAL_WIDTH, bottom: LOGICAL_HEIGHT };
    expect(rectPercent(whole)).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });
});
