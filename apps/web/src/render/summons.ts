import type { SummonsFrom } from '../domain/summons';
import type { MemberId, TilePos } from '../guild.config';
import type { MemberPose, StageFrame } from './director';
import { SUMMONS } from './metrics';
import type { MoveFrame } from './motion';
import { PLACES } from './map';
import { tileToPoint, type Point } from './path';
import type { Visit } from './visit';

/**
 * The king speaks to whom the president gave an order (Issue #28). Pure: stage time is passed in.
 * The king says "！" (rising a little on the throne), then "ゴニョゴニョ"; then each member called
 * turns to the throne and answers "はっ！". Nobody walks: the summons only changes poses at the
 * seats and puts words over heads, so it never moves anyone out of a scene or a walk.
 *
 * - The king never leaves the throne. While he speaks he sits up awake (out of a doze or sleep).
 * - A member at their seat and out of a scene turns to the throne (out of desk work, a doze or
 *   sleep). One right below it (かなめ) has no frame facing back, so she hops facing front.
 * - A member away from the seat (in a handover, walking back from play) answers where they are,
 *   without turning: their scene or walk goes on.
 * - かなめ, when free at her counter, walks to the side of the throne after the "！" instead
 *   (visit.ts, Issue #87): the king whispers once she is there, everyone called answers together,
 *   she facing the king, and the call ends when she is back at the counter.
 *
 * When かなめ hands work on to departments (Issue #155) the king keeps quiet: she turns at her
 * counter to the (first) department and says "おねがい！", then each department called turns to her
 * and answers "はい！". Who cannot turn (in a scene, away from the seat) speaks where they are.
 */

export type SpeechLine = '！' | 'ゴニョゴニョ' | 'はっ！' | 'おねがい！' | 'はい！';

export type Speeches = Readonly<Partial<Record<MemberId, SpeechLine>>>;

/** One order: when it starts on the stage clock and who was given it. */
export interface Summons {
  readonly start: number;
  readonly members: readonly MemberId[];
  /** かなめ's walk to the side of the throne and back, when she goes (visit.ts). */
  readonly visit?: Visit;
  /** Who gives it; absent: the king. かなめ's has no visit (she is not among the members). */
  readonly from?: SummonsFrom;
}

const KING: MemberId = 'yukihiro';
const KANAME: MemberId = 'kaname';

/** True for an order the king gives (not かなめ handing work on). */
export function fromKing(summons: Summons): boolean {
  return summons.from !== 'kaname';
}

/** When the king whispers "ゴニョゴニョ": after his "！", or once かなめ is beside him. */
function murmurStart(summons: Summons): number {
  return summons.visit?.arrive ?? summons.start + SUMMONS.callMs;
}

/** When the members answer: after the king's "！" and "ゴニョゴニョ", or かなめ's "おねがい！". */
export function replyStart(summons: Summons): number {
  if (!fromKing(summons)) return summons.start + SUMMONS.askMs;
  return murmurStart(summons) + SUMMONS.murmurMs;
}

/** When the members stop answering "はっ！". */
function replyEnd(summons: Summons): number {
  return replyStart(summons) + SUMMONS.replyMs;
}

/** The end of the call: after the answer, or once かなめ is back at her counter. */
export function summonsEnd(summons: Summons): number {
  return summons.visit?.back ?? replyEnd(summons);
}

/**
 * Adds an order at `now`, or right after the last one still playing, so two never talk over each
 * other. `visit` says whether かなめ goes to the throne for an order that starts at a given time.
 * No members: nothing to add.
 */
export function addSummons(
  list: readonly Summons[],
  members: readonly MemberId[],
  now: number,
  visit: (start: number) => Visit | null = () => null,
): Summons[] {
  if (members.length === 0) return [...list];
  const start = Math.max(now, ...list.map(summonsEnd));
  const going = visit(start);
  return [...list, going === null ? { start, members } : { start, members, visit: going }];
}

/** Adds かなめ's order to departments (Issue #155) as addSummons does: never over another. */
export function addDispatch(
  list: readonly Summons[],
  members: readonly MemberId[],
  now: number,
): Summons[] {
  if (members.length === 0) return [...list];
  const start = Math.max(now, ...list.map(summonsEnd));
  return [...list, { start, members, from: 'kaname' }];
}

/** True while an order plays or is still to come. */
export function isSummoning(list: readonly Summons[], now: number): boolean {
  return list.some((summons) => summonsEnd(summons) > now);
}

/** Drops the finished orders. */
export function pruneSummons(list: readonly Summons[], now: number): Summons[] {
  return list.filter((summons) => summonsEnd(summons) > now);
}

/** The orders over by `now` (those pruneSummons drops). */
export function endedSummons(list: readonly Summons[], now: number): Summons[] {
  return list.filter((summons) => summonsEnd(summons) <= now);
}

