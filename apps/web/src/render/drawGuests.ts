import type { SpriteArt } from './art';
import { drawSleepZ } from './draw';
import { drawBubble } from './drawBubble';
import { readingPoint, type GuestArt } from './guestArt';
import { markFeet, type GuestFrame, type SparkleView } from './guests';

/**
 * Canvas side effects only (guests.ts decides): the guests at their spots, then what is over
 * them. No name or counts are drawn under a guest (Issue #122).
 */

/** The guests, after the members and the furniture; a reading guest holds a scroll. */
export function drawGuestBodies(
  ctx: CanvasRenderingContext2D,
  frame: GuestFrame,
  art: { readonly guests: GuestArt; readonly sprites: Pick<SpriteArt, 'drawProp'> },
): void {
  for (const { guest, feet, look } of frame.poses) {
    const at = { x: feet.x, y: feet.y + look.dy };
    art.guests.drawGuest(ctx, guest.index, look.frame, at);
    if (look.reading) art.sprites.drawProp(ctx, 'scroll', readingPoint(guest.index, at), 'carry');
  }
}

/** The ink of the 「?」, as over a member waiting for a permission (draw.ts BUBBLE_GLYPHS). */
const QUESTION = { text: '?', color: '#1a56b0', voice: 'glyph', chars: 1 } as const;

function drawSparkle(ctx: CanvasRenderingContext2D, view: SparkleView): void {
  for (const p of view.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(view.origin.x + p.x), Math.round(view.origin.y + p.y), p.size, p.size);
  }
}

/** Over everything, like the members' bubbles: the 「?」 or the 「Z」 over the head, and the sparkles. */
export function drawGuestOverheads(ctx: CanvasRenderingContext2D, frame: GuestFrame): void {
  for (const { feet, look } of frame.poses) {
    const { mark } = look;
    if (mark?.kind === 'question') drawBubble(ctx, QUESTION, markFeet(feet, mark), 'beside-right');
    if (mark?.kind === 'z') drawSleepZ(ctx, mark.rise, markFeet(feet, mark));
  }
  for (const view of frame.sparkles) drawSparkle(ctx, view);
}
