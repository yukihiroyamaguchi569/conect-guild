import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotSchema } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import type { CompanySeat } from '../collector.config.ts';
import { CollectorError } from './errors.ts';
import { collectOnce, runCollector } from './run.ts';
import {
  fakeGh,
  harness,
  SECRET_BRANCH,
  SECRET_TITLE,
  SESSION_MEMBERS,
  SESSIONS_OK,
} from './run.fixtures.test-util.ts';
import { createCompanySessionsReader } from './sessionFiles.ts';

/** The five company seats under `root`, as collector.config.ts fixes them under the home. */
function seatsUnder(root: string): CompanySeat[] {
  return [
    { department: null, cwd: root },
    { department: '経理', cwd: join(root, 'accounting') },
    { department: '広報', cwd: join(root, 'pr') },
    { department: '企画', cwd: join(root, 'planning') },
    { department: '総務', cwd: join(root, 'general-affairs') },
  ];
}

describe('collectOnce', () => {
  it('writes one validated snapshot built from every page', async () => {
    const deps = harness(fakeGh());
    await expect(collectOnce(deps)).resolves.toEqual({
      github: { ok: true, issues: 1, prs: 2, history: { opened: 3, completed: 1, merged: 1 } },
      sessions: SESSIONS_OK,
    });
    expect(deps.writes).toHaveLength(1);
    const snapshot = snapshotSchema.parse(JSON.parse(deps.writes[0] ?? ''));
    expect(snapshot.sessions).toEqual({
      status: 'ok',
      checkedAt: '2026-10-12T00:00:00.000Z',
      members: SESSION_MEMBERS,
    });
    expect(snapshot.issues.map((i) => i.number)).toEqual([1]);
    expect(snapshot.prs.map((p) => [p.number, p.linkedIssues, p.changedFiles])).toEqual([
      [2, [1], ['a/CLAUDE.md', 'b.md']],
      [4, [1], []],
    ]);
    expect(deps.writes[0]).not.toContain('Confidential body');
    // The Issues closed long ago (from both pages) are in the history only: the completed one as
    // completed, the not planned one only in the count. The branch became its department.
    expect(snapshot.history).toEqual({
      openedIssueCount: 3,
      completedIssues: [{ number: 3, departments: ['経理'] }],
      mergedPrs: [{ number: 4, linkedIssues: [1], branchDepartment: '経理' }],
    });
  });

  it('asks for every issue in one list (no since, for the history) and files only for open PRs', async () => {
    const gh = fakeGh();
    await collectOnce(harness(gh));
    expect(gh.calls.filter((c) => c.includes('/issues'))).toEqual([
      'repos/yukihiroyamaguchi569/conect-management/issues?state=all&sort=created&direction=desc&per_page=100',
    ]);
    expect(gh.calls.some((c) => c.includes('since='))).toBe(false);
    expect(gh.calls.filter((c) => c.includes('/files'))).toEqual([
      'repos/yukihiroyamaguchi569/conect-management/pulls/2/files?per_page=100',
    ]);
  });
});

describe('collectOnce: nothing is written', () => {
  it.each([
    [
      'gh fails for one endpoint',
      { 'pulls/2/files': new CollectorError('gh-failed') },
      'gh-failed',
    ],
    ['gh prints broken JSON', { 'issues?state=all': '{"number":\n' }, 'validation-failed'],
    ['an item has the wrong shape', { 'pulls?state=all': '{"number":"x"}\n' }, 'validation-failed'],
    ['a file entry is not a path', { 'pulls/2/files': '{"filename":"a"}\n' }, 'validation-failed'],
    [
      'gh fails for the issues (the history)',
      { 'issues?state=all': new CollectorError('gh-failed') },
      'gh-failed',
    ],
    [
      'a closed issue has no state_reason',
      {
        'issues?state=all': `${JSON.stringify({
          number: 3,
          title: 't',
          state: 'closed',
          labels: [],
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
          closed_at: '2026-09-01T00:00:00Z',
          is_pull_request: false,
        })}\n`,
      },
      'validation-failed',
    ],
  ])('does not write when %s', async (_label, overrides, kind) => {
    const deps = harness(fakeGh(overrides));
    await expect(collectOnce(deps)).resolves.toMatchObject({ github: { ok: false, kind } });
    expect(deps.writes).toEqual([]);
  });

  it('does not write, nor read the Issues, when gh fails for the PR list (Issue #73)', async () => {
    const gh = fakeGh({ 'pulls?state=all': new CollectorError('gh-failed') });
    const deps = harness(gh);
    await expect(collectOnce(deps)).resolves.toMatchObject({
      github: { ok: false, kind: 'gh-failed' },
    });
    expect(deps.writes).toEqual([]);
    expect(gh.calls.some((c) => c.includes('pulls?state=all'))).toBe(true);
    expect(gh.calls.some((c) => c.includes('issues?state=all'))).toBe(false);
  });
});

