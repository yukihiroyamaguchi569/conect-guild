import { collectorStatusSchema, type CollectorStatus } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { CollectorError } from './errors.ts';
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
 * Issue #94: the suspected mix-ups in the collector's loop and --once, with guild.settings.json
 * (pr/ is 広報, departments[1]; planning/ is 企画, departments[2]). All values are fictional.
 */

const MINUTE_MS = 60_000;
const AT = '2026-10-12T00:00:00.000Z';
const SECRET_TITLE = 'Fictional client contract';
const SECRET_BRANCH = 'pr/fictional-client';
const DEPARTMENT_LABELS = ['経理', '広報', '企画', '総務'];

function lines(items: readonly unknown[]): string {
  return items.map((item) => `${JSON.stringify(item)}\n`).join('');
}

function issue(number: number, label: string): object {
  return {
    number,
    title: SECRET_TITLE,
    state: 'open',
    state_reason: null,
    labels: [label],
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    closed_at: null,
    is_pull_request: false,
  };
}

function mergedPr(number: number, branch: string, issueNumber: number): object {
  return {
    number,
    title: SECRET_TITLE,
    body: `Closes #${String(issueNumber)}`,
    state: 'closed',
    merged_at: '2026-10-10T00:00:00Z',
    closed_at: '2026-10-10T00:00:00Z',
    head_ref: branch,
  };
}

const ISSUES = lines([issue(1, '企画'), issue(2, '広報')]);
/** Three PRs on 広報's prefix tied to a 企画 Issue, and three the other way round. */
const SWAPPED_PRS = lines([
  ...[10, 11, 12].map((n) => mergedPr(n, `${SECRET_BRANCH}-${String(n)}`, 1)),
  ...[13, 14, 15].map((n) => mergedPr(n, `planning/fictional-${String(n)}`, 2)),
]);
/** The same PRs, each tied to its own department's Issue. */
const MATCHED_PRS = lines([
  ...[10, 11, 12].map((n) => mergedPr(n, `${SECRET_BRANCH}-${String(n)}`, 2)),
  ...[13, 14, 15].map((n) => mergedPr(n, `planning/fictional-${String(n)}`, 1)),
]);

const LABELS = lines(DEPARTMENT_LABELS);

function parsed(statuses: readonly string[]): CollectorStatus[] {
  return statuses.map((s) => collectorStatusSchema.parse(JSON.parse(s)));
}

function expectNoSecrets(output: readonly string[]): void {
  const text = output.join('\n');
  for (const secret of [SECRET_TITLE, SECRET_BRANCH, 'planning/', ...DEPARTMENT_LABELS])
    expect(text).not.toContain(secret);
}

/** A gh whose PR list is whatever `prs()` says at the time of the call. */
function ghWithPrs(prs: () => string | Error): GhRunner {
  const base = fakeGh({
    'issues?state=all': ISSUES,
    labels: LABELS,
    [TOTALS_KEY]: totalsLine(2, 6),
  });
  return (args) => {
    if (!(args.at(-1) ?? '').includes('pulls?state=all')) return base(args);
    const answer = prs();
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
}

const SWAP_LINE =
  'mixups suspected: departments[1] と departments[2] が入れ替わっているかもしれない（直近 30 日のマージ: departments[1] の接頭辞の PR 3/3 件が departments[2] のラベルの Issue、departments[2] の接頭辞の PR 3/3 件が departments[1] のラベルの Issue）';

describe('runCollector --once: suspected mix-ups', () => {
  it('writes the positions in the status and logs the counts, without names', async () => {
    const deps = harness(ghWithPrs(() => SWAPPED_PRS));
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    expect(parsed(deps.statuses)).toEqual([
      {
        ok: true,
        attemptedAt: AT,
        suspectedMixups: [
          { from: 1, to: 2 },
          { from: 2, to: 1 },
        ],
      },
    ]);
    expect(deps.errors[0]).toBe(`[collector] ${AT} ${SWAP_LINE}`);
    expect(deps.errors[1]).toContain('次にやること: ');
    expectNoSecrets([...deps.logs, ...deps.errors, ...deps.statuses]);
  });

  it('says nothing of mix-ups when there is none', async () => {
    const deps = harness(ghWithPrs(() => MATCHED_PRS));
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    expect(parsed(deps.statuses)).toEqual([{ ok: true, attemptedAt: AT }]);
    expect([...deps.logs, ...deps.errors].join('\n')).not.toContain('mixups');
  });

  it('says nothing of mix-ups when GitHub fails', async () => {
    const deps = harness(ghWithPrs(() => new CollectorError('gh-failed')));
    await expect(runCollector(['--once'], deps)).resolves.toBe(1);
    expect(parsed(deps.statuses)).toEqual([{ ok: false, attemptedAt: AT, kind: 'gh-failed' }]);
  });
});

describe('runCollector loop: suspected mix-ups', () => {
  it('logs a finding once, not on every fetch, and keeps it in the status', async () => {
    const { deps } = clockedHarness(
      ghWithPrs(() => SWAPPED_PRS),
      3 * MINUTE_MS,
    );
    await runCollector([], deps);
    expect(deps.errors.filter((l) => l.includes('mixups'))).toEqual([
      `[collector] ${AT} ${SWAP_LINE}`,
    ]);
    expect(parsed(deps.statuses).at(-1)).toEqual({
      ok: true,
      attemptedAt: '2026-10-12T00:02:00.000Z',
      suspectedMixups: [
        { from: 1, to: 2 },
        { from: 2, to: 1 },
      ],
    });
    expectNoSecrets([...deps.logs, ...deps.errors, ...deps.statuses]);
  });

  it('logs nothing at the start when nothing is suspected', async () => {
    const { deps } = clockedHarness(
      ghWithPrs(() => MATCHED_PRS),
      2 * MINUTE_MS,
    );
    await runCollector([], deps);
    expect([...deps.logs, ...deps.errors].join('\n')).not.toContain('mixups');
    expect(parsed(deps.statuses).every((s) => s.suspectedMixups === undefined)).toBe(true);
  });

  it('keeps the last finding through a failed fetch, and drops it once fixed', async () => {
    const answers: (string | Error)[] = [
      SWAPPED_PRS,
      new CollectorError('gh-failed'),
      MATCHED_PRS,
      MATCHED_PRS,
    ];
    let fetches = 0;
    const gh = ghWithPrs(() => answers[Math.min(fetches++, answers.length - 1)] ?? MATCHED_PRS);
    const { deps } = clockedHarness(gh, 4 * MINUTE_MS);
    await runCollector([], deps);
    const statuses = parsed(deps.statuses);
    const at = (minute: number): CollectorStatus | undefined =>
      statuses.find((s) => s.attemptedAt === `2026-10-12T00:0${String(minute)}:00.000Z`);
    expect(at(0)?.suspectedMixups).toHaveLength(2);
    expect(at(1)).toMatchObject({ ok: false, kind: 'gh-failed', suspectedMixups: [{}, {}] });
    expect(at(2)).toEqual({ ok: true, attemptedAt: '2026-10-12T00:02:00.000Z' });
    expect(deps.logs).toContain('[collector] 2026-10-12T00:02:00.000Z mixups ok');
    expect(deps.logs.filter((l) => l.includes('mixups'))).toHaveLength(1);
  });
});
