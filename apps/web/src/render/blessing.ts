import { PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import type { Random } from './confetti';
import type { Director } from './director';
import type { IdleSince } from './idle';

/**
 * The king's gracious words when he is clicked (Issue #187, docs/DESIGN.md 4.10): one of these over
 * his head for `SUMMONS.blessMs`, never the one he said last. Fixed lines only, like the line book
 * (lineBook.ts): hiragana and katakana with a few signs, at most 7 characters, so the bubble over
 * the throne is no wider than his other lines. Pure: the random source and the stage time are
 * passed in.
 */
export const BLESSINGS = [
  'よきにはからえ',
  'くるしゅうない',
  'ちこうよれ',
  'わるよのう',
  'よいてんきじゃ',
  'おもてをあげい',
  'ほうびをとらす',
  'はげむがよい',
  'たのんだぞ',
  'あいわかった',
  'よいぞよいぞ',
  'しんじておるぞ',
  'ゆっくりせい',
] as const;

export type BlessingLine = (typeof BLESSINGS)[number];

/**
 * One of BLESSINGS other than `last`, evenly from `random`. One number is drawn.
 */
export function pickBlessing(last: BlessingLine | null, random: Random): BlessingLine {
  const choices = BLESSINGS.filter((words) => words !== last);
  const index = Math.min(Math.floor(random() * choices.length), choices.length - 1);
  return choices[index] ?? BLESSINGS[0];
}

/** True while the king has a part in a scene now or still to come: his tracks, his lines. */
export function kingInScene(director: Director, t: number): boolean {
  const king = PRESIDENT_ID;
  return (
    (director.busyUntil[king] ?? Number.NEGATIVE_INFINITY) > t ||
    director.lines.some((said) => said.actor === king && said.end > t)
  );
}

/** The stage when the king is clicked. */
export interface BlessMoment {
  /** The screen is halted (not live). */
  readonly halted: boolean;
  /** False before the first snapshot. */
  readonly known: boolean;
  /** Drawing would not be seen: the page is hidden or the canvas not shown (narrow screens). */
  readonly paused: boolean;
  /** Something waits for the president's approval (the page's 「承認まち」 bubble over him). */
  readonly kingAwaiting: boolean;
  /** A call (summons.ts) plays or is to come: the king's, かなめ's, or his words before. */
  readonly calling: boolean;
  /** The king has a part in a scene now or still to come (kingInScene). */
  readonly kingInScene: boolean;
}

/** The moment of a click at stage time `t`, from what the render loop holds (loop.ts). */
export function blessMomentOf(
  stage: {
    readonly party: {
      readonly halted: boolean;
      readonly known: boolean;
      readonly idleSince: IdleSince;
    };
    readonly director: Director;
    readonly calling: boolean;
    readonly paused: boolean;
  },
  t: number,
): BlessMoment {
  const { party, director, calling, paused } = stage;
  return {
    halted: party.halted,
    known: party.known,
    paused,
    // As the murmurs see it (murmurs.kingAwaiting): the king is restful unless he has to approve.
    kingAwaiting: party.idleSince[PRESIDENT_ID] === undefined,
    calling,
    kingInScene: kingInScene(director, t),
  };
}

/** Whether the king says a word now; a click otherwise is dropped, not kept for later. */
export function mayBless(moment: BlessMoment): boolean {
  return (
    !moment.halted &&
    moment.known &&
    !moment.paused &&
    !moment.kingAwaiting &&
    !moment.calling &&
    !moment.kingInScene
  );
}

/**
 * What the king says for a click at `moment`: a word other than `last`, or null when the click is
 * dropped (mayBless). No number is drawn then.
 */
export function blessingFor(
  moment: BlessMoment,
  last: BlessingLine | null,
  random: Random,
): BlessingLine | null {
  return mayBless(moment) ? pickBlessing(last, random) : null;
}
