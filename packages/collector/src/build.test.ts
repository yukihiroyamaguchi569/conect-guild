import { describe, expect, it } from 'vitest';
import {
  issueNumbersOf,
  recentCutoff,
  selectRecentPrs,
  toSnapshotIssues,
  toSnapshotPr,
} from './build.ts';
import type { RawIssue, RawPr } from './github.ts';

const NOW = new Date('2026-10-12T00:00:00.000Z');
const CUTOFF = recentCutoff(NOW);

function issue(patch: Partial<RawIssue>): RawIssue {
  return {
    number: 1,
    title: 'Issue',
    state: 'open',
    state_reason: null,
    labels: ['経理'],
    is_pull_request: false,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    closed_at: null,
    ...patch,
  };
}

function pr(patch: Partial<RawPr>): RawPr {
  return {
    number: 10,
    title: 'PR (#1)',
    body: 'Body text',
    state: 'open',
    merged_at: null,
    closed_at: null,
    head_ref: 'accounting/x',
    ...patch,
  };
}

describe('recentCutoff', () => {
  it('is exactly 7 days before now', () => {
    expect(CUTOFF.toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
});

describe('toSnapshotIssues', () => {
  it('maps fields to the snapshot shape with normalized ISO times', () => {
    expect(toSnapshotIssues([issue({})], CUTOFF)).toEqual([
      {
        number: 1,
        title: 'Issue',
        labels: ['経理'],
        state: 'open',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
        closedAt: null,
      },
    ]);
  });

  it('drops pull requests mixed into the issues list', () => {
    const items = [issue({ number: 1 }), issue({ number: 2, is_pull_request: true })];
    expect(toSnapshotIssues(items, CUTOFF).map((i) => i.number)).toEqual([1]);
  });

  it('keeps closed issues only when closed_at is within 7 days (boundary inclusive)', () => {
    const items = [
      issue({ number: 1, state: 'closed', closed_at: '2026-10-05T00:00:00Z' }),
      issue({ number: 2, state: 'closed', closed_at: '2026-10-04T23:59:59Z' }),
      issue({ number: 3, state: 'closed', closed_at: null }),
      issue({ number: 4, state: 'open', created_at: '2020-01-01T00:00:00Z' }),
    ];
    expect(toSnapshotIssues(items, CUTOFF).map((i) => i.number)).toEqual([1, 4]);
  });

  it('keeps the copy read last when an issue was read twice (the pages shifted)', () => {
    const open = issue({ number: 5 });
    const closed = issue({ number: 5, state: 'closed', closed_at: '2026-10-11T00:00:00Z' });
    const states = (items: RawIssue[]) =>
      toSnapshotIssues(items, CUTOFF).map((i) => [i.number, i.state]);
    // Closed while the pages were read, then reopened while the pages were read.
    expect(states([open, closed])).toEqual([[5, 'closed']]);
    expect(states([closed, open])).toEqual([[5, 'open']]);
  });
});

describe('selectRecentPrs', () => {
  it('keeps open PRs and PRs closed or merged within 7 days', () => {
    const items = [
      pr({ number: 1 }),
      pr({
        number: 2,
        state: 'closed',
        merged_at: '2026-10-10T00:00:00Z',
        closed_at: '2026-10-10T00:00:00Z',
      }),
      pr({ number: 3, state: 'closed', closed_at: '2026-10-06T00:00:00Z' }),
      pr({ number: 4, state: 'closed', closed_at: '2026-09-01T00:00:00Z' }),
      pr({ number: 1 }),
    ];
    expect(selectRecentPrs(items, CUTOFF).map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it('keeps the copy read last when a PR was read twice (merged while the pages were read)', () => {
    const merged = pr({
      number: 7,
      state: 'closed',
      merged_at: '2026-10-11T00:00:00Z',
      closed_at: '2026-10-11T00:00:00Z',
    });
    expect(selectRecentPrs([pr({ number: 7 }), merged], CUTOFF)).toEqual([merged]);
  });
});

describe('issueNumbersOf', () => {
  it('collects every Issue number, open or closed, but no PR number', () => {
    const numbers = issueNumbersOf([
      issue({ number: 1 }),
      issue({ number: 2, state: 'closed', closed_at: '2020-01-01T00:00:00Z' }),
      issue({ number: 3, is_pull_request: true }),
    ]);
    expect([...numbers].toSorted((a, b) => a - b)).toEqual([1, 2]);
  });

  it('is empty for a repository without Issues', () => {
    expect(issueNumbersOf([]).size).toBe(0);
  });
});

describe('toSnapshotPr', () => {
  it('links only Issues that exist', () => {
    const result = toSnapshotPr(pr({ body: 'Closes #7, #8' }), 'o/r', new Set([8]), []);
    expect(result.linkedIssues).toEqual([8]);
  });

  it('stores links and changed files for an open PR, never the body', () => {
    const result = toSnapshotPr(pr({ body: 'Closes #7' }), 'o/r', new Set([1, 7]), ['a.md']);
    expect(result).toEqual({
      number: 10,
      title: 'PR (#1)',
      state: 'open',
      mergedAt: null,
      closedAt: null,
      headRef: 'accounting/x',
      linkedIssues: [7],
      changedFiles: ['a.md'],
    });
    expect(JSON.stringify(result)).not.toContain('Closes');
  });

  it('gives closed PRs no changed files', () => {
    const closed = pr({
      state: 'closed',
      merged_at: '2026-10-10T00:00:00Z',
      closed_at: '2026-10-10T00:00:00Z',
    });
    const result = toSnapshotPr(closed, 'o/r', new Set([1]), ['a.md']);
    expect(result.changedFiles).toEqual([]);
    expect(result.mergedAt).toBe('2026-10-10T00:00:00.000Z');
  });
});
