import type { DecorArt } from './art';
import { TILE_SIZE } from './metrics';
import { rewardSparkle, type PlacedReward } from './rewardDesk';

/**
 * Canvas side effects only (rewardDesk.ts decides): the king's reward of the day on its desk
 * (Issues #194, #208). Drawn after the shade of the time of day, so it reads the same at any hour:
 * a warm glow behind it lifts it off the wood and the things on the desk, and a ✦ twinkles on it.
 */

const GLOW = 'rgba(255, 236, 170, 0.55)';
const GLOW_EDGE = 'rgba(255, 236, 170, 0)';
const SPARKLE_FILL = '#fff6c8';
const SPARKLE_INK = '#2a1608';

export function drawReward(
  ctx: CanvasRenderingContext2D,
  decor: DecorArt,
  placed: PlacedReward | null,
  now: number,
): void {
  if (placed === null) return;
  const side = TILE_SIZE * placed.scale;
  const cx = placed.x + side / 2;
  const cy = placed.y + side * 0.62;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, side * 0.55);
  glow.addColorStop(0, GLOW);
  glow.addColorStop(1, GLOW_EDGE);
  ctx.save();
  ctx.fillStyle = glow;
  ctx.fillRect(placed.x - side * 0.1, placed.y, side * 1.2, side);
  ctx.restore();
  decor.drawDecorScaled(ctx, placed.name, placed);
  const sparkle = rewardSparkle(placed, now);
  ctx.save();
  ctx.globalAlpha = sparkle.alpha;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = SPARKLE_INK;
  ctx.fillStyle = SPARKLE_FILL;
  ctx.strokeText('✦', sparkle.x, sparkle.y);
  ctx.fillText('✦', sparkle.x, sparkle.y);
  ctx.restore();
}
