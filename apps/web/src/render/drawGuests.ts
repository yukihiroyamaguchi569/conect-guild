import type { SpriteArt } from './art';
import { drawSleepZ } from './draw';
import { drawBubble } from './drawBubble';
import { LEVEL_TAG_ALPHA } from './drawLevelTags';
import { readingPoint, type GuestArt } from './guestArt';
import type { PxRect } from './map';
import { guestTags, markFeet, type GuestFrame, type GuestTag, type SparkleView } from './guests';

/**
 * Canvas side effects only (guests.ts decides): the guests at their spots, then what is over and
 * under them. The names come from the settings and are drawn with fillText only.
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

function drawTags(ctx: CanvasRenderingContext2D, tags: readonly GuestTag[]): void {
  ctx.save();
  ctx.globalAlpha = LEVEL_TAG_ALPHA;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a1608';
  for (const tag of tags) {
    ctx.font = tag.kind === 'name' ? 'bold 10px sans-serif' : 'bold 9px sans-serif';
    ctx.fillStyle = tag.kind === 'name' ? '#ffe9a8' : '#d8ecff';
    ctx.textAlign = tag.align;
    const maxWidth = tag.maxWidth ?? undefined;
    ctx.strokeText(tag.text, tag.x, tag.y, maxWidth);
    ctx.fillText(tag.text, tag.x, tag.y, maxWidth);
  }
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, view: SparkleView): void {
  for (const p of view.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(view.origin.x + p.x), Math.round(view.origin.y + p.y), p.size, p.size);
  }
}

/**
 * Over everything, like the members' bubbles: the name and the counts under each guest (kept clear of
 * `messageWindow`), the 「?」 or the 「Z」 over the head, and the sparkles.
 */
export function drawGuestOverheads(
  ctx: CanvasRenderingContext2D,
  frame: GuestFrame,
  messageWindow: PxRect,
): void {
  for (const { guest, feet, look } of frame.poses) {
    drawTags(ctx, guestTags(guest, feet, messageWindow));
    const { mark } = look;
    if (mark?.kind === 'question') drawBubble(ctx, QUESTION, markFeet(feet, mark), 'beside-right');
    if (mark?.kind === 'z') drawSleepZ(ctx, mark.rise, markFeet(feet, mark));
  }
  for (const view of frame.sparkles) drawSparkle(ctx, view);
}
