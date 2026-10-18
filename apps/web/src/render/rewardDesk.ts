import type { RewardKind } from '../domain/dailyReward';
import { MEMBERS, type MemberId } from '../guild.config';
import type { PressLines } from './examine';
import type { GuildLayout, TilePos } from './layouts/types';
import { contains } from './map';
import { TILE_SIZE } from './metrics';

/**
 * Where the king's reward of the day (Issue #194, domain/dailyReward.ts) stands on its member's
 * desk, and what a press on it tells (Issue #213). Pure: the layout and the seat are passed in.
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
  /** How many times its own size it is drawn (REWARD_SCALE). */
  readonly scale: number;
}

/**
 * Drawn half as big again as the things on the desk, so it stands out among them (Issue #208).
 * The picture is a decor piece of one tile (assets/decor).
 */
export const REWARD_SCALE = 1.5;
const SIDE = TILE_SIZE * REWARD_SCALE;
/** Half the width of a seated member, px from the middle of their seat. */
const MEMBER_HALF = TILE_SIZE / 2;
/** Where the bottom of the picture rests, px below the top of the desk (on its top). */
const REST_BELOW_DESK_TOP = 28;

/**
 * The reward `kind` on the desk in front of `seat` in `layout`: on the desk top, in the middle of
 * the wider of the two stretches of desk left and right of the member in the chair, over the things
 * there (Issue #208: drawn bigger, after the shade, with a glow). null when no desk stands in front
 * of the seat.
 */
export function rewardOnDesk(
  layout: Pick<GuildLayout, 'objects'>,
  seat: TilePos,
  kind: RewardKind,
): PlacedReward | null {
  const front = { col: seat.col, row: seat.row + 1 };
  const desk = layout.objects.find((item) => item.tile === 'desk' && contains(item, front));
  if (desk === undefined) return null;
  const middle = seat.col * TILE_SIZE + TILE_SIZE / 2;
  const left = { from: desk.col * TILE_SIZE, to: middle - MEMBER_HALF };
  const right = { from: middle + MEMBER_HALF, to: (desk.col + desk.w) * TILE_SIZE };
  const wider = left.to - left.from > right.to - right.from ? left : right;
  return {
    name: kind,
    x: (wider.from + wider.to - SIDE) / 2,
    y: desk.row * TILE_SIZE + REST_BELOW_DESK_TOP - SIDE,
    scale: REWARD_SCALE,
  };
}

/** The little ✦ over the reward: where (its middle, logical px) and how bright now. */
export interface RewardSparkle {
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
}

/** One twinkle of the ✦, ms. */
const TWINKLE_MS = 1_200;

/** The ✦ at the top-right of the picture, twinkling at `now` (ms). Pure. */
export function rewardSparkle(placed: PlacedReward, now: number): RewardSparkle {
  const phase = (now % TWINKLE_MS) / TWINKLE_MS;
  return {
    x: placed.x + SIDE - 6,
    y: placed.y + 10,
    alpha: 0.55 + 0.45 * Math.cos(phase * 2 * Math.PI),
  };
}

/** What a press on each kind tells (Issue #213), with the name of the member who got it. */
const REWARD_LINES: Readonly<
  Record<RewardKind, readonly [(name: string) => string, ...((name: string) => string)[]]>
> = {
  onigiri: [
    (name) => `${name}の おにぎりは まだ あたたかい。`,
    (name) => `${name}は おにぎりを うれしそうに みつめている。`,
    (name) => `${name}は おにぎりを たべるのが もったいないようだ。`,
  ],
  dango: [
    (name) => `${name}は おだんごを だいじそうに ながめている。`,
    (name) => `${name}の おだんごから あまい においが する。`,
    (name) => `${name}は おだんごを いつ たべるか まよっている。`,
  ],
  medal: [
    (name) => `${name}は くんしょうを ほこらしげに みがいている。`,
    (name) => `${name}の くんしょうが きらりと ひかった。`,
    (name) => `${name}は くんしょうを むねに つけてみた。`,
  ],
};

/**
 * What a press on `reward` tells in the message window (Issue #213): one of the fixed lines of its
 * kind with its member's name from the settings, never the line told just before, nothing rare.
 */
export function rewardLinesOf(reward: Pick<StageReward, 'member' | 'kind'>): PressLines {
  const { name } = MEMBERS[reward.member];
  const [first, ...rest] = REWARD_LINES[reward.kind];
  return { usual: [first(name), ...rest.map((line) => line(name))], rare: [], noRepeat: true };
}
