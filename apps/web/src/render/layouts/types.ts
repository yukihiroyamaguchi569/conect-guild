import { DECOR, type DecorName } from '../../../../../assets/decor/decor';

/**
 * What an office layout is made of (Issue #18): one hand-made layout per number of departments.
 * Pure data and the small helpers that write it. Nothing of render is imported here, so map.ts and
 * decor.ts can read the selected layout without an import cycle (they re-export these types).
 */

/** A cell on the office tile map (the shape of guild.config's TilePos). */
export interface TilePos {
  readonly col: number;
  readonly row: number;
}

export const MAP_COLS = 32;
export const MAP_ROWS = 18;

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

/** A rectangle of the ground layer, painted in order (later fills win). */
export interface GroundFill extends TileRect {
  readonly tile: TileName;
}

/** Where a small thing (assets/decor/decor.ts) sits, in tile units. */
export interface DecorPlacement extends TileRect {
  readonly name: DecorName;
  /** True when members cannot walk on its cells. */
  readonly solid: boolean;
}

/** Which banner a desk's cleared quests flutter: the back wall's (upper) or the left wall's (lower). */
export type DeskSide = 'upper' | 'lower';

/** A department's desk; `departments[i]` of the settings sits at `desks[i]`. */
export interface Desk {
  /** The tile under the member's feet: the chair's lower cell behind the desk. */
  readonly seat: TilePos;
  readonly side: DeskSide;
  /** The department's things that move while its member works (render/trinkets.ts). */
  readonly things: readonly DecorName[];
  /** The desk whose member this one goes to chat with when idle (render/idleSpots.ts). */
  readonly chatWith?: number;
}

export interface GuildLayout {
  readonly departmentCount: number;
  readonly groundFills: readonly GroundFill[];
  readonly objects: readonly MapObject[];
  readonly decor: readonly DecorPlacement[];
  /** One per department, in the settings' order. */
  readonly desks: readonly Desk[];
  readonly commanderSeat: TilePos;
  /** The middle of the throne. */
  readonly kingSeat: TilePos;
  readonly places: {
    /** Where a visitor stands in front of かなめ's counter. */
    readonly counterFront: TilePos;
    /** Where かなめ stands to hear the king's order (Issue #87). */
    readonly throneSide: TilePos;
  };
  /** By the door: the seat of a member no department names (never drawn). */
  readonly offstage: TilePos;
  /**
   * Where the guests stand, one per guest the departments leave room for (settings maxGuestsFor:
   * two with two to four departments, one with five, none with six).
   */
  readonly guestSpots: readonly TilePos[];
  /** How far down the right-hand column (party window) reaches, logical px (render/map.ts). */
  readonly partyWindow: {
    /** Measured with a failure line: walking keeps clear of it. */
    readonly bottom: number;
    /** With every rare note: seats and their bubbles keep clear of it. */
    readonly tallestBottom: number;
    /** The rows are packed (ui/PartyStatus.vue `dense`) so that seven or eight of them fit. */
    readonly dense?: boolean;
    /**
     * Packed tighter still, the type unchanged (ui/PartyStatus.vue `tight`): layout6's eight rows
     * end above the bubble over the sales desk (Issue #121).
     */
    readonly tight?: boolean;
    /**
     * The fetch status leaves the column for a one-line tab on the message window's top edge
     * (ui/GuildScreen.vue, render/map.ts FETCH_TAB): layout6, Issue #121.
     */
    readonly fetchTab?: boolean;
  };
  /**
   * The quest board's max-height in cqw (GuildScreen.vue; it scrolls beyond), when lower than
   * BOARD_MAX_CQW (render/map.ts): five and six departments seat a member further left on the lower
   * row, under where a taller board would reach (the president's decision, 2026-10-15).
   */
  readonly boardMaxCqw?: number;
  /**
   * Tiles where the party window may cover the top of a member's frame and the bubble over the
   * head. None at present: layout6's sales desk was one until its column ended above the bubble
   * (Issue #121). Nowhere else does anything that matters go under a window.
   */
  readonly underPartyWindow?: readonly TilePos[];
  readonly toss: {
    /** かなめ tosses to a desk whose seat is at most this many tiles from hers (render/toss.ts). */
    readonly maxTiles: number;
  };
}

export const rect = (col: number, row: number, w: number, h: number): TileRect => ({
  col,
  row,
  w,
  h,
});

export const solid = (tile: TileName, area: TileRect): MapObject => ({
  tile,
  solid: true,
  ...area,
});
export const flat = (tile: TileName, area: TileRect): MapObject => ({
  tile,
  solid: false,
  ...area,
});

/** Flat floor patches: drawn with the ground, under the furniture, and walked on. */
const FLOOR_PATCHES: ReadonlySet<DecorName> = new Set<DecorName>(['light-patch']);

export function isFloorPatch(placement: DecorPlacement): boolean {
  return FLOOR_PATCHES.has(placement.name);
}

/** A thing at its picture's size; solid unless it is a floor patch. */
export function place(name: DecorName, col: number, row: number): DecorPlacement {
  const { w, h } = DECOR[name];
  return { name, col, row, w, h, solid: !FLOOR_PATCHES.has(name) };
}
