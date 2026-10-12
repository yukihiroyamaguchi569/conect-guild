import type { Snapshot, SnapshotIssue, SnapshotPr } from '@conect-guild/snapshot';
import { departmentFromBranch as departmentFromBranchIn } from '@conect-guild/snapshot/settings';
import {
  BRANCH_PREFIX_RULES,
  DEPARTMENT_LABELS,
  departmentMember,
  DONE_WINDOW_MS,
  MEMBERS,
  RULE_CHANGE_PATHS,
  type DepartmentLabel,
  type MemberId,
  type RuleChangePath,
} from '../guild.config';
import { departmentLabelsOf, pickDepartment } from './quest';
import { NO_LIVE_STATES, type LiveState, type LiveStates } from './session';

export type PrAssignment =
  | { readonly department: DepartmentLabel; readonly source: 'linked-issue' | 'branch-prefix' }
  | { readonly department: null; readonly source: 'unknown' };

/** Who an open PR waits for: the president (rule change) or かなめ (everything else). */
export type PrWaitKind = 'president' | 'kaname';

/**
 * `awaiting-permission` and `busy` come from the live session (docs/DESIGN.md 4.7): the session
 * asks for a tool permission / is in a turn right now. The others come from GitHub.
 */
export type MemberState =
  | 'awaiting-permission'
  | 'awaiting-president'
  | 'awaiting-kaname'
  | 'busy'
  | 'working'
  | 'done'
  | 'idle';

export interface MemberStatus {
  readonly department: DepartmentLabel;
  readonly memberId: MemberId;
  readonly state: MemberState;
  /** Why the member is idle (shown as a tooltip). null for every other state. */
  readonly reason: string | null;
}

export type IssueIndex = ReadonlyMap<number, SnapshotIssue>;

export function indexIssues(issues: readonly SnapshotIssue[]): IssueIndex {
  return new Map(issues.map((issue) => [issue.number, issue]));
}

/** Department from the branch name prefix table, or null when no rule matches. */
export function departmentFromBranch(headRef: string): DepartmentLabel | null {
  return departmentFromBranchIn(headRef, BRANCH_PREFIX_RULES);
}

/** linked Issues' department labels (fixed order) → branch prefix → unknown (かなめの受付). */
export function assignPr(pr: SnapshotPr, issues: IssueIndex): PrAssignment {
  const linkedLabels = pr.linkedIssues.flatMap((n) => issues.get(n)?.labels ?? []);
  const fromIssues = pickDepartment(linkedLabels).department;
  if (fromIssues !== null) return { department: fromIssues, source: 'linked-issue' };
  const fromBranch = departmentFromBranch(pr.headRef);
  if (fromBranch !== null) return { department: fromBranch, source: 'branch-prefix' };
  return { department: null, source: 'unknown' };
}

function matchesRule(path: string, rule: RuleChangePath): boolean {
  switch (rule.match) {
    case 'exact':
      return path === rule.path;
    case 'suffix':
      return path.endsWith(rule.path);
    case 'prefix':
      return path.startsWith(rule.path);
  }
}

/**
 * True for files whose change needs the president's merge. Plain string comparisons only, no glob
 * (`ruleChangePaths` in guild.settings.json; by default the root CLAUDE.md, any `<dir>/CLAUDE.md`,
 * or anything under the root `.claude/agents/`).
 */
export function isRuleChangePath(
  path: string,
  rules: readonly RuleChangePath[] = RULE_CHANGE_PATHS,
): boolean {
  return rules.some((rule) => matchesRule(path, rule));
}

/** Wait kind for an open PR; null for closed PRs, which wait for no one. */
export function prWaitKind(pr: SnapshotPr): PrWaitKind | null {
  if (pr.state !== 'open') return null;
  return pr.changedFiles.some((path) => isRuleChangePath(path)) ? 'president' : 'kaname';
}

interface Workload {
  awaitingPresident: boolean;
  openPrs: number;
  openIssues: number;
  recentlyClosed: number;
  closedWithoutTime: number;
}

interface Unassigned {
  readonly issues: number;
  readonly prs: number;
}

