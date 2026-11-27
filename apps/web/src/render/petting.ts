import { decorPoint } from './decorPoint';
import { PET_DECOR } from './idleSpots';
import { SELECTED_LAYOUT } from './layouts';
import type { GuildLayout } from './layouts/types';
import type { PxRect } from './map';
import { BUBBLE, DETAIL_SCALE, OVERHEAD_OFFSET, TILE_SIZE, TRINKETS } from './metrics';
import { bubbleBox, meet, type BubbleOf, type Box } from './overhead';
import type { Point } from './path';

/**
 * The pet clicked (Issue #186, docs/DESIGN.md 8): it wakes for TRINKETS.pettedMs from the latest
 * press, sits up wagging its tail from one side to the other, and says 「わん」 in a murmur's bubble
 * over it (unless that would meet a bubble over a member: their words come first); then it sleeps
 * again. A press while the screen is halted or drawing would not be seen is
 * dropped, not kept for later. The pictures are trinkets.wagDecorAt's. Pure: the stage time is
 * passed in.
 */

/** What the pet says while it is up from a press. */
export const BARK = 'わん';

/** What the pet says as the toast's tankards go up (Issue #315). */
export const TOAST_BARK = 'わん！';

/** What the pet says at a visitor coming in (Issue #317). */
export const VISITOR_BARK = 'わんわん';

/** Where the pet of `layout` is drawn, logical px; null when the layout has no pet. */
export function petRectIn(layout: GuildLayout): PxRect | null {
  const pet = layout.decor.find((item) => item.name === PET_DECOR);
  if (pet === undefined) return null;
  const { x, y } = decorPoint(pet);
  return { left: x, top: y, right: x + pet.w * TILE_SIZE, bottom: y + pet.h * TILE_SIZE };
}

/** Where the pet of the selected layout is drawn (petRectIn); null when it has none. */
export const PET_RECT: PxRect | null = petRectIn(SELECTED_LAYOUT);

/** Where the pet was drawn (logical px), and whether it was away from its place, walking round (Issue #319). */
export interface PetAt {
  readonly rect: PxRect;
  readonly away: boolean;
}

/** The pet of the selected layout in its place; null when it has none. */
export const HOME_PET: PetAt | null = PET_RECT === null ? null : { rect: PET_RECT, away: false };

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

/** The bubble of a word of the pet's (`text`): a murmur's. */
export function petBubbleOf(text: string): BubbleOf {
  return { voice: 'whisper', chars: Array.from(text).length };
}

/** The bubble of the pet's 「わん」. */
export const BARK_BUBBLE: BubbleOf = petBubbleOf(BARK);

/** Everything drawn for the word `text` of the pet in `rect` (overhead.bubbleBox), logical px. */
export function petLineBox(rect: PxRect, text: string): Box {
  return bubbleBox(barkFeet(rect), petBubbleOf(text), 'right', 0);
}

/** Everything drawn for the 「わん」 of the pet in `rect`. */
export function barkBox(rect: PxRect): Box {
  return petLineBox(rect, BARK);
}

/**
 * Whether the word `text` of the pet in `rect` is drawn: only clear of `bubbles` (those over the
 * members this frame, overheadPlace.placedBox). The king's words and calls go over the throne next
 * to the pet; theirs come first, and the pet goes on without its bubble.
 */
export function petLineClear(rect: PxRect, text: string, bubbles: readonly Box[]): boolean {
  const line = petLineBox(rect, text);
  return !bubbles.some((box) => meet(line, box));
}

/** Whether the 「わん」 of the pet in `rect` is drawn (petLineClear). */
export function barkClear(rect: PxRect, bubbles: readonly Box[]): boolean {
  return petLineClear(rect, BARK, bubbles);
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

/** Until when the pet is up once the screen is `halted` or not: a halt puts it to sleep for good. */
export function pettedAfterHalt(until: number | null, halted: boolean): number | null {
  return halted ? null : until;
}

/**
 * The spin (Issue #312): petted TRINKETS.petSpinPresses times within TRINKETS.petSpinWindowMs, the pet
 * is so happy it spins for TRINKETS.petSpinMs. `presses` are the recent let-through presses counted
 * toward a spin (at most petSpinPresses, oldest first); `since` is when the spin now going started.
 */
export interface Spin {
  readonly presses: readonly number[];
  readonly since: number | null;
}

export const NO_SPIN: Spin = { presses: [], since: null };

/** True while the spin from `since` goes on at `now`. */
function spinning(since: number | null, now: number): boolean {
  return since !== null && now >= since && now < since + TRINKETS.petSpinMs;
}

/**
 * The spin after a press at `t`. A dropped press changes nothing. A press during a spin neither
 * restarts it nor counts toward the next one; the presses of a spin start no other one. Otherwise
 * the press is kept with the others within the window, and the petSpinPresses-th starts a spin.
 */
export function spinAfterPress(spin: Spin, moment: PetMoment, t: number): Spin {
  if (!mayPet(moment) || spinning(spin.since, t)) return spin;
  const presses = [...spin.presses.filter((p) => t - p <= TRINKETS.petSpinWindowMs), t].slice(
    -TRINKETS.petSpinPresses,
  );
  if (presses.length < TRINKETS.petSpinPresses) return { presses, since: spin.since };
  return { presses: [], since: t };
}

/** When the spin going on at `now` started; null when the pet does not spin (or is halted). */
export function spinningSince(spin: Spin, now: number, halted: boolean): number | null {
  return !halted && spinning(spin.since, now) ? spin.since : null;
}

/** The pet's presses through the loop (Cast.pet), keeping until when it is up and its spin. */
export interface Petting {
  /** A press at `t`: true when the pet is up from it (mayPet). */
  press(moment: PetMoment, t: number): boolean;
  /** True while the pet is up from a press at `now` (isPetted). */
  isPetted(now: number, halted: boolean): boolean;
  /** When the spin going on at `now` started, or null (spinningSince). */
  spinningSince(now: number, halted: boolean): number | null;
  /** The screen is halted or not (Cast.receive): a halt ends the time up (pettedAfterHalt). */
  setHalted(halted: boolean): void;
  /** Where the pet was drawn in the frame drawn now (loop.paintAt), for the clicks. */
  drew(at: PetAt | null): void;
  /** Where it was drawn last; HOME_PET before the first frame. */
  drawn(): PetAt | null;
}

export function createPetting(): Petting {
  let until: number | null = null;
  let spin = NO_SPIN;
  let drawnAt = HOME_PET;
  return {
    press(moment, t) {
      until = pettedUntil(until, moment, t);
      spin = spinAfterPress(spin, moment, t);
      return mayPet(moment);
    },
    isPetted: (now, halted) => isPetted(until, now, halted),
    spinningSince: (now, halted) => spinningSince(spin, now, halted),
    setHalted(halted) {
      until = pettedAfterHalt(until, halted);
      if (halted) spin = NO_SPIN;
    },
    drew(at) {
      drawnAt = at;
    },
    drawn: () => drawnAt,
  };
}
