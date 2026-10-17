import type {
  HistoryIssue,
  HistoryPr,
  SnapshotHistory,
  SnapshotIssue,
  SnapshotPr,
  SnapshotPresident,
} from '@conect-guild/snapshot';
import {
  DEPARTMENT_LABELS,
  departmentFromBranch,
  type BranchPrefixRule,
} from '@conect-guild/snapshot/settings';
import type { RawIssue, RawPr } from './github.ts';
import { extractLinkedIssues } from './links.ts';

/** Closed issues and PRs are kept for this long (docs/DESIGN.md 4.1). */
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function recentCutoff(now: Date): Date {
  return new Date(now.getTime() - RECENT_WINDOW_MS);
}

function isOpenOrRecentlyClosed(
  item: { readonly state: 'open' | 'closed'; readonly closed_at: string | null },
  cutoff: Date,
): boolean {
  if (item.state === 'open') return true;
  return item.closed_at !== null && Date.parse(item.closed_at) >= cutoff.getTime();
}

/**
 * One item per number. Issues and PRs each come from one list read page by page (github.ts), so
 * an item read twice (the pages shifted) is newest in the copy read last.
 */
function uniqueReadLast<T extends { readonly number: number }>(items: readonly T[]): T[] {
  return [...new Map(items.map((item) => [item.number, item])).values()];
}

function isoOrNull(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/** Numbers of every Issue (PRs excluded) in the repository: the only numbers a PR may link. */
export function issueNumbersOf(raw: readonly RawIssue[]): ReadonlySet<number> {
  return new Set(raw.filter((issue) => !issue.is_pull_request).map((issue) => issue.number));
}

/** Issues without PRs: all open ones and those closed since `cutoff`. */
export function toSnapshotIssues(raw: readonly RawIssue[], cutoff: Date): SnapshotIssue[] {
  const issues = uniqueReadLast(raw.filter((issue) => !issue.is_pull_request)).filter((issue) =>
    isOpenOrRecentlyClosed(issue, cutoff),
  );
  return issues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    labels: [...issue.labels],
    state: issue.state,
    createdAt: new Date(issue.created_at).toISOString(),
    updatedAt: new Date(issue.updated_at).toISOString(),
    closedAt: isoOrNull(issue.closed_at),
  }));
}

/**
 * Issue #141: the Issues with the president's label are the king's, even with a department label
 * too. They all leave `issues` (no department desk, no reception, no clear there when one closes);
 * the open ones go to `president.issues`, the most recently updated first, and the closed ones to
 * `president.closed` (number and time only, Issue #172). The history is counted
 * from the raw lists apart (toHistory), so it stays as it was. Without the label, nothing moves.
 */
export function splitPresidentIssues(
  issues: readonly SnapshotIssue[],
  label: string | undefined,
): { readonly issues: SnapshotIssue[]; readonly president: SnapshotPresident | undefined } {
  if (label === undefined) return { issues: [...issues], president: undefined };
  const isKing = (issue: SnapshotIssue) => issue.labels.includes(label);
  const king = issues
    .filter((issue) => issue.state === 'open' && isKing(issue))
    .toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map(({ number, title, updatedAt }) => ({ number, title, updatedAt }));
  // Issue #172: the closed ones (since the cutoff of `issues`) count in the week's clears.
  const closed = issues
    .filter((issue) => issue.state === 'closed' && isKing(issue))
    .flatMap(({ number, closedAt }) => (closedAt === null ? [] : [{ number, closedAt }]))
    .toSorted(byNumber);
  return {
    issues: issues.filter((issue) => !isKing(issue)),
    president: { issues: king, closed },
  };
}

/** All open PRs and those closed or merged since `cutoff`. */
export function selectRecentPrs(raw: readonly RawPr[], cutoff: Date): RawPr[] {
  return uniqueReadLast(raw).filter((pr) => isOpenOrRecentlyClosed(pr, cutoff));
}

/** Snapshot form of a PR. The body is read for links only and dropped here. */
export function toSnapshotPr(
  pr: RawPr,
  repo: string,
  existingIssues: ReadonlySet<number>,
  changedFiles: readonly string[],
): SnapshotPr {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    mergedAt: isoOrNull(pr.merged_at),
    closedAt: isoOrNull(pr.closed_at),
    headRef: pr.head_ref,
    linkedIssues: extractLinkedIssues(pr.title, pr.body, repo, existingIssues),
    changedFiles: pr.state === 'open' ? [...changedFiles] : [],
  };
}

function byNumber(a: { readonly number: number }, b: { readonly number: number }): number {
  return a.number - b.number;
}

/** Only the department labels, in the fixed order; other labels stay out. */
function toHistoryIssue(issue: RawIssue): HistoryIssue {
  const departments = DEPARTMENT_LABELS.filter((label) => issue.labels.includes(label));
  return { number: issue.number, departments };
}

/** Only the department the branch name points at goes in; the branch name stays out. */
function toHistoryPr(
  pr: RawPr,
  repo: string,
  existingIssues: ReadonlySet<number>,
  branchPrefixes: readonly BranchPrefixRule[],
): HistoryPr {
  return {
    number: pr.number,
    linkedIssues: extractLinkedIssues(pr.title, pr.body, repo, existingIssues),
    branchDepartment: departmentFromBranch(pr.head_ref, branchPrefixes),
  };
}

/**
 * The whole history, counted afresh from what GitHub says now (docs/DESIGN.md 4.1, 4.2): how many
 * Issues were ever opened, the Issues closed as completed, and the merged PRs. Numbers and
 * departments only; titles, other labels, branch names and times are dropped here.
 */
export function toHistory(
  rawIssues: readonly RawIssue[],
  rawPrs: readonly RawPr[],
  repo: string,
  branchPrefixes: readonly BranchPrefixRule[],
): SnapshotHistory {
  const issues = uniqueReadLast(rawIssues.filter((issue) => !issue.is_pull_request));
  const completed = issues.filter(
    (issue) => issue.state === 'closed' && issue.state_reason === 'completed',
  );
  const merged = uniqueReadLast(rawPrs).filter((pr) => pr.merged_at !== null);
  const existingIssues = issueNumbersOf(issues);
  return {
    openedIssueCount: issues.length,
    completedIssues: completed.map(toHistoryIssue).toSorted(byNumber),
    mergedPrs: merged
      .map((pr) => toHistoryPr(pr, repo, existingIssues, branchPrefixes))
      .toSorted(byNumber),
  };
}
