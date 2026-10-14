import { collectorStatusSchema, snapshotSchema, type Snapshot } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { COLLECTOR_CONFIG } from '../collector.config.ts';
import { CollectorError } from './errors.ts';
import type { GhRunner } from './gh.ts';
import {
  GUEST_OUTPUTS,
  GUEST_REPO_A,
  GUEST_REPO_B,
  GUEST_TITLE,
  SESSIONS_WITH_GUESTS,
  sessionsWithGuests,
} from './guestRun.fixtures.test-util.ts';
import { runCollector } from './run.ts';
import { clockedHarness, fakeGh, harness } from './run.fixtures.test-util.ts';

/** Issue #108: the guests' fetches in the collector's run. */

const GUESTS = { guestRepos: [GUEST_REPO_A, GUEST_REPO_B] } as const;
const WITH_GUEST_SESSIONS = { readSessions: () => Promise.resolve(SESSIONS_WITH_GUESTS) };

function snapshots(writes: readonly string[]): Snapshot[] {
  return writes.map((w) => snapshotSchema.parse(JSON.parse(w)));
}

/** Every line and file that leaves the collector except the snapshot. */
function outside(deps: { logs: string[]; errors: string[]; statuses: string[] }): string {
  return [...deps.logs, ...deps.errors, ...deps.statuses].join('\n');
}

describe('runCollector --once with guests', () => {
  it('fetches the guests beside the company and writes their parts', async () => {
    const deps = harness(fakeGh({}, GUEST_OUTPUTS), { ...GUESTS, ...WITH_GUEST_SESSIONS });
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    const [snapshot] = snapshots(deps.writes);
    expect(snapshot?.guests.map((g) => [g?.repo, g?.open.length, g?.recent.length])).toEqual([
      [GUEST_REPO_A, 1, 1],
      [GUEST_REPO_B, 2, 1],
    ]);
    expect(deps.logs).toContain(
      '[collector] 2026-10-12T00:00:00.000Z guests[0] github ok: open=1 recent=1',
    );
    expect(deps.logs).toContain('[collector] 2026-10-12T00:00:00.000Z guests: 2 ok');
  });

  it('writes the company with null for a failed guest, keeps the other, and exits 0', async () => {
    const gh = fakeGh(
      { [`${GUEST_REPO_A}/issues?state=closed`]: new CollectorError('gh-failed') },
      GUEST_OUTPUTS,
    );
    const deps = harness(gh, { ...GUESTS, ...WITH_GUEST_SESSIONS });
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    const [snapshot] = snapshots(deps.writes);
    expect(snapshot?.issues).toHaveLength(1);
    expect(snapshot?.guests.map((g) => g?.repo ?? null)).toEqual([null, GUEST_REPO_B]);
    expect(deps.errors).toEqual([
      '[collector] 2026-10-12T00:00:00.000Z guests[0] github failed: gh-failed',
    ]);
    expect(deps.logs).toContain('[collector] 2026-10-12T00:00:00.000Z guests: 1 ok, 1 failed');
    // The status file is about the company only.
    expect(collectorStatusSchema.parse(JSON.parse(deps.statuses[0] ?? ''))).toMatchObject({
      ok: true,
    });
  });

  it('skips a guest without a repository and asks gh nothing for it', async () => {
    const gh = fakeGh({}, GUEST_OUTPUTS);
    const deps = harness(gh, { guestRepos: [null, GUEST_REPO_B], ...WITH_GUEST_SESSIONS });
    await runCollector(['--once'], deps);
    expect(gh.calls.some((c) => c.includes(GUEST_REPO_A))).toBe(false);
    expect(snapshots(deps.writes)[0]?.guests.map((g) => g?.repo ?? null)).toEqual([
      null,
      GUEST_REPO_B,
    ]);
    expect(deps.logs).toContain('[collector] 2026-10-12T00:00:00.000Z guests: 1 ok');
  });

  it('still fails and writes nothing when the company fails, whatever the guests do', async () => {
    const gh = fakeGh({ 'issues?state=all': new CollectorError('gh-failed') }, GUEST_OUTPUTS);
    const deps = harness(gh, { ...GUESTS, ...WITH_GUEST_SESSIONS });
    await expect(runCollector(['--once'], deps)).resolves.toBe(1);
    expect(deps.writes).toEqual([]);
  });
});

