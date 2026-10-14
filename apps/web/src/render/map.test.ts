import { describe, expect, it } from 'vitest';
import { ACTIVE_MEMBER_IDS, MEMBERS, type MemberId } from '../guild.config';
import {
  contains,
  GROUND,
  groundAt,
  isUnderWindow,
  overlaps,
  spriteRect,
  isInsideMap,
  isWalkable,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAP_COLS,
  MAP_OBJECTS,
  MAP_ROWS,
  PLACES,
  TALLEST_WINDOW_EXTENTS,
  TILE_NAMES,
  WINDOW_EXTENTS,
} from './map';
import { AMBIENT, OVERHEAD_TOP, SPRITE_SIZE } from './metrics';
import { findPath } from './path';

const WALKERS: readonly MemberId[] = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae'];
const DEPARTMENT_MEMBERS: readonly MemberId[] = ['minori', 'hibiki', 'hirame', 'sasae'];
/** Everyone, the king included (his bubble is HTML, but his head must show too). */
const SEATED: readonly MemberId[] = [...WALKERS, 'yukihiro'];

describe('map: size and contents', () => {
  it('is 32 x 18 tiles of 32 px (1024 x 576)', () => {
    expect([MAP_COLS, MAP_ROWS, LOGICAL_WIDTH, LOGICAL_HEIGHT]).toEqual([32, 18, 1024, 576]);
    expect(GROUND).toHaveLength(MAP_ROWS);
    for (const row of GROUND) expect(row).toHaveLength(MAP_COLS);
  });

  it('uses every tile kind of the art contract, and only those', () => {
    const used = new Set([...GROUND.flat(), ...MAP_OBJECTS.map((o) => o.tile)]);
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect([...used].toSorted(byName)).toEqual(TILE_NAMES.toSorted(byName));
  });

  it('keeps every piece of furniture inside the map', () => {
    for (const object of MAP_OBJECTS) {
      expect(isInsideMap(object)).toBe(true);
      expect(isInsideMap({ col: object.col + object.w - 1, row: object.row + object.h - 1 })).toBe(
        true,
      );
    }
  });

  it('walls in the room and puts the door at the bottom of the right wall', () => {
    expect(groundAt({ col: 0, row: 5 })).toBe('wall');
    expect(groundAt({ col: 31, row: 5 })).toBe('wall');
    expect(groundAt({ col: 5, row: 0 })).toBe('wall-top');
    // The back wall is two tiles high.
    expect(groundAt({ col: 16, row: 2 })).toBe('wall');
    // A doorway (floor) in the right wall, with the door drawn over it as decoration.
    const door = MAP_OBJECTS.find((o) => o.tile === 'door');
    expect(door).toBeDefined();
    if (door === undefined) return;
    expect(door.col + door.w).toBe(MAP_COLS);
    expect(door.row + door.h).toBe(MAP_ROWS - 1);
    expect(groundAt({ col: MAP_COLS - 1, row: MAP_ROWS - 2 })).toBe('floor');
    expect(groundAt({ col: MAP_COLS - 1, row: door.row - 1 })).toBe('wall');
  });

  it('draws windows and the door over the wall, not in place of it (they are see-through)', () => {
    for (const tile of ['window', 'door'] as const) {
      expect(GROUND.flat().includes(tile)).toBe(false);
      expect(MAP_OBJECTS.some((o) => o.tile === tile)).toBe(true);
    }
    for (const window of MAP_OBJECTS.filter((o) => o.tile === 'window')) {
      expect(groundAt(window)).toBe('wall');
    }
  });

  it('has nothing outside the map', () => {
    expect(groundAt({ col: -1, row: 0 })).toBeNull();
    expect(groundAt({ col: 0, row: MAP_ROWS })).toBeNull();
    expect(isInsideMap({ col: MAP_COLS, row: 0 })).toBe(false);
  });
});

