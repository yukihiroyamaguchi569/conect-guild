import { describe, expect, it } from 'vitest';
import { DECOR } from '../../../../assets/decor/decor';
import { decorPoint } from './decorPoint';
import { rect } from './layouts/types';
import { TILE_SIZE } from './metrics';
import { monthAt, ORNAMENTS, ornamentOf, ornamentPlacement } from './ornament';

/** The month's ornament (Issue #192). */

describe('monthAt', () => {
  it('reads the local month, turning over at local midnight', () => {
    expect(monthAt(new Date(2026, 9, 31, 23, 59, 59, 999).getTime())).toBe(10);
    expect(monthAt(new Date(2026, 10, 1, 0, 0, 0, 0).getTime())).toBe(11);
    expect(monthAt(new Date(2026, 11, 31, 23, 59).getTime())).toBe(12);
    expect(monthAt(new Date(2027, 0, 1, 0, 0).getTime())).toBe(1);
  });
});

describe('ORNAMENTS', () => {
  it('has one ornament a month, each its own picture, January to December', () => {
    expect(ORNAMENTS).toHaveLength(12);
    expect(new Set(ORNAMENTS.map((one) => one.name)).size).toBe(12);
    expect(ornamentOf(1).name).toBe('kadomatsu');
    expect(ornamentOf(10).name).toBe('jack-o-lantern');
    expect(ornamentOf(12).name).toBe('christmas-tree');
  });

  it('tells fixed lines in kana, ending in 。 or ！', () => {
    for (const { line } of ORNAMENTS) {
      expect(line).toMatch(/^[\u3040-\u30ff\u3000 、。！]+$/u);
      expect(line).toMatch(/[。！]$/u);
    }
  });

  it('fits every picture in the 2 x 2 spot', () => {
    for (const { name } of ORNAMENTS) {
      expect(DECOR[name].w).toBeLessThanOrEqual(2);
      expect(DECOR[name].h).toBeLessThanOrEqual(2);
    }
  });
});

describe('ornamentPlacement', () => {
  const spot = rect(29, 9, 2, 2);
  const box = (month: number) => {
    const placement = ornamentPlacement(spot, month);
    const { x, y } = decorPoint(placement);
    return { x, y, w: placement.w * TILE_SIZE, h: placement.h * TILE_SIZE };
  };

  it('fills the spot with a picture of its size', () => {
    expect(box(12)).toEqual({ x: 928, y: 288, w: 64, h: 64 });
  });

  it('stands a smaller picture on the floor of the spot, in the middle', () => {
    // The pumpkin is one tile; the beans and the mask two tiles wide and one high.
    expect(box(10)).toEqual({ x: 944, y: 320, w: 32, h: 32 });
    expect(box(2)).toEqual({ x: 928, y: 320, w: 64, h: 32 });
  });

  it('draws every month inside the spot', () => {
    for (let month = 1; month <= 12; month++) {
      const { x, y, w, h } = box(month);
      expect(x).toBeGreaterThanOrEqual(928);
      expect(y).toBeGreaterThanOrEqual(288);
      expect(x + w).toBeLessThanOrEqual(992);
      expect(y + h).toBe(352);
    }
  });
});
