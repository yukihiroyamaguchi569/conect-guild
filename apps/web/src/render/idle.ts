import type { MemberState } from '../domain/party';
import { byMember } from '@conect-guild/snapshot/settings';
import { ACTIVE_MEMBER_IDS, type MemberId, type TilePos } from '../guild.config';
import type { Random } from './confetti';
import { IDLE } from './metrics';
import {
  MS_PER_TILE,
  poseOnSegment,
  walkSegment,
  type MoveFrame,
  type Segment,
  type SleepFrame,
} from './motion';
import { findPath, tileToPoint, type Point, type TilePath } from './path';
import { DEFAULT_SEATS } from './scenes';
import { PLAY_SPOTS, turnsToPet, type PlaySpot } from './idleSpots';

/**
 * Long idle spells (Issue #23): after 10 minutes with nothing to do a member dozes at the seat
 * (nods, yawns, a "…" now and then), after 30 minutes they sleep (the sleeping frame 7, Issue #179,
 * a "Z" rising over the head) or get up to play for a while (idleSpots.ts)
 * and come back to sleep or play again. Pure: the wall time, each member's last-active time and the
 * per-member salt (from the injected random source) decide everything, so the same moment always
 * looks the same. The king follows the same rules but never leaves the throne.
 */

/** Epoch ms since when each member has had nothing to do; members with work are absent. */
export type IdleSince = Readonly<Partial<Record<MemberId, number>>>;

/** Nothing to do: no quest, no PR, no session turn, nobody to wait for. */
export function isRestful(state: MemberState): boolean {
  return state === 'idle' || state === 'done';
}

export type IdleStage = 'awake' | 'doze' | 'sleep';

export function idleStage(since: number, now: number): IdleStage {
  const idleMs = now - since;
  if (idleMs >= IDLE.sleepAfterMs) return 'sleep';
  return idleMs >= IDLE.dozeAfterMs ? 'doze' : 'awake';
}

/** Per member, so they do not all nod, play and come back together. */
export type IdleSeeds = Readonly<Record<MemberId, number>>;

export function createIdleSeeds(random: Random): IdleSeeds {
  const salt = () => Math.floor(random() * 2 ** 31);
  return byMember(() => salt());
}

