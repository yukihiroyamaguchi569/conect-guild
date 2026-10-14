import type { MemberId } from '../guild.config';
import type { GuildArt } from './art';
import type { BubbleKind } from './bubbles';
import type { ConfettiView, MemberPose, StageFrame } from './director';
import type { DecorPlacement } from './decor';
import { drawBubble } from './drawBubble';
import { drawAnimatedDecor } from './drawDecor';
import { BACK_OBJECTS, BACK_STILL_DECOR, stageSteps, type FrontLayer } from './layers';
import { GROUND } from './map';
import { DETAIL_SCALE, IDLE, OVERHEAD_OFFSET, TILE_SIZE } from './metrics';
import { heldLook } from './hands';
import type { Overhead } from './overhead';
import type { Placed } from './overheadPlace';
import type { Point } from './path';
import type { SpeechLine } from './summons';
import { flyingItemPoint } from './toss';
import type { DecorCues } from './trinkets';

/** Canvas side effects only: every decision was made in the pure modules. Logical pixels. */

function drawPlacement(ctx: CanvasRenderingContext2D, art: GuildArt, item: DecorPlacement): void {
  art.decor.drawDecor(ctx, item.name, item.col * TILE_SIZE, item.row * TILE_SIZE);
}

/**
 * Ground, the furniture behind the members and the small things that never move: the loop draws
 * them once into a cached layer. The things that move are left out (drawDecor.ts), and so are the
 * light patches (drawDaylight.ts) and the furniture in front of the members (drawFrontLayer).
 */
export function drawStatic(ctx: CanvasRenderingContext2D, art: GuildArt): void {
  GROUND.forEach((cells, row) => {
    cells.forEach((tile, col) => {
      art.tiles.drawTile(ctx, tile, { col, row, w: 1, h: 1 });
    });
  });
  for (const object of BACK_OBJECTS) art.tiles.drawTile(ctx, object.tile, object);
  for (const item of BACK_STILL_DECOR) drawPlacement(ctx, art, item);
}

/** One front layer's still parts, for its own cached canvas: furniture, clipped parts, things on it. */
export function drawFrontLayer(
  ctx: CanvasRenderingContext2D,
  art: GuildArt,
  layer: FrontLayer,
): void {
  for (const object of layer.objects) art.tiles.drawTile(ctx, object.tile, object);
  for (const { object, clips } of layer.parts) {
    ctx.save();
    ctx.beginPath();
    for (const r of clips) ctx.rect(r.left, r.top, r.right - r.left, r.bottom - r.top);
    ctx.clip();
    art.tiles.drawTile(ctx, object.tile, object);
    ctx.restore();
  }
  for (const item of layer.still) drawPlacement(ctx, art, item);
}

interface Glyph {
  readonly glyph: string;
  readonly color: string;
}

const BUBBLE_GLYPHS: Readonly<Record<BubbleKind, Glyph>> = {
  'awaiting-permission': { glyph: '?', color: '#1a56b0' },
  'awaiting-president': { glyph: '!', color: '#b0103a' },
  'awaiting-kaname': { glyph: '…', color: '#222222' },
};

/** The signs of a long idle spell (idle.ts): fixed glyphs, never outside text. */
const IDLE_GLYPHS: Readonly<Record<'…' | '♪', Glyph>> = {
  '…': { glyph: '…', color: '#222222' },
  '♪': { glyph: '♪', color: '#2a7a2a' },
};

/** A "Z" rising from over the head and fading as it goes (`rise` 0 to 1), in detail pixels. */
export function drawSleepZ(ctx: CanvasRenderingContext2D, rise: number, feet: Point): void {
  ctx.save();
  ctx.translate(Math.round(feet.x), Math.round(feet.y - OVERHEAD_OFFSET));
  ctx.scale(DETAIL_SCALE, DETAIL_SCALE);
  ctx.globalAlpha = 1 - rise;
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#1a3a8a';
  const x = 6 + 2 * rise;
  const y = -(IDLE.zRisePx / DETAIL_SCALE) * rise;
  ctx.strokeText('Z', x, y);
  ctx.fillText('Z', x, y);
  ctx.restore();
}

/** The words of the king's summons (summons.ts): fixed strings, never outside text. */
const SPEECH_COLORS: Readonly<Record<SpeechLine, string>> = {
  '！': '#b0103a',
  ゴニョゴニョ: '#222222',
  'はっ！': '#1a3a8a',
};

/** The members' lines (lineBook.ts) read best in the dark ink of the king's murmur. */
const LINE_COLOR = '#222222';

function drawConfetti(ctx: CanvasRenderingContext2D, view: ConfettiView): void {
  for (const p of view.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(view.origin.x + p.x), Math.round(view.origin.y + p.y), p.size, p.size);
  }
}

