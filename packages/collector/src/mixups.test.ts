import { describe, expect, it } from 'vitest';
import type { RawIssue, RawPr } from './github.ts';
import { mixupReport, mixupsOf, toMixupPrs } from './mixups.ts';

/** Issue #94: the collector's side of the mix-up check. Fictional titles, labels and branches. */

const REPO = 'owner/repo';
const NOW = new Date('2026-10-13T00:00:00.000Z');
const DEPARTMENTS = ['経理', '広報', '企画', '総務'];
const BRANCH_PREFIXES = [
  { prefix: 'accounting/', department: '経理' },
  { prefix: 'pr/', department: '広報' },
  { prefix: 'planning/', department: '企画' },
  { prefix: 'general-affairs/', department: '総務' },
] as const;
const CONTEXT = { branchPrefixes: BRANCH_PREFIXES, departments: DEPARTMENTS, now: NOW };

function issue(number: number, labels: string[], patch: Partial<RawIssue> = {}): RawIssue {
  return {
    number,
    title: 'Fictional task',
    state: 'open',
    state_reason: null,
    labels,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    closed_at: null,
    is_pull_request: false,
    ...patch,
  };
}

function merged(number: number, branch: string, body: string | null, patch: Partial<RawPr> = {}) {
  return {
    number,
    title: 'Fictional change',
    body,
    state: 'closed',
    merged_at: '2026-10-12T00:00:00Z',
    closed_at: '2026-10-12T00:00:00Z',
    head_ref: branch,
    ...patch,
  } satisfies RawPr;
}

describe('toMixupPrs', () => {
  it('turns the branch into a position and each tied Issue into its department positions', () => {
    const issues = [issue(1, ['企画', 'bug']), issue(2, ['経理', '総務']), issue(3, [])];
    const prs = [merged(10, 'pr/fictional', 'Closes #1, closes #2, closes #3')];
    expect(toMixupPrs(issues, prs, REPO, CONTEXT)).toEqual([
      {
        branchPosition: 1,
        mergedAt: Date.parse('2026-10-12T00:00:00Z'),
        linkedIssuePositions: [[2], [0, 3], []],
      },
    ]);
  });

  it('leaves out the PRs that are open or closed without a merge', () => {
    const prs = [
      merged(10, 'pr/a', 'Closes #1', { state: 'open', merged_at: null, closed_at: null }),
      merged(11, 'pr/b', 'Closes #1', { merged_at: null }),
    ];
    expect(toMixupPrs([issue(1, ['企画'])], prs, REPO, CONTEXT)).toEqual([]);
  });

  it('has no position for a branch without a department prefix', () => {
    const [pr] = toMixupPrs([issue(1, ['企画'])], [merged(10, 'fix/x', '#1')], REPO, CONTEXT);
    expect(pr?.branchPosition).toBeNull();
  });

  it('has no position for a prefix department missing from the departments given', () => {
    const context = { ...CONTEXT, departments: ['経理', '企画'] };
    const [pr] = toMixupPrs([issue(1, ['企画'])], [merged(10, 'pr/x', '#1')], REPO, context);
    expect(pr).toEqual(expect.objectContaining({ branchPosition: null }));
  });

  it('ties only to Issues that exist, and not to PRs', () => {
    const items = [issue(1, ['企画']), issue(2, ['企画'], { is_pull_request: true })];
    const [pr] = toMixupPrs(items, [merged(10, 'pr/x', 'Closes #2 #1 #99')], REPO, CONTEXT);
    expect(pr?.linkedIssuePositions).toEqual([[2]]);
  });

  it('uses the copy read last of an Issue or a PR read twice', () => {
    const issues = [issue(1, ['経理']), issue(1, ['企画'])];
    const prs = [merged(10, 'pr/x', '#1', { merged_at: null }), merged(10, 'pr/x', '#1')];
    expect(toMixupPrs(issues, prs, REPO, CONTEXT)).toEqual([
      expect.objectContaining({ linkedIssuePositions: [[2]] }),
    ]);
  });
});

describe('mixupsOf', () => {
  const issues = [issue(1, ['企画']), issue(2, ['広報'])];

  it('finds the PRs of one prefix tied to another department’s Issues', () => {
    const prs = [10, 11, 12].map((n) => merged(n, `pr/f-${String(n)}`, 'Closes #1'));
    expect(mixupsOf(issues, prs, REPO, CONTEXT)).toEqual([{ from: 1, to: 2, count: 3, total: 3 }]);
  });

  it('measures the 30 days from the merge', () => {
    const old = '2026-09-12T23:59:59.999Z';
    const prs = [10, 11, 12].map((n) => merged(n, `pr/f-${String(n)}`, '#1', { merged_at: old }));
    expect(mixupsOf(issues, prs, REPO, CONTEXT)).toEqual([]);
    const edge = prs.map((pr) => ({ ...pr, merged_at: '2026-09-13T00:00:00.000Z' }));
    expect(mixupsOf(issues, edge, REPO, CONTEXT)).toHaveLength(1);
  });

  it('finds nothing when each prefix ties to its own department', () => {
    const prs = [10, 11, 12].map((n) => merged(n, `planning/f-${String(n)}`, 'Closes #1'));
    expect(mixupsOf(issues, prs, REPO, CONTEXT)).toEqual([]);
  });
});

describe('mixupReport', () => {
  it('says ok when nothing is suspected', () => {
    expect(mixupReport([])).toEqual({ level: 'log', lines: ['mixups ok'] });
  });

  it('tells a swap with both counts, positions only', () => {
    const report = mixupReport([
      { from: 1, to: 2, count: 4, total: 5 },
      { from: 2, to: 1, count: 3, total: 3 },
    ]);
    expect(report.level).toBe('error');
    expect(report.lines).toEqual([
      'mixups suspected: departments[1] と departments[2] が入れ替わっているかもしれない（直近 30 日のマージ: departments[1] の接頭辞の PR 4/5 件が departments[2] のラベルの Issue、departments[2] の接頭辞の PR 3/3 件が departments[1] のラベルの Issue）',
      '次にやること: 設定（guild.settings.local.json、無ければ guild.settings.json）の branchPrefixes の department が、その接頭辞のブランチを作る部門のラベルになっているか確かめてください。合っていれば、部門のフォルダの CLAUDE.md が指示するラベルと接頭辞を確かめてください（docs/setup.md の「困ったとき」）',
    ]);
  });

  it('tells a one-way mix-up', () => {
    expect(mixupReport([{ from: 3, to: 0, count: 3, total: 4 }]).lines[0]).toBe(
      'mixups suspected: departments[3] の接頭辞の PR 3/4 件が departments[0] のラベルの Issue に結び付いている（直近 30 日のマージ）',
    );
  });

  it('has one line per finding, then the next step', () => {
    const lines = mixupReport([
      { from: 0, to: 3, count: 3, total: 3 },
      { from: 1, to: 2, count: 3, total: 3 },
      { from: 2, to: 1, count: 3, total: 3 },
    ]).lines;
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('departments[0] の接頭辞');
    expect(lines[1]).toContain('departments[1] と departments[2] が入れ替わって');
  });
});
