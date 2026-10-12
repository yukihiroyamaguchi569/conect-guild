import type { StageFrame } from './director';
import { bannerPoint, LEVEL_UP } from './levelUp';
import { wordsTop, type Placed } from './overheadPlace';

/** What the words need of a 2D context (tests pass a recording one). */
export type BannerContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'lineWidth'
  | 'lineJoin'
  | 'strokeStyle'
  | 'fillStyle'
  | 'globalAlpha'
  | 'strokeText'
  | 'fillText'
>;

/**
 * Canvas side effects only (levelUp.ts decides): the words "LEVEL UP" over the seat of a member
 * who went up a level, on top of everything like the confetti, and over the words over the
 * member's head when there are some (the answer to the king, a line of a scene: overheadPlace.wordsTop,
 * placed as they are drawn). A fixed string, drawn with fillText.
 */
export function drawLevelUpBanners(
  ctx: BannerContext,
  stage: {
    readonly confetti: StageFrame['confetti'];
    /** What is over the heads this frame, as drawn (overheadPlace.ts). */
    readonly placed: readonly Placed[];
  },
): void {
  const { placed } = stage;
  ctx.save();
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a1608';
  ctx.fillStyle = '#ffd84a';
  for (const { actor, origin, banner } of stage.confetti) {
    if (banner === null) continue;
    const at = bannerPoint(origin, banner, wordsTop(placed, actor));
    ctx.globalAlpha = banner.alpha;
    ctx.strokeText(LEVEL_UP.text, Math.round(at.x), Math.round(at.y));
    ctx.fillText(LEVEL_UP.text, Math.round(at.x), Math.round(at.y));
  }
  ctx.restore();
}
