import { collectorStatusSchema, snapshotSchema } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import type { GhRunner } from './gh.ts';
import { runCollector } from './run.ts';
import {
  clockedHarness,
  fakeGh,
  harness,
  TOTALS_KEY,
  totalsLine,
} from './run.fixtures.test-util.ts';

/**
 * Issue #251: gh can end a paginated list early with exit code 0. The collector compares the
 * lists with the GraphQL totals and keeps the snapshot as it was when a list comes out short.
 * The fake lists hold Issues 1, 3, 5 and PRs 2, 4 (run.fixtures.test-util.ts).
 */

const AT = '2026-10-12T00:00:00.000Z';

function issueLine(number: number): string {
  const issue = {
    number,
    title: 'Fictional issue',
    state: 'open',
    state_reason: null,
    labels: [],
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-11T00:00:00Z',
    closed_at: null,
    is_pull_request: false,
  };
  return `${JSON.stringify(issue)}\n`;
}

describe('runCollector --once: a list cut short', () => {
  it.each([
    ['the Issue list', totalsLine(4, 2)],
    ['the PR list', totalsLine(3, 3)],
  ])('does not write when %s is shorter than the totals', async (_label, totals) => {
    const deps = harness(fakeGh({ [TOTALS_KEY]: totals }));
    await expect(runCollector(['--once'], deps)).resolves.toBe(1);
    expect(deps.writes).toEqual([]);
    expect(deps.errors).toEqual([`[collector] ${AT} failed: validation-failed`]);
    expect(deps.statuses.map((s) => collectorStatusSchema.parse(JSON.parse(s)))).toEqual([
      { ok: false, attemptedAt: AT, kind: 'validation-failed' },
    ]);
  });

  it('writes when the lists match the totals', async () => {
    const deps = harness(fakeGh({ [TOTALS_KEY]: totalsLine(3, 2) }));
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    const snapshot = snapshotSchema.parse(JSON.parse(deps.writes[0] ?? ''));
    expect(snapshot.history.openedIssueCount).toBe(3);
  });

  it('writes when an Issue created after the totals makes the list longer', async () => {
    const deps = harness(fakeGh({ [TOTALS_KEY]: totalsLine(2, 2) }));
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    expect(deps.writes).toHaveLength(1);
  });

  it('counts an Issue read twice (the pages shifted) once', async () => {
    const twice = issueLine(2) + issueLine(1) + issueLine(1);
    const short = harness(fakeGh({ 'issues?state=all': twice, [TOTALS_KEY]: totalsLine(3, 2) }));
    await expect(runCollector(['--once'], short)).resolves.toBe(1);
    expect(short.writes).toEqual([]);
    const whole = harness(fakeGh({ 'issues?state=all': twice, [TOTALS_KEY]: totalsLine(2, 2) }));
    await expect(runCollector(['--once'], whole)).resolves.toBe(0);
    expect(whole.writes).toHaveLength(1);
  });
});

describe('runCollector loop: a list cut short', () => {
  it('keeps the history of the last whole fetch, so the level does not drop', async () => {
    let short = false;
    const whole = fakeGh();
    const cut = fakeGh({ [TOTALS_KEY]: totalsLine(4, 2) });
    const gh: GhRunner = (args) => (short ? cut(args) : whole(args));
    const { deps } = clockedHarness(gh, 70_000);
    const sleep = deps.sleep;
    await runCollector([], {
      ...deps,
      sleep: async (ms: number) => {
        short = true;
        await sleep(ms);
      },
    });
    const last = snapshotSchema.parse(JSON.parse(deps.writes.at(-1) ?? ''));
    expect(last.fetchedAt).toBe(AT);
    expect(last.history.openedIssueCount).toBe(3);
    expect(deps.errors).toEqual(['[collector] 2026-10-12T00:01:00.000Z failed: validation-failed']);
  });
});
