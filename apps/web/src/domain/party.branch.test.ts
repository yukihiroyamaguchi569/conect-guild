import { describe, expect, it } from 'vitest';
import { toBaseline } from './baseline';
import { diffSnapshot } from './events';
import {
  T0,
  at,
  closedIssue,
  issue,
  minutesAfter,
  mergedPr,
  pr,
  snapshot,
} from './fixtures.test-util';
import { branchDepartmentsOfIssues, deriveMemberStatuses } from './party';
import { issueDepartment } from './quest';

/** Issue #164: an Issue without department labels goes by its linked open PRs' branch prefixes. */

describe('branchDepartmentsOfIssues', () => {
  it('maps each linked Issue to the department of the open PR’s branch prefix', () => {
    const found = branchDepartmentsOfIssues([
      pr(1, { headRef: 'pr/news', linkedIssues: [10, 11] }),
    ]).open;
    expect([...found]).toEqual([
      [10, '広報'],
      [11, '広報'],
    ]);
  });

  it('agrees when several open PRs point at the same department', () => {
    const prs = [
      pr(1, { headRef: 'accounting/a', linkedIssues: [10] }),
      pr(2, { headRef: 'docs/accounting-b', linkedIssues: [10] }),
    ];
    expect(branchDepartmentsOfIssues(prs).open.get(10)).toBe('経理');
  });

  it('leaves out an Issue whose open PRs split across departments', () => {
    const prs = [
      pr(1, { headRef: 'accounting/a', linkedIssues: [10] }),
      pr(2, { headRef: 'planning/b', linkedIssues: [10] }),
    ];
    expect(branchDepartmentsOfIssues(prs).open.has(10)).toBe(false);
  });

  it('ignores PRs whose prefix matches no department', () => {
    expect(branchDepartmentsOfIssues([pr(1, { linkedIssues: [10] })]).open.size).toBe(0);
    const prs = [
      pr(1, { headRef: 'feat/x', linkedIssues: [10] }),
      pr(2, { headRef: 'general-affairs/y', linkedIssues: [10] }),
    ];
    expect(branchDepartmentsOfIssues(prs).open.get(10)).toBe('総務');
  });

  it('places open Issues by open PRs only: closed and merged PRs do not count', () => {
    const prs = [
      mergedPr(1, T0, { headRef: 'accounting/a', linkedIssues: [10] }),
      pr(2, { state: 'closed', closedAt: T0, headRef: 'pr/b', linkedIssues: [11] }),
      pr(3, { headRef: 'planning/c', linkedIssues: [11] }),
    ];
    const { open } = branchDepartmentsOfIssues(prs);
    expect(open.has(10)).toBe(false);
    expect(open.get(11)).toBe('企画');
  });

  it('counts merged PRs too for closed Issues, but never closed PRs that were not merged', () => {
    const prs = [
      mergedPr(1, T0, { headRef: 'accounting/a', linkedIssues: [10] }),
      pr(2, { state: 'closed', closedAt: T0, headRef: 'pr/b', linkedIssues: [11] }),
      mergedPr(3, T0, { headRef: 'planning/c', linkedIssues: [12] }),
      pr(4, { headRef: 'pr/d', linkedIssues: [12] }),
    ];
    const { closed } = branchDepartmentsOfIssues(prs);
    expect([...closed]).toEqual([[10, '経理']]);
  });

  it('finds nothing for PRs linked to no Issue', () => {
    const found = branchDepartmentsOfIssues([pr(1, { headRef: 'pr/x' })]);
    expect([found.open.size, found.closed.size]).toEqual([0, 0]);
  });
});

describe('issueDepartment', () => {
  const fromBranches = branchDepartmentsOfIssues([pr(9, { headRef: 'pr/x', linkedIssues: [1] })]);

  it('lets the department label win over the branch prefix', () => {
    expect(issueDepartment(issue(1, { labels: ['経理'] }), fromBranches)).toBe('経理');
  });

  it('uses the branch prefix for an open Issue without department labels', () => {
    expect(issueDepartment(issue(1, { labels: ['bug'] }), fromBranches)).toBe('広報');
  });

  it('keeps the reception without a linked open PR', () => {
    expect(issueDepartment(issue(2), fromBranches)).toBeNull();
    expect(issueDepartment(issue(1))).toBeNull();
  });

  it('keeps the department of a closed Issue while its PR is still open', () => {
    expect(issueDepartment(closedIssue(1, T0), fromBranches)).toBe('広報');
  });
});

