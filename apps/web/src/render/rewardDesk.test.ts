import { describe, expect, it } from 'vitest';
import { LAYOUTS, SELECTED_LAYOUT } from './layouts';
import type { TilePos } from './layouts/types';
import { levelTags } from './levelTags';
import { contains, overlaps, tallestWindowExtentsFor, type PxRect } from './map';
import { TILE_SIZE } from './metrics';
import { bubbleBox } from './overhead';
import { tileToPoint } from './path';
import { REWARD_SCALE, rewardOnDesk, rewardShownAt, rewardSparkle } from './rewardDesk';
import type { Spot } from './bubbleShape';
import { DEFAULT_SEATS } from './scenes';

/** The king's reward of the day on a desk (Issues #194, #208). */

const SIDE = TILE_SIZE * REWARD_SCALE;
const SPOTS: readonly Spot[] = ['right', 'left', 'beside-right', 'beside-left'];
/** Around the 「Lv 10」 under `seat` (levelTags.ts; drawLevelTags.ts draws it 10 px bold). */
function tagArea(seat: TilePos): PxRect {
  const [tag] = levelTags({ minori: 10 }, { ...DEFAULT_SEATS, minori: seat });
  if (tag === undefined) throw new Error('no tag');
  return { left: tag.x - 20, top: tag.y - 8, right: tag.x + 20, bottom: tag.y + 8 };
}

describe.each(Object.values(LAYOUTS))(
  'rewardOnDesk in the layout of $departmentCount departments',
  (layout) => {
    it.each(layout.desks.map((desk) => [desk.seat.col, desk.seat.row, desk.seat] as const))(
      'stands on the desk top in front of the seat %i,%i, beside the member, clear of the rest',
      (_col, _row, seat) => {
        const placed = rewardOnDesk(layout, seat, 'onigiri');
        const desk = layout.objects.find(
          (item) => item.tile === 'desk' && contains(item, { col: seat.col, row: seat.row + 1 }),
        );
        if (placed === null || desk === undefined) throw new Error('no desk in front of the seat');
        expect(placed.name).toBe('onigiri');
        expect(placed.scale).toBe(REWARD_SCALE);
        const box = {
          left: placed.x,
          top: placed.y,
          right: placed.x + SIDE,
          bottom: placed.y + SIDE,
        };
        // Within the desk's width, resting on its top row.
        expect(box.left).toBeGreaterThanOrEqual(desk.col * TILE_SIZE);
        expect(box.right).toBeLessThanOrEqual((desk.col + desk.w) * TILE_SIZE);
        expect(box.bottom).toBeGreaterThan(desk.row * TILE_SIZE);
        expect(box.bottom).toBeLessThanOrEqual((desk.row + 1) * TILE_SIZE);
        // Beside the member in the chair, not over them.
        const middle = seat.col * TILE_SIZE + TILE_SIZE / 2;
        const member = {
          left: middle - TILE_SIZE / 2,
          top: 0,
          right: middle + TILE_SIZE / 2,
          bottom: box.bottom,
        };
        expect(overlaps(box, member)).toBe(false);
        const feet = tileToPoint(seat);
        expect(overlaps(box, tagArea(seat))).toBe(false);
        for (const spot of SPOTS) {
          const bubble = bubbleBox(feet, { voice: 'glyph', chars: 1 }, spot, 0);
          expect(overlaps(box, bubble), spot).toBe(false);
        }
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

  it('takes the wider stretch of desk beside the member', () => {
    const desk = { tile: 'desk', solid: true, col: 10, row: 5, w: 4, h: 2 } as const;
    const left = rewardOnDesk({ objects: [desk] }, { col: 12, row: 4 }, 'dango');
    const right = rewardOnDesk({ objects: [desk] }, { col: 11, row: 4 }, 'dango');
    expect(left?.x).toBe((10 * TILE_SIZE + 12 * TILE_SIZE - SIDE) / 2);
    expect(right?.x).toBe((12 * TILE_SIZE + 14 * TILE_SIZE - SIDE) / 2);
  });
});

describe('rewardSparkle', () => {
  const placed = { name: 'medal', x: 100, y: 50, scale: REWARD_SCALE } as const;

  it('twinkles over the top-right of the picture', () => {
    const bright = rewardSparkle(placed, 0);
    const dim = rewardSparkle(placed, 600);
    expect(bright.alpha).toBeCloseTo(1);
    expect(dim.alpha).toBeCloseTo(0.1);
    expect(rewardSparkle(placed, 1_200).alpha).toBeCloseTo(1);
    expect(bright.x).toBeGreaterThan(placed.x + SIDE / 2);
    expect(bright.x).toBeLessThan(placed.x + SIDE);
    expect(bright.y).toBeGreaterThan(placed.y);
    expect(bright.y).toBeLessThan(placed.y + SIDE / 2);
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
