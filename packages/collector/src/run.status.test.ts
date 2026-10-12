import { collectorStatusSchema, type CollectorStatus } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { CollectorError } from './errors.ts';
import type { GhRunner } from './gh.ts';
import { runCollector } from './run.ts';
import {
  clockedHarness,
  fakeGh,
  GH_FAILED_NEXT_STEP,
  harness,
  SECRET_BRANCH,
  SECRET_TITLE,
} from './run.fixtures.test-util.ts';
import { collectorStatusOf, statusContent } from './status.ts';

const AT = new Date('2026-10-12T00:00:00.000Z');
const REPO = 'yukihiroyamaguchi569/conect-management';

function parsed(statuses: readonly string[]): CollectorStatus[] {
  return statuses.map((s) => collectorStatusSchema.parse(JSON.parse(s)));
}

describe('collectorStatusOf', () => {
  it('is ok with the time of the try when GitHub and the write succeeded', () => {
    expect(collectorStatusOf({ at: AT, failure: null }, null)).toEqual({
      ok: true,
      attemptedAt: '2026-10-12T00:00:00.000Z',
    });
  });

  it('carries the kind of a failed fetch, before that of a failed write', () => {
    expect(collectorStatusOf({ at: AT, failure: 'gh-failed' }, 'write-failed')).toEqual({
      ok: false,
      attemptedAt: '2026-10-12T00:00:00.000Z',
      kind: 'gh-failed',
    });
  });

  it('fails with the write when only the snapshot could not be written', () => {
    expect(collectorStatusOf({ at: AT, failure: null }, 'write-failed')).toMatchObject({
      ok: false,
      kind: 'write-failed',
    });
  });

  it('is one line of JSON the schema accepts', () => {
    const content = statusContent(collectorStatusOf({ at: AT, failure: 'unexpected' }, null));
    expect(content).toBe(
      '{"ok":false,"attemptedAt":"2026-10-12T00:00:00.000Z","kind":"unexpected"}\n',
    );
    expect(collectorStatusSchema.safeParse(JSON.parse(content)).success).toBe(true);
  });
});

describe('runCollector --once: the status file', () => {
  it('writes ok after a good run', async () => {
    const deps = harness(fakeGh());
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    expect(parsed(deps.statuses)).toEqual([{ ok: true, attemptedAt: AT.toISOString() }]);
  });

  it('writes gh-failed and logs the next step after the failure', async () => {
    const deps = harness(fakeGh({ 'issues?state=all': new CollectorError('gh-failed') }));
    await expect(runCollector(['--once'], deps)).resolves.toBe(1);
    expect(parsed(deps.statuses)).toEqual([
      { ok: false, attemptedAt: AT.toISOString(), kind: 'gh-failed' },
    ]);
    expect(deps.errors).toEqual([
      '[collector] 2026-10-12T00:00:00.000Z failed: gh-failed',
      `[collector] 2026-10-12T00:00:00.000Z ${GH_FAILED_NEXT_STEP}`,
    ]);
    // The hint names no repository.
    expect(deps.errors.join('\n')).not.toContain(REPO);
  });

  it('gives the next step for gh-failed only', async () => {
    const deps = harness(fakeGh({ 'pulls?state=all': '{"number":"x"}\n' }));
    await expect(runCollector(['--once'], deps)).resolves.toBe(1);
    expect(deps.errors).toEqual(['[collector] 2026-10-12T00:00:00.000Z failed: validation-failed']);
    expect(parsed(deps.statuses)).toMatchObject([{ ok: false, kind: 'validation-failed' }]);
  });

  it('writes write-failed when the snapshot could not be written', async () => {
    const deps = harness(fakeGh(), { writeSnapshot: () => Promise.reject(new Error('EACCES')) });
    await expect(runCollector(['--once'], deps)).resolves.toBe(1);
    expect(parsed(deps.statuses)).toMatchObject([{ ok: false, kind: 'write-failed' }]);
  });

  it('logs a status it could not write, without the path, and keeps the exit code', async () => {
    const deps = harness(fakeGh(), {
      writeStatus: () => Promise.reject(new Error('EACCES /secret/.data/collector-status.json')),
    });
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    expect(deps.errors).toEqual([
      '[collector] 2026-10-12T00:00:00.000Z status not written: write-failed',
    ]);
    expect(deps.writes).toHaveLength(1);
  });

  it('never puts a title, branch name, path or the repository in the status', async () => {
    const deps = harness(
      fakeGh({ 'pulls/2/files': new Error(`${SECRET_TITLE} ${SECRET_BRANCH}`) }),
    );
    await runCollector(['--once'], deps);
    expect(parsed(deps.statuses)).toMatchObject([{ ok: false, kind: 'unexpected' }]);
    for (const secret of [SECRET_TITLE, SECRET_BRANCH, 'CLAUDE.md', REPO])
      expect(deps.statuses.join('\n')).not.toContain(secret);
  });

  it('writes no status for unknown arguments', async () => {
    const deps = harness(fakeGh());
    await expect(runCollector(['--nope'], deps)).resolves.toBe(2);
    expect(deps.statuses).toEqual([]);
  });
});