describe('deriveMemberStatuses with branch prefixes', () => {
  it('puts the prefix’s member to work on an unlabelled Issue', () => {
    // The PR also closes 経理's Issue, so the PR itself goes to 経理 and only #2 makes 広報 work.
    const snap = {
      issues: [issue(1, { labels: ['経理'] }), issue(2)],
      prs: [pr(3, { headRef: 'pr/x', linkedIssues: [1, 2] })],
    };
    const states = deriveMemberStatuses(snap, at(T0)).map((s) => [s.department, s.state]);
    expect(states).toEqual([
      ['経理', 'awaiting-kaname'],
      ['広報', 'working'],
      ['企画', 'idle'],
      ['総務', 'idle'],
    ]);
  });

  it('counts the Issue at the desk, not at the reception, in the idle reason', () => {
    const snap = {
      issues: [issue(1), issue(3)],
      prs: [pr(2, { headRef: 'accounting/x', linkedIssues: [1] })],
    };
    const idle = deriveMemberStatuses(snap, at(T0)).find((s) => s.department === '総務');
    expect(idle?.reason).toContain('Issue 1 件・PR 0 件');
  });
});

describe('diffSnapshot with branch prefixes', () => {
  it('hands a newly opened unlabelled Issue to the department of its open PR', () => {
    const base = toBaseline(snapshot({ fetchedAt: T0 }));
    const next = snapshot({
      fetchedAt: minutesAfter(T0, 1),
      issues: [issue(1, { createdAt: minutesAfter(T0, 1) })],
      prs: [pr(2, { headRef: 'planning/x', linkedIssues: [1] })],
    });
    const opened = diffSnapshot(base, next).events.find((e) => e.id === 'issue-opened#1');
    expect(opened?.department).toBe('企画');
  });

  it('clears an unlabelled Issue at the desk while its PR is still open (review)', () => {
    const prs = [pr(2, { headRef: 'planning/x', linkedIssues: [1] })];
    const base = toBaseline(snapshot({ fetchedAt: T0, issues: [issue(1)], prs }));
    const T1 = minutesAfter(T0, 1);
    const next = snapshot({ fetchedAt: T1, issues: [closedIssue(1, T1)], prs });
    const closed = diffSnapshot(base, next).events.find((e) => e.id === 'issue-closed#1');
    expect(closed?.department).toBe('企画');
  });

  it('clears at the desk when the merge of its PR closed the Issue (Issue #164)', () => {
    const base = toBaseline(
      snapshot({ fetchedAt: T0, issues: [issue(1)], prs: [pr(2, { headRef: 'planning/x' })] }),
    );
    const T1 = minutesAfter(T0, 1);
    const merged = mergedPr(2, T1, { headRef: 'planning/x', linkedIssues: [1] });
    const next = snapshot({ fetchedAt: T1, issues: [closedIssue(1, T1)], prs: [merged] });
    const closed = diffSnapshot(base, next).events.find((e) => e.id === 'issue-closed#1');
    expect(closed?.department).toBe('企画');
  });

  it('clears at the reception when its PR was closed without a merge', () => {
    const base = toBaseline(snapshot({ fetchedAt: T0, issues: [issue(1)] }));
    const T1 = minutesAfter(T0, 1);
    const dropped = pr(2, {
      state: 'closed',
      closedAt: T1,
      headRef: 'planning/x',
      linkedIssues: [1],
    });
    const next = snapshot({ fetchedAt: T1, issues: [closedIssue(1, T1)], prs: [dropped] });
    const closed = diffSnapshot(base, next).events.find((e) => e.id === 'issue-closed#1');
    expect(closed?.department).toBeNull();
  });

  it('marks the member done after the merge closed the unlabelled Issue', () => {
    const T1 = minutesAfter(T0, 1);
    const merged = mergedPr(2, T1, { headRef: 'planning/x', linkedIssues: [1] });
    const snap = { issues: [closedIssue(1, T1)], prs: [merged] };
    const planning = deriveMemberStatuses(snap, at(T1)).find((s) => s.department === '企画');
    expect(planning?.state).toBe('done');
  });
});
