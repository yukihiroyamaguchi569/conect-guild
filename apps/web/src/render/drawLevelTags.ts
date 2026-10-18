import type { LevelTag } from './levelTags';

/** Canvas side effects only (levelTags.ts decides). Faint, so the room stays the picture. */
const LEVEL_TAG_ALPHA = 0.7;

export function drawLevelTags(ctx: CanvasRenderingContext2D, tags: readonly LevelTag[]): void {
  if (tags.length === 0) return;
  ctx.save();
  ctx.globalAlpha = LEVEL_TAG_ALPHA;
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a1608';
  ctx.fillStyle = '#ffe9a8';
  for (const tag of tags) {
    ctx.strokeText(tag.text, tag.x, tag.y);
    ctx.fillText(tag.text, tag.x, tag.y);
  }
  ctx.restore();
}
