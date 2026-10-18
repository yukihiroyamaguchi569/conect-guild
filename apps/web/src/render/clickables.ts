import { PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import { ACTIVE_MEMBER_IDS, MEMBERS, type MemberId, type TilePos } from '../guild.config';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, type PxRect } from './map';
import { tileToPoint, type Point } from './path';
import { PET_RECT } from './petting';
import { DEFAULT_SEATS } from './scenes';
import { thingName, thingsIn, type RoomThing, type Thing } from './examine';
import { SELECTED_LAYOUT } from './layouts';
import { seatedPoint } from './seating';
import { REWARD_NAMES } from '../domain/dailyReward';
import { rewardOnDesk, type StageReward } from './rewardDesk';
import type { VisitorKind } from '../domain/visitors';
import { DOOR, VISITOR_NAMES } from './visitors';
import type { DrawnVisitor } from './visitorStage';
import { SPRITE_SIZE, TILE_SIZE } from './metrics';

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
  | (Spot & { readonly id: 'member'; readonly member: MemberId })
  | (Spot & { readonly id: 'thing'; readonly thing: RoomThing })
  | (Spot & { readonly id: 'reward'; readonly reward: StageReward })
  | (Spot & { readonly id: 'visitor'; readonly kind: VisitorKind });

export type ClickableId = Clickable['id'];

/** The frame of a member drawn seated on `seat` (seating.seatedPoint), logical px. */
export function seatedSpriteRect(seat: TilePos): PxRect {
  return spriteFrame(seatedPoint(tileToPoint(seat)));
}

/** The frame of a member drawn with their feet at `feet`, logical px. */
function spriteFrame(feet: Point): PxRect {
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
    label: `${thingName(thing.kind)}を しらべる`,
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

/**
 * The members but the king (his click is his own: Issue #187) drawn with their feet at `feet`
 * (Issue #191; loop.RenderLoop.feet), in the order given.
 */
export function memberClickables(
  feet: readonly { readonly id: MemberId; readonly point: Point }[],
): readonly Clickable[] {
  return feet
    .filter(({ id }) => id !== PRESIDENT_ID)
    .map(({ id, point }) => ({
      id: 'member',
      member: id,
      rect: spriteFrame(point),
      label: `${MEMBERS[id].name}に話しかける`,
    }));
}

/**
 * The members' buttons for the keyboard, at their seats: かなめ and the departments' members in the
 * settings' order (a click finds them where they are drawn: memberClickables).
 */
export const MEMBER_SEAT_CLICKABLES: readonly Clickable[] = memberClickables(
  ACTIVE_MEMBER_IDS.map((id) => ({ id, point: seatedPoint(tileToPoint(DEFAULT_SEATS[id])) })),
);

/**
 * The reward of the day on its member's desk (Issue #213), pressed where it is drawn (1.5 times a
 * tile: rewardDesk.rewardOnDesk, Issue #208); none when there is no reward or no desk for it.
 */
export function rewardClickables(reward: StageReward | null): readonly Clickable[] {
  if (reward === null) return [];
  const placed = rewardOnDesk(SELECTED_LAYOUT, DEFAULT_SEATS[reward.member], reward.kind);
  if (placed === null) return [];
  const side = TILE_SIZE * placed.scale;
  return [
    {
      id: 'reward',
      reward,
      rect: { left: placed.x, top: placed.y, right: placed.x + side, bottom: placed.y + side },
      label: `${MEMBERS[reward.member].name}の ${REWARD_NAMES[reward.kind]}を みる`,
    },
  ];
}

/**
 * The visitor (Issue #212) where it was drawn last (VisitorStage.drawn), a member's frame (the
 * pictures are the guests' size); none when no visitor is in the room.
 */
export function visitorClickables(drawn: DrawnVisitor | null): readonly Clickable[] {
  if (drawn === null) return [];
  const label = `${VISITOR_NAMES[drawn.kind]}に話しかける`;
  return [{ id: 'visitor', kind: drawn.kind, rect: spriteFrame(drawn.feet), label }];
}

/**
 * The visitor's button for the keyboard while `kind` is in the room (null: none): over the door it
 * comes in by, which stays put (a click finds the visitor where it is drawn: visitorClickables).
 */
export function visitorDoorClickables(kind: VisitorKind | null): readonly Clickable[] {
  return kind === null ? [] : visitorClickables({ kind, feet: tileToPoint(DOOR) });
}

/**
 * The buttons of the row 「へやの こもの」 (Issue #190): the room's `things` and the `reward` on a desk
 * (rewardClickables, Issue #213), top row first and left to right, as the things are.
 */
export function roomPresses(
  things: readonly Clickable[],
  reward: readonly Clickable[],
): readonly Clickable[] {
  return [...things, ...reward].sort(
    (a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left,
  );
}

/**
 * `clickables` (clickablesWith) with `members` (memberClickables; the reward, drawn in front of
 * them, before them: Issue #213) behind the king and the pet and in front of the room's things.
 */
export function withMembers(
  clickables: readonly Clickable[],
  members: readonly Clickable[],
): readonly Clickable[] {
  const things = clickables.filter((item) => item.id === 'thing');
  return [...clickables.filter((item) => item.id !== 'thing'), ...members, ...things];
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
 * What tells `item` from the others of a row of buttons (ui/PressGroup.vue) whatever its place in
 * it: the things of one kind share a label, never a spot.
 */
export function pressKey(item: Clickable): string {
  return `${item.label}@${String(item.rect.left)},${String(item.rect.top)}`;
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
