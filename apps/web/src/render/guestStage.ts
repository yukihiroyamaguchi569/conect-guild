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
  /** Drops what is over and says what to draw at `t`. */
  frameAt(t: number): GuestFrame;
  /** Drops the sparkles (the canvas is out of sight: they must not play late). */
  clearSparkles(): void;
}

export function createGuestStage(
  spots: readonly TilePos[],
  hasHoldFrames: (index: number) => boolean,
  random: Random = Math.random,
): GuestStage {
  let guests: readonly StageGuest[] = [];
  let sparkles: readonly GuestSparkle[] = [];
  return {
    set(next) {
      guests = next;
    },
    sparkle(index, t) {
      if (!guests.some((guest) => guest.index === index)) return;
      sparkles = [...liveSparkles(sparkles, t), createSparkle(index, t, random)];
    },
    frameAt(t) {
      sparkles = liveSparkles(sparkles, t);
      return guestFrame({ guests, sparkles, spots }, t, hasHoldFrames);
    },
    clearSparkles() {
      sparkles = [];
    },
  };
}
