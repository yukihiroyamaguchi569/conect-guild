import type { TilePos } from '../guild.config';
import type { GuestState, GuestView } from '../domain/guests';
import {
  confettiAt,
  createConfetti,
  burstOrigin,
  type PlacedParticle,
  type Random,
} from './confetti';
import { dozeMotion, idleStage } from './idle';
import { DECOR, DECOR_TILE_SIZE } from '../../../../assets/decor/decor';
import { CONFETTI, IDLE } from './metrics';
import type { SpriteFrame } from './motion';
import { tileToPoint, type Point } from './path';

/**
 * The guests on the stage (Issue #108): each stands at its spot of the layout and never walks into
 * the members' scenes. The look follows the session: waiting for a permission shows the 「?」,
 * working reads a scroll. Resting and idle go as the members' long idle spells (idle.ts, Issue
 * #183): awake for 10 minutes, then dozing, from 30 minutes asleep, never leaving the spot. A
 * finished PR or Issue makes a small sparkle. Pure: drawGuests.ts draws.
 */

/**
 * What the stage needs of a guest: its place in the settings and its session's state. No name
 * or counts are drawn under it (the president, 2026-10-15, Issue #122): the board lists them.
 */
export interface StageGuest {
  readonly index: number;
  readonly state: GuestState;
  /** Epoch ms since when the guest has had nothing to do; null while working or not known. */
  readonly idleSince: number | null;
}

/** Since when each guest (by index) has had nothing to do (app/guestLastActive.ts). */
export type GuestIdleSince = readonly (number | null)[];

export function stageGuestsOf(views: readonly GuestView[], since: GuestIdleSince): StageGuest[] {
  return views.map(({ index, state }) => ({ index, state, idleSince: since[index] ?? null }));
}

/** Times are ms, distances logical px. */
export const GUEST = {
  /** Reading a scroll: the head bobs `readPx` for half of every `readMs`. */
  readMs: 2_400,
  readPx: 1,
  /** Each guest's moves run this much behind the one before, so the two never move as one. */
  phaseMs: 700,
  /** How much lower than over a member each mark is (markFeet). */
  markDrop: { question: 20, dots: 20, z: 17 },
  /**
   * The bench behind a guest (Issue #182) is this much right of centred under the feet: its ends
   * then stay clear of the stools beside two spots (the tavern's round table, the map table's).
   */
  benchDx: 12,
  /** A sparkle: fewer, slower and shorter-lived squares than a member's confetti. */
  sparkleMs: 1_600,
  sparkleCount: 14,
  sparkleSpeed: 0.5,
} as const;

/**
 * What is over a guest's head: the waiting 「?」, the dozing 「…」 (in the same place) or a rising
 * 「Z」 (`rise` 0 to 1).
 */
export type GuestMark =
  | { readonly kind: 'question' }
  | { readonly kind: 'dots' }
  | { readonly kind: 'z'; readonly rise: number };

export interface GuestLook {
  readonly frame: SpriteFrame;
  /** True when facing left (the side frame of a yawn). */
  readonly flip: boolean;
  /** Down from the spot, logical px (a bob while reading). */
  readonly dy: number;
  /** True while reading: a scroll in the arms. */
  readonly reading: boolean;
  readonly mark: GuestMark | null;
}

/** The clocks a look reads: the stage's `t` (stops while hidden) and the wall's epoch ms. */
export interface GuestClock {
  readonly t: number;
  readonly wall: number;
}

const STANDING = { flip: false, dy: 0, reading: false } as const;

/** Resting or idle, by how long since the guest had work (idle.idleStage, the members' times). */
function restingLook(guest: Pick<StageGuest, 'index' | 'idleSince'>, now: GuestClock): GuestLook {
  const stage = guest.idleSince === null ? 'awake' : idleStage(guest.idleSince, now.wall);
  if (stage === 'awake') return { ...STANDING, frame: 0, mark: null };
  if (stage === 'doze') {
    const doze = dozeMotion(guest.index * GUEST.phaseMs, now.wall);
    const mark = doze.mark === null ? null : { kind: 'dots' as const };
    return { ...STANDING, frame: doze.frame, flip: doze.flip, dy: doze.offset.y, mark };
  }
  // Asleep on the spot, as the members sleep at their seats (idle.ts): the 「Z」 too goes by the wall.
  const phase = Math.max(now.wall - guest.index * GUEST.phaseMs, 0);
  const rise = (phase % IDLE.zRiseMs) / IDLE.zRiseMs;
  return { ...STANDING, frame: 7, mark: { kind: 'z', rise } };
}

