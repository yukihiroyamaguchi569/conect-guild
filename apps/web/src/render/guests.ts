import type { TilePos } from '../guild.config';
import type { GuestState, GuestView } from '../domain/guests';
import {
  confettiAt,
  createConfetti,
  burstOrigin,
  type PlacedParticle,
  type Random,
} from './confetti';
import { CONFETTI, IDLE } from './metrics';
import type { SpriteFrame } from './motion';
import { tileToPoint, type Point } from './path';

/**
 * The guests on the stage (Issue #108): each stands at its spot of the layout and never walks into
 * the members' scenes. The look follows the session: waiting for a permission shows the 「?」,
 * working reads a scroll, resting and idle doze. A finished PR or Issue makes a small sparkle.
 * Pure: drawGuests.ts draws.
 */

/** What the stage needs of a guest: names come from the settings, counts from the snapshot. */
export interface StageGuest {
  readonly index: number;
  readonly name: string;
  readonly state: GuestState;
  /** Open Issues and PRs; null while the guest has no repository read. */
  readonly counts: { readonly issues: number; readonly prs: number } | null;
}

export function stageGuestsOf(views: readonly GuestView[]): StageGuest[] {
  return views.map(({ index, name, state, repo }) => ({
    index,
    name,
    state,
    counts: repo === null ? null : { issues: repo.openIssues, prs: repo.openPrs },
  }));
}

/** Times are ms, distances logical px. */
export const GUEST = {
  /** Reading a scroll: the head bobs `readPx` for half of every `readMs`. */
  readMs: 2_400,
  readPx: 1,
  /** Each guest's moves run this much behind the one before, so the two never move as one. */
  phaseMs: 700,
  /** The name's centre under the feet, and the counts' under the name. */
  nameBelowFeet: 8,
  countBelowName: 11,
  /** On one line, the gap between the feet and each of the name and the counts. */
  tagGap: 3,
  /** How much lower than over a member each mark is (markFeet). */
  markDrop: { question: 20, z: 17 },
  /** A sparkle: fewer, slower and shorter-lived squares than a member's confetti. */
  sparkleMs: 1_600,
  sparkleCount: 14,
  sparkleSpeed: 0.5,
} as const;

/** What is over a guest's head: the waiting 「?」 or a rising 「Z」 (`rise` 0 to 1). */
export type GuestMark =
  { readonly kind: 'question' } | { readonly kind: 'z'; readonly rise: number };

export interface GuestLook {
  readonly frame: SpriteFrame;
  /** Down from the spot, logical px (a nod or a bob). */
  readonly dy: number;
  /** True while reading: a scroll in the arms. */
  readonly reading: boolean;
  readonly mark: GuestMark | null;
}

/**
 * How a guest looks at stage time `t`. Reading uses the arms-in-front frame when the sheet has it
 * (the scroll is then held in the arms), otherwise the front frame.
 */
export function guestLook(
  guest: Pick<StageGuest, 'index' | 'state'>,
  t: number,
  hasHoldFrames: boolean,
): GuestLook {
  const phase = Math.max(t - guest.index * GUEST.phaseMs, 0);
  if (guest.state === 'awaiting-permission') {
    return { frame: 0, dy: 0, reading: false, mark: { kind: 'question' } };
  }
  if (guest.state === 'working') {
    const dy = phase % GUEST.readMs < GUEST.readMs / 2 ? 0 : GUEST.readPx;
    return { frame: hasHoldFrames ? 5 : 0, dy, reading: true, mark: null };
  }
  // Resting and idle: dozing on the spot, as the members do at their seats (idle.ts).
  const dy = phase % IDLE.nodMs < IDLE.nodMs / 2 ? 0 : IDLE.nodPx;
  const rise = (phase % IDLE.zRiseMs) / IDLE.zRiseMs;
  return { frame: 0, dy, reading: false, mark: { kind: 'z', rise } };
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

export interface GuestTag {
  readonly text: string;
  readonly kind: 'name' | 'count';
  /** Which end of the text `x` is (canvas textAlign); `y` is its middle. Logical px. */
  readonly align: 'center' | 'left' | 'right';
  readonly x: number;
  readonly y: number;
}

/** 「Issue 2 / PR 1」: what is open in the guest's repository. */
export function countText(counts: NonNullable<StageGuest['counts']>): string {
  return `Issue ${String(counts.issues)} / PR ${String(counts.prs)}`;
}

/**
 * The name under the feet and the counts under it. When the counts would reach below `bottom` (the
 * message window), they go on the name's line instead: the name left of the feet, the counts right.
 */
export function guestTags(guest: StageGuest, feet: Point, bottom: number): GuestTag[] {
  const { x } = feet;
  const nameY = feet.y + GUEST.nameBelowFeet;
  const name = { text: guest.name, kind: 'name' } as const;
  if (guest.counts === null) return [{ ...name, align: 'center', x, y: nameY }];
  const count = { text: countText(guest.counts), kind: 'count' } as const;
  const below = nameY + GUEST.countBelowName;
  if (below + GUEST.countBelowName / 2 <= bottom) {
    return [
      { ...name, align: 'center', x, y: nameY },
      { ...count, align: 'center', x, y: below },
    ];
  }
  return [
    { ...name, align: 'right', x: x - GUEST.tagGap, y: nameY },
    { ...count, align: 'left', x: x + GUEST.tagGap, y: nameY },
  ];
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

/** The guests at their spots and the sparkles still in the air at `t`. */
export function guestFrame(
  stage: {
    readonly guests: readonly StageGuest[];
    readonly sparkles: readonly GuestSparkle[];
    readonly spots: readonly TilePos[];
  },
  t: number,
  hasHoldFrames: (index: number) => boolean,
): GuestFrame {
  const poses = stage.guests.flatMap((guest) => {
    const spot = stage.spots[guest.index];
    if (spot === undefined) return [];
    const feet = guestFeet(spot);
    return [{ guest, feet, look: guestLook(guest, t, hasHoldFrames(guest.index)) }];
  });
  const sparkles = stage.sparkles.flatMap((sparkle) => {
    const pose = poses.find((p) => p.guest.index === sparkle.guest);
    const view = pose === undefined ? null : sparkleAt(sparkle, t, pose.feet);
    return view === null ? [] : [view];
  });
  return { poses, sparkles, animating: sparkles.length > 0 };
}

/** The sparkles that may still show at `t` (the others are over). */
export function liveSparkles(sparkles: readonly GuestSparkle[], t: number): GuestSparkle[] {
  return sparkles.filter((sparkle) => t - sparkle.start < GUEST.sparkleMs);
}