describe('runCollector loop: the status file', () => {
  it('writes after each GitHub fetch, not on every 5-second tick', async () => {
    // A fetch runs in the background, so its status is written on the tick after it.
    const { deps } = clockedHarness(fakeGh(), 130_000);
    await runCollector([], deps);
    expect(deps.writes).toHaveLength(26);
    expect(parsed(deps.statuses)).toEqual([
      { ok: true, attemptedAt: '2026-10-12T00:00:00.000Z' },
      { ok: true, attemptedAt: '2026-10-12T00:01:00.000Z' },
      { ok: true, attemptedAt: '2026-10-12T00:02:00.000Z' },
    ]);
  });

  it('writes the snapshot before the status of the same tick', async () => {
    const order: string[] = [];
    const { deps } = clockedHarness(fakeGh(), 5_000, {
      writeSnapshot: () => {
        order.push('snapshot');
        return Promise.resolve();
      },
      writeStatus: () => {
        order.push('status');
        return Promise.resolve();
      },
    });
    await runCollector([], deps);
    expect(order).toEqual(['snapshot', 'status']);
  });
});

describe('runCollector loop: the status file through failures', () => {
  it('says gh-failed before the first success, then ok', async () => {
    let failing = true;
    const base = fakeGh();
    const gh: GhRunner = (args) =>
      failing ? Promise.reject(new CollectorError('gh-failed')) : base(args);
    const { deps } = clockedHarness(gh, 70_000);
    const sleep = deps.sleep;
    await runCollector([], {
      ...deps,
      sleep: async (ms) => {
        await sleep(ms);
        failing = deps.now().getTime() < Date.parse('2026-10-12T00:01:00.000Z');
      },
    });
    expect(parsed(deps.statuses)).toEqual([
      { ok: false, attemptedAt: '2026-10-12T00:00:00.000Z', kind: 'gh-failed' },
      { ok: true, attemptedAt: '2026-10-12T00:01:00.000Z' },
    ]);
  });

  it('says write-failed while the snapshot cannot be written, and ok once it can', async () => {
    let writes = 0;
    const { deps } = clockedHarness(fakeGh(), 20_000, {
      writeSnapshot: () => {
        writes += 1;
        return writes <= 2 ? Promise.reject(new Error('EACCES')) : Promise.resolve();
      },
    });
    await runCollector([], deps);
    expect(parsed(deps.statuses)).toEqual([
      { ok: false, attemptedAt: '2026-10-12T00:00:00.000Z', kind: 'write-failed' },
      { ok: true, attemptedAt: '2026-10-12T00:00:00.000Z' },
    ]);
  });

  it('logs a status it cannot write once, and tries again on each tick', async () => {
    let attempts = 0;
    const { deps } = clockedHarness(fakeGh(), 20_000, {
      writeStatus: () => {
        attempts += 1;
        return attempts <= 2 ? Promise.reject(new Error('EACCES')) : Promise.resolve();
      },
    });
    await runCollector([], deps);
    expect(attempts).toBe(3);
    expect(deps.errors).toEqual([
      '[collector] 2026-10-12T00:00:00.000Z status not written: write-failed',
    ]);
  });

  it('writes no status when interrupted during the first fetch', async () => {
    const controller = new AbortController();
    const gh: GhRunner = () => {
      controller.abort();
      return Promise.reject(new CollectorError('gh-failed'));
    };
    const deps = harness(gh, { signal: controller.signal });
    await expect(runCollector([], deps)).resolves.toBe(0);
    expect(deps.statuses).toEqual([]);
  });
});
