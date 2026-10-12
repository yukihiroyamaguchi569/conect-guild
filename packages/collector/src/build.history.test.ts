import { snapshotHistorySchema } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { toHistory } from './build.ts';
import type { RawIssue, RawPr } from './github.ts';

const REPO = 'o/r';
const RULES = [
  { prefix: 'accounting/', department: '経理' },
  { prefix: 'pr/', department: '広報' },
] as const;
const SECRET_TITLE = 'Secret client Ltd';
const SECRET_BRANCH = 'accounting/secret-client';

function issue(number: number, patch: Partial<RawIssue> = {}): RawIssue {
  return {
    number,
    title: SECRET_TITLE,
    state: 'open',
    state_reason: null,
    labels: [],
    is_pull_request: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    closed_at: null,
    ...patch,
  };
}

/** Closed long before the 7-day window of `issues`: only the history keeps it. */
function completed(number: number, labels: string[] = []): RawIssue {
  return issue(number, {
    state: 'closed',
    state_reason: 'completed',
    labels,
    closed_at: '2025-02-01T00:00:00Z',
  });
}

function pr(number: number, patch: Partial<RawPr> = {}): RawPr {
  return {
    number,
    title: SECRET_TITLE,
    body: null,
    state: 'closed',
    merged_at: '2025-02-01T00:00:00Z',
    closed_at: '2025-02-01T00:00:00Z',
    head_ref: SECRET_BRANCH,
    ...patch,
  };
}

function historyOf(issues: readonly RawIssue[], prs: readonly RawPr[] = []) {
  return toHistory(issues, prs, REPO, RULES);
}

describe('toHistory: Issues', () => {
  it('keeps completed Issues however long ago they closed', () => {
    const history = historyOf([completed(1, ['経理']), completed(2, ['広報'])]);
    expect(history.completedIssues).toEqual([
      { number: 1, departments: ['経理'] },
      { number: 2, departments: ['広報'] },
    ]);
  });

  it.each([
    ['not planned', 'not_planned'],
    ['a duplicate', 'duplicate'],
    ['without a reason', null],
    ['with a reason GitHub may add later', 'something_new'],
  ])(
    'leaves an Issue closed as %s out of the completed ones but counts it opened',
    (_l, reason) => {
      const history = historyOf([
        completed(1),
        issue(2, { state: 'closed', state_reason: reason, closed_at: '2025-02-01T00:00:00Z' }),
      ]);
      expect(history.completedIssues.map((i) => i.number)).toEqual([1]);
      expect(history.openedIssueCount).toBe(2);
    },
  );

  it('counts open and reopened Issues as opened, not completed', () => {
    const history = historyOf([issue(1), issue(2, { state_reason: 'reopened' })]);
    expect(history).toMatchObject({ openedIssueCount: 2, completedIssues: [] });
  });

  it('leaves out the PRs mixed into the issues list', () => {
    const history = historyOf([
      completed(1),
      issue(2, { is_pull_request: true, state: 'closed', state_reason: 'completed' }),
      issue(3, { is_pull_request: true }),
    ]);
    expect(history).toMatchObject({
      openedIssueCount: 1,
      completedIssues: [{ number: 1, departments: [] }],
    });
  });

  it('counts an Issue read twice (the pages shifted) once, in the state read last', () => {
    // Closed as completed while the pages were read.
    expect(historyOf([issue(5), completed(5)])).toEqual({
      openedIssueCount: 1,
      completedIssues: [{ number: 5, departments: [] }],
      mergedPrs: [],
    });
    // Reopened while the pages were read: no longer completed.
    expect(historyOf([completed(5), issue(5, { state_reason: 'reopened' })])).toEqual({
      openedIssueCount: 1,
      completedIssues: [],
      mergedPrs: [],
    });
  });
});