/**
 * How a guest looks at `now`. Reading uses the arms-in-front frame when the sheet has it (the
 * scroll is then held in the arms), otherwise the front frame.
 */
export function guestLook(guest: StageGuest, now: GuestClock, hasHoldFrames: boolean): GuestLook {
  if (guest.state === 'awaiting-permission') {
    return { ...STANDING, frame: 0, mark: { kind: 'question' } };
  }
  if (guest.state === 'working') {
    const phase = Math.max(now.t - guest.index * GUEST.phaseMs, 0);
    const dy = phase % GUEST.readMs < GUEST.readMs / 2 ? 0 : GUEST.readPx;
    return { ...STANDING, frame: hasHoldFrames ? 5 : 0, dy, reading: true, mark: null };
  }
  return restingLook(guest, now);
}

/**
 * The top-left of the bench a guest sits on or stands in front of (Issue #182): the decor `bench`
 * with its bottom on the feet, `GUEST.benchDx` right of centred. It stays put while the guest bobs
 * or nods.
 */
export function benchPoint(feet: Point): Point {
  const { w, h } = DECOR.bench;
  return { x: feet.x - (w * DECOR_TILE_SIZE) / 2 + GUEST.benchDx, y: feet.y - h * DECOR_TILE_SIZE };
}

/**
 * Where a mark over a guest is drawn from, as if the feet were there (drawBubble, draw.drawSleepZ):
 * lower than over a member, so the 「?」 sits beside the head and the 「Z」 rises from just over
 * it, both under the board's lowest edge (the guests' spots are under the board, Issue #108).
 */
export function markFeet(feet: Point, mark: GuestMark): Point {
  return { x: feet.x, y: feet.y + GUEST.markDrop[mark.kind] };
}

/** The feet of a guest on its spot. */
export function guestFeet(spot: TilePos): Point {
  return tileToPoint(spot);
}

/** A sparkle over a guest, started at stage time `start`. */
export interface GuestSparkle {
  readonly guest: number;
  readonly start: number;
  readonly particles: readonly ReturnType<typeof createConfetti>[number][];
}

export function createSparkle(guest: number, start: number, random: Random): GuestSparkle {
  const particles = createConfetti(random, GUEST.sparkleCount).map((p) => ({
    ...p,
    vx: p.vx * GUEST.sparkleSpeed,
    vy: p.vy * GUEST.sparkleSpeed,
    size: CONFETTI.smallPx,
  }));
  return { guest, start, particles };
}

export interface SparkleView {
  readonly origin: Point;
  readonly particles: readonly PlacedParticle[];
}

/** The sparkle's squares at `t` over the guest at `feet`; null before it starts and once it ends. */
export function sparkleAt(sparkle: GuestSparkle, t: number, feet: Point): SparkleView | null {
  const particles = confettiAt(sparkle.particles, t - sparkle.start, GUEST.sparkleMs);
  return particles.length === 0 ? null : { origin: burstOrigin(feet), particles };
}

/** One guest as drawn at a moment. */
export interface GuestPose {
  readonly guest: StageGuest;
  readonly feet: Point;
  readonly look: GuestLook;
}

export interface GuestFrame {
  readonly poses: readonly GuestPose[];
  readonly sparkles: readonly SparkleView[];
  /** True while a sparkle flies: the loop draws every frame. */
  readonly animating: boolean;
}

/** The guests at their spots and the sparkles still in the air at `now`. */
export function guestFrame(
  stage: {
    readonly guests: readonly StageGuest[];
    readonly sparkles: readonly GuestSparkle[];
    readonly spots: readonly TilePos[];
  },
  now: GuestClock,
  hasHoldFrames: (index: number) => boolean,
): GuestFrame {
  const poses = stage.guests.flatMap((guest) => {
    const spot = stage.spots[guest.index];
    if (spot === undefined) return [];
    const feet = guestFeet(spot);
    return [{ guest, feet, look: guestLook(guest, now, hasHoldFrames(guest.index)) }];
  });
  const sparkles = stage.sparkles.flatMap((sparkle) => {
    const pose = poses.find((p) => p.guest.index === sparkle.guest);
    const view = pose === undefined ? null : sparkleAt(sparkle, now.t, pose.feet);
    return view === null ? [] : [view];
  });
  return { poses, sparkles, animating: sparkles.length > 0 };
}

/** The sparkles that may still show at `t` (the others are over). */
export function liveSparkles(sparkles: readonly GuestSparkle[], t: number): GuestSparkle[] {
  return sparkles.filter((sparkle) => t - sparkle.start < GUEST.sparkleMs);
}