describe('map: places and seats', () => {
  it('puts the throne at the back centre with the king on it', () => {
    const throne = MAP_OBJECTS.find((o) => o.tile === 'throne');
    expect(throne).toBeDefined();
    if (throne === undefined) return;
    expect(contains(throne, MEMBERS.yukihiro.seat)).toBe(true);
    expect(throne.row).toBeLessThanOrEqual(3);
    // Centred on it: the throne's middle is the king's feet.
    expect(MEMBERS.yukihiro.seat.col + 0.5).toBe(throne.col + throne.w / 2);
  });

  it.each(WALKERS)('seats %s where they can walk and are not under a window', (id) => {
    const seat = MEMBERS[id].seat;
    expect(isWalkable(seat)).toBe(true);
    // The whole sprite, head included, must be visible.
    expect(isUnderWindow(seat)).toBe(false);
  });

  it('keeps the king visible', () => {
    const seat = MEMBERS.yukihiro.seat;
    expect(isUnderWindow(seat)).toBe(false);
  });

  it('gives every member of the office a different seat', () => {
    const keys = ACTIVE_MEMBER_IDS.map(
      (id) => `${String(MEMBERS[id].seat.col)},${String(MEMBERS[id].seat.row)}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(DEPARTMENT_MEMBERS)('lets %s walk seat → counter front → seat', (id) => {
    const seat = MEMBERS[id].seat;
    expect(findPath(seat, PLACES.counterFront)).not.toBeNull();
    expect(findPath(PLACES.counterFront, seat)).not.toBeNull();
  });

  it.each(DEPARTMENT_MEMBERS)('lets かなめ walk from behind the counter to %s and back', (id) => {
    const there = findPath(MEMBERS.kaname.seat, MEMBERS[id].seat);
    const back = findPath(MEMBERS[id].seat, MEMBERS.kaname.seat);
    expect(there).not.toBeNull();
    expect(back).not.toBeNull();
    for (const tile of [...(there ?? []), ...(back ?? [])]) expect(isWalkable(tile)).toBe(true);
  });

  it('places one desk in each corner, right next to its department member', () => {
    const desks = MAP_OBJECTS.filter((o) => o.tile === 'desk');
    expect(desks).toHaveLength(4);
    for (const id of DEPARTMENT_MEMBERS) {
      const { col, row } = MEMBERS[id].seat;
      const around = [-1, 0, 1].flatMap((dc) =>
        [-1, 0, 1].map((dr) => ({ col: col + dc, row: row + dr })),
      );
      expect(desks.filter((d) => around.some((cell) => contains(d, cell)))).toHaveLength(1);
    }
  });
});

describe('map: seats behind the desks', () => {
  it.each(DEPARTMENT_MEMBERS)('seats %s on a chair’s lower cell, right behind a desk', (id) => {
    const seat = MEMBERS[id].seat;
    const chair = MAP_OBJECTS.find((o) => o.tile === 'chair' && contains(o, seat));
    expect(chair).toBeDefined();
    expect(seat.row).toBe((chair?.row ?? Number.NaN) + (chair?.h ?? 0) - 1);
    const below = { col: seat.col, row: seat.row + 1 };
    const desk = MAP_OBJECTS.find((o) => o.tile === 'desk' && contains(o, below));
    expect(desk?.row).toBe(below.row);
    // Not at the desk's end: the desk reaches past the member on both sides.
    if (desk === undefined) return;
    expect(seat.col).toBeGreaterThan(desk.col);
    expect(seat.col).toBeLessThan(desk.col + desk.w - 1);
  });

  it('gives every chair a member', () => {
    const chairs = MAP_OBJECTS.filter((o) => o.tile === 'chair');
    expect(chairs).toHaveLength(DEPARTMENT_MEMBERS.length);
    for (const chair of chairs) {
      expect(DEPARTMENT_MEMBERS.some((id) => contains(chair, MEMBERS[id].seat))).toBe(true);
    }
  });
});

describe('map: かなめ’s counter', () => {
  it('builds one counter of left, middle and right pieces, 7 to 9 tiles wide', () => {
    const pieces = MAP_OBJECTS.filter((o) => o.tile.startsWith('counter-'));
    expect(pieces.map((o) => o.tile)).toEqual(['counter-left', 'counter-mid', 'counter-right']);
    const [left, mid, right] = pieces;
    if (left === undefined || mid === undefined || right === undefined) return;
    expect([mid.col, right.col]).toEqual([left.col + left.w, mid.col + mid.w]);
    expect(new Set(pieces.map((o) => `${String(o.row)},${String(o.h)}`)).size).toBe(1);
    const width = right.col + right.w - left.col;
    expect(width).toBeGreaterThanOrEqual(7);
    expect(width).toBeLessThanOrEqual(9);
  });

  it('puts かなめ right behind the counter, facing the counter front', () => {
    const counter = MAP_OBJECTS.find((o) => o.tile === 'counter-mid');
    expect(counter).toBeDefined();
    if (counter === undefined) return;
    expect(contains(counter, { col: MEMBERS.kaname.seat.col, row: counter.row })).toBe(true);
    expect(MEMBERS.kaname.seat.row).toBe(counter.row - 1);
    expect(PLACES.counterFront).toEqual({
      col: MEMBERS.kaname.seat.col,
      row: counter.row + counter.h,
    });
  });
});

describe('map: the side of the throne (Issue #87)', () => {
  const throne = MAP_OBJECTS.find((o) => o.tile === 'throne');

  it('is a free tile right beside the throne, on its front row, clear of the windows', () => {
    expect(throne).toBeDefined();
    if (throne === undefined) return;
    expect(isWalkable(PLACES.throneSide)).toBe(true);
    expect(PLACES.throneSide.col).toBe(throne.col - 1);
    expect(PLACES.throneSide.row).toBe(throne.row + throne.h - 1);
    expect(isUnderWindow(PLACES.throneSide)).toBe(false);
  });

  it('is no seat, and かなめ walks there from the counter and back in 5 steps', () => {
    const seats = Object.values(MEMBERS).map((m) => `${String(m.seat.col)},${String(m.seat.row)}`);
    expect(seats).not.toContain(
      `${String(PLACES.throneSide.col)},${String(PLACES.throneSide.row)}`,
    );
    expect(findPath(MEMBERS.kaname.seat, PLACES.throneSide)).toHaveLength(6);
    expect(findPath(PLACES.throneSide, MEMBERS.kaname.seat)).toHaveLength(6);
  });
});

describe('map: walkable grid', () => {
  it('blocks walls, solid furniture and the outside', () => {
    expect(isWalkable({ col: 0, row: 10 })).toBe(false);
    expect(isWalkable({ col: 16, row: 8 })).toBe(false); // counter
    expect(isWalkable({ col: 3, row: 11 })).toBe(false); // map table (floor decor)
    expect(isWalkable({ col: -1, row: 10 })).toBe(false);
  });

  it('lets members cross rugs, carpet and chairs', () => {
    expect(isWalkable({ col: 16, row: 10 })).toBe(true); // rug-red
    expect(isWalkable({ col: 13, row: 4 })).toBe(true); // floor-carpet
    expect(isWalkable({ col: 14, row: 13 })).toBe(true); // light patch (flat decor)
    expect(isWalkable(MEMBERS.minori.seat)).toBe(true); // chair
  });

  it('keeps everyone out from under the windows', () => {
    expect(isWalkable({ col: 2, row: 3 })).toBe(false); // board
    expect(isWalkable({ col: 26, row: 3 })).toBe(false); // party
    expect(isWalkable({ col: 20, row: 15 })).toBe(false); // message
  });

  it('keeps heads out from under the windows too (sprites are 80 px tall)', () => {
    // Below the party window (bottom 340 px): feet on row 12 put the head at 336 px, under it.
    expect(isUnderWindow({ col: 24, row: 12 })).toBe(true);
    expect(isUnderWindow({ col: 24, row: 13 })).toBe(false);
    // Feet just above the message window: the head is above the feet, so this is fine.
    expect(isWalkable({ col: 24, row: 13 })).toBe(true);
  });

  it('keeps the sides of the sprite out too (80 px wide, beyond its own tile)', () => {
    // Column 10 is right of the board (ends at 309 px), but the sprite reaches back to 296 px.
    expect(isUnderWindow({ col: 10, row: 3 })).toBe(true);
    expect(isUnderWindow({ col: 11, row: 3 })).toBe(false);
    // Column 2 is left of the message window (from 100 px), but the sprite reaches to 112 px.
    expect(isUnderWindow({ col: 2, row: 15 })).toBe(true);
    expect(isUnderWindow({ col: 1, row: 15 })).toBe(false);
  });
});

describe('map: windows over the canvas (GuildScreen.vue)', () => {
  it('converts GuildScreen.vue’s % and cqw to logical px', () => {
    const { board, party, message } = WINDOW_EXTENTS;
    // 1.6% of 576 down, then max-height 31cqw = 31 x 10.24.
    expect(board.top).toBeCloseTo(9.216);
    expect(board.bottom).toBeCloseTo(9.216 + 317.44);
    expect(board.right).toBeCloseTo(30.2 * 10.24);
    expect(party.left).toBeCloseTo(74.3 * 10.24);
    expect(party.right).toBeCloseTo(98.9 * 10.24);
    expect(message.top).toBeCloseTo(80.7 * 5.76);
    expect(message.bottom).toBeCloseTo(98.1 * 5.76);
  });

  it('places the sprite frame with the feet at the bottom centre of the tile', () => {
    expect(spriteRect({ col: 4, row: 12 })).toEqual({
      left: 104,
      top: 336,
      right: 184,
      bottom: 416,
    });
  });

  it('counts overlap only when areas share some area', () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(overlaps(a, { left: 9, top: 9, right: 20, bottom: 20 })).toBe(true);
    expect(overlaps(a, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(false);
    expect(overlaps(a, { left: 0, top: 10, right: 10, bottom: 20 })).toBe(false);
  });

  it('keeps feet on row 11 under the tall board off the walking grid (head under it)', () => {
    expect(isUnderWindow({ col: 4, row: 11 })).toBe(true);
    expect(isUnderWindow({ col: 4, row: 12 })).toBe(false);
  });

  it('takes the tallest right-hand column (rare notes) only for seats', () => {
    expect(TALLEST_WINDOW_EXTENTS.party.bottom).toBe(373);
    expect(TALLEST_WINDOW_EXTENTS.party.bottom).toBeGreaterThan(WINDOW_EXTENTS.party.bottom);
    expect(TALLEST_WINDOW_EXTENTS.board).toEqual(WINDOW_EXTENTS.board);
  });

  it.each(SEATED)('keeps the head and bubble of %s clear of every window at its tallest', (id) => {
    const frame = spriteRect(MEMBERS[id].seat);
    // Mid-stretch, with the waiting bubble on top (the highest thing drawn over a member).
    const withBubble = { ...frame, top: frame.bottom - OVERHEAD_TOP - AMBIENT.stretchPx };
    for (const area of Object.values(TALLEST_WINDOW_EXTENTS)) {
      expect(overlaps(withBubble, area)).toBe(false);
    }
  });

  it('puts the bubble top over the sprite top', () => {
    expect(OVERHEAD_TOP).toBeGreaterThan(SPRITE_SIZE);
  });
});
