import type { TilePos } from '../guild.config';
import { SELECTED_LAYOUT } from './layouts';
import type { GuildLayout, MapObject } from './layouts/types';
import { SEATING, TILE_SIZE } from './metrics';
import type { Point } from './path';

/**
 * Sitting down without a sitting frame: a member on a seat is drawn a little lower (sunk), and the
 * furniture in front of them (layers.ts) hides their lower body. Seats are the chairs' lower cells
 * (behind the desks), the row right behind the counter and the middle of the throne. Pure.
 */

const keyOf = (pos: TilePos): string => `${String(pos.col)},${String(pos.row)}`;

function seatCells(object: MapObject): readonly (readonly [TilePos, number])[] {
  const { col, row, w, h } = object;
  if (object.tile === 'chair') return [[{ col, row: row + h - 1 }, SEATING.chairPx]];
  if (object.tile === 'throne') {
    return [[{ col: col + Math.floor(w / 2), row: row + Math.floor(h / 2) }, SEATING.thronePx]];
  }
  if (!object.tile.startsWith('counter-')) return [];
  return Array.from({ length: w }, (_, i) => [{ col: col + i, row: row - 1 }, SEATING.counterPx]);
}

/** Sink of every seat cell of `layout`, px, by `col,row`. */
export function seatSinkFor(layout: GuildLayout): ReadonlyMap<string, number> {
  return new Map(layout.objects.flatMap(seatCells).map(([pos, px]) => [keyOf(pos), px]));
}

/** Sink of every seat cell, px. */
export const SEAT_SINK: ReadonlyMap<string, number> = seatSinkFor(SELECTED_LAYOUT);

function sinkOfTile(col: number, row: number): number {
  return SEAT_SINK.get(keyOf({ col, row })) ?? 0;
}

/**
 * How far to draw a member with their feet at `point` below it: the seat's sink on a seat, none
 * elsewhere, and in between while stepping on or off (blended over the four nearest cells), so
 * they sit down and stand up instead of jumping.
 */
export function sinkAt(point: Point): number {
  const u = (point.x - TILE_SIZE / 2) / TILE_SIZE;
  const v = point.y / TILE_SIZE - 1;
  const col = Math.floor(u);
  const row = Math.floor(v);
  const fx = u - col;
  const fy = v - row;
  const top = sinkOfTile(col, row) * (1 - fx) + sinkOfTile(col + 1, row) * fx;
  const bottom = sinkOfTile(col, row + 1) * (1 - fx) + sinkOfTile(col + 1, row + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** `point` moved down by its sink: where the member is drawn. */
export function seatedPoint(point: Point): Point {
  return { x: point.x, y: point.y + sinkAt(point) };
}
