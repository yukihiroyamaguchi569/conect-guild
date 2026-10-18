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
import { GUILD_SETTINGS, type GuildGuest } from '@conect-guild/snapshot/settings';
import {
  DEPARTMENT_LABELS,
  RULE_CHANGE_PATHS,
  type DepartmentLabel,
  type RuleChangePath,
} from '../guild.config';
import {
  DEMO_KING_QUEST,
  DEMO_KING_TITLES,
  DEMO_LANES,
  DEMO_LOOP_MS,
  DEMO_REPO,
  DEMO_RECEPTION_TITLES,
  DEMO_TITLES,
  type DemoLane,
  type DemoQuestTitles,
} from './demoScript';
import { demoGuestsAt } from './demoGuests';
import {
  carriesBefore,
  departmentAt,
  laneDepartments,
  laneStatesAt,
  type LaneState,
} from './demoLanes';

/**
 * The demo mode's data (Issue #49): the fictional snapshot at a given time, played from the script
 * (domain/demoScript.ts). Pure: the time since the demo started and the wall clock are passed in.
 * The rest of the screen (diff → events → scenes, sounds, narration) takes it as a real snapshot.
 */

export { DEMO_LOOP_MS, DEMO_REPO } from './demoScript';

/** Numbers grow with the loop, so a new loop's quests are new Issues, never reopened ones. */
export function demoIssueNumber(loop: number, lane: DemoLane): number {
  return 101 + 2 * DEMO_LANES.length * loop + 2 * DEMO_LANES.indexOf(lane);
}

