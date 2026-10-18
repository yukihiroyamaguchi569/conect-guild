import { PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import { dueVisit, visitsOn, type LocalDay, type VisitorKind } from '../domain/visitors';
import { ACTIVE_MEMBER_IDS, type MemberId, type TilePos } from '../guild.config';
import type { MemberPose } from './director';
import type { IdlePoses } from './idle';
import { DEFAULT_SEATS } from './scenes';
import type { Point } from './path';
import {
  cutTrip,
  planTrip,
  replyOf,
  tripEnd,
  VISITOR,
  visitorAt,
  type Trip,
  type VisitorReply,
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
  /**
   * The visitor was clicked at `t` (Issue #212): a reply over the head for VISITOR.replyMs while it
   * walks, never the reply said just before. Dropped (not kept for later) while halted, while it
   * speaks at the seat (those words come first), and once it turned back. True when it replies.
   */
  reply(t: number): boolean;
  /** Who was drawn where (feet) in the frame drawn last, for the clicks; null for none. */
  drawn(): DrawnVisitor | null;
}

/** The visitor as drawn: which kind, and its feet (logical px). */
export interface DrawnVisitor {
  readonly kind: VisitorKind;
  readonly feet: Point;
}

const kindOf = (view: VisitorView | null): VisitorKind | null => view?.kind ?? null;

/** A reply to a click (Issue #212): over the head of `trip`'s visitor until `until`. */
interface Reply {
  readonly trip: Trip;
  readonly words: VisitorReply;
  readonly until: number;
}

/** `view` with `reply` over its head while it lasts and the visitor says nothing else. */
function withReply(view: VisitorView | null, reply: Reply | null, trip: Trip | null, t: number) {
  if (view === null || trip === null || reply?.trip !== trip || t >= reply.until) return view;
  return view.words === null ? { ...view, words: reply.words } : view;
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

export function createVisitorStage(
  wallNow: () => number = () => Date.now(),
  {
    random = Math.random,
    onVisitor,
  }: {
    readonly random?: () => number;
    /** The visitor drawn came in (its kind) or is gone (null), Issue #212. */
    readonly onVisitor?: (kind: VisitorKind | null) => void;
  } = {},
): VisitorStage {
  let trip: Trip | null = null;
  const came = new Set<string>();
  let halted = false;
  let reply: Reply | null = null;
  let lastReply: VisitorReply | null = null;
  let shown: VisitorView | null = null;

  function arrive(t: number, scene: VisitorScene): Trip | null {
    const { day, minute } = localTimeOf(wallNow());
    const visit = dueVisit(visitsOn(day), minute, came, VISITOR.graceMinutes);
    const member =
      visit === null ? undefined : scene.free[Math.floor(visit.pick * scene.free.length)];
    if (visit === null || member === undefined) return null;
    came.add(visit.id);
    return planTrip(visit, member, t);
  }

  /** `next` is the visitor drawn now: onVisitor hears when it comes or goes. */
  function show(next: VisitorView | null): VisitorView | null {
    const was = shown;
    shown = next;
    if (kindOf(was) !== kindOf(next)) onVisitor?.(kindOf(next));
    return next;
  }

  return {
    frameAt(t, scene) {
      if (trip !== null && t >= tripEnd(trip)) trip = null;
      if (trip !== null && scene.busy) trip = cutTrip(trip, t);
      if (trip === null && !halted && !scene.busy) trip = arrive(t, scene);
      return show(withReply(trip === null ? null : visitorAt(trip, t), reply, trip, t));
    },
    setHalted(next, t) {
      halted = next;
      if (halted && trip !== null) trip = cutTrip(trip, t);
    },
    clear() {
      trip = null;
      show(null);
    },
    isVisiting: () => trip !== null,
    reply(t) {
      // A trip cut short says nothing more (cutTrip); at the seat its own words come first.
      if (halted || !trip?.talk) return false;
      if (visitorAt(trip, t)?.words !== null) return false;
      lastReply = replyOf(trip.kind, lastReply, random());
      reply = { trip, words: lastReply, until: t + VISITOR.replyMs };
      return true;
    },
    drawn: () => (shown === null ? null : { kind: shown.kind, feet: shown.feet }),
  };
}

/** The presses on the visitor (Issue #212), as the render loop takes them. */
export interface VisitorPresses {
  /**
   * The visitor was clicked: a reply over its head on the way. Dropped while drawing would not be
   * seen, and as VisitorStage.reply drops it. True when it replies.
   */
  answer(): boolean;
  /** Who was drawn where in the last frame (feet), null for none, for the clicks. */
  visitor(): DrawnVisitor | null;
}

/** VisitorPresses on `visitors`, on the loop's clock; the frame is drawn when it replies. */
export function visitorControls(
  visitors: VisitorStage,
  loop: {
    readonly schedule: { now(): void };
    readonly paused: () => boolean;
    readonly stageNow: () => number;
  },
): VisitorPresses {
  return {
    answer() {
      const said = !loop.paused() && visitors.reply(loop.stageNow());
      if (said) loop.schedule.now();
      return said;
    },
    visitor: () => visitors.drawn(),
  };
}
