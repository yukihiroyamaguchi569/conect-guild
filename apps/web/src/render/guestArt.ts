import { DETAIL_SCALE, SPRITE_SIZE } from './metrics';
import { hasHoldFrames as sheetHasHoldFrames } from './hands';
import type { SpriteFrame } from './motion';
import type { Point } from './path';
import { spriteDraw, type SpriteSheet } from './spriteArt';

/**
 * The guests' pictures (Issue #108): assets/sprites/guest1.png (旅の剣士) for the first guest and
 * guest2.png (旅の魔法使い) for the second, in the members' sheet format (80 x 80 frames: front,
 * side, walking, then hands up and arms in front). Apart from the members' art: a guest is no
 * MemberId. When a picture cannot be loaded, plain boxes take its place.
 */
export interface GuestArt {
  /** Draws guest `index` facing front (or in a holding frame) with the feet at `feet`. */
  drawGuest(ctx: CanvasRenderingContext2D, index: number, frame: SpriteFrame, feet: Point): void;
  /** True when the guest's sheet has the holding frames (the arms-in-front frame to read in). */
  hasHoldFrames(index: number): boolean;
}

/**
 * Where a scroll read in the arms-in-front frame (5) is centred: up from the feet and its x in the
 * frame. Measured with assets/sprites/measure_hands.py (assets/sprites/hands-new4.json).
 */
const CARRY_FRONT: readonly { readonly up: number; readonly x: number }[] = [
  { up: 32, x: 41 },
  { up: 33, x: 41 },
];

/** Where the read scroll is centred for guest `index` standing at `feet`. */
export function readingPoint(index: number, feet: Point): Point {
  const hands = CARRY_FRONT[index] ?? { up: 32, x: SPRITE_SIZE / 2 };
  return { x: feet.x + hands.x - SPRITE_SIZE / 2, y: feet.y - hands.up };
}

function sheetWidth(sheet: SpriteSheet): number {
  return 'naturalWidth' in sheet ? sheet.naturalWidth : sheet.width;
}

/** Each guest's sheet by position; null where its picture could not be loaded (a plain box). */
export function createGuestArt(sheets: readonly (SpriteSheet | null)[]): GuestArt {
  return {
    hasHoldFrames: (index) => {
      const sheet = sheets[index] ?? null;
      return sheet !== null && sheetHasHoldFrames(sheetWidth(sheet));
    },
    drawGuest(ctx, index, frame, feet) {
      const sheet = sheets[index] ?? null;
      if (sheet === null) {
        placeholderGuestArt.drawGuest(ctx, index, frame, feet);
        return;
      }
      const { sx, dx, dy } = spriteDraw(frame, feet);
      ctx.drawImage(sheet, sx, 0, SPRITE_SIZE, SPRITE_SIZE, dx, dy, SPRITE_SIZE, SPRITE_SIZE);
    },
  };
}

/** A cloak and a hood per guest, in detail pixels, when the pictures cannot be loaded. */
const PLACEHOLDER_COLORS = ['#6d4c8e', '#2f6f8f'] as const;

export const placeholderGuestArt: GuestArt = {
  hasHoldFrames: () => false,
  drawGuest(ctx, index, _frame, feet) {
    ctx.save();
    ctx.translate(Math.round(feet.x), Math.round(feet.y));
    ctx.scale(DETAIL_SCALE, DETAIL_SCALE);
    ctx.fillStyle = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length] ?? '#6d4c8e';
    ctx.fillRect(-6, -16, 12, 16);
    ctx.fillStyle = '#f2d0a9';
    ctx.fillRect(-5, -26, 10, 10);
    ctx.restore();
  },
};
