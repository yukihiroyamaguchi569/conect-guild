import { byMember, PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import type { DecorName } from '../../../../assets/decor/decor';
import {
  ACTIVE_MEMBER_IDS,
  DEPARTMENT_MEMBERS,
  type MemberId,
  type TilePos,
} from '../guild.config';
import { SELECTED_LAYOUT } from './layouts';
import type { GuildLayout } from './layouts/types';
import { isWalkableIn, type TileRect } from './map';
import { findPath, type TilePath } from './path';
import { DEFAULT_SEATS } from './scenes';

/**
 * Where members go to play after a long idle spell (idle.ts, Issue #23), worked out once from the
 * layout: beside the mugs for tea, beside the pet, under the nearer window, and beside the seat
 * of the neighbouring department for a chat (GuildLayout.desks[].chatWith). Only walkable tiles
 * (never under an HTML window) that can be reached from the member's seat are kept. The king never
 * leaves the throne. Each builder takes the layout (`...In`); the exports without it use
 * SELECTED_LAYOUT.
 */

/** The pet by the throne. Its picture may change; the play spot follows this one name. */
export const PET_DECOR: DecorName = 'sleeping-poodle';
/** The things that mark the tea spot. */
export const TEA_DECOR: DecorName = 'mugs';

export type PlayKind = 'tea' | 'pet' | 'window' | 'chat';

export interface PlaySpot {
  readonly kind: PlayKind;
  /** Where the member stands. */
  readonly tile: TilePos;
  /** From the seat to the tile (both included); walked back in reverse. */
  readonly path: TilePath;
  /** Who the member chats with (chat only), to turn toward them. */
  readonly partner: MemberId | null;
}

const at = (base: TilePos, col: number, row: number): TilePos => ({
  col: base.col + col,
  row: base.row + row,
});

function decorAt(layout: GuildLayout, name: DecorName): TileRect | null {
  return layout.decor.find((item) => item.name === name) ?? null;
}

/** The first walkable tile of `tiles` in `layout`, or null. */
function firstWalkable(layout: GuildLayout, tiles: readonly TilePos[]): TilePos | null {
  return tiles.find((tile) => isWalkableIn(layout, tile)) ?? null;
}

/**
 * Beside the pet on its bottom row, left or right. Not in front of it: a member there is taller
 * than the pet and would hide it.
 */
export function petTileIn(layout: GuildLayout): TilePos | null {
  const pet = decorAt(layout, PET_DECOR);
  if (pet === null) return null;
  const row = pet.h - 1;
  return firstWalkable(layout, [at(pet, -1, row), at(pet, pet.w, row)]);
}

export function petTile(): TilePos | null {
  return petTileIn(SELECTED_LAYOUT);
}

/** True when a member at `tile` turns left (flipped) to face the pet in `layout`. */
export function turnsToPetIn(layout: GuildLayout, tile: TilePos): boolean {
  const pet = decorAt(layout, PET_DECOR);
  return pet !== null && pet.col < tile.col;
}

/** True when a member at `tile` turns left (flipped) to face the pet. */
export function turnsToPet(tile: TilePos): boolean {
  return turnsToPetIn(SELECTED_LAYOUT, tile);
}

/** Next to the mugs: behind the desk they stand on, at its left or right, else in front. */
export function teaTileIn(layout: GuildLayout): TilePos | null {
  const mugs = decorAt(layout, TEA_DECOR);
  if (mugs === null) return null;
  return firstWalkable(layout, [
    at(mugs, -1, -1),
    at(mugs, mugs.w, -1),
    at(mugs, 0, -1),
    at(mugs, 0, 1),
  ]);
}

export function teaTile(): TilePos | null {
  return teaTileIn(SELECTED_LAYOUT);
}

/** Right under each window (the row below it), the first walkable tile along it. */
export function windowTilesIn(layout: GuildLayout): TilePos[] {
  return layout.objects
    .filter((object) => object.tile === 'window')
    .flatMap((window) => {
      const below = Array.from({ length: window.w }, (_, i) => at(window, i, window.h));
      const tile = firstWalkable(layout, below);
      return tile === null ? [] : [tile];
    });
}

export function windowTiles(): TilePos[] {
  return windowTilesIn(SELECTED_LAYOUT);
}

/** Who sits where in a layout, and which members are on stage. */
export interface Crew {
  readonly seats: Readonly<Record<MemberId, TilePos>>;
  /** `departmentMembers[i]` sits at desk i. */
  readonly departmentMembers: readonly MemberId[];
  readonly active: readonly MemberId[];
}

/** Who `id` chats with: the member at the desk theirs names (GuildLayout.desks[].chatWith). */
export function chatPartnerIn(layout: GuildLayout, crew: Crew, id: MemberId): MemberId | null {
  const desk = layout.desks[crew.departmentMembers.indexOf(id)];
  if (desk?.chatWith === undefined) return null;
  return crew.departmentMembers[desk.chatWith] ?? null;
}

/** Beside the partner's seat, on the side the member comes from. */
export function chatTileIn(layout: GuildLayout, crew: Crew, id: MemberId): TilePos | null {
  const partner = chatPartnerIn(layout, crew, id);
  if (partner === null) return null;
  const seat = crew.seats[partner];
  const side = crew.seats[id].col < seat.col ? -1 : 1;
  return firstWalkable(layout, [at(seat, side, 0), at(seat, -side, 0)]);
}

const SELECTED_CREW: Crew = {
  seats: DEFAULT_SEATS,
  departmentMembers: DEPARTMENT_MEMBERS,
  active: ACTIVE_MEMBER_IDS,
};

export function chatTile(id: MemberId): TilePos | null {
  return chatTileIn(SELECTED_LAYOUT, SELECTED_CREW, id);
}

/** Every member's play spots in `layout`; none for the king and for a member off stage. */
export function playSpotsFor(
  layout: GuildLayout,
  crew: Crew,
): Readonly<Record<MemberId, readonly PlaySpot[]>> {
  const walkable = (pos: TilePos): boolean => isWalkableIn(layout, pos);
  const spot = (id: MemberId, kind: PlayKind, tile: TilePos | null): PlaySpot[] => {
    if (tile === null) return [];
    const path = findPath(crew.seats[id], tile, walkable);
    if (path === null || path.length < 2) return [];
    const partner = kind === 'chat' ? chatPartnerIn(layout, crew, id) : null;
    return [{ kind, tile, path, partner }];
  };
  /** The window with the shortest walk from the member's seat. */
  const nearestWindow = (id: MemberId): PlaySpot[] =>
    windowTilesIn(layout)
      .flatMap((tile) => spot(id, 'window', tile))
      .toSorted((a, b) => a.path.length - b.path.length)
      .slice(0, 1);
  const tea = teaTileIn(layout);
  const pet = petTileIn(layout);
  return byMember((id): readonly PlaySpot[] => {
    if (id === PRESIDENT_ID || !crew.active.includes(id)) return [];
    return [
      ...spot(id, 'tea', tea),
      ...spot(id, 'pet', pet),
      ...nearestWindow(id),
      ...spot(id, 'chat', chatTileIn(layout, crew, id)),
    ];
  });
}

export const PLAY_SPOTS: Readonly<Record<MemberId, readonly PlaySpot[]>> = playSpotsFor(
  SELECTED_LAYOUT,
  SELECTED_CREW,
);