function titlesOf(
  department: DepartmentLabel | null,
  loop: number,
  labels: readonly DepartmentLabel[],
): DemoQuestTitles {
  const index = department === null ? -1 : labels.indexOf(department);
  const pool = index < 0 ? DEMO_RECEPTION_TITLES : (DEMO_TITLES[index % DEMO_TITLES.length] ?? []);
  // Each quest a department carries is the next in its pool; the reception's go round per loop.
  const turn = index < 0 ? loop : carriesBefore(index, loop, labels.length);
  const titles = pool[turn % Math.max(pool.length, 1)];
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

/** The lane's quest of `loop`; null for a lane no department is left for. */
function questRef(
  loop: number,
  lane: DemoLane,
  loopStart: number,
  labels: readonly DepartmentLabel[],
): QuestRef | null {
  const department = laneDepartments(loop, labels)[lane];
  if (department === undefined) return null;
  return {
    number: demoIssueNumber(loop, lane),
    department,
    titles: titlesOf(department, loop, labels),
    loopStart,
  };
}

/** The Issues and PRs of one loop as they stand at `inLoopMs`. */
function loopItems(
  loop: number,
  inLoopMs: number,
  loopStart: number,
  labels: readonly DepartmentLabel[],
): LoopItems {
  const lanes = laneStatesAt(inLoopMs);
  const items: LoopItems = { issues: [], prs: [] };
  for (const lane of DEMO_LANES) {
    const quest = questRef(loop, lane, loopStart, labels);
    if (quest === null) continue;
    const state = lanes[lane];
    if (state.issue !== 'none') items.issues.push(issueOf(state, quest));
    if (state.pr !== 'none') items.prs.push(prOf(state, quest));
  }
  return items;
}

/**
 * The king's quest open at `inLoopMs` of `loop` (Issue #152): from `openAt` of every
 * `everyLoops`-th loop from `firstLoop` to `clearAt` of the next one; null otherwise. It takes the
 * number of かなめ's lane of the loop it opens in, which has no Issue or PR of its own
 * (demo.king.test.ts).
 */
export function demoKingQuestAt(
  loop: number,
  inLoopMs: number,
): { readonly loop: number; readonly number: number; readonly title: string } | null {
  const { everyLoops, firstLoop, openAt, clearAt } = DEMO_KING_QUEST;
  if (loop < firstLoop) return null;
  const phase = (loop - firstLoop) % everyLoops;
  const open = (phase === 0 && inLoopMs >= openAt) || (phase === 1 && inLoopMs < clearAt);
  if (!open) return null;
  const openLoop = loop - phase;
  const turn = (openLoop - firstLoop) / everyLoops;
  return {
    loop: openLoop,
    number: demoIssueNumber(openLoop, 'commander'),
    title: DEMO_KING_TITLES[turn % DEMO_KING_TITLES.length] ?? DEMO_KING_TITLES[0],
  };
}

/**
 * A made-up past, so the counts (and the levels of Issue #19) do not start from zero. Each
 * department's clears and merges (in the settings' order: 経理, 広報, 企画, 総務 by default) and
 * the Issues opened are picked so that, with four departments, the level-ups come one by one: in
 * the first loop かなめ (her second scroll), the 1st department (its chest) and the 3rd (its
 * clear); later only now and then (domain/demo.test.ts has the times). The 5th and 6th are for
 * the larger offices to come; a company of fewer departments takes the first ones.
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
  // 115 (Lv 5, 100) and 95 (Lv 4, 60): a few loops from their next levels. Not yet timed.
  { clears: 8, merges: 7 },
  { clears: 7, merges: 5 },
];
/** 48 scrolls × 3 = 144: かなめ reaches Lv 6 (150) with the second scroll of the first loop. */
const PAST_OPENED = 48;

/** Past Issues are numbered from 1 and past PRs after them; the loops' numbers start at 101. */
function pastHistory(labels: readonly DepartmentLabel[]): {
  completed: HistoryIssue[];
  merged: HistoryPr[];
} {
  const completed: HistoryIssue[] = [];
  const merged: HistoryPr[] = [];
  PAST_WORK.slice(0, labels.length).forEach(({ clears, merges }, index) => {
    const first = completed.length + 1;
    for (let i = 0; i < clears; i += 1)
      completed.push({ number: first + i, departments: [departmentAt(labels, index)] });
    for (let i = 0; i < merges; i += 1)
      merged.push({ number: 0, linkedIssues: [first + i], branchDepartment: null });
  });
  const prStart = completed.length + 1;
  return {
    completed,
    merged: merged.map((pr, i) => ({ ...pr, number: prStart + i })),
  };
}

/** The made-up past, then every loop so far (the current one up to `inLoopMs`). */
function historyUntil(
  loop: number,
  inLoopMs: number,
  labels: readonly DepartmentLabel[],
): SnapshotHistory {
  const past = pastHistory(labels);
  let opened = PAST_OPENED;
  const completed: HistoryIssue[] = [...past.completed];
  const merged: HistoryPr[] = [...past.merged];
  const isDepartment = (label: string): boolean => labels.includes(label);
  for (let j = 0; j <= loop; j += 1) {
    const { issues, prs } = loopItems(j, j < loop ? DEMO_LOOP_MS : inLoopMs, 0, labels);
    opened += issues.length;
    for (const issue of issues.filter((i) => i.state === 'closed'))
      completed.push({ number: issue.number, departments: issue.labels.filter(isDepartment) });
    for (const pr of prs.filter((p) => p.mergedAt !== null))
      merged.push({ number: pr.number, linkedIssues: pr.linkedIssues, branchDepartment: null });
  }
  return { openedIssueCount: opened, completedIssues: completed, mergedPrs: merged };
}

function sessionsOf(
  loop: number,
  inLoopMs: number,
  nowMs: number,
  labels: readonly DepartmentLabel[],
): Extract<Snapshot['sessions'], { status: 'ok' }> {
  const lanes = laneStatesAt(inLoopMs);
  const departments = laneDepartments(loop, labels);
  const byDepartment = new Map<DepartmentLabel | null, SessionState>(
    DEMO_LANES.flatMap((lane) => {
      const department = departments[lane];
      return department === undefined ? [] : [[department, lanes[lane].session] as const];
    }),
  );
  return {
    status: 'ok',
    checkedAt: iso(nowMs),
    members: [
      { department: null, state: byDepartment.get(null) ?? 'idle' },
      ...labels.map((department) => ({
        department,
        state: byDepartment.get(department) ?? 'idle',
      })),
    ],
    // The guests' states are added by demoSnapshotAt (Issue #108).
    guests: [],
  };
}

/**
 * The fictional snapshot `elapsedMs` after the demo started, at wall time `nowMs` (epoch ms), for
 * the departments `labels` (the settings' by default; tests pass made-up ones). It holds the
 * current loop as far as it has gone and the whole previous loop (so the members who cleared a
 * quest stay 完了 and keep their rewards). `fetchedAt` is always now: never stale. The settings'
 * guests (Issue #108) come too, with made-up work (domain/demoGuests.ts); without any, none. So
 * does the king's quest (Issue #152, demoKingQuestAt), whatever the settings say of `president`.
 */
export function demoSnapshotAt(
  elapsedMs: number,
  nowMs: number,
  labels: readonly DepartmentLabel[] = DEPARTMENT_LABELS,
  guests: readonly GuildGuest[] = GUILD_SETTINGS.guests ?? [],
): Snapshot {
  const elapsed = Math.max(elapsedMs, 0);
  const loop = Math.floor(elapsed / DEMO_LOOP_MS);
  const inLoop = elapsed - loop * DEMO_LOOP_MS;
  const loopStart = (j: number) => nowMs - inLoop - (loop - j) * DEMO_LOOP_MS;
  const previous = loop > 0 ? loopItems(loop - 1, DEMO_LOOP_MS, loopStart(loop - 1), labels) : null;
  const current = loopItems(loop, inLoop, loopStart(loop), labels);
  const visitors = demoGuestsAt(guests, { loop, inLoopMs: inLoop, nowMs });
  const king = demoKingQuestAt(loop, inLoop);
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fetchedAt: iso(nowMs),
    repo: DEMO_REPO,
    issues: [...(previous?.issues ?? []), ...current.issues],
    prs: [...(previous?.prs ?? []), ...current.prs],
    history: historyUntil(loop, inLoop, labels),
    sessions: { ...sessionsOf(loop, inLoop, nowMs, labels), guests: visitors.states },
    guests: visitors.parts,
    president: {
      issues:
        king === null
          ? []
          : [
              {
                number: king.number,
                title: king.title,
                updatedAt: iso(loopStart(king.loop) + DEMO_KING_QUEST.openAt),
              },
            ],
    },
  };
}