describe('collectOnce: failures', () => {
  it('reports write-failed when writing throws', async () => {
    const deps = harness(fakeGh(), { writeSnapshot: () => Promise.reject(new Error('EACCES')) });
    await expect(collectOnce(deps)).resolves.toMatchObject({
      github: { ok: false, kind: 'write-failed' },
    });
  });

  it.each(['missing', 'read-failed', 'parse-failed', 'invalid'] as const)(
    'still writes the GitHub part when the sessions are %s',
    async (kind) => {
      const deps = harness(fakeGh(), {
        readSessions: () => Promise.resolve({ ok: false, kind }),
      });
      await expect(collectOnce(deps)).resolves.toMatchObject({ github: { ok: true } });
      const snapshot = snapshotSchema.parse(JSON.parse(deps.writes[0] ?? ''));
      expect(snapshot.issues.map((i) => i.number)).toEqual([1]);
      expect(snapshot.sessions).toEqual({
        status: 'unavailable',
        checkedAt: '2026-10-12T00:00:00.000Z',
      });
    },
  );
});

describe('runCollector --once', () => {
  it('exits 0 and logs counts and time only', async () => {
    const deps = harness(fakeGh());
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    expect(deps.logs).toEqual([
      '[collector] 2026-10-12T00:00:00.000Z ok: issues=1 prs=2 history: opened=3 completed=1 merged=1',
      '[collector] 2026-10-12T00:00:00.000Z labels ok: 4/4',
      '[collector] 2026-10-12T00:00:00.000Z sessions=5 ok',
    ]);
    expect(deps.errors).toEqual([]);
  });

  it('exits 0 and logs only the kind when the sessions are unavailable', async () => {
    const deps = harness(fakeGh(), {
      readSessions: () => Promise.resolve({ ok: false, kind: 'parse-failed' }),
    });
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    expect(deps.logs).toEqual([
      '[collector] 2026-10-12T00:00:00.000Z ok: issues=1 prs=2 history: opened=3 completed=1 merged=1',
      '[collector] 2026-10-12T00:00:00.000Z labels ok: 4/4',
      '[collector] 2026-10-12T00:00:00.000Z sessions unavailable: parse-failed',
    ]);
  });

  it('exits 1 on failure and logs only the error kind', async () => {
    const error = new Error(`gh: ${SECRET_TITLE} ${SECRET_BRANCH}`);
    const deps = harness(fakeGh({ 'issues?state=all': error }));
    await expect(runCollector(['--once'], deps)).resolves.toBe(1);
    expect(deps.errors).toEqual(['[collector] 2026-10-12T00:00:00.000Z failed: unexpected']);
    expect(deps.writes).toEqual([]);
  });

  it('never logs titles, bodies or branch names', async () => {
    const cases: Record<string, string | Error>[] = [
      {},
      { 'pulls/2/files': new Error(SECRET_TITLE) },
    ];
    for (const overrides of cases) {
      const deps = harness(fakeGh(overrides));
      await runCollector(['--once'], deps);
      const output = [...deps.logs, ...deps.errors].join('\n');
      for (const secret of [SECRET_TITLE, SECRET_BRANCH, 'Confidential', 'CLAUDE.md']) {
        expect(output).not.toContain(secret);
      }
    }
  });
});

