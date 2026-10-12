import { collectorStatusSchema, type CollectorStatus } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { CollectorError } from './errors.ts';
import type { GhRunner } from './gh.ts';
import { runCollector } from './run.ts';
import { clockedHarness, fakeGh, harness } from './run.fixtures.test-util.ts';

/** Issue #85: the check of the department labels, in the collector's loop and --once. */

const MINUTE_MS = 60_000;
const AT = '2026-10-12T00:00:00.000Z';
/** The labels of guild.settings.ts, in its order. None may reach a log or the status file. */
const DEPARTMENT_LABELS = ['経理', '広報', '企画', '総務'];

function parsed(statuses: readonly string[]): CollectorStatus[] {
  return statuses.map((s) => collectorStatusSchema.parse(JSON.parse(s)));
}

function labelLines(names: readonly string[]): string {
  return names.map((name) => `${JSON.stringify(name)}\n`).join('');
}

function labelCalls(gh: { calls: string[] }): number {
  return gh.calls.filter((c) => c.includes('/labels')).length;
}

/** A gh whose label list is whatever `answer()` says at the time of the call. */
function ghWithLabels(answer: () => string | Error): GhRunner & { calls: string[] } {
  const base = fakeGh();
  const gh = (args: readonly string[]): Promise<string> => {
    const path = args.at(-1) ?? '';
    if (!path.includes('/labels')) return base(args);
    base.calls.push(path);
    const label = answer();
    return label instanceof Error ? Promise.reject(label) : Promise.resolve(label);
  };
  return Object.assign(gh, { calls: base.calls });
}

function expectNoLabelNames(lines: readonly string[]): void {
  for (const name of DEPARTMENT_LABELS) expect(lines.join('\n')).not.toContain(name);
}

describe('runCollector loop: the label check schedule', () => {
  it('checks at the start and every 10 minutes, apart from GitHub every minute', async () => {
    const gh = fakeGh();
    const { deps } = clockedHarness(gh, 21 * MINUTE_MS);
    await runCollector([], deps);
    // GitHub at 0, 1, ..., 20 minutes; the labels at 0, 10 and 20 minutes.
    expect(gh.calls.filter((c) => c.includes('issues?state=all'))).toHaveLength(21);
    expect(labelCalls(gh)).toBe(3);
    // All there: logged once, not on every check.
    expect(deps.logs.filter((l) => l.includes('labels'))).toEqual([
      `[collector] ${AT} labels ok: 4/4`,
    ]);
  });

  it('keeps the 10 minutes when each tick takes 3 seconds', async () => {
    const gh = fakeGh();
    const { deps } = clockedHarness(gh, 21 * MINUTE_MS, {}, 3_000);
    await runCollector([], deps);
    expect(labelCalls(gh)).toBe(3);
  });

  it('does not hold up the sessions or the snapshot while the label check hangs', async () => {
    const waiting: (() => void)[] = [];
    const gh = ghWithLabels(() => labelLines(DEPARTMENT_LABELS));
    const hanging: GhRunner = async (args) => {
      if ((args.at(-1) ?? '').includes('/labels')) {
        await new Promise<void>((resolve) => {
          waiting.push(resolve);
        });
      }
      return gh(args);
    };
    const { deps, sessionReads } = clockedHarness(hanging, 30_000);
    const sleep = deps.sleep;
    await runCollector([], {
      ...deps,
      sleep: async (ms) => {
        await sleep(ms);
        if (deps.signal.aborted) for (const resolve of waiting.splice(0)) resolve();
      },
    });
    expect(sessionReads).toEqual(Array.from({ length: 6 }, (_, i) => i * 5_000));
    expect(deps.writes).toHaveLength(6);
    // Checked once: no second check starts while the first is still running.
    expect(labelCalls(gh)).toBe(1);
  });
});

