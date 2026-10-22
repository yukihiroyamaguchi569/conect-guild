import { describe, expect, it } from 'vitest';
import type { GhRunner } from './gh.ts';
import { projectionFilter } from './gh.ts';
import {
  assertListsComplete,
  fetchChangedFiles,
  fetchIssues,
  fetchLabelNames,
  fetchPrs,
  fetchTotals,
  type RawIssue,
  type RawPr,
} from './github.ts';

/** Records the jq filter of each call and answers with `stdout`. */
function recordingGh(stdout: string): GhRunner & { filters: string[]; args: string[][] } {
  const filters: string[] = [];
  const args: string[][] = [];
  const gh = (callArgs: readonly string[]): Promise<string> => {
    args.push([...callArgs]);
    filters.push(callArgs[callArgs.indexOf('--jq') + 1] ?? '');
    return Promise.resolve(stdout);
  };
  return Object.assign(gh, { filters, args });
}

describe('fetchChangedFiles', () => {
  it('asks gh for file paths only, so diffs (patch) never reach the collector', async () => {
    const gh = recordingGh('"a/CLAUDE.md"\n"b.md"\n');
    await expect(fetchChangedFiles(gh, 'o/r', 7)).resolves.toEqual(['a/CLAUDE.md', 'b.md']);
    expect(gh.filters).toEqual([projectionFilter('.filename')]);
    expect(gh.args.flat()).not.toContain('--slurp');
  });

  it('rejects whole file objects (a projection that lets patch through)', async () => {
    const gh = recordingGh('{"filename":"a.md","patch":"@@ secret"}\n');
    await expect(fetchChangedFiles(gh, 'o/r', 7)).rejects.toMatchObject({
      kind: 'validation-failed',
    });
  });
});

describe('fetchIssues', () => {
  it('projects issues without their body', async () => {
    const gh = recordingGh('');
    await fetchIssues(gh, 'o/r');
    expect(gh.filters).toHaveLength(1);
    for (const filter of gh.filters) {
      expect(filter).not.toMatch(/body/);
      expect(filter).toContain('has("pull_request")');
      expect(filter).toContain('state_reason');
    }
  });

  it('asks for every issue in one list sorted by creation, without since, for the history', async () => {
    const gh = recordingGh('');
    await fetchIssues(gh, 'o/r');
    expect(gh.args.map((a) => a.at(-1))).toEqual([
      'repos/o/r/issues?state=all&sort=created&direction=desc&per_page=100',
    ]);
    expect(gh.args.every((a) => a.includes('--paginate'))).toBe(true);
  });

  it.each([
    ['a missing state_reason', undefined],
    ['a numeric state_reason', 1],
  ])('rejects %s', async (_label, reason) => {
    const line = JSON.stringify({
      number: 1,
      title: 't',
      state: 'closed',
      state_reason: reason,
      labels: [],
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      closed_at: '2026-10-01T00:00:00Z',
      is_pull_request: false,
    });
    await expect(fetchIssues(recordingGh(`${line}\n`), 'o/r')).rejects.toMatchObject({
      kind: 'validation-failed',
    });
  });

  it('rejects an issue that still carries a body', async () => {
    const line = JSON.stringify({
      number: 1,
      title: 't',
      state: 'open',
      state_reason: null,
      labels: [],
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      closed_at: null,
      is_pull_request: false,
      body: 'secret',
    });
    await expect(fetchIssues(recordingGh(`${line}\n`), 'o/r')).rejects.toMatchObject({
      kind: 'validation-failed',
    });
  });
});

describe('fetchPrs', () => {
  it('keeps the body (needed for linked issues) but projects away everything else', async () => {
    const gh = recordingGh('');
    await fetchPrs(gh, 'o/r');
    const filter = projectionFilter(
      '{number, title, body, state, merged_at, closed_at, head_ref: .head.ref}',
    );
    expect(gh.filters).toEqual([filter]);
  });

  it('asks for every PR in one list sorted by creation, so an updated PR keeps its page', async () => {
    const gh = recordingGh('');
    await fetchPrs(gh, 'o/r');
    expect(gh.args.map((a) => a.at(-1))).toEqual([
      'repos/o/r/pulls?state=all&sort=created&direction=desc&per_page=100',
    ]);
    expect(gh.args.every((a) => a.includes('--paginate'))).toBe(true);
  });
});

