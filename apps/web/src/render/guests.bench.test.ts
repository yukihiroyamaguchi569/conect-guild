import { describe, expect, it } from 'vitest';
import type { DecorName } from '../../../../assets/decor/decor';
import { decorPoint } from './decorPoint';
import { benchPoint, GUEST, guestFeet, guestFrame, type StageGuest } from './guests';
import { LAYOUTS } from './layouts';
import { overlaps, type PxRect } from './map';
import { TILE_SIZE } from './metrics';

/**
 * Where the pictures are inside their cells, px (assets/decor/decor.png, measured 2026-10-18): the
 * bench fills x 2–60 and y 9–31 of its 64 x 32 px, a stool x 6–24 of its 32 px, the round table
 * (with its stools) x 6–57 and y 26–63 of its 64 px. Other things count as their whole cells.
 */
const PICTURES: Partial<Record<DecorName, PxRect>> = {
  bench: { left: 2, right: 61, top: 9, bottom: 32 },
  stool: { left: 6, right: 25, top: 11, bottom: 32 },
  'round-table': { left: 6, right: 58, top: 26, bottom: 64 },
};

function pictureAt(name: DecorName, at: { x: number; y: number }, w: number, h: number): PxRect {
  const inset = PICTURES[name] ?? { left: 0, right: w, top: 0, bottom: h };
  return {
    left: at.x + inset.left,
    right: at.x + inset.right,
    top: at.y + inset.top,
    bottom: at.y + inset.bottom,
  };
}

const SPOTS = Object.entries(LAYOUTS).flatMap(([count, layout]) =>
  layout.guestSpots.map((spot) => ({ count, layout, spot })),
);

describe('benchPoint', () => {
  it('puts the bench on the feet, a little right of centred', () => {
    expect(benchPoint({ x: 240, y: 416 })).toEqual({
      x: 240 - TILE_SIZE + GUEST.benchDx,
      y: 416 - TILE_SIZE,
    });
  });
});

describe.each(SPOTS)('the bench of layout $count at $spot.col,$spot.row', ({ layout, spot }) => {
  const bench = pictureAt('bench', benchPoint(guestFeet(spot)), 2 * TILE_SIZE, TILE_SIZE);

  it('stays clear of the small things around it (the stools of #182)', () => {
    for (const item of layout.decor) {
      const picture = pictureAt(
        item.name,
        decorPoint(item),
        item.w * TILE_SIZE,
        item.h * TILE_SIZE,
      );
      expect(overlaps(bench, picture), item.name).toBe(false);
    }
  });

  it('stays clear of the furniture', () => {
    for (const object of layout.objects) {
      const area = {
        left: object.col * TILE_SIZE,
        right: (object.col + object.w) * TILE_SIZE,
        top: object.row * TILE_SIZE,
        bottom: (object.row + object.h) * TILE_SIZE,
      };
      expect(overlaps(bench, area), object.tile).toBe(false);
    }
  });
});

describe('benches only under guests that are on stage', () => {
  const guest = (index: number): StageGuest => ({ index, state: 'working', idleSince: null });
  const clock = { t: 0, wall: 0 };
  const frame = (spots: readonly { col: number; row: number }[], count: number) =>
    guestFrame(
      { guests: Array.from({ length: count }, (_, i) => guest(i)), sparkles: [], spots },
      clock,
      () => true,
    );

  it('poses (and so benches) one per guest with a spot, none without spots (six departments)', () => {
    expect(LAYOUTS[6]?.guestSpots).toEqual([]);
    expect(frame([], 2).poses).toEqual([]);
    const spots = LAYOUTS[4]?.guestSpots ?? [];
    expect(frame(spots, 3).poses.map((pose) => pose.feet)).toEqual(spots.map(guestFeet));
    expect(frame(spots, 0).poses).toEqual([]);
  });
});
