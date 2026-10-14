import type { DecorName } from '../../../../assets/decor/decor';
import type { MemberState } from '../domain/party';
import { byMember } from '@conect-guild/snapshot/settings';
import type { MemberId } from '../guild.config';
import type { Random } from './confetti';
import { AMBIENT } from './metrics';
import type { HoldFrame, MoveFrame, Prop } from './motion';
import type { Point } from './path';

/**
 * Small moves while nothing happens, chosen from the party state only (no new data, no new
 * pictures: the four frames, the arms-in-front frame for typing, mirroring, a few px of offset and
 * the existing props). Pure: the time, the per-member seed and whether the member's sheet has the
 * holding frames are passed in. Members in a scene get none (director.ts).
 */

export type AmbientMood =
  /** Typing at the desk, now and then turning aside for papers. */
  | 'desk-work'
  /** Now and then looking around or stretching. */
  | 'idle'
  /** かなめ with quests at the reception: tidying the scroll. */
  | 'tidy-scroll'
  /** かなめ with nothing at the reception: fanning. */
  | 'fan'
  /** The king with PRs to approve: swaying on the throne. */
  | 'fidget';

export type AmbientMoods = Readonly<Partial<Record<MemberId, AmbientMood>>>;

/**
 * `busy` (the session is in a turn right now) is desk work for everyone. `awaiting-permission`
 * (the session waits for a tool permission) looks around: the bubble (bubbles.ts) says why.
 */
export function ambientMoodOf(id: MemberId, state: MemberState): AmbientMood {
  if (state === 'awaiting-permission') return 'idle';
  if (id === 'kaname') {
    if (state === 'working') return 'tidy-scroll';
    // awaiting-kaname: reviewing PRs, which reads as desk work.
    return state === 'idle' ? 'fan' : 'desk-work';
  }
  if (id === 'yukihiro') return state === 'awaiting-president' ? 'fidget' : 'idle';
  return state === 'working' || state === 'busy' ? 'desk-work' : 'idle';
}

export function ambientMoodsOf(
  rows: readonly { id: MemberId; state: MemberState }[],
): AmbientMoods {
  const moods: Partial<Record<MemberId, AmbientMood>> = {};
  for (const row of rows) moods[row.id] = ambientMoodOf(row.id, row.state);
  return moods;
}

/** Per member, so the members do not all move together. */
export interface AmbientSeed {
  /** Shifts the member's cycle, ms in [0, intervalMs). */
  readonly phaseMs: number;
  /** Length of one cycle (a move, then rest), ms. */
  readonly intervalMs: number;
}

export type AmbientSeeds = Readonly<Record<MemberId, AmbientSeed>>;

function drawSeed(random: Random): AmbientSeed {
  const span = AMBIENT.maxIntervalMs - AMBIENT.minIntervalMs;
  const intervalMs = Math.round(AMBIENT.minIntervalMs + random() * span);
  return { intervalMs, phaseMs: Math.floor(random() * intervalMs) };
}

export function createAmbientSeeds(random: Random): AmbientSeeds {
  return byMember(() => drawSeed(random));
}

/** An item handled in front of the member, centred at `offset` from the feet. */
export interface HandProp {
  readonly prop: Prop;
  readonly offset: Point;
}

/** The standing frames, and the arms-in-front frame for typing (hands.ts). */
export type AmbientFrame = MoveFrame | Extract<HoldFrame, 5>;

export interface AmbientPose {
  readonly frame: AmbientFrame;
  /** True when facing left (side frames only). */
  readonly flip: boolean;
  /** Added to the feet, logical px. */
  readonly offset: Point;
  readonly hand: HandProp | null;
}

export const AMBIENT_REST: AmbientPose = {
  frame: 0,
  flip: false,
  offset: { x: 0, y: 0 },
  hand: null,
};

/** Where `now` falls in the member's cycle: which cycle, and ms since it began. */
interface CycleTime {
  readonly index: number;
  readonly elapsed: number;
}

function cycleTime(seed: AmbientSeed, now: number): CycleTime {
  const t = now + seed.phaseMs;
  const index = Math.floor(t / seed.intervalMs);
  return { index, elapsed: t - index * seed.intervalMs };
}

/** 0 or 1, switching every `stepMs` from the start of the cycle. */
function alternate(elapsed: number, stepMs: number): 0 | 1 {
  return Math.floor(elapsed / stepMs) % 2 === 0 ? 0 : 1;
}

function rest(offset: Point = AMBIENT_REST.offset): AmbientPose {
  return { ...AMBIENT_REST, offset };
}

/**
 * Typing: the arms go back and forth over the desk (frames 0 and 5 in turn; the head stays put, as
 * it is at the same place in both), or, on a sheet without the holding frames, an up-and-down bob.
 */
