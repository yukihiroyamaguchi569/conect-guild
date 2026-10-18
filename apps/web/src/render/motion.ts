import type { TilePos } from '../guild.config';
import { HOLD, OVERHEAD_OFFSET } from './metrics';
import { tileToPoint, type Point, type TilePath } from './path';

/**
 * Timed movement of one member, as pure data: a segment either walks a tile path or stays on one
 * tile. All times are milliseconds on the clock the caller injects.
 */

/** What a member hands over in a scene, or raises in a toast (Issue #193). */
export type Prop = 'scroll' | 'chest' | 'tankard';

/** How it is held: in both arms in front of the body while carried, or up over the head. */
export type Hold = 'carry' | 'raise';

export interface Held {
  readonly prop: Prop;
  readonly hold: Hold;
}

export const carry = (prop: Prop): Held => ({ prop, hold: 'carry' });
export const raise = (prop: Prop): Held => ({ prop, hold: 'raise' });

/** Standing and walking frames: 0 front, 1 side standing, 2 and 3 side walking. */
export type MoveFrame = 0 | 1 | 2 | 3;
/** Holding frames (hands.ts): 4 hands up, 5 arms in front (front), 6 arms in front (side). */
export type HoldFrame = 4 | 5 | 6;
/** Asleep, sitting, facing front (Issue #179). */
export type SleepFrame = 7;
/** Sprite frame: the n-th 80 px column of a member's sheet (contract with the sprite art). */
export type SpriteFrame = MoveFrame | HoldFrame | SleepFrame;

export const MS_PER_TILE = 250;
export const STEP_FRAME_MS = 160;

export interface Segment {
  readonly start: number;
  /** Exclusive. */
  readonly end: number;
  /** One tile for a stay, two or more for a walk. */
  readonly path: TilePath;
  readonly held: Held | null;
  /**
   * A stay that is one hop, up and down, this high (logical px; levelUp.ts). Only the drawing goes
   * up (director.frameAt): the feet stay on the tile, so the seat and the depth do not change.
   */
  readonly hopPx?: number;
}

export interface Pose {
  /** Feet, in logical pixels. */
  readonly point: Point;
  readonly frame: MoveFrame;
  /** True when facing left (the art draws the right-facing frame mirrored). */
  readonly flip: boolean;
  readonly held: Held | null;
}

export function staySegment(
  at: TilePos,
  start: number,
  durationMs: number,
  held: Held | null = null,
): Segment {
  return { start, end: start + durationMs, path: [at], held };
}

/** Walks the path at MS_PER_TILE per step. A one-tile path takes no time. */
export function walkSegment(path: TilePath, start: number, held: Held | null = null): Segment {
  return {
    start,
    end: start + (path.length - 1) * MS_PER_TILE,
    path,
    held,
  };
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Facing of the last sideways step at or before `step`; right when there was none. */
function facesLeft(path: readonly TilePos[], step: number): boolean {
  for (let i = step; i >= 0; i -= 1) {
    const from = path[i];
    const to = path[i + 1];
    if (from === undefined || to === undefined || from.col === to.col) continue;
    return to.col < from.col;
  }
  return false;
}

/** How high a hopping stay lifts the member at `t`: a parabola, 0 at both ends, `hopPx` halfway. */
export function hopLift(segment: Segment, t: number): number {
  const length = segment.end - segment.start;
  if (segment.hopPx === undefined || length <= 0) return 0;
  const p = Math.min(Math.max((t - segment.start) / length, 0), 1);
  return 4 * segment.hopPx * p * (1 - p);
}

/** Pose on a segment at time `t` (clamped to the segment). */
export function poseOnSegment(segment: Segment, t: number): Pose {
  const base = { held: segment.held };
  const first = segment.path[0];
  if (segment.path.length < 2) return { ...base, point: tileToPoint(first), frame: 0, flip: false };
  const elapsed = Math.min(Math.max(t - segment.start, 0), segment.end - segment.start);
  const progress = elapsed / MS_PER_TILE;
  const step = Math.min(Math.floor(progress), segment.path.length - 2);
  const from = segment.path[step] ?? first;
  const to = segment.path[step + 1] ?? from;
  const frame: MoveFrame = Math.floor(elapsed / STEP_FRAME_MS) % 2 === 0 ? 2 : 3;
  return {
    ...base,
    point: lerp(tileToPoint(from), tileToPoint(to), progress - step),
    frame,
    flip: facesLeft(segment.path, step),
  };
}

/** The member standing still on a tile (at their seat when nothing is happening). */
export function standingPose(at: TilePos): Pose {
  return { point: tileToPoint(at), frame: 0, flip: false, held: null };
}

/**
 * Where a held item is centred. Raised: over the head. Carried: in front of the body at
 * chest-to-waist height; facing front it is in the middle, facing sideways it moves forward to
 * where the hands are, a little out from the outline of the body.
 */
export function heldItemPoint(pose: Pick<Pose, 'point' | 'frame' | 'flip'>, hold: Hold): Point {
  const { x, y } = pose.point;
  if (hold === 'raise') return { x, y: y - OVERHEAD_OFFSET };
  const forward = pose.frame === 0 ? 0 : HOLD.carryForwardPx;
  return { x: x + (pose.flip ? -forward : forward), y: y - HOLD.carryHeightPx };
}
