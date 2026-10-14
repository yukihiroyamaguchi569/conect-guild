import {
  SNAPSHOT_SCHEMA_VERSION,
  type Snapshot,
  type SnapshotIssue,
  type SnapshotPr,
} from '@conect-guild/snapshot';

/** Shared builders for domain tests. Titles are fictional. */
export const T0 = '2026-10-12T00:00:00Z';

export function at(iso: string): number {
  return Date.parse(iso);
}

export function minutesAfter(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

export function issue(number: number, over: Partial<SnapshotIssue> = {}): SnapshotIssue {
  return {
    number,
    title: `架空の依頼 ${String(number)}`,
    labels: [],
    state: 'open',
    createdAt: T0,
    updatedAt: T0,
    closedAt: null,
    ...over,
  };
}

export function closedIssue(
  number: number,
  closedAt: string,
  labels: string[] = [],
): SnapshotIssue {
  return issue(number, { state: 'closed', closedAt, labels });
}

export function pr(number: number, over: Partial<SnapshotPr> = {}): SnapshotPr {
  return {
    number,
    title: `架空の成果物 ${String(number)}`,
    state: 'open',
    mergedAt: null,
    closedAt: null,
    headRef: 'feat/something',
    linkedIssues: [],
    changedFiles: [],
    ...over,
  };
}

export function mergedPr(
  number: number,
  mergedAt: string,
  over: Partial<SnapshotPr> = {},
): SnapshotPr {
  return pr(number, { state: 'closed', mergedAt, closedAt: mergedAt, ...over });
}

export function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fetchedAt: T0,
    repo: 'example/guild',
    issues: [],
    prs: [],
    history: { openedIssueCount: 0, completedIssues: [], mergedPrs: [] },
    // GitHub only unless a test gives the sessions.
    sessions: { status: 'unavailable', checkedAt: T0 },
    guests: [],
    ...over,
  };
}