function deskWork({ index, elapsed }: CycleTime, withHoldFrames: boolean): AmbientPose {
  if (elapsed < AMBIENT.pageTurnMs) return { ...AMBIENT_REST, frame: 1, flip: index % 2 !== 0 };
  const stroke = alternate(elapsed, AMBIENT.typingMs);
  if (!withHoldFrames) return rest({ x: 0, y: -AMBIENT.typingBobPx * stroke });
  return { ...AMBIENT_REST, frame: stroke === 0 ? 0 : 5 };
}

function idle({ index, elapsed }: CycleTime): AmbientPose {
  if (index % 2 !== 0) {
    return elapsed < AMBIENT.stretchMs ? rest({ x: 0, y: -AMBIENT.stretchPx }) : AMBIENT_REST;
  }
  if (elapsed < AMBIENT.lookMs) return { ...AMBIENT_REST, frame: 1 };
  if (elapsed < 2 * AMBIENT.lookMs) return { ...AMBIENT_REST, frame: 1, flip: true };
  return AMBIENT_REST;
}

function fan({ elapsed }: CycleTime): AmbientPose {
  if (elapsed >= AMBIENT.fanBurstMs) return AMBIENT_REST;
  return { ...AMBIENT_REST, frame: alternate(elapsed, AMBIENT.fanStrokeMs) };
}

/** -1 or +1 times `px`, switching every `stepMs`, during the first `burstMs`; else 0. */
function sway(elapsed: number, burstMs: number, stepMs: number, px: number): number {
  if (elapsed >= burstMs) return 0;
  return alternate(elapsed, stepMs) === 0 ? -px : px;
}

function tidyScroll({ elapsed }: CycleTime): AmbientPose {
  const x = sway(elapsed, AMBIENT.scrollBurstMs, AMBIENT.scrollStepMs, AMBIENT.scrollShakePx);
  return { ...AMBIENT_REST, hand: { prop: 'scroll', offset: { x, y: -AMBIENT.handHeightPx } } };
}

function fidget({ elapsed }: CycleTime): AmbientPose {
  const x = sway(elapsed, AMBIENT.fidgetBurstMs, AMBIENT.fidgetStepMs, AMBIENT.fidgetPx);
  return rest({ x, y: 0 });
}

const MOVES: Readonly<
  Record<AmbientMood, (time: CycleTime, withHoldFrames: boolean) => AmbientPose>
> = {
  'desk-work': deskWork,
  idle,
  'tidy-scroll': tidyScroll,
  fan,
  fidget,
};

/**
 * The frame, facing, offset and handled item of a member in `mood` at `now` (ms). `withHoldFrames`
 * tells whether the member's sheet has the holding frames (hands.hasHoldFrames).
 */
export function ambientPose(
  mood: AmbientMood,
  seed: AmbientSeed,
  now: number,
  withHoldFrames = false,
): AmbientPose {
  return MOVES[mood](cycleTime(seed, now), withHoldFrames);
}

/**
 * Small things that move between scenes: the flames of lamps and candles flicker (a little added
 * light) and the sleeping pet breathes (1 px) and now and then sits up. The others move only at
 * times (trinkets.ts): a glint on the abacus and the coins, notes from the megaphone, the globe
 * turning, the papers on ささえ's desk being sorted, the hourglass running and the banners fluttering. Pure: the time
 * and each thing's phase are passed in.
 */
export type DecorMotion =
  'flame' | 'breath' | 'glint' | 'notes' | 'spin' | 'papers' | 'sand' | 'flutter';

export const DECOR_MOTION: Readonly<Partial<Record<DecorName, DecorMotion>>> = {
  lantern: 'flame',
  sconce: 'flame',
  'pillar-lamp': 'flame',
  candlestick: 'flame',
  'sleeping-poodle': 'breath',
  abacus: 'glint',
  'coin-pile': 'glint',
  megaphone: 'notes',
  globe: 'spin',
  'file-stack': 'papers',
  hourglass: 'sand',
  banner: 'flutter',
};

export interface DecorPose {
  /** Added to the top of the picture, logical px. */
  readonly dy: number;
  /** How much light to add over the picture, 0 (none) to AMBIENT.flameGlow. */
  readonly glow: number;
}

/** A number in [0, 1) that looks random but is fixed for each step (integer hash). */
function flicker(step: number): number {
  return (Math.imul(step, 2_654_435_761) >>> 0) / 2 ** 32;
}

export function decorPose(
  motion: Extract<DecorMotion, 'flame' | 'breath'>,
  phaseMs: number,
  now: number,
): DecorPose {
  const t = now + phaseMs;
  if (motion === 'flame') {
    return { dy: 0, glow: AMBIENT.flameGlow * flicker(Math.floor(t / AMBIENT.flameStepMs)) };
  }
  return { dy: alternate(t, AMBIENT.breathMs / 2) === 1 ? -AMBIENT.breathPx : 0, glow: 0 };
}
