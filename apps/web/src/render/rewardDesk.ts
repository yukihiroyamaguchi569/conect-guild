import type { RewardKind } from '../domain/dailyReward';
import type { MemberId } from '../guild.config';
import type { GuildLayout, TilePos } from './layouts/types';
import { contains } from './map';
import { TILE_SIZE } from './metrics';

/**
 * Where the king's reward of the day (Issue #194, domain/dailyReward.ts) stands on its member's
 * desk. Pure: the layout and the seat are passed in.
 */

/** The reward of the day on the stage: whose desk, and which picture (assets/decor). */
export interface StageReward {
  readonly member: MemberId;
  readonly kind: RewardKind;
  /** The next midnight, epoch ms: the desk is cleared then, fetched or not. */
  readonly until: number;
}

/** `reward` while its day lasts at `wallNow` (epoch ms), else null. */
export function rewardShownAt(reward: StageReward | null, wallNow: number): StageReward | null {
  return reward !== null && wallNow < reward.until ? reward : null;
}

export interface PlacedReward {
  readonly name: RewardKind;
  /** Top-left of the picture, logical px. */
  readonly x: number;
  readonly y: number;
  /** The bottom of its desk: it is drawn with the desk's front layer (layers.ts FrontLayer.depth). */
  readonly depth: number;
}

/** How far right of the member's middle the picture starts, and how far over the desk top, px. */
const OFFSET = { x: 8, y: -6 } as const;

/**
 * The reward `kind` on the desk in front of `seat` in `layout`: on the desk top, just right of the
 * member in the chair, over the things there. null when no desk stands in front of the seat.
 */
export function rewardOnDesk(
  layout: Pick<GuildLayout, 'objects'>,
  seat: TilePos,
  kind: RewardKind,
): PlacedReward | null {
  const front = { col: seat.col, row: seat.row + 1 };
  const desk = layout.objects.find((item) => item.tile === 'desk' && contains(item, front));
  if (desk === undefined) return null;
  return {
    name: kind,
    x: seat.col * TILE_SIZE + TILE_SIZE / 2 + OFFSET.x,
    y: desk.row * TILE_SIZE + OFFSET.y,
    depth: (desk.row + desk.h) * TILE_SIZE,
  };
}
