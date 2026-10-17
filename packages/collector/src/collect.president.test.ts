import { describe, expect, it } from 'vitest';
import type { SnapshotIssue } from '@conect-guild/snapshot';
import { splitPresidentIssues } from './build.ts';
import { collectSnapshot } from './collect.ts';
import type { GhRunner } from './gh.ts';
import { reportCycle } from './report.ts';

/** Issue #141: the king's open Issues leave `issues` for `president.issues`. */

const KING = '社長';
const NOW = new Date('2026-10-12T00:00:00.000Z');

function issue(
  number: number,
  labels: string[],
  extra: Partial<SnapshotIssue> = {},
): SnapshotIssue {
  return {
    number,
    title: `架空の題 ${String(number)}`,
    labels,
    state: 'open',
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: `2026-10-11T0${String(number % 10)}:00:00.000Z`,
    closedAt: null,
    ...extra,
  };
}

describe('splitPresidentIssues', () => {
  it('takes the Issues with the label out, a department label or not; lists the open ones', () => {
    const issues = [
      issue(1, [KING]),
      issue(2, ['経理']),
      issue(3, ['経理', KING]),
      issue(4, []),
      issue(5, [KING], { state: 'closed', closedAt: '2026-10-11T09:00:00.000Z' }),
    ];
    const split = splitPresidentIssues(issues, KING);
    // The closed one leaves too: no clear at a desk or the reception (the king's scene is #142).
    expect(split.issues.map((i) => i.number)).toEqual([2, 4]);
    expect(split.president).toStrictEqual({
      issues: [
        { number: 3, title: '架空の題 3', updatedAt: '2026-10-11T03:00:00.000Z' },
        { number: 1, title: '架空の題 1', updatedAt: '2026-10-11T01:00:00.000Z' },
      ],
      // Issue #172: the closed one goes to `closed`, number and time only (no title).
      closed: [{ number: 5, closedAt: '2026-10-11T09:00:00.000Z' }],
    });
  });

  it('gives an empty list with the label and none on it, and nothing without the label', () => {
    const issues = [issue(1, [KING]), issue(2, ['経理'])];
    expect(splitPresidentIssues([issue(2, ['経理'])], KING).president).toEqual({
      issues: [],
      closed: [],
    });
    const without = splitPresidentIssues(issues, undefined);
    expect(without.president).toBeUndefined();
    expect(without.issues).toEqual(issues);
  });

  it('lists the closed ones by number, and leaves out those with no closing time', () => {
    const closed = (number: number, closedAt: string | null) =>
      issue(number, [KING], { state: 'closed', closedAt });
    const split = splitPresidentIssues(
      [
        closed(9, '2026-10-11T02:00:00.000Z'),
        closed(6, '2026-10-11T03:00:00.000Z'),
        closed(8, null),
      ],
      KING,
    );
    expect(split.president?.closed).toEqual([
      { number: 6, closedAt: '2026-10-11T03:00:00.000Z' },
      { number: 9, closedAt: '2026-10-11T02:00:00.000Z' },
    ]);
    expect(split.issues).toEqual([]);
  });

  it('compares the label exactly', () => {
    expect(splitPresidentIssues([issue(1, ['社長 '])], KING).president).toEqual({
      issues: [],
      closed: [],
    });
  });
});

function rawIssue(number: number, labels: string[], state: 'open' | 'closed'): object {
  return {
    number,
    title: `架空の題 ${String(number)}`,
    state,
    state_reason: state === 'closed' ? 'completed' : null,
    labels,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-11T00:00:00Z',
    closed_at: state === 'closed' ? '2026-10-11T00:00:00Z' : null,
    is_pull_request: false,
  };
}

const gh: GhRunner = (args) => {
  const path = args.at(-1) ?? '';
  if (!path.includes('issues?state=all')) return Promise.resolve('');
  return Promise.resolve(
    [rawIssue(1, [KING], 'open'), rawIssue(2, [], 'open'), rawIssue(3, [KING], 'closed')]
      .map((item) => `${JSON.stringify(item)}\n`)
      .join(''),
  );
};

describe('collectSnapshot with the president’s label', () => {
  it('writes president.issues and keeps the history as before', async () => {
    const { part } = await collectSnapshot(gh, 'owner/repo', NOW, {
      branchPrefixes: [],
      presidentLabel: KING,
    });
    expect(part.issues.map((i) => i.number)).toEqual([2]);
    expect(part.president?.issues.map((i) => i.number)).toEqual([1]);
    expect(part.president?.closed).toEqual([{ number: 3, closedAt: '2026-10-11T00:00:00.000Z' }]);
    expect(part.history.openedIssueCount).toBe(3);
    expect(part.history.completedIssues.map((i) => i.number)).toEqual([3]);
  });

  it('writes no president key without the label', async () => {
    const { part } = await collectSnapshot(gh, 'owner/repo', NOW, { branchPrefixes: [] });
    expect('president' in part).toBe(false);
    expect(part.issues.map((i) => i.number)).toEqual([1, 2, 3]);
  });
});

describe('collectSnapshot: the mix-up check without the king’s Issues', () => {
  // Three PRs of the 経理 prefix, all tied to an Issue of the king that also has 広報's label.
  const merged = (number: number) => ({
    number,
    title: 'Fictional change',
    body: 'Closes #1',
    state: 'closed',
    merged_at: '2026-10-11T00:00:00Z',
    closed_at: '2026-10-11T00:00:00Z',
    head_ref: 'accounting/fictional',
  });
  const mixGh: GhRunner = (args) => {
    const path = args.at(-1) ?? '';
    const items = path.includes('pulls?state=all')
      ? [merged(11), merged(12), merged(13)]
      : [rawIssue(1, [KING, '広報'], 'closed')];
    return Promise.resolve(items.map((item) => `${JSON.stringify(item)}\n`).join(''));
  };
  const branchPrefixes = [{ prefix: 'accounting/', department: '経理' }];

  it('does not count the king’s Issues as a department’s', async () => {
    const without = await collectSnapshot(mixGh, 'owner/repo', NOW, { branchPrefixes });
    expect(without.mixups).not.toEqual([]);
    const rules = { branchPrefixes, presidentLabel: KING };
    expect((await collectSnapshot(mixGh, 'owner/repo', NOW, rules)).mixups).toEqual([]);
  });
});

describe('reportCycle', () => {
  const lines: string[] = [];
  const push = (line: string) => lines.push(line);
  const deps = { now: () => NOW, log: push, error: push };
  const ok = { ok: true, issues: 2, prs: 0, history: { opened: 3, completed: 1, merged: 0 } };

  it('logs the count of the king’s Issues only with president in the settings', () => {
    reportCycle(deps, { ...ok, ok: true, president: 1 });
    reportCycle(deps, { ...ok, ok: true, president: null });
    expect(lines).toEqual([
      '[collector] 2026-10-12T00:00:00.000Z ok: issues=2 prs=0 president=1 history: opened=3 completed=1 merged=0',
      '[collector] 2026-10-12T00:00:00.000Z ok: issues=2 prs=0 history: opened=3 completed=1 merged=0',
    ]);
  });
});
