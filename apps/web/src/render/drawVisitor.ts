import { VISITOR_KINDS } from '../domain/visitors';
import { drawBubble } from './drawBubble';
import type { GuestArt } from './guestArt';
import type { LevelTag } from './levelTags';
import { overheadLift, overheadSide } from './overhead';
import type { VisitorView } from './visitors';

/**
 * Canvas side effects only (visitors.ts decides): the visitor of Issue #195 with the members'
 * shade of the time of day over it, then its words over everything, as the members' lines (the
 * same ink, the upper left under a window, lifted over the 「Lv N」 tags).
 */

/** The visitor's body; the pictures are a GuestArt in the order of VISITOR_KINDS (loadArt.ts). */
export function drawVisitorBody(
  ctx: CanvasRenderingContext2D,
  art: GuestArt,
  visitor: VisitorView | null,
): void {
  if (visitor === null) return;
  art.drawGuest(ctx, VISITOR_KINDS.indexOf(visitor.kind), visitor, visitor.feet);
}

export function drawVisitorWords(
  ctx: CanvasRenderingContext2D,
  visitor: VisitorView | null,
  tags: readonly LevelTag[],
): void {
  if (visitor === null) return;
  const { feet, words } = visitor;
  if (words === null) return;
  const pose = { point: feet, held: null };
  const lift = overheadLift(pose, words, tags);
  const text = {
    text: words,
    color: '#222222',
    voice: 'say',
    chars: Array.from(words).length,
  } as const;
  drawBubble(ctx, text, { x: feet.x, y: feet.y - lift }, overheadSide(pose, words));
}