describe('runCollector --once with guests: what leaves the collector', () => {
  it('logs no guest repository or title, even when a guest fails validation', async () => {
    const gh = fakeGh(
      { [`${GUEST_REPO_B}/issues?state=open`]: `{"title":"${GUEST_TITLE}"}\n` },
      GUEST_OUTPUTS,
    );
    const deps = harness(gh, { ...GUESTS, ...WITH_GUEST_SESSIONS });
    await runCollector(['--once'], deps);
    expect(deps.errors).toContain(
      '[collector] 2026-10-12T00:00:00.000Z guests[1] github failed: validation-failed',
    );
    const text = outside(deps);
    for (const secret of [
      GUEST_REPO_A,
      GUEST_REPO_B,
      'secret-visitor',
      'hidden-app',
      GUEST_TITLE,
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});

/** The times (ms since the start) at which each guest's open list was asked for. */
function guestFetchTimes(calls: readonly { path: string; at: number }[], repo: string): number[] {
  return calls.filter((c) => c.path.includes(`${repo}/issues?state=open`)).map((c) => c.at);
}

describe('runCollector loop with guests', () => {
  it('fetches each guest every 5 minutes, staggered, never on a company fetch', async () => {
    const base = fakeGh({}, GUEST_OUTPUTS);
    const calls: { path: string; at: number }[] = [];
    let elapsed = (): number => 0;
    const gh: GhRunner = (args) => {
      calls.push({ path: args.at(-1) ?? '', at: elapsed() });
      return base(args);
    };
    const h = clockedHarness(gh, 11 * 60_000, { ...GUESTS, ...WITH_GUEST_SESSIONS });
    elapsed = h.elapsed;
    await runCollector([], h.deps);
    expect(COLLECTOR_CONFIG.guests).toMatchObject({ intervalMs: 300_000, offsetMs: 20_000 });
    expect(guestFetchTimes(calls, GUEST_REPO_A)).toEqual([20_000, 320_000, 620_000]);
    expect(guestFetchTimes(calls, GUEST_REPO_B)).toEqual([40_000, 340_000, 640_000]);
    const company = calls.filter((c) => c.path.includes('issues?state=all')).map((c) => c.at);
    const guests = calls.filter((c) => c.path.includes('state=open')).map((c) => c.at);
    expect(guests.filter((at) => company.includes(at))).toEqual([]);
    // Written from the tick after each guest's fetch on.
    const written = snapshots(h.deps.writes);
    expect(written[4]?.guests).toEqual([null, null]);
    expect(written[5]?.guests.map((g) => g?.repo ?? null)).toEqual([GUEST_REPO_A, null]);
    expect(written.at(-1)?.guests.map((g) => g?.fetchedAt)).toEqual([
      '2026-10-12T00:10:20.000Z',
      '2026-10-12T00:10:40.000Z',
    ]);
  });
});

describe('runCollector loop with guests: failures', () => {
  it("keeps a guest's last good part when its next fetch fails, and the other guest's too", async () => {
    let failA = false;
    const base = fakeGh({}, GUEST_OUTPUTS);
    const gh: GhRunner = (args) =>
      failA && (args.at(-1) ?? '').includes(GUEST_REPO_A)
        ? Promise.reject(new CollectorError('gh-failed'))
        : base(args);
    const h = clockedHarness(gh, 6 * 60_000, { ...GUESTS, ...WITH_GUEST_SESSIONS });
    const sleep = h.deps.sleep;
    const deps = {
      ...h.deps,
      sleep: async (ms: number) => {
        if (h.elapsed() >= 60_000) failA = true;
        await sleep(ms);
      },
    };
    await runCollector([], deps);
    const last = snapshots(h.deps.writes).at(-1);
    expect(last?.guests.map((g) => g?.fetchedAt)).toEqual([
      '2026-10-12T00:00:20.000Z',
      '2026-10-12T00:05:40.000Z',
    ]);
    expect(h.deps.errors).toEqual([
      '[collector] 2026-10-12T00:05:20.000Z guests[0] github failed: gh-failed',
    ]);
    // The company went on every 60 seconds.
    expect(last?.fetchedAt).toBe('2026-10-12T00:05:00.000Z');
  });

  it('never holds up the 5-second loop for a guest that hangs, and ends it on stop', async () => {
    const base = fakeGh({}, GUEST_OUTPUTS);
    let signal: AbortSignal | null = null;
    let settled = false;
    const gh: GhRunner = (args) => {
      if (!(args.at(-1) ?? '').includes(GUEST_REPO_A)) return base(args);
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          settled = true;
          reject(new CollectorError('gh-failed'));
        });
      });
    };
    const h = clockedHarness(gh, 60_000, {
      guestRepos: [GUEST_REPO_A],
      readSessions: () => Promise.resolve(sessionsWithGuests(['idle'])),
    });
    signal = h.deps.signal;
    await runCollector([], h.deps);
    expect(h.deps.writes).toHaveLength(12);
    expect(snapshots(h.deps.writes).at(-1)?.guests).toEqual([null]);
    // The loop waited for the hung fetch to end on the stop, and logged nothing of it.
    expect(settled).toBe(true);
    expect(h.deps.errors).toEqual([]);
  });
});
