import { describe, expect, it } from 'vitest';
import { COMMANDER_ID, type MemberId } from '@conect-guild/snapshot/settings';
import { petTileIn, playSpotsFor, teaTileIn, windowTilesIn, type Crew } from '../idleSpots';
import { contains, isWalkableIn } from '../map';
import { tileDistance } from '../toss';
import { LAYOUT2 } from './layout2';
import { LAYOUT3 } from './layout3';
import { LAYOUT4 } from './layout4';
import { seatsFor } from './seats';
import {
  isFloorPatch,
  MAP_COLS,
  MAP_ROWS,
  type GuildLayout,
  type TilePos,
  type TileRect,
} from './types';

/**
 * Where the desks and the tavern of two and three departments are (Issue #18, the president's
 * order of 2026-10-14): the desks stand where layout4 has them, the lower row first filled, and
 * the guests stand in the tavern of the upper right.
 */

const [ACCOUNTS, , PLANNING, GENERAL] = LAYOUT4.desks;

/** The objects and decor of `layout` on `tile`, as "tile/name" (the order does not matter). */
function thingsOn(layout: GuildLayout, tile: TilePos): string[] {
  return [
    ...layout.objects.filter((object) => contains(object, tile)).map((o) => `tile/${o.tile}`),
    ...layout.decor.filter((item) => contains(item, tile)).map((item) => `decor/${item.name}`),
  ].sort((a, b) => a.localeCompare(b));
}

describe('two departments', () => {
  it('seats both at layout4 lower desks, left then right, chatting across the counter', () => {
    expect(LAYOUT2.desks).toEqual([
      { ...PLANNING, chatWith: 1 },
      { ...GENERAL, chatWith: 0 },
    ]);
  });

  it('keeps the lower desks, their chairs and their things where layout4 has them', () => {
    for (const desk of LAYOUT2.desks) {
      for (const tile of [desk.seat, { col: desk.seat.col, row: desk.seat.row + 1 }]) {
        expect(thingsOn(LAYOUT2, tile)).toEqual(thingsOn(LAYOUT4, tile));
      }
    }
  });

  it('has no desk in the upper row: a library on the left, the tavern on the right', () => {
    expect(LAYOUT2.objects.filter((object) => object.tile === 'desk' && object.row < 8)).toEqual(
      [],
    );
    const shelves = LAYOUT2.objects.filter((object) => object.tile === 'shelf' && object.row < 8);
    // Against the back wall (rows 1-2), not standing in the middle of the floor.
    expect(shelves.map((shelf) => shelf.row)).toEqual([3, 3]);
    expect(LAYOUT2.decor.some((item) => item.name === 'round-table' && item.col >= 18)).toBe(true);
  });

  it('lays no cat on the bench', () => {
    const cats = LAYOUT2.decor.filter((item) => item.name === 'sleeping-cat');
    for (const cat of cats) {
      expect(thingsOn(LAYOUT2, cat)).toEqual(['decor/sleeping-cat']);
    }
  });
});

describe('three departments', () => {
  it('seats the upper left first, then the lower row left to right', () => {
    expect(LAYOUT3.desks).toEqual([
      { seat: ACCOUNTS?.seat, side: 'upper', things: ACCOUNTS?.things },
      { ...PLANNING, chatWith: 2 },
      { ...GENERAL, chatWith: 1 },
    ]);
  });

  it('keeps the upper left desk, its chair, safe and things where layout4 has them', () => {
    for (let col = 10; col <= 14; col += 1) {
      for (let row = 3; row <= 6; row += 1) {
        expect(thingsOn(LAYOUT3, { col, row })).toEqual(thingsOn(LAYOUT4, { col, row }));
      }
    }
  });

  it('puts the tavern where layout4 has the upper right desk', () => {
    const upperRight = (layout: GuildLayout) =>
      layout.objects.some((o) => o.tile === 'desk' && o.col === 19 && o.row === 5);
    expect(upperRight(LAYOUT4)).toBe(true);
    expect(upperRight(LAYOUT3)).toBe(false);
    expect(LAYOUT3.decor.some((item) => item.name === 'round-table' && item.col >= 18)).toBe(true);
  });
});

