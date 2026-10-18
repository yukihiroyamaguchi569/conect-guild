import { PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import type { TilePos } from '../guild.config';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, type PxRect } from './map';
import { SPRITE_SIZE } from './metrics';
import { tileToPoint, type Point } from './path';
import { DEFAULT_SEATS } from './scenes';
import { seatedPoint } from './seating';

/**
 * What can be pressed on the canvas (Issue #187): where it is in logical px, and its accessible
 * name for the button that presses it from the keyboard (ui/GuildCanvas.vue). Pure: the point of a
 * click is passed in.
 */

export type ClickableId = 'king';

export interface Clickable {
  readonly id: ClickableId;
  /** Where a press lands, logical px. */
  readonly rect: PxRect;
  /** The accessible name of its button. */
  readonly label: string;
}

/** The frame of a member drawn seated on `seat` (seating.seatedPoint), logical px. */
export function seatedSpriteRect(seat: TilePos): PxRect {
  const feet = seatedPoint(tileToPoint(seat));
  return {
    left: feet.x - SPRITE_SIZE / 2,
    top: feet.y - SPRITE_SIZE,
    right: feet.x + SPRITE_SIZE / 2,
    bottom: feet.y,
  };
}

/** Front first: the first that holds a point is the one pressed. The king never leaves the throne. */
export const CLICKABLES: readonly Clickable[] = [
  {
    id: 'king',
    rect: seatedSpriteRect(DEFAULT_SEATS[PRESIDENT_ID]),
    label: '王様に話しかける',
  },
];

/**
 * The logical point of `offset` (CSS px from the canvas's top left) on a canvas displayed `size`
 * CSS px (any scale, whole or not); null when the canvas has no size (narrow screens hide it).
 */
export function toLogical(
  offset: Point,
  size: { readonly width: number; readonly height: number },
): Point | null {
  if (size.width <= 0 || size.height <= 0) return null;
  return {
    x: (offset.x * LOGICAL_WIDTH) / size.width,
    y: (offset.y * LOGICAL_HEIGHT) / size.height,
  };
}

/** True when `point` is inside `rect` (its left and top edges in, its right and bottom out). */
function holds(rect: PxRect, point: Point): boolean {
  return (
    point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom
  );
}

/** What is pressed at the logical `point`, or null for none (or no point). */
export function clickableAt(
  point: Point | null,
  clickables: readonly Clickable[] = CLICKABLES,
): ClickableId | null {
  if (point === null) return null;
  return clickables.find((clickable) => holds(clickable.rect, point))?.id ?? null;
}

/**
 * Where the button of `rect` sits over the canvas, in % of its size: it covers the same spot at any
 * width.
 */
export function rectPercent(rect: PxRect): {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
} {
  return {
    left: (rect.left / LOGICAL_WIDTH) * 100,
    top: (rect.top / LOGICAL_HEIGHT) * 100,
    width: ((rect.right - rect.left) / LOGICAL_WIDTH) * 100,
    height: ((rect.bottom - rect.top) / LOGICAL_HEIGHT) * 100,
  };
}