/** A number in [0, 1) fixed for each (salt, cycle, draw): looks random, is the same every frame. */
export function idleHash(salt: number, cycle: number, draw: number): number {
  let h = Math.imul(salt ^ 0x9e37_79b9, 0x85eb_ca6b);
  h = Math.imul(h ^ cycle ^ (h >>> 15), 0xc2b2_ae35);
  h = Math.imul(h ^ draw ^ (h >>> 13), 0x27d4_eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** One outing within a play cycle: out along the spot's path, a stay, and back the same way. */
export interface Outing {
  readonly spot: PlaySpot;
  readonly out: Segment;
  readonly back: Segment;
}

export type IdleActivity =
  | { readonly kind: 'doze' }
  | { readonly kind: 'sleep' }
  | { readonly kind: 'play'; readonly outing: Outing };

function reversed(path: TilePath): TilePath {
  const [first, ...rest] = path.toReversed();
  return first === undefined ? path : [first, ...rest];
}

/** The outing a member would make in `cycle`, or null when they sleep through it. */
export function plannedOuting(id: MemberId, salt: number, cycle: number): Outing | null {
  const spots = PLAY_SPOTS[id];
  if (spots.length === 0 || idleHash(salt, cycle, 0) >= IDLE.playShare) return null;
  const spot = spots[Math.floor(idleHash(salt, cycle, 1) * spots.length)] ?? spots[0];
  if (spot === undefined) return null;
  const leave = cycle * IDLE.playCycleMs + Math.floor(idleHash(salt, cycle, 2) * IDLE.leaveMaxMs);
  const out = walkSegment(spot.path, leave);
  const stay =
    IDLE.stayMinMs + Math.floor(idleHash(salt, cycle, 3) * (IDLE.stayMaxMs - IDLE.stayMinMs));
  return { spot, out, back: walkSegment(reversed(spot.path), out.end + stay) };
}

/** The members on stage, かなめ first, then the departments in their order, then the king. */
const MEMBER_ORDER: readonly MemberId[] = ACTIVE_MEMBER_IDS;

const keyOf = (tile: TilePos): string => `${String(tile.col)},${String(tile.row)}`;

/**
 * The outing each member may make in `cycle`: their planned one, unless a member earlier in the
 * order plans the same tile. Decided from the salts alone, whoever is idle, so one member waking up
 * never sends another one to a spot in the middle of a cycle.
 */
export function cycleOutings(seeds: IdleSeeds, cycle: number): Partial<Record<MemberId, Outing>> {
  const taken = new Set<string>();
  const outings: Partial<Record<MemberId, Outing>> = {};
  for (const id of MEMBER_ORDER) {
    const outing = plannedOuting(id, seeds[id], cycle);
    if (outing === null) continue;
    const key = keyOf(outing.spot.tile);
    if (!taken.has(key)) outings[id] = outing;
    taken.add(key);
  }
  return outings;
}

/**
 * What every idle member does at `now`. Members play only in cycles that start after their 30
 * minutes; two members never go to the same tile in one cycle (cycleOutings). Outside the outing
 * itself a member of the cycle sleeps at the seat.
 */
export function idleActivities(
  since: IdleSince,
  seeds: IdleSeeds,
  now: number,
): Partial<Record<MemberId, IdleActivity>> {
  const cycle = Math.floor(now / IDLE.playCycleMs);
  const outings = cycleOutings(seeds, cycle);
  const activities: Partial<Record<MemberId, IdleActivity>> = {};
  for (const id of MEMBER_ORDER) {
    const from = since[id];
    const stage = from === undefined ? 'awake' : idleStage(from, now);
    if (from === undefined || stage === 'awake') continue;
    const eligible = stage === 'sleep' && cycle * IDLE.playCycleMs >= from + IDLE.sleepAfterMs;
    const outing = eligible ? outings[id] : undefined;
    const out = outing !== undefined && outing.out.start <= now && now < outing.back.end;
    activities[id] = out ? { kind: 'play', outing } : { kind: stage };
  }
  return activities;
}

/** A sign over the head: a rising "Z" (0 to 1 of its way), or a small bubble. */
export type IdleMark =
  | { readonly kind: 'z'; readonly rise: number }
  | { readonly kind: 'bubble'; readonly glyph: '…' | '♪' };

/** Between two tiles: `progress` (0 to 1) of the way from `from` to `to`; equal tiles when still. */
export interface IdleStep {
  readonly from: TilePos;
  readonly to: TilePos;
  readonly progress: number;
}

export interface IdlePose {
  /** The feet on the floor, before the seat's sink. */
  readonly feet: Point;
  /** Where the feet are on the tile grid (to walk back from exactly there). */
  readonly step: IdleStep;
  readonly frame: MoveFrame | SleepFrame;
  readonly flip: boolean;
  /** Added after the sink (nodding), logical px. */
  readonly offset: Point;
  readonly mark: IdleMark | null;
  /** True while the member stays by the pet (from arriving until the walk back starts). */
  readonly withPet: boolean;
}

const STILL: Point = { x: 0, y: 0 };

const still = (tile: TilePos): IdleStep => ({ from: tile, to: tile, progress: 0 });

/** The step of a walk at `now` (as motion.poseOnSegment places the feet). */
function stepOn(segment: Segment, now: number): IdleStep {
  const { path } = segment;
  const elapsed = Math.min(Math.max(now - segment.start, 0), segment.end - segment.start);
  const progress = elapsed / MS_PER_TILE;
  const index = Math.min(Math.floor(progress), path.length - 2);
  const from = path[index] ?? path[0];
  return { from, to: path[index + 1] ?? from, progress: progress - index };
}

function phase(salt: number, now: number, cycleMs: number): { index: number; elapsed: number } {
  const t = now + (salt % cycleMs);
  const index = Math.floor(t / cycleMs);
  return { index, elapsed: t - index * cycleMs };
}

/** Nodding; a yawn turned aside in every fourth cycle; a "…" in every third. */
function dozePose(seat: TilePos, salt: number, now: number): IdlePose {
  const { index, elapsed } = phase(salt, now, IDLE.dozeCycleMs);
  const feet = tileToPoint(seat);
  const step = still(seat);
  if (index % 4 === 0 && elapsed < IDLE.yawnMs) {
    return {
      feet,
      step,
      frame: 1,
      flip: index % 8 === 0,
      offset: STILL,
      mark: null,
      withPet: false,
    };
  }
  const nod = Math.floor(elapsed / (IDLE.nodMs / 2)) % 2 === 1 ? IDLE.nodPx : 0;
  const dots = index % 3 === 1 && elapsed < IDLE.dozeDotsMs;
  return {
    feet,
    step,
    frame: 0,
    flip: false,
    offset: { x: 0, y: nod },
    mark: dots ? { kind: 'bubble', glyph: '…' } : null,
    withPet: false,
  };
}

function sleepPose(seat: TilePos, salt: number, now: number): IdlePose {
  const { elapsed } = phase(salt, now, IDLE.zRiseMs);
  return {
    feet: tileToPoint(seat),
    step: still(seat),
    frame: 7,
    flip: false,
    offset: STILL,
    mark: { kind: 'z', rise: elapsed / IDLE.zRiseMs },
    withPet: false,
  };
}

/** How far a member by the pet is crouched `elapsed` ms after arriving: down at the end of each turn. */
export function crouchAt(elapsed: number): number {
  return elapsed % IDLE.crouchEveryMs >= IDLE.crouchEveryMs - IDLE.crouchMs ? IDLE.crouchPx : 0;
}

/**
 * At the spot: chat bubbles in turn facing the partner, a "♪" turned toward the pet with a crouch
 * now and then, looks at the window.
 */
function stayPose(outing: Outing, now: number): IdlePose {
  const { spot } = outing;
  const feet = tileToPoint(spot.tile);
  const step = Math.floor((now - outing.out.end) / IDLE.bubbleMs);
  const base = {
    feet,
    step: still(spot.tile),
    frame: 0 as const,
    flip: false,
    offset: STILL,
    mark: null,
    withPet: false,
  };
  if (spot.kind === 'chat' && spot.partner !== null) {
    const glyph = step % 2 === 0 ? '…' : '♪';
    const flip = DEFAULT_SEATS[spot.partner].col < spot.tile.col;
    return { ...base, frame: 1, flip, mark: { kind: 'bubble', glyph } };
  }
  if (spot.kind === 'pet') {
    const flip = turnsToPet(spot.tile);
    return {
      ...base,
      frame: 1,
      flip,
      offset: { x: 0, y: crouchAt(now - outing.out.end) },
      mark: step % 2 === 0 ? { kind: 'bubble', glyph: '♪' } : null,
      withPet: true,
    };
  }
  if (spot.kind === 'window') {
    const look = Math.floor((now - outing.out.end) / IDLE.lookMs) % 4;
    if (look === 1 || look === 3) return { ...base, frame: 1, flip: look === 3 };
  }
  return base;
}

function playPose(outing: Outing, now: number): IdlePose {
  let walking: Segment | null = null;
  if (now < outing.out.end) walking = outing.out;
  else if (now >= outing.back.start) walking = outing.back;
  if (walking === null) return stayPose(outing, now);
  const pose = poseOnSegment(walking, now);
  return {
    feet: pose.point,
    step: stepOn(walking, now),
    frame: pose.frame,
    flip: pose.flip,
    offset: STILL,
    mark: null,
    withPet: false,
  };
}

export function idlePose(
  activity: IdleActivity,
  seat: TilePos,
  salt: number,
  now: number,
): IdlePose {
  if (activity.kind === 'play') return playPose(activity.outing, now);
  return activity.kind === 'doze' ? dozePose(seat, salt, now) : sleepPose(seat, salt, now);
}

export type IdlePoses = Readonly<Partial<Record<MemberId, IdlePose>>>;

/** The pose of every member in a long idle spell at `now` (wall time). */
export function idlePosesAt(
  since: IdleSince,
  seeds: IdleSeeds,
  now: number,
  seats: Readonly<Record<MemberId, TilePos>> = DEFAULT_SEATS,
): IdlePoses {
  const activities = idleActivities(since, seeds, now);
  const poses: Partial<Record<MemberId, IdlePose>> = {};
  for (const id of MEMBER_ORDER) {
    const activity = activities[id];
    if (activity !== undefined) poses[id] = idlePose(activity, seats[id], seeds[id], now);
  }
  return poses;
}

/**
 * The walk back to the seat from exactly where the feet are, starting at `now`; null when already
 * on the seat or there is no way. Between two tiles the walk goes on through the one the seat is
 * nearer from; the segment then starts a little before `now`, so the feet do not jump.
 */
export function homeWalk(step: IdleStep, seat: TilePos, now: number): Segment | null {
  const { from, to, progress } = step;
  const same = (a: TilePos, b: TilePos) => a.col === b.col && a.row === b.row;
  if (same(from, to)) {
    if (same(from, seat)) return null;
    const path = findPath(from, seat);
    return path === null || path.length < 2 ? null : walkSegment(path, now);
  }
  const ways = [
    { first: from, rest: findPath(to, seat), done: progress },
    { first: to, rest: findPath(from, seat), done: 1 - progress },
  ].flatMap(({ first, rest, done }) =>
    rest === null ? [] : [walkSegment([first, ...rest], now - done * MS_PER_TILE)],
  );
  return ways.reduce<Segment | null>(
    (best, walk) => (best === null || walk.end < best.end ? walk : best),
    null,
  );
}