/**
 * The start of the order playing at `now` when it is not `announced` (the start already reported):
 * the moment its "！" and its sound begin. Null otherwise. Starts are unique (addSummons).
 */
export function newCallStart(
  list: readonly Summons[],
  now: number,
  announced: number | null,
): number | null {
  const start = playing(list, now)?.start;
  return start === undefined || start === announced ? null : start;
}

/** The order playing at `now`, if any (they never overlap: addSummons). */
function playing(list: readonly Summons[], now: number): Summons | undefined {
  return list.find((summons) => summons.start <= now && now < summonsEnd(summons));
}

/** Who says what at `now`; those in `done` have stopped answering (holdsAt). */
export function speechesAt(
  list: readonly Summons[],
  now: number,
  done: readonly MemberId[] = [],
): Speeches {
  const summons = playing(list, now);
  if (summons === undefined) return {};
  if (!fromKing(summons)) return dispatchSpeeches(summons, now, done);
  if (now < summons.start + SUMMONS.callMs) return { [KING]: '！' };
  // かなめ on her way to the throne, or back to her counter: nobody speaks.
  if (now < murmurStart(summons) || now >= replyEnd(summons)) return {};
  if (now < replyStart(summons)) return { [KING]: 'ゴニョゴニョ' };
  const answers: Partial<Record<MemberId, SpeechLine>> = {};
  for (const id of summons.members) if (!done.includes(id)) answers[id] = 'はっ！';
  return answers;
}

/** かなめ's "おねがい！", then the departments' "はい！"; those in `done` have stopped. */
function dispatchSpeeches(summons: Summons, now: number, done: readonly MemberId[]): Speeches {
  if (now >= replyEnd(summons)) return {};
  if (now < replyStart(summons)) return done.includes(KANAME) ? {} : { [KANAME]: 'おねがい！' };
  const answers: Partial<Record<MemberId, SpeechLine>> = {};
  for (const id of summons.members) if (!done.includes(id)) answers[id] = 'はい！';
  return answers;
}

/** Which way a member at `seat` faces the throne: sideways towards it, or front when right below. */
export function faceThrone(seat: TilePos, throne: TilePos): { frame: MoveFrame; flip: boolean } {
  if (seat.col === throne.col) return { frame: 0, flip: false };
  return { frame: 1, flip: seat.col > throne.col };
}

/**
 * Where the call playing holds those who take part at their seat: the point each one was drawn at
 * when their part began (the king from the start of the call to its end, a member at the seat from
 * the reply), so a nod, a doze turning to sleep or a typing bob does not move them in the call.
 */
export interface Holds {
  /** The start of the call they belong to; null when none plays. */
  readonly start: number | null;
  /** The end of that call (summonsEnd); null when none plays. */
  readonly end: number | null;
  readonly points: Readonly<Partial<Record<MemberId, Point>>>;
  /**
   * Members whose answer at the seat a scene cut short (a scroll or a chest): they stop answering
   * there and the scene takes them as it would from the seat, like the waiting bubbles.
   */
  readonly done: readonly MemberId[];
}

export const NO_HOLDS: Holds = { start: null, end: null, points: {}, done: [] };

/** True while `member` takes part at the seat at `now`: the king all along, a member answering. */
function heldAt(summons: Summons, member: MemberPose, now: number): boolean {
  if (member.id === KING) return fromKing(summons);
  const free = member.atSeat && !member.inScene;
  // かなめ handing work on: at her counter from her "おねがい！" to the end of the answers.
  if (member.id === KANAME && !fromKing(summons)) return free;
  return now >= replyStart(summons) && summons.members.includes(member.id) && free;
}

/**
 * What a call starts with from `holds`: all of it for the same call; for the next call of a row
 * (it starts right as the held one ends) only the king, where he was; nothing otherwise.
 */
function carriedOver(holds: Holds, summons: Summons): Pick<Holds, 'points' | 'done'> {
  if (summons.start === holds.start) return holds;
  const king = holds.points[KING];
  const follows = holds.end === summons.start;
  if (!follows || king === undefined || !fromKing(summons)) return NO_HOLDS;
  return { points: { [KING]: king }, done: [] };
}

/** The holds at `now`: those of `holds` for the same call, plus anyone whose part begins now. */
export function holdsAt(
  holds: Holds,
  frame: StageFrame,
  list: readonly Summons[],
  now: number,
): Holds {
  const summons = playing(list, now);
  if (summons === undefined) return NO_HOLDS;
  const before = carriedOver(holds, summons);
  const points: Partial<Record<MemberId, Point>> = {};
  const done = [...before.done];
  for (const member of frame.members) {
    const at = before.points[member.id];
    if (at !== undefined && member.id !== KING && member.inScene) done.push(member.id);
    else if (at !== undefined) points[member.id] = at;
    else if (!done.includes(member.id) && heldAt(summons, member, now)) {
      points[member.id] = member.pose.point;
    }
  }
  return { start: summons.start, end: summonsEnd(summons), points, done };
}

