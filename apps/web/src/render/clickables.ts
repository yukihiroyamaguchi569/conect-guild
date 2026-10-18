import { PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import type { TilePos } from '../guild.config';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, type PxRect } from './map';
import { SPRITE_SIZE } from './metrics';
import { tileToPoint, type Point } from './path';
import { PET_RECT } from './petting';
import { DEFAULT_SEATS } from './scenes';
import { THINGS, thingsIn, type Thing, type ThingKind } from './examine';
import { SELECTED_LAYOUT } from './layouts';
import { seatedPoint } from './seating';

/**
 * What can be pressed on the canvas (Issue #187): where it is in logical px, and its accessible
 * name for the button that presses it from the keyboard (ui/GuildCanvas.vue). The things of the
 * room (Issue #190) say which kind they are. Pure: the point of a click is passed in.
 */

interface Spot {
  /** Where a press lands, logical px. */
  readonly rect: PxRect;
  /** The accessible name of its button. */
  readonly label: string;
}

export type Clickable =
  | (Spot & { readonly id: 'king' | 'dog' })
  | (Spot & { readonly id: 'thing'; readonly thing: ThingKind });

export type ClickableId = Clickable['id'];

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

/** The button of a thing to examine (examine.thingsIn). */
function thingClickable(thing: Thing): Clickable {
  return {
    id: 'thing',
    thing: thing.kind,
    rect: thing.rect,
    label: `${THINGS[thing.kind].name}を しらべる`,
  };
}

/**
 * What can be pressed with the pet in `pet` (petting.petRectIn; null: the layout has none, nothing
 * to pet) and the room's `things` (examine.thingsIn). Front first: the first that holds a point is
 * the one pressed. The king never leaves the throne; the pet (Issue #186) and the things never
 * leave their place.
 */
export function clickablesWith(
  pet: PxRect | null,
  things: readonly Thing[] = [],
): readonly Clickable[] {
  const king: Clickable = {
    id: 'king',
    rect: seatedSpriteRect(DEFAULT_SEATS[PRESIDENT_ID]),
    label: '王様に話しかける',
  };
  const dog: readonly Clickable[] =
    pet === null ? [] : [{ id: 'dog', rect: pet, label: '犬をなでる' }];
  return [king, ...dog, ...things.map(thingClickable)];
}

/** What can be pressed in the selected layout (clickablesWith). */
export const CLICKABLES: readonly Clickable[] = clickablesWith(PET_RECT, thingsIn(SELECTED_LAYOUT));

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
export function pressedAt(
  point: Point | null,
  clickables: readonly Clickable[] = CLICKABLES,
): Clickable | null {
  if (point === null) return null;
  return clickables.find((clickable) => holds(clickable.rect, point)) ?? null;
}

/** Which kind of thing is pressed at the logical `point` (pressedAt), or null. */
export function clickableAt(
  point: Point | null,
  clickables: readonly Clickable[] = CLICKABLES,
): ClickableId | null {
  return pressedAt(point, clickables)?.id ?? null;
}

/**
 * Where the focus goes in a row of `count` buttons from `index` on `key` (the things' buttons are
 * one stop of Tab, ui/PressGroup.vue): the arrows go to the next or the previous one, round the
 * ends, Home and End to the first and the last; null for any other key.
 */
export function rovingIndex(index: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
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

/** The CSS of a button over `rect`: at the same spot of the canvas at any width (rectPercent). */
export function pressStyle(rect: PxRect): Record<'left' | 'top' | 'width' | 'height', string> {
  const at = rectPercent(rect);
  return {
    left: `${String(at.left)}%`,
    top: `${String(at.top)}%`,
    width: `${String(at.width)}%`,
    height: `${String(at.height)}%`,
  };
}
