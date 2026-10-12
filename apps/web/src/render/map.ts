import type { TilePos } from '../guild.config';
import { DECOR_PLACEMENTS } from './decor';
import { SPRITE_SIZE, TILE_SIZE } from './metrics';

/**
 * The office as a tile map: 32 x 18 tiles (render/metrics.ts sets the pixel sizes). Pure data plus the
 * walkable grid derived from it. The layout follows assets/concept/rpg-company-ui.png:
 * the throne at the back centre, かなめ's counter in the middle, a desk in each wing and the door
 * at the bottom right. Nothing that matters is placed under the HTML windows (WINDOW_EXTENTS).
 */

export const MAP_COLS = 32;
export const MAP_ROWS = 18;
export const LOGICAL_WIDTH = MAP_COLS * TILE_SIZE;
export const LOGICAL_HEIGHT = MAP_ROWS * TILE_SIZE;

/** Tile kinds shared with the tile art (assets/tiles/tiles.ts). */
export const TILE_NAMES = [
  'floor',
  'floor-carpet',
  'wall',
  'wall-top',
  'rug-red',
  'plant',
  'crate',
  'desk',
  'board',
  'chair',
  'window',
  'throne',
  'shelf',
  'door',
  'counter-left',
  'counter-mid',
  'counter-right',
] as const;
export type TileName = (typeof TILE_NAMES)[number];

/** A rectangle in tile units. */
export interface TileRect {
  readonly col: number;
  readonly row: number;
  readonly w: number;
  readonly h: number;
}

/** A piece of furniture drawn over the ground. Solid ones cannot be walked through. */
export interface MapObject extends TileRect {
  readonly tile: TileName;
  readonly solid: boolean;
}

/** A rectangle in logical px (edges, not size). */
export interface PxRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * GuildScreen.vue places the windows in % of the stage (left / right / width of its width, top / bottom /
 * height of its height) and cqw (1 % of the stage width). The stage is the canvas, 1024 x 576
 * logical px, so 1 % across = 10.24 px, 1 % down = 5.76 px and 1cqw = 10.24 px.
 */
const PCT_X = LOGICAL_WIDTH / 100;
const PCT_Y = LOGICAL_HEIGHT / 100;
const CQW = LOGICAL_WIDTH / 100;

/** The most each window covers (logical px), from the numbers in GuildScreen.vue's styles. */
export const WINDOW_EXTENTS: Readonly<Record<'board' | 'party' | 'message', PxRect>> = {
  // .stage__board: left 1.2%, top 1.6%, width 29%, max-height 31cqw (it scrolls beyond that)
  board: {
    left: 1.2 * PCT_X,
    top: 1.6 * PCT_Y,
    right: (1.2 + 29) * PCT_X,
    bottom: 1.6 * PCT_Y + 31 * CQW,
  },
  // .stage__side: right 1.1%, top 1.6%, width 24.6%. Its height is its content (party window and
  // fetch status): measured 324 px, 340 px with a failure line (Chrome, 2026-10-12). Walking uses
  // 340; seats keep clear of the tallest, PARTY_TALLEST_BOTTOM.
  party: {
    left: (100 - 1.1 - 24.6) * PCT_X,
    top: 1.6 * PCT_Y,
    right: (100 - 1.1) * PCT_X,
    bottom: 340,
  },
  // .stage__message: left 9.8%, width 80.4%, bottom 1.9%, height 17.4%
  message: {
    left: 9.8 * PCT_X,
    top: (100 - 1.9 - 17.4) * PCT_Y,
    right: (9.8 + 80.4) * PCT_X,
    bottom: (100 - 1.9) * PCT_Y,
  },
};

/**
 * The tallest the right-hand column gets: rare extra notes (localStorage unavailable, a failed
 * baseline clear) on top of a failure line, measured 372.5 px. Seats and their bubbles keep clear
 * of it; a member walking past may be covered for a moment in that rare state.
 */
const PARTY_TALLEST_BOTTOM = 373;

/** The windows at their tallest: what seats and bubbles must stay clear of. */
export const TALLEST_WINDOW_EXTENTS: Readonly<Record<'board' | 'party' | 'message', PxRect>> = {
  ...WINDOW_EXTENTS,
  party: { ...WINDOW_EXTENTS.party, bottom: PARTY_TALLEST_BOTTOM },
};

/** The 80 x 80 frame of a member whose feet are on `pos` (bottom centre, as path.tileToPoint). */
export function spriteRect(pos: TilePos): PxRect {
  const x = pos.col * TILE_SIZE + TILE_SIZE / 2;
  const y = (pos.row + 1) * TILE_SIZE;
  return { left: x - SPRITE_SIZE / 2, top: y - SPRITE_SIZE, right: x + SPRITE_SIZE / 2, bottom: y };
}

