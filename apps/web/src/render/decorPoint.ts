import type { DecorPlacement } from './layouts/types';
import { TILE_SIZE } from './metrics';
import type { Point } from './path';

/**
 * Where a placed thing's picture has its top-left, logical px: its cell, moved by its `dx` and
 * `dy` (layout5's round table, Issue #122). Every drawing of placed things goes through it.
 */
export function decorPoint(item: DecorPlacement): Point {
  return {
    x: item.col * TILE_SIZE + (item.dx ?? 0),
    y: item.row * TILE_SIZE + (item.dy ?? 0),
  };
}
