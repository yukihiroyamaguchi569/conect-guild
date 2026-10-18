import type { SessionState } from '@conect-guild/snapshot';
import { DEPARTMENT_LABELS, type DepartmentLabel } from '../guild.config';
import { DEMO_SCRIPT, type DemoBeat, type DemoLane } from './demoScript';

/**
 * The demo's lanes (Issue #49): where each stands at a time of a loop, played from the script
 * (domain/demoScript.ts), and which departments carry the quests and help in each loop. Pure.
 */

/** Where a lane stands at some time of a loop. Times are ms from the loop's start. */
export interface LaneState {
  readonly issue: 'none' | 'open' | 'closed';
  /** rule: an open PR that changes rules (承認まち). */
  readonly pr: 'none' | 'open' | 'rule' | 'merged';
  readonly session: SessionState;
  readonly openedAt: number;
  readonly prAt: number;
  readonly mergedAt: number;
  readonly closedAt: number;
}

const START_LANE: LaneState = {
  issue: 'none',
  pr: 'none',
  session: 'idle',
  openedAt: 0,
  prAt: 0,
  mergedAt: 0,
  closedAt: 0,
};

function applyBeat(lane: LaneState, { action, at }: DemoBeat): LaneState {
  switch (action) {
    case 'open-issue':
      return { ...lane, issue: 'open', openedAt: at };
    case 'close-issue':
      return { ...lane, issue: 'closed', closedAt: at, session: 'idle' };
    case 'work':
      return { ...lane, session: 'working' };
    case 'ask':
      return { ...lane, session: 'awaiting-permission' };
    case 'rest':
      return { ...lane, session: 'resting' };
    case 'open-pr':
      return { ...lane, pr: 'open', prAt: at };
    case 'open-rule-pr':
      return { ...lane, pr: 'rule', prAt: at };
    case 'merge-pr':
      return { ...lane, pr: 'merged', mergedAt: at };
  }
}

/** Every lane after the beats up to `inLoopMs` (inclusive) of one loop. */
export function laneStatesAt(
  inLoopMs: number,
  script: readonly DemoBeat[] = DEMO_SCRIPT,
): Readonly<Record<DemoLane, LaneState>> {
  const lanes: Record<DemoLane, LaneState> = {
    commander: START_LANE,
    quest1: START_LANE,
    quest2: START_LANE,
    helper1: START_LANE,
    helper2: START_LANE,
  };
  for (const beat of script) {
    if (beat.at <= inLoopMs) lanes[beat.lane] = applyBeat(lanes[beat.lane], beat);
  }
  return lanes;
}

export function departmentAt(labels: readonly DepartmentLabel[], index: number): DepartmentLabel {
  const label = labels[index];
  // Only indexes below labels.length are asked for (questCarriers, PAST_WORK by label).
  if (label === undefined) throw new Error(`no department #${String(index)}`);
  return label;
}

/** Loops until every one of `count` departments has carried a quest: half of them per loop. */
function carryCycle(count: number): number {
  if (!Number.isInteger(count) || count < 2) {
    throw new RangeError(`the demo needs two departments or more, not ${String(count)}`);
  }
  return Math.ceil(count / 2);
}

/**
 * The indexes of the two departments that carry the quests of `loop` (quest1, quest2): the k-th
 * and the (k + half)-th, k going round the first half. Four departments: 1st and 3rd (経理, 企画)
 * in even loops, 2nd and 4th (広報, 総務) in odd ones, so each pair has one desk near かなめ (the
 * scroll may be thrown) and one farther away. Three: (1st, 3rd), (2nd, 1st). Two: both, always.
 */
export function questCarriers(loop: number, count: number): readonly [number, number] {
  const half = carryCycle(count);
  const first = loop % half;
  return [first, (first + half) % count];
}

/** How many loops before `loop` department `index` carried a quest in (its next title). */
export function carriesBefore(index: number, loop: number, count: number): number {
  const half = carryCycle(count);
  const inCycle = (k: number): boolean => questCarriers(k, count).includes(index);
  let carries = 0;
  for (let k = 0; k < half; k += 1) {
    if (!inCycle(k)) continue;
    carries += Math.floor(loop / half) + (k < loop % half ? 1 : 0);
  }
  return carries;
}

/**
 * The departments of the lanes in a loop; null for the commander (かなめ, the reception). Two
 * departments carry the quests (questCarriers); the next two of the others in the settings' order
 * help. A lane no department is left for (two or three departments) is not in the record: its
 * beats play for nobody.
 */
export function laneDepartments(
  loop: number,
  labels: readonly DepartmentLabel[] = DEPARTMENT_LABELS,
): Readonly<Partial<Record<DemoLane, DepartmentLabel | null>>> {
  const [quest1, quest2] = questCarriers(loop, labels.length);
  const helpers = labels.flatMap((label, i) => (i === quest1 || i === quest2 ? [] : [label]));
  const lanes: Partial<Record<DemoLane, DepartmentLabel | null>> = {
    commander: null,
    quest1: departmentAt(labels, quest1),
    quest2: departmentAt(labels, quest2),
  };
  const [helper1, helper2] = helpers;
  if (helper1 !== undefined) lanes.helper1 = helper1;
  if (helper2 !== undefined) lanes.helper2 = helper2;
  return lanes;
}
