import type { MemberId } from '../guild.config';
import { HOLD, SPRITE_SIZE } from './metrics';
import {
  heldItemPoint,
  type Held,
  type Hold,
  type HoldFrame,
  type MoveFrame,
  type Pose,
  type SpriteFrame,
} from './motion';
import type { Point } from './path';

/**
 * Holding frames and where the hands are in them. A sheet of 7 frames adds 4 (both hands up,
 * front), 5 (both arms in front, front) and 6 (both arms in front, facing right; mirrored for
 * left). A sheet of the first 4 frames only falls back to the standing / walking frames with the
 * item placed by motion.heldItemPoint. Pure.
 */

/** Frames in a sheet that has the holding frames. */
const FRAMES_WITH_HOLDS = 7;

/** True when a sheet `width` px wide has the holding frames. */
export function hasHoldFrames(width: number): boolean {
  return Math.floor(width / SPRITE_SIZE) >= FRAMES_WITH_HOLDS;
}

/** Where the held item is centred in a holding frame, px from the feet. */
export interface HandPosition {
  /** Up from the feet. */
  readonly up: number;
  /** Toward the facing side (mirrored when facing left). */
  readonly forward: number;
}

/** Hands measured on each member's holding frames (frame px; feet at y 80, middle at x 40). */
interface MeasuredHands {
  /** Frame 4: the top of the raised hands, up from the feet. */
  readonly raiseTop: number;
  /** Frame 5: the centre of the carried item, up from the feet, and its x in the frame. */
  readonly carryFront: { readonly up: number; readonly x: number };
  /** Frame 6 (facing right): the centre of the carried item, up and forward from the feet. */
  readonly carrySide: HandPosition;
}

/**
 * Measured on assets/sprites/<memberId>.png, frames 4–6 (2026-10-12; takumi and musubi by
 * assets/sprites/measure_hands.py, assets/sprites/hands-new4.json, 2026-10-14).
 */
const MEASURED: Readonly<Record<MemberId, MeasuredHands>> = {
  kaname: { raiseTop: 69, carryFront: { up: 32, x: 40 }, carrySide: { up: 31, forward: 15 } },
  minori: { raiseTop: 71, carryFront: { up: 31, x: 39 }, carrySide: { up: 33, forward: 14 } },
  hibiki: { raiseTop: 70, carryFront: { up: 34, x: 41 }, carrySide: { up: 35, forward: 21 } },
  hirame: { raiseTop: 74, carryFront: { up: 33, x: 40 }, carrySide: { up: 33, forward: 14 } },
  sasae: { raiseTop: 72, carryFront: { up: 32, x: 39 }, carrySide: { up: 32, forward: 16 } },
  takumi: { raiseTop: 67, carryFront: { up: 30, x: 40 }, carrySide: { up: 32, forward: 12 } },
  musubi: { raiseTop: 72, carryFront: { up: 34, x: 42 }, carrySide: { up: 36, forward: 16 } },
  yukihiro: { raiseTop: 75, carryFront: { up: 34, x: 40 }, carrySide: { up: 32, forward: 15 } },
};

/**
 * Where the item is centred in each holding frame. A raised item sits on the hands (its bottom on
 * their top, so its centre half its height above); a carried one is centred on the arms.
 */
function handsOf(measured: MeasuredHands): Readonly<Record<HoldFrame, HandPosition>> {
  return {
    4: { up: measured.raiseTop + HOLD.raisedItemHalfPx, forward: 0 },
    5: { up: measured.carryFront.up, forward: measured.carryFront.x - SPRITE_SIZE / 2 },
    6: measured.carrySide,
  };
}

export const HANDS: Readonly<Record<MemberId, Readonly<Record<HoldFrame, HandPosition>>>> = {
  kaname: handsOf(MEASURED.kaname),
  minori: handsOf(MEASURED.minori),
  hibiki: handsOf(MEASURED.hibiki),
  hirame: handsOf(MEASURED.hirame),
  sasae: handsOf(MEASURED.sasae),
  takumi: handsOf(MEASURED.takumi),
  musubi: handsOf(MEASURED.musubi),
  yukihiro: handsOf(MEASURED.yukihiro),
};

/** Raised: hands up. Carried: arms in front, facing front when standing, sideways when walking. */
export function holdFrameOf(frame: MoveFrame, hold: Hold): HoldFrame {
  if (hold === 'raise') return 4;
  return frame === 0 ? 5 : 6;
}

/** How a member holding something is drawn: the frame, facing, feet and the item's centre. */
export interface HeldLook {
  readonly frame: SpriteFrame;
  readonly flip: boolean;
  readonly feet: Point;
  readonly item: Point;
}

export function heldLook(id: MemberId, pose: Pose, held: Held, withHoldFrames: boolean): HeldLook {
  if (!withHoldFrames) {
    return {
      frame: pose.frame,
      flip: pose.flip,
      feet: pose.point,
      item: heldItemPoint(pose, held.hold),
    };
  }
  const frame = holdFrameOf(pose.frame, held.hold);
  const flip = frame === 6 && pose.flip;
  // Frame 6 has no stepping legs: a small bob on every other step keeps it walking.
  const bob = pose.frame === 3 ? HOLD.walkBobPx : 0;
  const feet = { x: pose.point.x, y: pose.point.y - bob };
  const hand = HANDS[id][frame];
  return {
    frame,
    flip,
    feet,
    item: { x: feet.x + (flip ? -hand.forward : hand.forward), y: feet.y - hand.up },
  };
}