describe('fetchLabelNames (Issue #85)', () => {
  it('asks gh for every page of label names only', async () => {
    const gh = recordingGh('"bug"\n"経理"\n');
    await expect(fetchLabelNames(gh, 'o/r')).resolves.toEqual(['bug', '経理']);
    expect(gh.filters).toEqual([projectionFilter('.name')]);
    expect(gh.args).toEqual([
      ['api', '--paginate', '--jq', projectionFilter('.name'), 'repos/o/r/labels?per_page=100'],
    ]);
  });

  it('reads an empty repository as no labels', async () => {
    await expect(fetchLabelNames(recordingGh(''), 'o/r')).resolves.toEqual([]);
  });

  it.each([
    ['whole label objects', '{"name":"経理","description":"secret"}\n'],
    ['a name that is no string', '7\n'],
    ['a broken line', '"経理\n'],
  ])('rejects %s', async (_label, stdout) => {
    await expect(fetchLabelNames(recordingGh(stdout), 'o/r')).rejects.toMatchObject({
      kind: 'validation-failed',
    });
  });
});

describe('fetchTotals (Issue #251)', () => {
  it('passes owner and name as string variables, never inside the query', async () => {
    const gh = recordingGh('{"issues":171,"pullRequests":400}\n');
    await expect(fetchTotals(gh, 'o-wner/re.po')).resolves.toEqual({
      issues: 171,
      pullRequests: 400,
    });
    const [args = []] = gh.args;
    expect(args.slice(0, 2)).toEqual(['api', 'graphql']);
    expect(args).toContain('owner=o-wner');
    expect(args).toContain('name=re.po');
    expect(args[args.indexOf('owner=o-wner') - 1]).toBe('-f');
    expect(args[args.indexOf('name=re.po') - 1]).toBe('-f');
    const query = args.at(-1) ?? '';
    expect(query).toMatch(/^query=/);
    expect(query).toContain('totalCount');
    expect(query).not.toContain('o-wner');
    expect(query).not.toContain('re.po');
    expect(args.join(' ')).not.toMatch(/title|body/);
  });

  it.each([
    ['no output', ''],
    ['two lines', '{"issues":1,"pullRequests":1}\n{"issues":1,"pullRequests":1}\n'],
    ['a missing count', '{"issues":1}\n'],
    ['a negative count', '{"issues":-1,"pullRequests":0}\n'],
    ['an extra field', '{"issues":1,"pullRequests":0,"title":"secret"}\n'],
    ['null (no repository)', 'null\n'],
  ])('rejects %s', async (_label, stdout) => {
    await expect(fetchTotals(recordingGh(stdout), 'o/r')).rejects.toMatchObject({
      kind: 'validation-failed',
    });
  });
});

describe('assertListsComplete (Issue #251)', () => {
  const issue = (number: number, isPr = false): RawIssue => ({
    number,
    title: 't',
    state: 'open',
    state_reason: null,
    labels: [],
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    closed_at: null,
    is_pull_request: isPr,
  });
  const pr = (number: number): RawPr => ({
    number,
    title: 't',
    body: null,
    state: 'open',
    merged_at: null,
    closed_at: null,
    head_ref: 'b',
  });
  // Issues 1 and 3, PR 2 (also in the Issue list, where it is not counted as an Issue).
  const issues = [issue(3), issue(2, true), issue(1)];
  const prs = [pr(2)];

  it('passes lists as long as the totals, or longer (created while they were read)', () => {
    expect(() => {
      assertListsComplete({ issues: 2, pullRequests: 1 }, issues, prs);
    }).not.toThrow();
    expect(() => {
      assertListsComplete({ issues: 1, pullRequests: 0 }, issues, prs);
    }).not.toThrow();
  });

  it.each([
    ['the Issues', { issues: 3, pullRequests: 1 }],
    ['the PRs', { issues: 2, pullRequests: 2 }],
  ])('fails when %s are fewer than the totals', (_label, totals) => {
    expect(() => {
      assertListsComplete(totals, issues, prs);
    }).toThrow(expect.objectContaining({ kind: 'validation-failed' }));
  });

  it('counts a number read twice once, so a repeat does not hide a missing one', () => {
    const repeated = [issue(3), issue(3), issue(1), issue(1)];
    expect(() => {
      assertListsComplete({ issues: 3, pullRequests: 2 }, repeated, [pr(2), pr(2), pr(4)]);
    }).toThrow(expect.objectContaining({ kind: 'validation-failed' }));
    expect(() => {
      assertListsComplete({ issues: 2, pullRequests: 1 }, repeated, [pr(2), pr(2)]);
    }).not.toThrow();
  });
});
