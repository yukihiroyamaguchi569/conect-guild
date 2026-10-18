import type { MemberId } from '../guild.config';
import type { SpriteArt } from './art';
import { SPRITE_SIZE } from './metrics';
import { hasHoldFrames } from './hands';
import type { SpriteFrame } from './motion';
import type { Point } from './path';

/**
 * The real members: one sheet per member (assets/sprites/<memberId>.png), 80 x 80 frames in a row
 * (front, right standing, right walking 1 and 2, then optionally hands up, arms in front and arms in
 * front facing right: hands.ts, then asleep: Issue #179), feet at the bottom centre. A frame the
 * sheet does not have falls back to the front frame. Facing left is the
 * right-facing frame mirrored. Held items keep the drawing passed in.
 */

export interface SpriteDraw {
  /** Left edge of the frame in the sheet. */
  readonly sx: number;
  /** Top-left of the frame on the canvas, logical px (before mirroring). */
  readonly dx: number;
  readonly dy: number;
}

/** Where a frame comes from and where it lands, with the feet at `feet`. Pure. */
export function spriteDraw(frame: SpriteFrame, feet: Point): SpriteDraw {
  return {
    sx: frame * SPRITE_SIZE,
    dx: Math.round(feet.x) - SPRITE_SIZE / 2,
    dy: Math.round(feet.y) - SPRITE_SIZE,
  };
}

/** A member's sheet: an image whose width tells how many frames it has. */
export type SpriteSheet = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export function sheetWidth(sheet: SpriteSheet): number {
  return 'naturalWidth' in sheet ? sheet.naturalWidth : sheet.width;
}

/** `frame` when a sheet `width` px wide has it, otherwise the front frame (0). Pure. */
export function frameInSheet(frame: SpriteFrame, width: number): SpriteFrame {
  return (frame + 1) * SPRITE_SIZE <= width ? frame : 0;
}

export function createSpriteArt(
  sheets: Readonly<Record<MemberId, SpriteSheet>>,
  drawProp: SpriteArt['drawProp'],
): SpriteArt {
  return {
    hasHoldFrames: (id) => hasHoldFrames(sheetWidth(sheets[id])),
    drawMember(ctx, id, pose, feet) {
      const { sx, dx, dy } = spriteDraw(frameInSheet(pose.frame, sheetWidth(sheets[id])), feet);
      ctx.save();
      if (pose.flip) {
        // Mirror around the feet so the member stays on the same spot.
        ctx.translate(2 * dx + SPRITE_SIZE, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(sheets[id], sx, 0, SPRITE_SIZE, SPRITE_SIZE, dx, dy, SPRITE_SIZE, SPRITE_SIZE);
      ctx.restore();
    },
    drawProp,
  };
}
