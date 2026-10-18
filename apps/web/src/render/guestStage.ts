import type { TilePos } from '../guild.config';
import type { Random } from './confetti';
import {
  createSparkle,
  guestFrame,
  liveSparkles,
  type GuestFrame,
  type GuestSparkle,
  type StageGuest,
} from './guests';

/**
 * The guests the loop keeps between frames (Issue #108): who stands where and the sparkles in the
 * air. Times are the stage clock's (render/clock.ts), so a sparkle stops with the page hidden.
 */
export interface GuestStage {
  set(guests: readonly StageGuest[]): void;
  /** A sparkle over guest `index` from stage time `t`; nothing when that guest is not there. */
  sparkle(index: number, t: number): void;
  /** Drops what is over and says what to draw at `t` (the idle spells go by the wall clock). */
  frameAt(t: number): GuestFrame;
  /** Drops the sparkles (the canvas is out of sight: they must not play late). */
  clearSparkles(): void;
  /** While the screen is halted the sparkles are dropped and new ones are not started. */
  setHalted(halted: boolean): void;
}

export function createGuestStage(
  spots: readonly TilePos[],
  hasHoldFrames: (index: number) => boolean,
  random: Random = Math.random,
  /** Epoch ms, for the guests' long idle spells (Issue #183); they go on while the page is hidden. */
  wallNow: () => number = () => Date.now(),
): GuestStage {
  let guests: readonly StageGuest[] = [];
  let sparkles: readonly GuestSparkle[] = [];
  let halted = false;
  return {
    set(next) {
      guests = next;
    },
    sparkle(index, t) {
      if (halted || !guests.some((guest) => guest.index === index)) return;
      sparkles = [...liveSparkles(sparkles, t), createSparkle(index, t, random)];
    },
    frameAt(t) {
      sparkles = liveSparkles(sparkles, t);
      return guestFrame({ guests, sparkles, spots }, { t, wall: wallNow() }, hasHoldFrames);
    },
    clearSparkles() {
      sparkles = [];
    },
    setHalted(next) {
      halted = next;
      if (halted) sparkles = [];
    },
  };
}

/** RenderLoop.setGuests and RenderLoop.sparkle: a sparkle nobody would see is dropped. */
export function guestControls(
  guests: GuestStage,
  loop: {
    readonly schedule: { now(): void };
    readonly paused: () => boolean;
    readonly stageNow: () => number;
  },
): {
  setGuests(next: readonly StageGuest[]): void;
  sparkle(index: number): void;
} {
  return {
    setGuests(next) {
      guests.set(next);
      loop.schedule.now();
    },
    sparkle(index) {
      if (loop.paused()) return;
      guests.sparkle(index, loop.stageNow());
      loop.schedule.now();
    },
  };
}