/** True when the rectangles share some area (touching edges do not count). */
export function overlaps(a: PxRect, b: PxRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** True when any part of a member standing on `pos` would be under a window. */
export function isUnderWindow(pos: TilePos): boolean {
  const sprite = spriteRect(pos);
  return Object.values(WINDOW_EXTENTS).some((area) => overlaps(sprite, area));
}

/** Fixed places the scenes walk between. */
export const PLACES = {
  /** Where a visitor stands in front of かなめ's counter. */
  counterFront: { col: 16, row: 10 },
} as const satisfies Record<string, TilePos>;

interface GroundFill extends TileRect {
  readonly tile: TileName;
}

const rect = (col: number, row: number, w: number, h: number): TileRect => ({
  col,
  row,
  w,
  h,
});

/**
 * Ground layer, painted in order (later fills win). The back wall is two tiles high; a carpet in
 * each department's corner, a red rug from the throne down to かなめ and in front of her counter.
 */
const GROUND_FILLS: readonly GroundFill[] = [
  { tile: 'floor', ...rect(0, 0, MAP_COLS, MAP_ROWS) },
  { tile: 'floor-carpet', ...rect(10, 3, 4, 4) },
  { tile: 'floor-carpet', ...rect(19, 3, 4, 4) },
  { tile: 'floor-carpet', ...rect(1, 11, 12, 3) },
  { tile: 'floor-carpet', ...rect(20, 11, 10, 3) },
  { tile: 'rug-red', ...rect(15, 5, 3, 3) },
  { tile: 'rug-red', ...rect(13, 10, 7, 3) },
  { tile: 'wall', ...rect(0, 1, MAP_COLS, 2) },
  { tile: 'wall', ...rect(0, 1, 1, MAP_ROWS - 1) },
  { tile: 'wall', ...rect(MAP_COLS - 1, 1, 1, MAP_ROWS - 1) },
  { tile: 'wall', ...rect(0, MAP_ROWS - 1, MAP_COLS, 1) },
  { tile: 'wall-top', ...rect(0, 0, MAP_COLS, 1) },
  // The doorway in the right wall; the door itself is drawn over it (MAP_OBJECTS).
  { tile: 'floor', ...rect(30, 14, 2, 3) },
];

const solid = (tile: TileName, area: TileRect): MapObject => ({ tile, solid: true, ...area });
const flat = (tile: TileName, area: TileRect): MapObject => ({ tile, solid: false, ...area });

/**
 * Furniture, sized to the pieces of assets/tiles/tiles.ts, laid out like
 * assets/concept/rpg-company-ui.png within what the HTML windows leave free: the throne at the back
 * centre, かなめ's counter (left + middles + right) in front of it, a department in each corner and
 * the door at the bottom right. The upper departments sit between the quest board and the party
 * window; the lower ones just above the message window. Every member sits on the chair right behind
 * their desk (the chair's lower cell is the seat), so the desk is in front of them. Chairs are not
 * solid, so members walk on them; the door is only decoration (nobody leaves the room). Windows and the door have see-through parts, so they go over the
 * wall and floor, not instead.
 */
export const MAP_OBJECTS: readonly MapObject[] = [
  flat('window', rect(10, 1, 2, 2)),
  flat('window', rect(21, 1, 2, 2)),
  solid('board', rect(12, 1, 3, 2)),
  solid('throne', rect(15, 2, 3, 3)),
  solid('counter-left', rect(13, 8, 1, 2)),
  solid('counter-mid', rect(14, 8, 5, 2)),
  solid('counter-right', rect(19, 8, 1, 2)),
  flat('door', rect(30, 14, 2, 3)),
  // 経理 (upper left): the member on the chair right behind the desk, facing it
  flat('chair', rect(12, 3, 1, 2)),
  solid('desk', rect(10, 5, 4, 2)),
  // 広報 (upper right)
  flat('chair', rect(20, 3, 1, 2)),
  solid('desk', rect(19, 5, 4, 2)),
  solid('plant', rect(22, 7, 1, 1)),
  // 企画 (lower left): behind the desk too, clear of the quest board above
  solid('shelf', rect(1, 10, 2, 3)),
  flat('chair', rect(11, 9, 1, 2)),
  solid('desk', rect(9, 11, 4, 2)),
  // 総務 (lower right), mirroring 企画 around the counter
  flat('chair', rect(21, 9, 1, 2)),
  solid('desk', rect(20, 11, 4, 2)),
  // the bottom-left corner, left of the message window
  solid('crate', rect(2, 14, 1, 1)),
];

const WALKABLE_GROUND: ReadonlySet<TileName> = new Set<TileName>([
  'floor',
  'floor-carpet',
  'rug-red',
]);

export function contains(area: TileRect, pos: TilePos): boolean {
  return (
    pos.col >= area.col &&
    pos.col < area.col + area.w &&
    pos.row >= area.row &&
    pos.row < area.row + area.h
  );
}

export function isInsideMap(pos: TilePos): boolean {
  return contains(rect(0, 0, MAP_COLS, MAP_ROWS), pos);
}

/** Ground tile of every cell, row by row. */
function buildGround(): TileName[][] {
  const ground = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, (): TileName => 'floor'),
  );
  for (const fill of GROUND_FILLS) {
    for (let row = fill.row; row < fill.row + fill.h; row += 1) {
      ground[row]?.fill(fill.tile, fill.col, fill.col + fill.w);
    }
  }
  return ground;
}

export const GROUND: readonly (readonly TileName[])[] = buildGround();

export function groundAt(pos: TilePos): TileName | null {
  return GROUND[pos.row]?.[pos.col] ?? null;
}

/**
 * True where a member may walk: walkable ground, no solid furniture or floor decor, and no part of the sprite
 * (80 px wide and tall, so it reaches into the tiles beside and above) under a window, so nobody
 * vanishes behind one on the way.
 */
export function isWalkable(pos: TilePos): boolean {
  const ground = groundAt(pos);
  if (ground === null || !WALKABLE_GROUND.has(ground)) return false;
  if (MAP_OBJECTS.some((object) => object.solid && contains(object, pos))) return false;
  if (DECOR_PLACEMENTS.some((item) => item.solid && contains(item, pos))) return false;
  return !isUnderWindow(pos);
}