describe.each([LAYOUT2, LAYOUT3])('$departmentCount departments: the guests', (layout) => {
  it('stand on the tavern carpet of the upper right, one behind the other, not before the table', () => {
    const table = layout.decor.find((item) => item.name === 'round-table');
    expect(table).toBeDefined();
    if (table === undefined) return;
    const carpet = { col: 19, row: 3, w: 4, h: 4 };
    expect(layout.groundFills).toContainEqual({ tile: 'floor-carpet', ...carpet });
    const [back, front] = layout.guestSpots;
    for (const spot of layout.guestSpots) expect(contains(carpet, spot)).toBe(true);
    // Three rows apart: the back one's name tags end above the front one's head.
    expect(front.row - back.row).toBe(3);
    // Right of the table, so the front one's picture leaves the table in sight.
    expect(front.col).toBe(table.col + table.w);
    expect(front.row).toBe(table.row + table.h - 1);
  });

  it("puts the front guest right of the back one, so its 「?」 misses the back one's tags", () => {
    const [back, front] = layout.guestSpots;
    expect(front.col).toBeGreaterThan(back.col);
  });
});

/** True when two tile rectangles share a cell. */
const sharesCell = (a: TileRect, b: TileRect): boolean =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

describe.each([LAYOUT2, LAYOUT3])('$departmentCount departments: nothing piled up', (layout) => {
  const things = layout.decor.filter((item) => !isFloorPatch(item));

  it('puts no small thing on another', () => {
    things.forEach((item, i) => {
      for (const other of things.slice(i + 1)) {
        expect(sharesCell(item, other), `${item.name} and ${other.name}`).toBe(false);
      }
    });
  });

  it('keeps every small thing inside the room', () => {
    for (const item of layout.decor) {
      expect(item.col >= 0 && item.row >= 0, item.name).toBe(true);
      expect(item.col + item.w <= MAP_COLS && item.row + item.h <= MAP_ROWS, item.name).toBe(true);
    }
  });

  it('puts no small thing on furniture other than a desk or the counter', () => {
    const surfaces = new Set(['desk', 'counter-left', 'counter-mid', 'counter-right']);
    const furniture = layout.objects.filter((object) => !surfaces.has(object.tile));
    for (const item of things) {
      for (const object of furniture) {
        expect(sharesCell(item, object), `${item.name} on ${object.tile}`).toBe(false);
      }
    }
  });
});

describe.each([
  { layout: LAYOUT2, members: ['minori', 'hibiki'] as const },
  { layout: LAYOUT3, members: ['minori', 'hibiki', 'hirame'] as const },
])('$layout.departmentCount departments: play spots', ({ layout, members }) => {
  const crew: Crew = {
    seats: seatsFor(layout, members),
    departmentMembers: members,
    active: [COMMANDER_ID, ...members],
  };
  const spots = playSpotsFor(layout, crew);

  it('gives かなめ and each department tea, the pet and a window, on walkable paths', () => {
    for (const id of crew.active) {
      const kinds = spots[id].map((spot) => spot.kind);
      expect(kinds, id).toEqual(expect.arrayContaining(['tea', 'pet', 'window']));
      for (const spot of spots[id]) {
        for (const tile of spot.path) expect(isWalkableIn(layout, tile)).toBe(true);
      }
    }
  });

  it('puts tea beside the mugs, the pet spot beside it and a window spot under the windows', () => {
    expect(teaTileIn(layout)).toEqual({ col: 22, row: 4 });
    expect(petTileIn(layout)).toEqual({ col: 19, row: 3 });
    // The library's bookcases stand under the left window of two departments.
    const left = layout.departmentCount === 3 ? [{ col: 11, row: 3 }] : [];
    expect(windowTilesIn(layout)).toEqual([...left, { col: 21, row: 3 }]);
  });

  it("keeps the play spots off the guests' tiles", () => {
    const plays = [teaTileIn(layout), petTileIn(layout), ...windowTilesIn(layout)];
    for (const spot of layout.guestSpots) expect(plays).not.toContainEqual(spot);
  });

  it('lets the lower desks chat with each other, and the upper one with nobody', () => {
    const chats = (id: MemberId) =>
      spots[id].filter((spot) => spot.kind === 'chat').map((spot) => spot.partner);
    const [lowerLeft, lowerRight] = members.slice(-2);
    if (lowerLeft === undefined || lowerRight === undefined) throw new Error('two lower desks');
    expect(chats(lowerLeft)).toEqual([lowerRight]);
    expect(chats(lowerRight)).toEqual([lowerLeft]);
    if (members.length === 3) expect(chats(members[0])).toEqual([]);
  });
});

describe('the tossed scroll', () => {
  const tossedTo = (layout: GuildLayout): boolean[] =>
    layout.desks.map(
      (desk) => tileDistance(layout.commanderSeat, desk.seat) <= layout.toss.maxTiles,
    );

  it('flies to no desk of two departments: both are in the lower row', () => {
    expect(tossedTo(LAYOUT2)).toEqual([false, false]);
  });

  it('flies only to the upper desk of three departments', () => {
    expect(tossedTo(LAYOUT3)).toEqual([true, false, false]);
  });
});
