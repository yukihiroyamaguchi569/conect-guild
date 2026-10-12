import type { MemberId } from '../guild.config';
import type { StageFrame } from './director';
import { DEFAULT_SEATS } from './scenes';
import {
  addSummons,
  endedSummons,
  holdsAt,
  isSummoning,
  newCallStart,
  pruneSummons,
  speechesAt,
  NO_HOLDS,
  withSummons,
  type Holds,
  type Speeches,
  type Summons,
} from './summons';
import type { Visit } from './visit';

export interface CallsOptions {
  /** Epoch ms, for the time reported to `onActive`. */
  readonly wallNow?: () => number;
  /** Members active at `at` (epoch ms): the king once his call is over. */
  readonly onActive?: (ids: readonly MemberId[], at: number) => void;
  /** A call starts on the stage now: its sound rings with it. */
  readonly onCallStart?: () => void;
}

/** A frame with the king's call applied, its words, and whether calls go on after it. */
export interface CallView {
  readonly frame: StageFrame;
  readonly speeches: Speeches;
  readonly calling: boolean;
}

export interface Calls {
  /**
   * The king calls `members` at stage time `t`, or after the call playing; none while halted, nor
   * for a null `t` (nothing is drawn: the page is hidden or the canvas not shown). `visit` says
   * whether かなめ goes to the throne for a call that starts at a given time (visit.ts). The call
   * added, or null.
   */
  add(
    members: readonly MemberId[],
    t: number | null,
    visit?: (start: number) => Visit | null,
  ): Summons | null;
  /**
   * Halted (the screen is not live): the calls to come and the one playing are dropped. Returns
   * かなめ's visits dropped with them, to cut short on the stage (visit.cutVisit).
   */
  setHalted(halted: boolean): readonly Visit[];
  /**
   * The frame at `t` (built by `build`) with the call playing applied, and its words. First drops
   * the finished calls (and wakes the king after the last one, before his pose is built), then
   * reports a call that starts (`onCallStart`).
   */
  view(build: () => StageFrame, t: number): CallView;
}

/**
 * The king's calls (summons.ts, Issue #28) on the stage clock. Nobody's idle time moves while a
 * call plays, so a sleeper's pose stays where it is drawn. Once the last call is over the king, who gave
 * the order, is reported active (`onActive`): his doze starts over (idle.ts). The members are not:
 * their own session's work ends their idle spell (and brings them back from play), not the call.
 */
export function createCalls(options: CallsOptions): Calls {
  let list: readonly Summons[] = [];
  let announced: number | null = null;
  let holds: Holds = NO_HOLDS;
  let halted = false;
  return {
    add(members, t, visit) {
      if (halted || t === null || members.length === 0) return null;
      list = addSummons(list, members, t, visit);
      return list.at(-1) ?? null;
    },
    setHalted(next) {
      halted = next;
      if (!halted) return [];
      const visits = list.flatMap((summons) =>
        summons.visit === undefined ? [] : [summons.visit],
      );
      list = [];
      holds = NO_HOLDS;
      return visits;
    },
    view(build, t) {
      const ended = endedSummons(list, t).length > 0;
      list = pruneSummons(list, t);
      // After the last call of a row (the king's pose stays put through all of them), and before
      // the frame is built, so he is drawn awake at once and not asleep for one more frame.
      if (ended && list.length === 0)
        options.onActive?.(['yukihiro'], (options.wallNow ?? Date.now)());
      const frame = build();
      holds = holdsAt(holds, frame, list, t);
      const speeches = speechesAt(list, t, holds.done);
      const applied = withSummons(frame, list, t, { seats: DEFAULT_SEATS, holds });
      const started = newCallStart(list, t, announced);
      if (started !== null) {
        announced = started;
        options.onCallStart?.();
      }
      return { frame: applied, speeches, calling: isSummoning(list, t) };
    },
  };
}
