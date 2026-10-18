import { PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import { dueVisit, visitsOn, type LocalDay } from '../domain/visitors';
import { ACTIVE_MEMBER_IDS, type MemberId, type TilePos } from '../guild.config';
import type { MemberPose } from './director';
import type { IdlePoses } from './idle';
import { DEFAULT_SEATS } from './scenes';
import {
  cutTrip,
  planTrip,
  tripEnd,
  VISITOR,
  visitorAt,
  type Trip,
  type VisitorView,
} from './visitors';

/**
 * The visitor the loop keeps between frames (Issue #195): who is on the way, and which of the
 * day's visits came already (in memory only: a reload may see one again). A visit comes when its
 * time has come and the room is quiet, up to VISITOR.graceMinutes late; a scene, a call or a member
 * walking turns the visitor back to the door, and so does a halt. Times are the stage clock's, the
 * day's schedule the wall clock's.
 */

/** What the visitor waits for and whom it may speak to, in the frame drawn now. */
export interface VisitorScene {
  /** A scene, a call or a member on foot: no visitor comes, and one in the room turns back. */
  readonly busy: boolean;
  /** The members at their seat, awake and out of scenes, in the members' order (not the king). */
  readonly free: readonly { readonly id: MemberId; readonly seat: TilePos }[];
}

export interface VisitorStage {
  /** The visitor at stage time `t` (null: none), starting, turning back or ending a trip. */
  frameAt(t: number, scene: VisitorScene): VisitorView | null;
  /** Halted: the visitor in the room turns back, and none comes until it is live again. */
  setHalted(halted: boolean, t: number): void;
  /** Drops the visitor (the canvas is out of sight: it must not walk on late). */
  clear(): void;
  /** True while a visitor is in the room (as of the frame drawn last). */
  isVisiting(): boolean;
}

/** The local day and the minutes after its midnight of `epochMs`. */
export function localTimeOf(epochMs: number): { readonly day: LocalDay; readonly minute: number } {
  const at = new Date(epochMs);
  const day = { year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate() };
  return { day, minute: at.getHours() * 60 + at.getMinutes() + at.getSeconds() / 60 };
}

/** VisitorScene of a frame: the members' poses and the long idle spells (a step under way walks). */
export function visitorScene(
  members: readonly MemberPose[],
  idle: IdlePoses,
  busy: boolean,
): VisitorScene {
  const walking = Object.values(idle).some(
    ({ step }) => step.from.col !== step.to.col || step.from.row !== step.to.row,
  );
  const free = ACTIVE_MEMBER_IDS.flatMap((id) => {
    const member = members.find((one) => one.id === id);
    if (id === PRESIDENT_ID || member === undefined) return [];
    // A long idle spell (dozing, asleep, out playing) is no one to speak to, mark shown or not.
    const ready = member.atSeat && !member.inScene && idle[id] === undefined;
    return ready ? [{ id, seat: DEFAULT_SEATS[id] }] : [];
  });
  return { busy: busy || walking, free };
}

export function createVisitorStage(wallNow: () => number = () => Date.now()): VisitorStage {
  let trip: Trip | null = null;
  const came = new Set<string>();
  let halted = false;

  function arrive(t: number, scene: VisitorScene): Trip | null {
    const { day, minute } = localTimeOf(wallNow());
    const visit = dueVisit(visitsOn(day), minute, came, VISITOR.graceMinutes);
    const member =
      visit === null ? undefined : scene.free[Math.floor(visit.pick * scene.free.length)];
    if (visit === null || member === undefined) return null;
    came.add(visit.id);
    return planTrip(visit, member, t);
  }

  return {
    frameAt(t, scene) {
      if (trip !== null && t >= tripEnd(trip)) trip = null;
      if (trip !== null && scene.busy) trip = cutTrip(trip, t);
      if (trip === null && !halted && !scene.busy) trip = arrive(t, scene);
      return trip === null ? null : visitorAt(trip, t);
    },
    setHalted(next, t) {
      halted = next;
      if (halted && trip !== null) trip = cutTrip(trip, t);
    },
    clear() {
      trip = null;
    },
    isVisiting: () => trip !== null,
  };
}
