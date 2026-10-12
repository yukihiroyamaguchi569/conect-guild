import {
  SNAPSHOT_SCHEMA_VERSION,
  type HistoryIssue,
  type HistoryPr,
  type SessionState,
  type Snapshot,
  type SnapshotHistory,
  type SnapshotIssue,
  type SnapshotPr,
} from '@conect-guild/snapshot';
import {
  DEPARTMENT_LABELS,
  RULE_CHANGE_PATHS,
  type DepartmentLabel,
  type RuleChangePath,
} from '../guild.config';
import {
  DEMO_LANES,
  DEMO_LOOP_MS,
  DEMO_REPO,
  DEMO_RECEPTION_TITLES,
  DEMO_SCRIPT,
  DEMO_TITLES,
  type DemoBeat,
  type DemoLane,
  type DemoQuestTitles,
} from './demoScript';

/**
 * The demo mode's data (Issue #49): the fictional snapshot at a given time, played from the script
 * (domain/demoScript.ts). Pure: the time since the demo started and the wall clock are passed in.
 * The rest of the screen (diff → events → scenes, sounds, narration) takes it as a real snapshot.
 */

export { DEMO_LOOP_MS, DEMO_REPO } from './demoScript';

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

function departmentAt(index: number): DepartmentLabel {
  const label = DEPARTMENT_LABELS[index];
  // guild.settings.json is checked to have exactly four departments (packages/snapshot/src/settings.ts).
  if (label === undefined)
    throw new Error(`no department #${String(index)} in guild.settings.json`);
  return label;
}

/**
 * The departments of the lanes in a loop; null for the commander (かなめ, the reception). Even loops: the 1st and 3rd departments (経理, 企画)
 * carry the quests and the 2nd and 4th (広報, 総務) help; odd loops swap them. Each pair has one
 * desk near かなめ (the scroll may be thrown) and one farther away.
 */
export function laneDepartments(loop: number): Readonly<Record<DemoLane, DepartmentLabel | null>> {
  const order = loop % 2 === 0 ? [0, 2, 1, 3] : [1, 3, 0, 2];
  return {
    commander: null,
    quest1: departmentAt(order[0] ?? 0),
    quest2: departmentAt(order[1] ?? 0),
    helper1: departmentAt(order[2] ?? 0),
    helper2: departmentAt(order[3] ?? 0),
  };
}

/** Numbers grow with the loop, so a new loop's quests are new Issues, never reopened ones. */
export function demoIssueNumber(loop: number, lane: DemoLane): number {
  return 101 + 2 * DEMO_LANES.length * loop + 2 * DEMO_LANES.indexOf(lane);
}

function titlesOf(department: DepartmentLabel | null, loop: number): DemoQuestTitles {
  const pool =
    department === null
      ? DEMO_RECEPTION_TITLES
      : (DEMO_TITLES[DEPARTMENT_LABELS.indexOf(department)] ?? []);
  // A department carries a quest every other loop: the next one is the next in its pool.
  const titles = pool[Math.floor(loop / 2) % Math.max(pool.length, 1)];
  return titles ?? { issue: '架空のクエスト', pr: '架空の成果' };
}

/** A path that the first rule-change rule of guild.settings.json matches (承認まち). */
export function ruleChangeFile(rules: readonly RuleChangePath[] = RULE_CHANGE_PATHS): string {
  const rule = rules[0];
  if (rule === undefined) return 'CLAUDE.md';
  switch (rule.match) {
    case 'exact':
      return rule.path;
    case 'suffix':
      return `demo${rule.path}`;
    case 'prefix':
      return `${rule.path}demo.md`;
  }
}

interface LoopItems {
  readonly issues: SnapshotIssue[];
  readonly prs: SnapshotPr[];
}

const iso = (ms: number) => new Date(ms).toISOString();

function issueOf(lane: LaneState, quest: QuestRef): SnapshotIssue {
  const closed = lane.issue === 'closed';
  return {
    number: quest.number,
    title: quest.titles.issue,
    labels: quest.department === null ? [] : [quest.department],
    state: closed ? 'closed' : 'open',
    createdAt: iso(quest.loopStart + lane.openedAt),
    updatedAt: iso(quest.loopStart + (closed ? lane.closedAt : lane.openedAt)),
    closedAt: closed ? iso(quest.loopStart + lane.closedAt) : null,
  };
}

function prOf(lane: LaneState, quest: QuestRef): SnapshotPr {
  const mergedAt = lane.pr === 'merged' ? iso(quest.loopStart + lane.mergedAt) : null;
  const changedFiles =
    lane.pr === 'rule' ? [ruleChangeFile()] : [`docs/demo-${String(quest.number + 1)}.md`];
  return {
    number: quest.number + 1,
    title: quest.titles.pr,
    state: mergedAt === null ? 'open' : 'closed',
    mergedAt,
    closedAt: mergedAt,
    headRef: `demo/quest-${String(quest.number)}`,
    linkedIssues: lane.issue === 'none' ? [] : [quest.number],
    changedFiles: mergedAt === null ? changedFiles : [],
  };
}

interface QuestRef {
  /** The Issue's number; its PR is the next one. */
  readonly number: number;
  /** null: かなめ's reception. */
  readonly department: DepartmentLabel | null;
  readonly titles: DemoQuestTitles;
  /** Wall time (epoch ms) when the loop started. */
  readonly loopStart: number;
}

function questRef(loop: number, lane: DemoLane, loopStart: number): QuestRef {
  const department = laneDepartments(loop)[lane];
  return {
    number: demoIssueNumber(loop, lane),
    department,
    titles: titlesOf(department, loop),
    loopStart,
  };
}

