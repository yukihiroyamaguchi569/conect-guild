import { SELECTED_LAYOUT } from './layouts';
import {
  MAP_COLS,
  MAP_ROWS,
  rect,
  type GuildLayout,
  type MapObject,
  type TileName,
  type TilePos,
  type TileRect,
} from './layouts/types';
import { SPRITE_SIZE, TILE_SIZE } from './metrics';

/**
 * The office as a tile map: 32 x 18 tiles (render/metrics.ts sets the pixel sizes). The ground and
 * the furniture come from the layout for the number of departments (render/layouts, Issue #18);
 * this derives the walkable grid from it. Each builder takes the layout; the exports of the same
 * name without `In` / `For` are built from SELECTED_LAYOUT. Nothing that matters is placed under
 * the HTML windows (WINDOW_EXTENTS).
 */

export { MAP_COLS, MAP_ROWS, TILE_NAMES } from './layouts/types';
export type { MapObject, TileName, TileRect } from './layouts/types';
export const LOGICAL_WIDTH = MAP_COLS * TILE_SIZE;
export const LOGICAL_HEIGHT = MAP_ROWS * TILE_SIZE;

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

/** The quest board's max-height in cqw (GuildScreen.vue), unless the layout lowers it. */
export const BOARD_MAX_CQW = 31;

/**
 * The fetch status as a tab on the message window's top edge (Issue #121; every layout since Issue
 * #132): GuildScreen.vue sets its max-width (% of the stage) and height (cqw) from these, and
 * keeps it on one line. 1.6cqw (16.4 px) keeps it under the feet of a member on row 13 (448 px), the
 * only way along the lower carpets to the door.
 */
export const FETCH_TAB = { maxWidthPct: 50, heightCqw: 1.6 } as const;

/** The windows over the canvas, the fetch tab included. */
export type WindowExtents = Readonly<Record<'board' | 'party' | 'message' | 'tab', PxRect>>;

/** The most each window covers (logical px), from the numbers in GuildScreen.vue's styles. */
export function windowExtentsFor(layout: GuildLayout): WindowExtents {
  const extents = fixedWindowExtentsFor(layout);
  const { message } = extents;
  // .stage__tab: right 9.8%, bottom 19.3% (the message window's top), FETCH_TAB's size
  const tab = {
    left: message.right - FETCH_TAB.maxWidthPct * PCT_X,
    top: message.top - FETCH_TAB.heightCqw * CQW,
    right: message.right,
    bottom: message.top,
  };
  return { ...extents, tab };
}

function fixedWindowExtentsFor(
  layout: GuildLayout,
): Readonly<Record<'board' | 'party' | 'message', PxRect>> {
  return {
    // .stage__board: left 1.2%, top 1.6%, width 29%, max-height BOARD_MAX_CQW or the layout's
    // (it scrolls beyond that)
    board: {
      left: 1.2 * PCT_X,
      top: 1.6 * PCT_Y,
      right: (1.2 + 29) * PCT_X,
      bottom: 1.6 * PCT_Y + (layout.boardMaxCqw ?? BOARD_MAX_CQW) * CQW,
    },
    // .stage__side: right 1.1%, top 1.6%, width 24.6%. Its height is its content (the party
    // window; the fetch status is the tab), measured per layout (tallestWindowExtentsFor).
    party: {
      left: (100 - 1.1 - 24.6) * PCT_X,
      top: 1.6 * PCT_Y,
      right: (100 - 1.1) * PCT_X,
      bottom: layout.partyWindow.bottom,
    },
    // .stage__message: left 9.8%, width 80.4%, bottom 1.9%, height 17.4%
    message: {
      left: 9.8 * PCT_X,
      top: (100 - 1.9 - 17.4) * PCT_Y,
      right: (9.8 + 80.4) * PCT_X,
      bottom: (100 - 1.9) * PCT_Y,
    },
  };
}

/**
 * The windows at their tallest: what seats and bubbles must stay clear of. Since the fetch status
 * and its rare notes went to the tab (Issue #132), no note makes the right-hand column taller, so
 * every layout measures the same bottom for both.
 */
export function tallestWindowExtentsFor(layout: GuildLayout): WindowExtents {
  const extents = windowExtentsFor(layout);
  return { ...extents, party: { ...extents.party, bottom: layout.partyWindow.tallestBottom } };
}

