import { decorPoint } from './decorPoint';
import { PET_DECOR } from './idleSpots';
import { SELECTED_LAYOUT } from './layouts';
import type { GuildLayout } from './layouts/types';
import type { PxRect } from './map';
import { BUBBLE, DETAIL_SCALE, OVERHEAD_OFFSET, TILE_SIZE, TRINKETS } from './metrics';
import { bubbleBox, meet, type BubbleOf, type Box } from './overhead';
import type { Point } from './path';

/**
 * The pet clicked (Issue #186, docs/DESIGN.md 4.11): it wakes for TRINKETS.pettedMs from the latest
 * press, sits up wagging its tail from one side to the other, and says 「わん」 in a murmur's bubble
 * over it (unless that would meet a bubble over a member: their words come first); then it sleeps
 * again. A press while the screen is halted or drawing would not be seen is
 * dropped, not kept for later. The pictures are trinkets.wagDecorAt's. Pure: the stage time is
 * passed in.
 */

/** What the pet says while it is up from a press. */
export const BARK = 'わん';

/** Where the pet of `layout` is drawn, logical px; null when the layout has no pet. */
export function petRectIn(layout: GuildLayout): PxRect | null {
  const pet = layout.decor.find((item) => item.name === PET_DECOR);
  if (pet === undefined) return null;
  const { x, y } = decorPoint(pet);
  return { left: x, top: y, right: x + pet.w * TILE_SIZE, bottom: y + pet.h * TILE_SIZE };
}

/** Where the pet of the selected layout is drawn (petRectIn); null when it has none. */
export const PET_RECT: PxRect | null = petRectIn(SELECTED_LAYOUT);

/** Logical px from the top of the pet's picture down to its head in the wagging pictures. */
const HEAD_TOP = 5;

/**
 * Where drawBubble's feet go for the pet in `rect` (petRectIn): its bubble's tail ends just over
 * the pet's head, not a member's height over it.
 */
export function barkFeet(rect: PxRect): Point {
  const tail = BUBBLE.tailRows * DETAIL_SCALE;
  return { x: (rect.left + rect.right) / 2, y: rect.top + HEAD_TOP - tail + OVERHEAD_OFFSET };
}

/** The bubble of the pet's 「わん」: a murmur's. */
export const BARK_BUBBLE: BubbleOf = { voice: 'whisper', chars: Array.from(BARK).length };

/** Everything drawn for the 「わん」 of the pet in `rect` (overhead.bubbleBox), logical px. */
export function barkBox(rect: PxRect): Box {
  return bubbleBox(barkFeet(rect), BARK_BUBBLE, 'right', 0);
}

/**
 * Whether the 「わん」 of the pet in `rect` is drawn: only clear of `bubbles` (those over the
 * members this frame, overheadPlace.placedBox). The king's words and calls go over the throne next
 * to the pet; theirs come first, and the pet wags on without its bubble.
 */
export function barkClear(rect: PxRect, bubbles: readonly Box[]): boolean {
  const bark = barkBox(rect);
  return !bubbles.some((box) => meet(bark, box));
}

/** The stage when the pet is pressed. */
export interface PetMoment {
  /** The screen is halted (not live). */
  readonly halted: boolean;
  /** Drawing would not be seen: the page is hidden or the canvas not shown (narrow screens). */
  readonly paused: boolean;
}

/** Whether a press wakes the pet now; otherwise it is dropped. */
export function mayPet(moment: PetMoment): boolean {
  return !moment.halted && !moment.paused;
}

/**
 * Until when the pet is up after a press at `t` (stage ms), from `until` (null: asleep): a press
 * that is let through wakes it, or keeps it up, for TRINKETS.pettedMs from now; a dropped one
 * changes nothing.
 */
export function pettedUntil(until: number | null, moment: PetMoment, t: number): number | null {
  return mayPet(moment) ? t + TRINKETS.pettedMs : until;
}

/** True while the pet is up from a press: before `until`, and not on a halted screen. */
export function isPetted(until: number | null, now: number, halted: boolean): boolean {
  return until !== null && now < until && !halted;
}

/** The pet's presses through the loop (Cast.pet), keeping until when it is up. */
export interface Petting {
  /** A press at `t`: true when the pet is up from it (mayPet). */
  press(moment: PetMoment, t: number): boolean;
  /** True while the pet is up from a press at `now` (isPetted). */
  isPetted(now: number, halted: boolean): boolean;
}

export function createPetting(): Petting {
  let until: number | null = null;
  return {
    press(moment, t) {
      until = pettedUntil(until, moment, t);
      return mayPet(moment);
    },
    isPetted: (now, halted) => isPetted(until, now, halted),
  };
}