/** The Issues and PRs of one loop as they stand at `inLoopMs`. */
function loopItems(loop: number, inLoopMs: number, loopStart: number): LoopItems {
  const lanes = laneStatesAt(inLoopMs);
  const items: LoopItems = { issues: [], prs: [] };
  for (const lane of DEMO_LANES) {
    const quest = questRef(loop, lane, loopStart);
    const state = lanes[lane];
    if (state.issue !== 'none') items.issues.push(issueOf(state, quest));
    if (state.pr !== 'none') items.prs.push(prOf(state, quest));
  }
  return items;
}

/**
 * A made-up past, so the counts (and the levels of Issue #19) do not start from zero. Each
 * department's clears and merges (in the settings' order: 経理, 広報, 企画, 総務 by default) and
 * the Issues opened are picked so that the level-ups come one by one: in the first loop かなめ
 * (her second scroll), the 1st department (its chest) and the 3rd (its clear); later only now and
 * then (domain/demo.test.ts has the times).
 */
const PAST_WORK: readonly { readonly clears: number; readonly merges: number }[] = [
  // 205 experience: Lv 7 (210) with the chest of the first loop.
  { clears: 15, merges: 11 },
  // 130: Lv 6 (150) with the chest of the 4th loop.
  { clears: 9, merges: 8 },
  // 140: Lv 6 (150) with the clear of the first loop, not with its chest.
  { clears: 10, merges: 8 },
  // 170: Lv 7 (210) with the clear of the 6th loop.
  { clears: 12, merges: 10 },
];
/** 48 scrolls × 3 = 144: かなめ reaches Lv 6 (150) with the second scroll of the first loop. */
const PAST_OPENED = 48;

/** Past Issues are numbered from 1 and past PRs after them; the loops' numbers start at 101. */
function pastHistory(): { completed: HistoryIssue[]; merged: HistoryPr[] } {
  const completed: HistoryIssue[] = [];
  const merged: HistoryPr[] = [];
  PAST_WORK.forEach(({ clears, merges }, index) => {
    const first = completed.length + 1;
    for (let i = 0; i < clears; i += 1)
      completed.push({ number: first + i, departments: [departmentAt(index)] });
    for (let i = 0; i < merges; i += 1)
      merged.push({ number: 0, linkedIssues: [first + i], branchDepartment: null });
  });
  const prStart = completed.length + 1;
  return {
    completed,
    merged: merged.map((pr, i) => ({ ...pr, number: prStart + i })),
  };
}

const PAST = pastHistory();

/** The made-up past, then every loop so far (the current one up to `inLoopMs`). */
function historyUntil(loop: number, inLoopMs: number): SnapshotHistory {
  let opened = PAST_OPENED;
  const completed: HistoryIssue[] = [...PAST.completed];
  const merged: HistoryPr[] = [...PAST.merged];
  for (let j = 0; j <= loop; j += 1) {
    const { issues, prs } = loopItems(j, j < loop ? DEMO_LOOP_MS : inLoopMs, 0);
    opened += issues.length;
    for (const issue of issues.filter((i) => i.state === 'closed'))
      completed.push({ number: issue.number, departments: issue.labels.filter(isDepartment) });
    for (const pr of prs.filter((p) => p.mergedAt !== null))
      merged.push({ number: pr.number, linkedIssues: pr.linkedIssues, branchDepartment: null });
  }
  return { openedIssueCount: opened, completedIssues: completed, mergedPrs: merged };
}

function isDepartment(label: string): label is DepartmentLabel {
  return DEPARTMENT_LABELS.some((department) => department === label);
}

function sessionsOf(loop: number, inLoopMs: number, nowMs: number): Snapshot['sessions'] {
  const lanes = laneStatesAt(inLoopMs);
  const departments = laneDepartments(loop);
  const byDepartment = new Map<DepartmentLabel | null, SessionState>(
    DEMO_LANES.map((lane) => [departments[lane], lanes[lane].session]),
  );
  return {
    status: 'ok',
    checkedAt: iso(nowMs),
    members: [
      { department: null, state: byDepartment.get(null) ?? 'idle' },
      ...DEPARTMENT_LABELS.map((department) => ({
        department,
        state: byDepartment.get(department) ?? 'idle',
      })),
    ],
  };
}

/**
 * The fictional snapshot `elapsedMs` after the demo started, at wall time `nowMs` (epoch ms).
 * It holds the current loop as far as it has gone and the whole previous loop (so the members who
 * cleared a quest stay 完了 and keep their rewards). `fetchedAt` is always now: never stale.
 */
export function demoSnapshotAt(elapsedMs: number, nowMs: number): Snapshot {
  const elapsed = Math.max(elapsedMs, 0);
  const loop = Math.floor(elapsed / DEMO_LOOP_MS);
  const inLoop = elapsed - loop * DEMO_LOOP_MS;
  const loopStart = (j: number) => nowMs - inLoop - (loop - j) * DEMO_LOOP_MS;
  const previous = loop > 0 ? loopItems(loop - 1, DEMO_LOOP_MS, loopStart(loop - 1)) : null;
  const current = loopItems(loop, inLoop, loopStart(loop));
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fetchedAt: iso(nowMs),
    repo: DEMO_REPO,
    issues: [...(previous?.issues ?? []), ...current.issues],
    prs: [...(previous?.prs ?? []), ...current.prs],
    history: historyUntil(loop, inLoop),
    sessions: sessionsOf(loop, inLoop, nowMs),
  };
}