describe('toHistory: departments and recounts', () => {
  it('keeps only department labels, in the fixed order, without repeats', () => {
    const history = historyOf([completed(1, ['総務', 'bug', '経理', '総務', '経理部'])]);
    expect(history.completedIssues).toEqual([{ number: 1, departments: ['経理', '総務'] }]);
  });

  it('follows a label that was changed: each fetch is counted afresh', () => {
    expect(historyOf([completed(1, ['経理'])]).completedIssues[0]?.departments).toEqual(['経理']);
    expect(historyOf([completed(1, ['広報'])]).completedIssues[0]?.departments).toEqual(['広報']);
    expect(historyOf([completed(1, [])]).completedIssues[0]?.departments).toEqual([]);
  });

  it('drops an Issue that was reopened since the last fetch', () => {
    expect(historyOf([completed(1)]).completedIssues).toHaveLength(1);
    expect(historyOf([issue(1, { state_reason: 'reopened' })]).completedIssues).toEqual([]);
  });

  it('sorts by number whatever order the pages came in', () => {
    const history = historyOf([completed(30), completed(4), completed(12)]);
    expect(history.completedIssues.map((i) => i.number)).toEqual([4, 12, 30]);
  });
});

describe('toHistory: PRs', () => {
  it('keeps merged PRs only, with the department of the branch instead of the branch', () => {
    const history = historyOf(
      [],
      [
        pr(1),
        pr(2, { head_ref: 'pr/release' }),
        pr(3, { head_ref: 'feat/other' }),
        pr(4, { merged_at: null }),
        pr(5, { state: 'open', merged_at: null, closed_at: null }),
      ],
    );
    expect(history.mergedPrs).toEqual([
      { number: 1, linkedIssues: [], branchDepartment: '経理' },
      { number: 2, linkedIssues: [], branchDepartment: '広報' },
      { number: 3, linkedIssues: [], branchDepartment: null },
    ]);
  });

  it('links Issues of the same repository from the title and body', () => {
    const history = historyOf(
      [issue(7), completed(8)],
      [pr(1, { title: 'Fix (#3)', body: 'Closes #7, closes o/r#8, closes other/repo#9' })],
    );
    expect(history.mergedPrs[0]?.linkedIssues).toEqual([7, 8]);
  });

  it('drops links to numbers that are no Issue: missing, a PR, or too large', () => {
    const history = historyOf(
      [issue(5), issue(6, { is_pull_request: true })],
      [pr(1, { body: 'see #5, #6, #404 and #99999999999999999999' })],
    );
    expect(history.mergedPrs[0]?.linkedIssues).toEqual([5]);
    expect(snapshotHistorySchema.safeParse(history).success).toBe(true);
  });

  it('counts a PR read twice (the pages shifted) once, in the state read last', () => {
    const open = pr(7, { state: 'open', merged_at: null, closed_at: null });
    // Merged while the pages were read.
    expect(historyOf([], [open, pr(7)]).mergedPrs.map((p) => p.number)).toEqual([7]);
    // Read twice as merged, the second copy with a relabelled branch: the later copy wins.
    const later = pr(7, { head_ref: 'pr/x' });
    expect(historyOf([], [pr(7), later]).mergedPrs).toEqual([
      { number: 7, linkedIssues: [], branchDepartment: '広報' },
    ]);
  });

  it('sorts by number', () => {
    expect(historyOf([], [pr(9), pr(2), pr(5)]).mergedPrs.map((p) => p.number)).toEqual([2, 5, 9]);
  });
});

describe('toHistory: what it keeps', () => {
  it('holds numbers and departments only and passes the snapshot schema', () => {
    const history = historyOf(
      [completed(1, ['経理', 'client-x']), issue(2)],
      [pr(3, { body: 'Closes #1 Confidential body' })],
    );
    expect(snapshotHistorySchema.parse(history)).toEqual(history);
    const text = JSON.stringify(history);
    for (const secret of [SECRET_TITLE, SECRET_BRANCH, 'Confidential', 'client-x', '2025-']) {
      expect(text).not.toContain(secret);
    }
  });

  it('is empty for a repository without Issues or PRs', () => {
    expect(historyOf([], [])).toEqual({ openedIssueCount: 0, completedIssues: [], mergedPrs: [] });
  });
});
