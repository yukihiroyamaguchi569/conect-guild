import { ACTIVE_MEMBER_IDS, type MemberId } from '../guild.config';
import { CONFETTI_MS, type Random } from './confetti';
import type { GuildEvent } from '../domain/events';
import { inScene, scheduleEvent, sendHome, type Director } from './director';
import {
  createIdleSeeds,
  homeWalk,
  idleActivities,
  idlePosesAt,
  type IdleActivity,
  type IdlePoses,
  type IdleSeeds,
  type IdleSince,
} from './idle';
import { actorOf, castOf, DEFAULT_SEATS, type SceneContext } from './scenes';

/**
 * The render loop's memory of the long idle spells (idle.ts): since when each member has had
 * nothing to do, and when each was last in a scene (their spell starts over after it). It hands
 * back a new director when members out playing must walk back to their seat: when work comes
 * (their idle time changes) or when a scene needs them. `t` is stage time, `wall` epoch ms.
 */
export interface IdleCrew {
  /**
   * For one frame at stage time `t`: notes who is in a scene now (reported to `onActive`) and
   * returns the poses of the members in a long idle spell.
   */
  frame(director: Director, t: number): IdlePoses;
  /** The poses of the long idle spells now, like `frame` but noting nobody active. */
  poses(): IdlePoses;
  /** What the members in a long idle spell do now, and the wall time of it (murmurs.ts). */
  activities(): {
    readonly wall: number;
    readonly activities: Partial<Record<MemberId, IdleActivity>>;
  };
  /** New idle times; members whose time changed walk back if they are away. */
  setSince(director: Director, next: IdleSince, t: number): Director;
  /** The cast of a scene about to be scheduled: they walk back if away, and are active now. */
  callCast(director: Director, cast: readonly MemberId[], t: number): Director;
}

export interface IdleCrewOptions {
  readonly random: Random;
  /** The per-member salts; drawn from `random` when absent. Shared with the narration (Issue #30). */
  readonly seeds?: IdleSeeds;
  /** Epoch ms: the idle spells go on while the page is hidden. */
  readonly wallNow: () => number;
  /** Members in a scene at `at` (epoch ms), on every frame that shows them in one. */
  readonly onActive: ((ids: readonly MemberId[], at: number) => void) | undefined;
}

/** The members on stage (the settings' departments, かなめ and the king). */
const MEMBER_IDS: readonly MemberId[] = ACTIVE_MEMBER_IDS;

export function createIdleCrew(options: IdleCrewOptions): IdleCrew {
  const { wallNow, onActive } = options;
  const seeds = options.seeds ?? createIdleSeeds(options.random);
  let since: IdleSince = {};
  const sceneSeen: Partial<Record<MemberId, number>> = {};

  /** The idle times, each moved on to the member's last scene. */
  function current(): IdleSince {
    const merged: Partial<Record<MemberId, number>> = { ...since };
    for (const id of MEMBER_IDS) {
      const at = merged[id];
      if (at !== undefined) merged[id] = Math.max(at, sceneSeen[id] ?? at);
    }
    return merged;
  }

  /** Members away from their seat (out playing) walk back from where they are now. */
  function callHome(director: Director, ids: readonly MemberId[], t: number): Director {
    const poses = idlePosesAt(current(), seeds, wallNow());
    let next = director;
    for (const id of ids) {
      const step = poses[id]?.step;
      // A member with a track running or to come is taken already (and is not out playing).
      if (step === undefined || (next.busyUntil[id] ?? t) > t) continue;
      const walk = homeWalk(step, DEFAULT_SEATS[id], t);
      if (walk !== null) next = sendHome(next, id, walk);
    }
    return next;
  }

  return {
    frame(director, t) {
      const wall = wallNow();
      const ids = MEMBER_IDS.filter((id) => inScene(director, id, t));
      for (const id of ids) sceneSeen[id] = wall;
      if (ids.length > 0) onActive?.(ids, wall);
      return idlePosesAt(current(), seeds, wall);
    },
    poses() {
      return idlePosesAt(current(), seeds, wallNow());
    },
    activities() {
      const wall = wallNow();
      return { wall, activities: idleActivities(current(), seeds, wall) };
    },
    setSince(director, next, t) {
      const changed = MEMBER_IDS.filter((id) => next[id] !== since[id]);
      const moved = callHome(director, changed, t);
      since = next;
      return moved;
    },
    callCast(director, cast, t) {
      const moved = callHome(director, cast, t);
      const wall = wallNow();
      for (const id of cast) sceneSeen[id] = wall;
      return moved;
    },
  };
}

/**
 * Schedules the scene for an event once its members are back from play. A handover's cast walks
 * back first and the scene waits for them (scheduleEvent). For a cleared quest the member under
 * the confetti walks back too, and the confetti starts over the seat once they are there; when they
 * were at the seat (or already in a scene) it starts at once, as before.
 */
export function playEvent(
  crew: IdleCrew,
  director: Director,
  event: GuildEvent,
  at: { t: number; context: SceneContext },
): Director {
  if (event.kind !== 'issue-closed') {
    return scheduleEvent(crew.callCast(director, castOf(event), at.t), event, at.t, at.context);
  }
  const actor = actorOf(event);
  const back = crew.callCast(director, [actor], at.t);
  const home = back.busyUntil[actor];
  const walked = home !== undefined && home !== director.busyUntil[actor];
  return scheduleEvent(back, event, walked ? Math.max(at.t, home) : at.t, at.context);
}

/** Ms from now until each member is free at their seat (0 when they are already). */
export type HomeIn = Readonly<Partial<Record<MemberId, number>>>;

/**
 * Ms from `t` until each of `ids` is free in `director` (0 when they are already): out of their
 * tracks, and out from under their confetti (a cleared quest has no track: its scene is the burst).
 */
export function freeIn(director: Director, ids: readonly MemberId[], t: number): HomeIn {
  return Object.fromEntries(
    ids.map((id) => {
      const bursts = director.bursts.filter((burst) => burst.actor === id);
      const ends = bursts.map((burst) => burst.start + CONFETTI_MS);
      return [id, Math.max((director.busyUntil[id] ?? t) - t, ...ends.map((end) => end - t), 0)];
    }),
  );
}

/**
 * Calls `members` back to their seat ahead of their scene (a level-up, Issue #19): those out
 * playing walk back now. Returns the new director and how long until each is free, which the
 * message queue waits for so the message, its sound and the scene start together.
 */
export function recallHome(
  crew: IdleCrew,
  director: Director,
  members: readonly MemberId[],
  t: number,
): { readonly director: Director; readonly homeIn: HomeIn } {
  const moved = crew.callCast(director, members, t);
  const homeIn: Partial<Record<MemberId, number>> = {};
  for (const id of members) homeIn[id] = Math.max((moved.busyUntil[id] ?? t) - t, 0);
  return { director: moved, homeIn };
}