describe('runCollector --once: sessions', () => {
  it('goes on with unavailable sessions when the reader throws', async () => {
    const deps = harness(fakeGh(), {
      readSessions: () => Promise.reject(new Error('/home/u/secret')),
    });
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    expect(deps.logs.at(-1)).toBe(
      '[collector] 2026-10-12T00:00:00.000Z sessions unavailable: read-failed',
    );
    expect(deps.writes).toHaveLength(1);
  });

  it('never writes or logs paths and ids of sessions outside the company', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guild-run-'));
    try {
      const root = join(dir, 'conect-management');
      const other = 'bbbbbbbb-0000-4000-8000-00000000000f';
      const company = 'aaaaaaaa-0000-4000-8000-000000000001';
      const otherPath = '/home/u/secret-client-project';
      const cwdLogPath = join(dir, 'cwds');
      const activityStatePath = join(dir, 'activity');
      await writeFile(
        cwdLogPath,
        `\n${other} ${otherPath}\n${company} ${root}\n${other} ${otherPath}`,
      );
      await writeFile(
        activityStatePath,
        JSON.stringify({
          [other]: { working: true, waiting: false, event: 'PreToolUse' },
          [company]: { working: true, waiting: false, event: 'PreToolUse' },
        }),
      );
      const deps = harness(fakeGh(), {
        readSessions: createCompanySessionsReader({
          seats: seatsUnder(root),
          cwdLogPath,
          activityStatePath,
        }),
      });
      await expect(runCollector(['--once'], deps)).resolves.toBe(0);
      expect(deps.writes).toHaveLength(1);
      const output = [...deps.logs, ...deps.errors, ...deps.writes].join('\n');
      for (const secret of [other, otherPath, company, root, dir]) {
        expect(output).not.toContain(secret);
      }
      expect(deps.writes[0]).toContain('"state": "working"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects unknown arguments without echoing them or contacting GitHub', async () => {
    const gh = fakeGh();
    const deps = harness(gh);
    await expect(runCollector(['--repo', 'other/repo'], deps)).resolves.toBe(2);
    expect(deps.errors.join('\n')).not.toContain('other/repo');
    expect(gh.calls).toEqual([]);
  });
});

describe('collectOnce: an issue that changes while the pages are read', () => {
  const base = {
    number: 7,
    title: SECRET_TITLE,
    labels: ['広報'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    is_pull_request: false,
  };
  const open = { ...base, state: 'open', state_reason: null, closed_at: null };
  const done = {
    ...base,
    state: 'closed',
    state_reason: 'completed',
    closed_at: '2026-10-11T00:00:00Z',
  };
  const lines = (...items: object[]) => items.map((i) => `${JSON.stringify(i)}\n`).join('');

  it.each([
    ['closes', lines(open, done), [{ number: 7, departments: ['広報'] }]],
    ['reopens', lines(done, { ...open, state_reason: 'reopened' }), []],
  ])('counts it once when it %s (read twice as the pages shifted)', async (_l, out, completed) => {
    const deps = harness(fakeGh({ 'issues?state=all': out }));
    await collectOnce(deps);
    const snapshot = snapshotSchema.parse(JSON.parse(deps.writes[0] ?? ''));
    expect(snapshot.history.openedIssueCount).toBe(1);
    expect(snapshot.history.completedIssues).toEqual(completed);
    expect(snapshot.issues.map((i) => i.number)).toEqual([7]);
  });
});

describe('collectOnce: PRs that change while the pages are read', () => {
  const base = {
    title: SECRET_TITLE,
    body: 'Closes #1',
    head_ref: SECRET_BRANCH,
  };
  const open = (number: number) => ({
    ...base,
    number,
    state: 'open',
    merged_at: null,
    closed_at: null,
  });
  const merged = (number: number) => ({
    ...base,
    number,
    state: 'closed',
    merged_at: '2026-10-11T00:00:00Z',
    closed_at: '2026-10-11T00:00:00Z',
  });
  const lines = (...items: object[]) => items.map((i) => `${JSON.stringify(i)}\n`).join('');

  it('counts a PR merged at a page boundary once and fetches no files for it', async () => {
    // Page 1 ends with PR 8 still open; a new PR 9 shifts the pages, so page 2 starts with PR 8
    // again, now merged. An old merged PR 3 updated meanwhile keeps its place (creation order).
    const gh = fakeGh({ 'pulls?state=all': lines(open(9), open(8), merged(8), merged(3)) });
    const deps = harness(gh);
    await collectOnce(deps);
    const snapshot = snapshotSchema.parse(JSON.parse(deps.writes[0] ?? ''));
    expect(snapshot.history.mergedPrs.map((p) => p.number)).toEqual([3, 8]);
    expect(snapshot.prs.map((p) => [p.number, p.state])).toEqual([
      [9, 'open'],
      [8, 'closed'],
      [3, 'closed'],
    ]);
    expect(gh.calls.filter((c) => c.includes('/files'))).toEqual([
      'repos/yukihiroyamaguchi569/conect-management/pulls/9/files?per_page=100',
    ]);
  });
});
