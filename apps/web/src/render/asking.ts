import type { MemberId } from '../guild.config';
import type { Bubbles } from './bubbles';
import type { Calls } from './calls';
import { inScene, type Director, type MemberPose } from './director';
import type { IdleActivity, IdleSince } from './idle';
import type { IdleCrew } from './idleCrew';
import type { LineScene } from './lineBook';
import { linesAt, showMs, type PickLine, type SpokenLines, type Utterance } from './lines';
import type { Point } from './path';
import { isFree, type Remarks } from './remarks';

/**
 * A member clicked (Issue #191, docs/DESIGN.md 4.12): they answer over their head with a line of
 * what they are doing (lineBook.ts `ask*`), as long as a remark. Nobody stops what they are doing:
 * a member in a scene, walking, or with words of their own over the head (a remark, an answer) lets
 * the click go, and a sleeper talks in their sleep and sleeps on. Pure but for createAsking, which
 * keeps the answers said: the stage time and the line picker are passed in.
 */

export type AskScene = Extract<
  LineScene,
  'askWork' | 'askIdle' | 'askWait' | 'askDoze' | 'askSleep' | 'askPlay'
>;

/** The stage when a member is clicked. */
export interface AskMoment {
  /** The screen is halted (not live). */
  readonly halted: boolean;
  /** False before the first snapshot. */
  readonly known: boolean;
  /** Drawing would not be seen: the page is hidden or the canvas not shown (narrow screens). */
  readonly paused: boolean;
  /** A call (summons.ts) plays or is to come: the king's, かなめ's, or the king's words. */
  readonly calling: boolean;
  /** The member walks, stays or holds something in a scene (director.inScene), or walks home. */
  readonly inScene: boolean;
  /** Their feet are on their seat (director.isAtSeat). */
  readonly atSeat: boolean;
  /** A remark or an answer of theirs shows or is to come. */
  readonly speaking: boolean;
  /** A waiting bubble is over their seat (bubbles.ts). */
  readonly waiting: boolean;
  /** They have nothing to do (idle.ts). */
  readonly restful: boolean;
  /** Their long idle spell now: dozing, asleep or out playing. */
  readonly activity: IdleActivity | undefined;
  /** Epoch ms, the time of `activity`. */
  readonly wall: number;
}

/** What a member in a long idle spell answers: only at the play spot, not on the way. */
function activityScene(activity: IdleActivity, wall: number): AskScene | null {
  if (activity.kind === 'doze') return 'askDoze';
  if (activity.kind === 'sleep') return 'askSleep';
  const { outing } = activity;
  return outing.out.end <= wall && wall < outing.back.start ? 'askPlay' : null;
}

/** True when a click at `moment` is dropped whatever the member does. */
function dropped(moment: AskMoment): boolean {
  const { halted, known, paused, calling, speaking } = moment;
  return halted || !known || paused || calling || moment.inScene || speaking;
}

/** What the member answers at `moment`, or null when the click is dropped (not kept for later). */
export function askSceneOf(moment: AskMoment): AskScene | null {
  if (dropped(moment)) return null;
  if (moment.activity !== undefined) return activityScene(moment.activity, moment.wall);
  if (!moment.atSeat) return null;
  if (moment.waiting) return 'askWait';
  return moment.restful ? 'askIdle' : 'askWork';
}

/** What the asking takes of a party (loop.StageParty). */
export interface AskParty {
  readonly halted: boolean;
  readonly known: boolean;
  readonly bubbles: Bubbles;
  readonly idleSince: IdleSince;
}

export interface Asking {
  /**
   * `id` was clicked at `t`: they answer with a line other than their last ones (the picker), unless
   * the click is dropped (askSceneOf). True when they answer.
   */
  ask(
    id: MemberId,
    stage: { readonly director: Director; readonly party: AskParty },
    at: { readonly t: number; readonly paused: boolean; readonly remarks: Remarks },
  ): boolean;
  /** Who answers what at `t`. */
  linesAt(t: number): SpokenLines;
  /** True while an answer of `id` (any member: null) shows at `t`. */
  isAnswering(t: number, id: MemberId | null): boolean;
  /** Drops the answers (halted, or the canvas out of sight). */
  clear(): void;
  /**
   * The frame drawn at `t` (director.StageFrame): where a click finds its members, and the answers
   * seen over their heads, counted as said for not repeating a line (lines.createLinePicker). An
   * answer is not seen while `covered` (something above it has the head) or its member is in a
   * scene.
   */
  drew(t: number, members: readonly MemberPose[], covered: (id: MemberId) => boolean): void;
  /** Where each member was drawn in the last frame (their feet; the king too). */
  feet(): readonly { readonly id: MemberId; readonly point: Point }[];
}

export function createAsking(
  crew: Pick<IdleCrew, 'poses' | 'activities'>,
  calls: Pick<Calls, 'isCalling'>,
  talk: {
    readonly pick: PickLine | undefined;
    readonly saw: (lines: readonly Utterance[], t: number) => void;
  },
): Asking {
  let said: readonly Utterance[] = [];
  let drawn: readonly MemberPose[] = [];
  const answering = (t: number, id: MemberId | null) =>
    said.some((one) => one.end > t && (id === null || one.actor === id));
  return {
    ask(id, { director, party }, { t, paused, remarks }) {
      const { wall, activities } = crew.activities();
      const scene = askSceneOf({
        halted: party.halted,
        known: party.known,
        paused,
        calling: calls.isCalling(t),
        inScene: inScene(director, id, t),
        atSeat: isFree(director, t, id, crew.poses()),
        speaking: answering(t, id) || remarks.said.some((one) => one.actor === id && one.end > t),
        waiting: party.bubbles[id] !== undefined,
        restful: party.idleSince[id] !== undefined,
        activity: activities[id],
        wall,
      });
      // Not a line still showing over another head (the shared ones are the guild's: lines.ts).
      const pending = said.filter((one) => one.end > t).map((one) => one.line);
      const line = scene === null ? null : (talk.pick?.(id, scene, pending) ?? null);
      if (scene === null || line === null) return false;
      const answer = { actor: id, line, start: t, end: t + showMs(scene) };
      said = [...said.filter((one) => one.end > t), answer];
      return true;
    },
    linesAt: (t) => linesAt(said, t),
    isAnswering: answering,
    clear() {
      said = [];
    },
    drew(t, members, covered) {
      drawn = members;
      const shown = new Set(members.filter((m) => !m.inScene && !covered(m.id)).map((m) => m.id));
      talk.saw(
        said.filter((one) => one.start <= t && t < one.end && shown.has(one.actor)),
        t,
      );
    },
    feet: () => drawn.map((member) => ({ id: member.id, point: member.pose.point })),
  };
}