/**
 * `build` of a layout, worked out once per layout: walking asks for the ground and the windows of
 * every tile it tries.
 */
function perLayout<T extends object>(
  build: (layout: GuildLayout) => T,
): (layout: GuildLayout) => T {
  const cache = new WeakMap<GuildLayout, T>();
  return (layout) => {
    const cached = cache.get(layout);
    if (cached !== undefined) return cached;
    const value = build(layout);
    cache.set(layout, value);
    return value;
  };
}

const cachedWindows = perLayout(windowExtentsFor);

export const WINDOW_EXTENTS = windowExtentsFor(SELECTED_LAYOUT);
export const TALLEST_WINDOW_EXTENTS = tallestWindowExtentsFor(SELECTED_LAYOUT);

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

/** True when any part of a member standing on `pos` would be under a window of `layout`. */
function isUnderWindowIn(layout: GuildLayout, pos: TilePos): boolean {
  const sprite = spriteRect(pos);
  return Object.values(cachedWindows(layout)).some((area) => overlaps(sprite, area));
}

/** True when any part of a member standing on `pos` would be under a window. */
export function isUnderWindow(pos: TilePos): boolean {
  return isUnderWindowIn(SELECTED_LAYOUT, pos);
}

/** Fixed places the scenes walk between (GuildLayout.places). */
export const PLACES: GuildLayout['places'] = SELECTED_LAYOUT.places;

/** The furniture of the selected layout. */
export const MAP_OBJECTS: readonly MapObject[] = SELECTED_LAYOUT.objects;

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

/** Ground tile of every cell of `layout`, row by row. */
function groundFor(layout: GuildLayout): TileName[][] {
  const ground = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, (): TileName => 'floor'),
  );
  for (const fill of layout.groundFills) {
    for (let row = fill.row; row < fill.row + fill.h; row += 1) {
      ground[row]?.fill(fill.tile, fill.col, fill.col + fill.w);
    }
  }
  return ground;
}

export const GROUND: readonly (readonly TileName[])[] = groundFor(SELECTED_LAYOUT);

const cachedGround = perLayout(groundFor);

function groundAtIn(layout: GuildLayout, pos: TilePos): TileName | null {
  return cachedGround(layout)[pos.row]?.[pos.col] ?? null;
}

export function groundAt(pos: TilePos): TileName | null {
  return groundAtIn(SELECTED_LAYOUT, pos);
}

/**
 * True where a member may walk in `layout`: walkable ground, no solid furniture or floor decor (nor
 * the month's ornament), and no part of the sprite (80 px wide and tall, so it reaches into the
 * tiles beside and above) under a window, so nobody vanishes behind one on the way; but the party
 * window may cover the tiles the layout lists (GuildLayout.underPartyWindow).
 */
export function isWalkableIn(layout: GuildLayout, pos: TilePos): boolean {
  const ground = groundAtIn(layout, pos);
  if (ground === null || !WALKABLE_GROUND.has(ground)) return false;
  if (layout.objects.some((object) => object.solid && contains(object, pos))) return false;
  if (layout.decor.some((item) => item.solid && contains(item, pos))) return false;
  if (contains(layout.ornamentSpot, pos)) return false;
  return !isUnderWindowIn(layout, pos) || isOnlyUnderPartyIn(layout, pos);
}

/** True when the layout lets the party window cover `pos` (GuildLayout.underPartyWindow). */
export function isPartyExceptionIn(layout: GuildLayout, pos: TilePos): boolean {
  return (layout.underPartyWindow ?? []).some(
    (tile) => tile.col === pos.col && tile.row === pos.row,
  );
}

/** A listed tile under the party window and no other window (the fetch tab included). */
function isOnlyUnderPartyIn(layout: GuildLayout, pos: TilePos): boolean {
  if (!isPartyExceptionIn(layout, pos)) return false;
  const sprite = spriteRect(pos);
  return Object.entries(cachedWindows(layout)).every(
    ([name, area]) => name === 'party' || !overlaps(sprite, area),
  );
}

/** isWalkableIn the selected layout. */
export function isWalkable(pos: TilePos): boolean {
  return isWalkableIn(SELECTED_LAYOUT, pos);
}