function emptyWorkload(): Workload {
  return {
    awaitingPresident: false,
    openPrs: 0,
    openIssues: 0,
    recentlyClosed: 0,
    closedWithoutTime: 0,
  };
}

function loadOf(
  loads: ReadonlyMap<DepartmentLabel, Workload>,
  department: DepartmentLabel | null,
): Workload | undefined {
  return department === null ? undefined : loads.get(department);
}

function addIssue(load: Workload, issue: SnapshotIssue, now: number, doneWindowMs: number): void {
  if (issue.state === 'open') {
    load.openIssues += 1;
  } else if (issue.closedAt === null) {
    load.closedWithoutTime += 1;
  } else if (now - Date.parse(issue.closedAt) <= doneWindowMs) {
    load.recentlyClosed += 1;
  }
}

function addPr(load: Workload, pr: SnapshotPr): void {
  const wait = prWaitKind(pr);
  if (wait === null) return;
  load.openPrs += 1;
  if (wait === 'president') load.awaitingPresident = true;
}

function stateOf(load: Workload, live: LiveState | undefined): MemberState {
  if (live === 'awaiting-permission') return 'awaiting-permission';
  if (load.awaitingPresident) return 'awaiting-president';
  if (load.openPrs > 0) return 'awaiting-kaname';
  if (live === 'working') return 'busy';
  if (load.openIssues > 0) return 'working';
  if (load.recentlyClosed > 0) return 'done';
  return 'idle';
}

function idleReason(load: Workload, unassigned: Unassigned): string {
  const parts = ['担当の Issue・PR がありません'];
  if (unassigned.issues > 0 || unassigned.prs > 0) {
    parts.push(
      `担当を判定できない Issue ${String(unassigned.issues)} 件・PR ${String(unassigned.prs)} 件は${MEMBERS.kaname.name}の受付にあります`,
    );
  }
  if (load.closedWithoutTime > 0) {
    parts.push(`閉じた時刻が分からない Issue が ${String(load.closedWithoutTime)} 件あります`);
  }
  return parts.join('。');
}

function countUnassigned(
  snapshot: Pick<Snapshot, 'issues' | 'prs'>,
  issues: IssueIndex,
): Unassigned {
  return {
    issues: snapshot.issues.filter(
      (i) => i.state === 'open' && departmentLabelsOf(i.labels).length === 0,
    ).length,
    prs: snapshot.prs.filter((p) => p.state === 'open' && assignPr(p, issues).department === null)
      .length,
  };
}

/**
 * Each department member's state, in the fixed department order. The first match wins:
 * 許可待ち (live) > 社長の承認まち > かなめの確認まち > いま作業中 (live) > working >
 * done (Issue closed within `doneWindowMs`) > idle. Without `live` it is GitHub only.
 * `now` is epoch milliseconds.
 */
export function deriveMemberStatuses(
  snapshot: Pick<Snapshot, 'issues' | 'prs'>,
  now: number,
  doneWindowMs: number = DONE_WINDOW_MS,
  live: LiveStates = NO_LIVE_STATES,
): MemberStatus[] {
  const index = indexIssues(snapshot.issues);
  const loads = new Map<DepartmentLabel, Workload>(
    DEPARTMENT_LABELS.map((department) => [department, emptyWorkload()]),
  );
  for (const issue of snapshot.issues) {
    const load = loadOf(loads, pickDepartment(issue.labels).department);
    if (load !== undefined) addIssue(load, issue, now, doneWindowMs);
  }
  for (const pr of snapshot.prs) {
    const load = loadOf(loads, assignPr(pr, index).department);
    if (load !== undefined) addPr(load, pr);
  }
  const unassigned = countUnassigned(snapshot, index);
  return DEPARTMENT_LABELS.map((department) => {
    const load = loads.get(department) ?? emptyWorkload();
    const state = stateOf(load, live[departmentMember(department)]);
    return {
      department,
      memberId: departmentMember(department),
      state,
      reason: state === 'idle' ? idleReason(load, unassigned) : null,
    };
  });
}
