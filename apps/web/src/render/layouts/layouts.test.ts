import { describe, expect, it } from 'vitest';
import { contains, isWalkableIn, overlaps, spriteRect, tallestWindowExtentsFor } from '../map';
import { levelTags } from '../levelTags';
import { bubbleBox, tagBox } from '../overhead';
import { findPath, tileToPoint } from '../path';
import { DEFAULT_SEATS } from '../scenes';
import { seatSinkFor } from '../seating';
import { LAYOUTS } from './index';
import { TILE_SIZE } from '../metrics';
import type { GuildLayout, TilePos } from './types';

/**
 * What every office layout must keep (Issue #18), whatever its number of departments: members can
 * walk between their seats and the counter, nothing that matters is under an HTML window, the
 * guests have room, and the desks match the departments.
 */

const keyOf = (pos: TilePos): string => `${String(pos.col)},${String(pos.row)}`;

/** The ground under `pos`: the last fill that covers it (later fills win). */
function groundAt(layout: GuildLayout, pos: TilePos): string | undefined {
  return layout.groundFills.findLast((fill) => contains(fill, pos))?.tile;
}

/** The seats of those who walk: かなめ and each desk (the king never leaves the throne). */
const walkerSeats = (layout: GuildLayout): TilePos[] => [
  layout.commanderSeat,
  ...layout.desks.map((desk) => desk.seat),
];
const allSeats = (layout: GuildLayout): TilePos[] => [...walkerSeats(layout), layout.kingSeat];

function underWindow(layout: GuildLayout, pos: TilePos): boolean {
  const sprite = spriteRect(pos);
  return Object.values(tallestWindowExtentsFor(layout)).some((area) => overlaps(sprite, area));
}

describe.each(Object.values(LAYOUTS))('layout of $departmentCount departments: seats', (layout) => {
  const walkable = (pos: TilePos): boolean => isWalkableIn(layout, pos);
  const route = (from: TilePos, to: TilePos) => findPath(from, to, walkable);

  it('has one desk per department', () => {
    expect(layout.desks).toHaveLength(layout.departmentCount);
  });

  it('gives everyone a seat of their own', () => {
    const keys = allSeats(layout).map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lets everyone but the king walk seat → counter front → seat on walkable tiles', () => {
    for (const seat of [...walkerSeats(layout), layout.places.throneSide]) {
      expect(walkable(seat)).toBe(true);
      const there = route(seat, layout.places.counterFront);
      const back = route(layout.places.counterFront, seat);
      expect(there).not.toBeNull();
      expect(back).not.toBeNull();
      for (const tile of [...(there ?? []), ...(back ?? [])]) expect(walkable(tile)).toBe(true);
    }
  });

  it('keeps every seat clear of the windows at their tallest', () => {
    for (const seat of allSeats(layout)) expect(underWindow(layout, seat)).toBe(false);
  });

  it('keeps the bubble over every seat clear of the windows at their tallest', () => {
    const windows = Object.values(tallestWindowExtentsFor(layout));
    const sinks = seatSinkFor(layout);
    for (const seat of allSeats(layout)) {
      const feet = tileToPoint(seat);
      // Standing and sunk into the seat (seating.ts): the bubble moves down with the member.
      for (const dy of [0, sinks.get(keyOf(seat)) ?? 0]) {
        const box = bubbleBox(
          { x: feet.x, y: feet.y + dy },
          { voice: 'glyph', chars: 1 },
          'right',
          0,
        );
        for (const area of windows) expect(overlaps(box, area)).toBe(false);
      }
    }
  });

  it('puts the 「Lv N」 of every desk on its front, clear of the windows at their tallest', () => {
    const windows = Object.values(tallestWindowExtentsFor(layout));
    for (const desk of layout.desks) {
      const [tag] = levelTags({ minori: 99 }, { ...DEFAULT_SEATS, minori: desk.seat });
      if (tag === undefined) throw new Error('no tag');
      const box = tagBox(tag);
      const front = layout.objects.filter(
        (object) =>
          object.tile === 'desk' &&
          box.left >= object.col * TILE_SIZE &&
          box.right <= (object.col + object.w) * TILE_SIZE &&
          box.top >= object.row * TILE_SIZE &&
          box.bottom <= (object.row + object.h) * TILE_SIZE,
      );
      expect(front, keyOf(desk.seat)).toHaveLength(1);
      for (const area of windows) expect(overlaps(box, area), keyOf(desk.seat)).toBe(false);
    }
  });
});

describe.each(Object.values(LAYOUTS))(
  'layout of $departmentCount departments: guests and things',
  (layout) => {
    const walkable = (pos: TilePos): boolean => isWalkableIn(layout, pos);

    it('stands the guests on two walkable tiles, clear of the windows, reachable from the door', () => {
      const [first, second] = layout.guestSpots;
      expect(keyOf(first)).not.toBe(keyOf(second));
      expect(walkable(layout.offstage)).toBe(true);
      const seats = new Set(allSeats(layout).map(keyOf));
      for (const spot of layout.guestSpots) {
        expect(walkable(spot)).toBe(true);
        expect(underWindow(layout, spot)).toBe(false);
        expect(seats.has(keyOf(spot))).toBe(false);
        expect(findPath(layout.offstage, spot, walkable)).not.toBeNull();
      }
    });

    it('stands no guest on the red rug, nor next to it (the picture is wider than a tile)', () => {
      for (const spot of layout.guestSpots) {
        for (const col of [spot.col - 1, spot.col, spot.col + 1]) {
          expect(groundAt(layout, { col, row: spot.row }), keyOf(spot)).not.toBe('rug-red');
        }
      }
    });

    it('puts no decor on a seat or a guest spot', () => {
      for (const tile of [...allSeats(layout), ...layout.guestSpots]) {
        expect(layout.decor.filter((item) => contains(item, tile))).toEqual([]);
      }
    });

    it('pairs the chats both ways, never with the same desk', () => {
      layout.desks.forEach((desk, i) => {
        if (desk.chatWith === undefined) return;
        expect(desk.chatWith).not.toBe(i);
        expect(layout.desks[desk.chatWith]?.chatWith).toBe(i);
      });
    });

    it('places each department thing in the room, once, for one desk only', () => {
      const things = layout.desks.flatMap((desk) => desk.things);
      expect(new Set(things).size).toBe(things.length);
      for (const thing of things) {
        expect(layout.decor.filter((item) => item.name === thing)).toHaveLength(1);
      }
    });

    it('keeps the party window extents in order', () => {
      expect(layout.partyWindow.tallestBottom).toBeGreaterThanOrEqual(layout.partyWindow.bottom);
      expect(layout.toss.maxTiles).toBeGreaterThan(0);
    });
  },
);
