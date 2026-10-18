import { describe, expect, it } from 'vitest';
import { FRONT_LAYERS } from './layers';
import { LAYOUTS, SELECTED_LAYOUT } from './layouts';
import { contains, overlaps, tallestWindowExtentsFor } from './map';
import { TILE_SIZE } from './metrics';
import { rewardOnDesk, rewardShownAt } from './rewardDesk';

/** The king's reward of the day on a desk (Issue #194). */

describe.each(Object.values(LAYOUTS))(
  'rewardOnDesk in the layout of $departmentCount departments',
  (layout) => {
    it.each(layout.desks.map((desk) => [desk.seat.col, desk.seat.row, desk.seat] as const))(
      'stands on the desk top in front of the seat %i,%i, right of the member',
      (_col, _row, seat) => {
        const placed = rewardOnDesk(layout, seat, 'onigiri');
        const desk = layout.objects.find(
          (item) => item.tile === 'desk' && contains(item, { col: seat.col, row: seat.row + 1 }),
        );
        if (placed === null || desk === undefined) throw new Error('no desk in front of the seat');
        expect(placed.name).toBe('onigiri');
        expect(placed.depth).toBe((desk.row + desk.h) * TILE_SIZE);
        // Within the desk's width, right of the member's middle, over its top row.
        expect(placed.x).toBeGreaterThan(seat.col * TILE_SIZE + TILE_SIZE / 2);
        expect(placed.x + TILE_SIZE).toBeLessThanOrEqual((desk.col + desk.w) * TILE_SIZE);
        expect(placed.y).toBeGreaterThanOrEqual(desk.row * TILE_SIZE - TILE_SIZE / 2);
        expect(placed.y + TILE_SIZE).toBeLessThanOrEqual((desk.row + 1) * TILE_SIZE);
        const box = {
          left: placed.x,
          top: placed.y,
          right: placed.x + TILE_SIZE,
          bottom: placed.y + TILE_SIZE,
        };
        for (const area of Object.values(tallestWindowExtentsFor(layout))) {
          expect(overlaps(box, area)).toBe(false);
        }
      },
    );
  },
);

describe('rewardOnDesk', () => {
  it('finds no desk in front of the throne or the counter', () => {
    expect(rewardOnDesk(SELECTED_LAYOUT, SELECTED_LAYOUT.kingSeat, 'medal')).toBeNull();
    expect(rewardOnDesk(SELECTED_LAYOUT, SELECTED_LAYOUT.commanderSeat, 'medal')).toBeNull();
  });

  it('is drawn with a front layer of the selected layout', () => {
    for (const { seat } of SELECTED_LAYOUT.desks) {
      const placed = rewardOnDesk(SELECTED_LAYOUT, seat, 'dango');
      expect(FRONT_LAYERS.map((layer) => layer.depth)).toContain(placed?.depth);
    }
  });
});

describe('rewardShownAt', () => {
  const reward = { member: 'sasae', kind: 'onigiri', until: 1_000 } as const;

  it('shows the reward until its day is over, fetched or not', () => {
    expect(rewardShownAt(reward, 999)).toBe(reward);
    expect(rewardShownAt(reward, 1_000)).toBeNull();
    expect(rewardShownAt(null, 0)).toBeNull();
  });
});