describe('runCollector loop: missing labels', () => {
  it('puts the missing positions in the status and logs them once, without the names', async () => {
    const gh = ghWithLabels(() => labelLines(['経理', '企画']));
    const { deps } = clockedHarness(gh, 11 * MINUTE_MS);
    await runCollector([], deps);
    const statuses = parsed(deps.statuses);
    expect(statuses.length).toBeGreaterThan(1);
    expect(statuses.every((s) => s.ok)).toBe(true);
    expect(statuses.at(-1)).toEqual({
      ok: true,
      attemptedAt: '2026-10-12T00:10:00.000Z',
      missingLabels: [1, 3],
    });
    // The same finding at 10 minutes is not logged again.
    const labelErrors = deps.errors.filter(
      (l) => l.includes('labels') || l.includes('次にやること'),
    );
    expect(labelErrors).toHaveLength(2);
    expect(labelErrors[0]).toBe(
      `[collector] ${AT} labels missing 2/4: departments[1], departments[3] のラベルがリポジトリに無い`,
    );
    expectNoLabelNames([...deps.logs, ...deps.errors, ...deps.statuses]);
    // The snapshot goes on as usual: every 5 seconds.
    expect(deps.writes).toHaveLength(132);
  });

  it('drops the finding from the status once the labels are there, and logs that', async () => {
    let names = ['経理'];
    const gh = ghWithLabels(() => labelLines(names));
    const { deps } = clockedHarness(gh, 11 * MINUTE_MS);
    const sleep = deps.sleep;
    await runCollector([], {
      ...deps,
      sleep: async (ms) => {
        await sleep(ms);
        if (deps.now().getTime() >= Date.parse('2026-10-12T00:05:00.000Z'))
          names = DEPARTMENT_LABELS;
      },
    });
    const statuses = parsed(deps.statuses);
    expect(statuses[0]).toMatchObject({ missingLabels: [1, 2, 3] });
    expect(statuses.at(-1)).toEqual({ ok: true, attemptedAt: '2026-10-12T00:10:00.000Z' });
    expect(deps.logs).toContain('[collector] 2026-10-12T00:10:00.000Z labels ok: 4/4');
  });
});

describe('runCollector loop: a failing label check', () => {
  it('is not known: the status says nothing of labels, and the snapshot goes on', async () => {
    const gh = ghWithLabels(() => new CollectorError('gh-failed'));
    const { deps } = clockedHarness(gh, 2 * MINUTE_MS);
    await runCollector([], deps);
    expect(deps.writes).toHaveLength(24);
    expect(parsed(deps.statuses)).toEqual([
      { ok: true, attemptedAt: '2026-10-12T00:00:00.000Z' },
      { ok: true, attemptedAt: '2026-10-12T00:01:00.000Z' },
    ]);
    expect(deps.errors).toEqual([`[collector] ${AT} labels unknown: gh-failed`]);
  });

  it('keeps the last finding through a failure, and logs the failure', async () => {
    let failing = false;
    const gh = ghWithLabels(() =>
      failing ? new CollectorError('gh-failed') : labelLines(['経理', '広報', '企画']),
    );
    const { deps } = clockedHarness(gh, 11 * MINUTE_MS);
    const sleep = deps.sleep;
    await runCollector([], {
      ...deps,
      sleep: async (ms) => {
        await sleep(ms);
        failing = true;
      },
    });
    expect(parsed(deps.statuses).at(-1)).toEqual({
      ok: true,
      attemptedAt: '2026-10-12T00:10:00.000Z',
      missingLabels: [3],
    });
    expect(deps.errors).toContain('[collector] 2026-10-12T00:10:00.000Z labels unknown: gh-failed');
  });

  it('is dropped quietly when the collector is interrupted meanwhile', async () => {
    const controller = new AbortController();
    const gh = ghWithLabels(() => {
      controller.abort();
      return new CollectorError('gh-failed');
    });
    const deps = harness(gh, { signal: controller.signal });
    await expect(runCollector([], deps)).resolves.toBe(0);
    expect(deps.errors.filter((l) => l.includes('labels'))).toEqual([]);
  });
});

describe('runCollector --once: the label check', () => {
  it('writes the missing positions in the status and logs them', async () => {
    const deps = harness(ghWithLabels(() => labelLines(['総務'])));
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    expect(parsed(deps.statuses)).toEqual([
      { ok: true, attemptedAt: AT, missingLabels: [0, 1, 2] },
    ]);
    expect(deps.errors[0]).toBe(
      `[collector] ${AT} labels missing 3/4: departments[0], departments[1], departments[2] のラベルがリポジトリに無い`,
    );
    expect(deps.writes).toHaveLength(1);
    expectNoLabelNames([...deps.logs, ...deps.errors, ...deps.statuses]);
  });

  it('keeps the exit code and the snapshot when the labels cannot be read', async () => {
    const deps = harness(ghWithLabels(() => new CollectorError('gh-failed')));
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    expect(deps.writes).toHaveLength(1);
    expect(parsed(deps.statuses)).toEqual([{ ok: true, attemptedAt: AT }]);
    expect(deps.errors).toEqual([`[collector] ${AT} labels unknown: gh-failed`]);
  });

  it('carries the finding next to a failed GitHub fetch', async () => {
    const base = ghWithLabels(() => labelLines([]));
    const gh: GhRunner = (args) =>
      (args.at(-1) ?? '').includes('issues?state=all')
        ? Promise.reject(new CollectorError('gh-failed'))
        : base(args);
    const deps = harness(gh);
    await expect(runCollector(['--once'], deps)).resolves.toBe(1);
    expect(parsed(deps.statuses)).toEqual([
      { ok: false, attemptedAt: AT, kind: 'gh-failed', missingLabels: [0, 1, 2, 3] },
    ]);
  });
});