/** A front layer with its still parts already drawn (the loop caches them once). */
export interface CachedFrontLayer {
  readonly depth: number;
  readonly layer: FrontLayer;
  readonly image: CanvasImageSource;
}

function drawMemberPose(ctx: CanvasRenderingContext2D, member: MemberPose, art: GuildArt): void {
  const { id, pose } = member;
  if (pose.held === null) {
    art.sprites.drawMember(ctx, id, pose, pose.point);
    return;
  }
  const look = heldLook(id, pose, pose.held, art.sprites.hasHoldFrames(id));
  art.sprites.drawMember(ctx, id, look, look.feet);
}

/** What a member holds, in their hands: over the furniture in front, which would hide it. */
function drawHeldItem(ctx: CanvasRenderingContext2D, member: MemberPose, art: GuildArt): void {
  const { id, pose, hand } = member;
  if (pose.held !== null) {
    const { prop, hold } = pose.held;
    const look = heldLook(id, pose, pose.held, art.sprites.hasHoldFrames(id));
    art.sprites.drawProp(ctx, prop, look.item, hold);
  } else if (hand !== null) {
    const at = { x: pose.point.x + hand.offset.x, y: pose.point.y + hand.offset.y };
    art.sprites.drawProp(ctx, hand.prop, at, 'carry');
  }
}

/** Items in the air (toss.ts): over every member and the furniture, as they fly over the room. */
function drawFlights(ctx: CanvasRenderingContext2D, frame: StageFrame, art: GuildArt): void {
  const feetOf = (id: MemberId) => frame.members.find((m) => m.id === id)?.pose.point;
  const hasHoldFrames = (id: MemberId) => art.sprites.hasHoldFrames(id);
  for (const view of frame.flights) {
    const at = flyingItemPoint(view, feetOf, hasHoldFrames);
    if (at !== null) art.sprites.drawProp(ctx, view.prop, at, 'raise');
  }
}

/**
 * Members (back to front) between the front layers, so the furniture in front of a member covers
 * their lower body, with the moving things on that furniture; then what they hold (sunk into a
 * seat, the hands are just over the desk or the counter, which would hide the item).
 */
export function drawActors(
  ctx: CanvasRenderingContext2D,
  stage: { readonly frame: StageFrame; readonly now: number; readonly cues: DecorCues },
  art: GuildArt,
  front: readonly CachedFrontLayer[],
): void {
  for (const step of stageSteps(stage.frame.members, front)) {
    if (step.kind === 'member') drawMemberPose(ctx, step.member, art);
    if (step.kind === 'held') drawHeldItem(ctx, step.member, art);
    if (step.kind !== 'layer') continue;
    ctx.drawImage(step.layer.image, 0, 0);
    drawAnimatedDecor(ctx, art, stage, step.layer.layer.animated);
  }
  drawFlights(ctx, stage.frame, art);
}

/** The text and the ink of what is over the head; null for the 「Z」, which has no bubble. */
function textOf(shown: Overhead): Glyph | null {
  if (shown.kind === 'speech') return { glyph: shown.words, color: SPEECH_COLORS[shown.words] };
  if (shown.kind === 'line' || shown.kind === 'murmur')
    return { glyph: shown.words, color: LINE_COLOR };
  if (shown.kind === 'bubble') return BUBBLE_GLYPHS[shown.bubble];
  return shown.mark.kind === 'z' ? null : IDLE_GLYPHS[shown.mark.glyph];
}

function drawPlaced(ctx: CanvasRenderingContext2D, placed: Placed): void {
  const { shown, bubble } = placed;
  if (shown.kind === 'mark' && shown.mark.kind === 'z') {
    drawSleepZ(ctx, shown.mark.rise, placed.feet);
    return;
  }
  const text = textOf(shown);
  if (text === null || bubble === null) return;
  drawBubble(ctx, { text: text.glyph, color: text.color, ...bubble }, placed.feet, placed.spot);
}

/**
 * Over everything, after the shade of the night (drawDaylight.ts), so they read the same at any
 * hour: one thing over each head (overhead.ts: the words of the king's summons, a line of a scene,
 * a line on starting to wait, the waiting bubble, a murmur or the sign of a long idle spell),
 * placed by overheadPlace.ts, and confetti.
 */
export function drawOverhead(
  ctx: CanvasRenderingContext2D,
  stage: { readonly placed: readonly Placed[]; readonly confetti: readonly ConfettiView[] },
): void {
  for (const placed of stage.placed) drawPlaced(ctx, placed);
  for (const view of stage.confetti) drawConfetti(ctx, view);
}