/**
 * A member at their seat in a still frame, `lift` px up from where they are held (holdsAt; where
 * they are drawn now when not held), so nothing jumps when the call starts or ends. What they
 * handle at the desk is put down and the idle sign goes.
 */
function sitting(
  member: MemberPose,
  look: { frame: MoveFrame; flip: boolean; lift: number; at: Point | undefined },
): MemberPose {
  const at = look.at ?? member.pose.point;
  return {
    ...member,
    pose: {
      point: { x: at.x, y: at.y - look.lift },
      frame: look.frame,
      flip: look.flip,
      held: null,
    },
    hand: null,
    mark: null,
  };
}

/** A member at the seat turned to `toward` (the throne, or whom they talk with), `since` ms in. */
function answering(
  member: MemberPose,
  seats: { readonly seat: TilePos; readonly toward: TilePos },
  since: number,
  at: Point | undefined,
): MemberPose {
  if (!member.atSeat || member.inScene) return member;
  const face = faceThrone(seats.seat, seats.toward);
  const hop = face.frame === 0 && since < SUMMONS.hopMs ? SUMMONS.hopPx : 0;
  return sitting(member, { ...face, lift: hop, at });
}

/** True while かなめ stands at the side of the throne (visit.ts): her feet on that tile. */
function besideThrone(member: MemberPose): boolean {
  const side = tileToPoint(PLACES.throneSide);
  return member.inScene && member.pose.point.x === side.x && member.depth === side.y;
}

/** かなめ beside the throne, from her arrival to the end of her answer, turned to the king. */
function listening(
  member: MemberPose,
  summons: Summons,
  context: { readonly now: number; readonly throne: TilePos },
): MemberPose | null {
  const { now, throne } = context;
  if (summons.visit === undefined || member.id !== 'kaname' || !besideThrone(member)) return null;
  if (now < murmurStart(summons) || now >= replyEnd(summons)) return null;
  const face = faceThrone(PLACES.throneSide, throne);
  return { ...member, pose: { ...member.pose, frame: face.frame, flip: face.flip } };
}

/**
 * The frame with the order playing at `now` applied: the king sitting up, awake, through the call
 * (rising a little while he calls), the members turned to the throne while they answer, each held
 * where `holds` keeps them (holdsAt), and かなめ beside the throne turned to the king (visit.ts). The depth order stays (nobody changes tile).
 */
export function withSummons(
  frame: StageFrame,
  list: readonly Summons[],
  now: number,
  context: { readonly seats: Readonly<Record<MemberId, TilePos>>; readonly holds: Holds },
): StageFrame {
  const summons = playing(list, now);
  if (summons === undefined) return frame;
  if (!fromKing(summons)) return withDispatch(frame, summons, now, context);
  const reply = replyStart(summons);
  const { seats, holds } = context;
  const members = frame.members.map((member) => {
    const at = holds.start === summons.start ? holds.points[member.id] : undefined;
    if (member.id === KING) {
      const lift = now < summons.start + SUMMONS.callMs ? SUMMONS.kingRisePx : 0;
      return sitting(member, { frame: 0, flip: false, lift, at });
    }
    const beside = listening(member, summons, { now, throne: seats[KING] });
    if (beside !== null) return beside;
    if (now < reply || now >= replyEnd(summons) || !summons.members.includes(member.id))
      return member;
    if (holds.start === summons.start && holds.done.includes(member.id)) return member;
    const toward = { seat: seats[member.id], toward: seats[KING] };
    return answering(member, toward, now - reply, at);
  });
  return { ...frame, members };
}

/**
 * The frame with かなめ handing work on (Issue #155): the king as he is; かなめ at her counter turned
 * to the first department called; the departments, while they answer, turned to her counter. Each
 * held where `holds` keeps them; one a scene took (`done`) is left to it.
 */
function withDispatch(
  frame: StageFrame,
  summons: Summons,
  now: number,
  context: { readonly seats: Readonly<Record<MemberId, TilePos>>; readonly holds: Holds },
): StageFrame {
  const { seats, holds } = context;
  const reply = replyStart(summons);
  const first = summons.members[0];
  const members = frame.members.map((member) => {
    const same = holds.start === summons.start;
    if (same && holds.done.includes(member.id)) return member;
    const at = same ? holds.points[member.id] : undefined;
    if (member.id === KANAME && first !== undefined) {
      const toward = { seat: seats[KANAME], toward: seats[first] };
      return answering(member, toward, now - summons.start, at);
    }
    if (now < reply || !summons.members.includes(member.id)) return member;
    return answering(member, { seat: seats[member.id], toward: seats[KANAME] }, now - reply, at);
  });
  return { ...frame, members };
}
