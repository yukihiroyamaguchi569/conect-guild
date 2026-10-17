import type { SnapshotIssue } from '@conect-guild/snapshot';
import { DEPARTMENT_LABELS, type DepartmentLabel } from '../guild.config';

export interface DepartmentPick {
  /** The department in charge, or null for "かなめの受付" (no department label). */
  readonly department: DepartmentLabel | null;
  /** True when two or more department labels were present. */
  readonly multiDepartment: boolean;
}

export interface Quest {
  readonly number: number;
  readonly title: string;
  readonly state: SnapshotIssue['state'];
  readonly closedAt: string | null;
  /** null means the scroll waits at かなめ's reception desk. */
  readonly department: DepartmentLabel | null;
  readonly multiDepartment: boolean;
}

/** Department labels among `labels`, in the fixed order (経理 → 広報 → 企画 → 総務), without repeats. */
export function departmentLabelsOf(labels: readonly string[]): DepartmentLabel[] {
  return DEPARTMENT_LABELS.filter((label) => labels.includes(label));
}

/** 0 department labels → reception; 2 or more → the first in the fixed order, marked as multi. */
export function pickDepartment(labels: readonly string[]): DepartmentPick {
  const found = departmentLabelsOf(labels);
  return { department: found[0] ?? null, multiDepartment: found.length >= 2 };
}

/** Issue number → department from linked open PRs' branch prefixes (party.ts, Issue #164). */
export type BranchDepartments = ReadonlyMap<number, DepartmentLabel>;

const NO_BRANCH_DEPARTMENTS: BranchDepartments = new Map();

/**
 * The department of an Issue: its department labels first; without one, the branch prefixes of its
 * linked open PRs (Issue #164), also for an Issue just closed while its PR is still open, so the
 * clear lands where the scroll was; otherwise null (かなめの受付).
 */
export function issueDepartment(
  issue: SnapshotIssue,
  fromBranches: BranchDepartments = NO_BRANCH_DEPARTMENTS,
): DepartmentLabel | null {
  return pickDepartment(issue.labels).department ?? fromBranches.get(issue.number) ?? null;
}

export function toQuest(
  issue: SnapshotIssue,
  fromBranches: BranchDepartments = NO_BRANCH_DEPARTMENTS,
): Quest {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    closedAt: issue.closedAt,
    department: issueDepartment(issue, fromBranches),
    multiDepartment: pickDepartment(issue.labels).multiDepartment,
  };
}

export function toQuests(
  issues: readonly SnapshotIssue[],
  fromBranches: BranchDepartments = NO_BRANCH_DEPARTMENTS,
): Quest[] {
  return issues.map((issue) => toQuest(issue, fromBranches));
}
