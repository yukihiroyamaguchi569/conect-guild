import { describe, expect, it } from 'vitest';
import { SPRITE_SIZE } from './metrics';
import { frameInSheet, spriteDraw } from './spriteArt';

describe('spriteDraw', () => {
  it('takes frame n from the n-th 80 px column of the sheet', () => {
    expect(([0, 1, 2, 3] as const).map((f) => spriteDraw(f, { x: 0, y: 0 }).sx)).toEqual([
      0, 80, 160, 240,
    ]);
  });

  it('takes the holding frames 4–6 from the columns after them', () => {
    expect(([4, 5, 6] as const).map((f) => spriteDraw(f, { x: 0, y: 0 }).sx)).toEqual([
      320, 400, 480,
    ]);
  });

  it('takes the sleeping frame 7 from the last column', () => {
    expect(spriteDraw(7, { x: 0, y: 0 }).sx).toBe(560);
  });

  it('puts the bottom centre of the frame on the feet', () => {
    const draw = spriteDraw(0, { x: 528, y: 256 });
    expect(draw.dx + SPRITE_SIZE / 2).toBe(528);
    expect(draw.dy + SPRITE_SIZE).toBe(256);
  });

  it('snaps to whole pixels while walking between tiles', () => {
    const draw = spriteDraw(2, { x: 100.4, y: 200.6 });
    expect([draw.dx, draw.dy]).toEqual([100 - 40, 201 - 80]);
  });
});

describe('frameInSheet', () => {
  it('keeps a frame the sheet has', () => {
    expect(frameInSheet(7, 8 * SPRITE_SIZE)).toBe(7);
    expect(frameInSheet(6, 7 * SPRITE_SIZE)).toBe(6);
    expect(frameInSheet(0, SPRITE_SIZE)).toBe(0);
  });

  it('falls back to the front frame when the sheet is too narrow for it', () => {
    expect(frameInSheet(7, 7 * SPRITE_SIZE)).toBe(0);
    expect(frameInSheet(7, 8 * SPRITE_SIZE - 1)).toBe(0);
    expect(frameInSheet(4, 4 * SPRITE_SIZE)).toBe(0);
  });
});
