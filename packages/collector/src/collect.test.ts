import { describe, expect, it } from 'vitest';
import { CHANGED_FILES_CONCURRENCY, collectSnapshot } from './collect.ts';
import type { GhRunner } from './gh.ts';

const REPO = 'owner/repo';
const OPEN_PR_COUNT = 30;

function openPr(number: number): object {
  return {
    number,
    title: 'PR',
    body: null,
    state: 'open',
    merged_at: null,
    closed_at: null,
    head_ref: 'b',
  };
}

function openIssue(number: number): object {
  return {
    number,
    title: 'Issue',
    state: 'open',
    state_reason: null,
    labels: [],
    created_at: '2026-10-11T00:00:00Z',
    updated_at: '2026-10-11T00:00:00Z',
    closed_at: null,
    is_pull_request: false,
  };
}

/** What `gh api --jq '... | @json'` prints: one JSON value per line. */
function lines(items: readonly unknown[]): string {
  return items.map((item) => `${JSON.stringify(item)}\n`).join('');
}

describe('collectSnapshot', () => {
  it(`fetches changed files with at most ${String(CHANGED_FILES_CONCURRENCY)} gh processes at once`, async () => {
    let inFlight = 0;
    let peak = 0;
    let fileCalls = 0;
    const gh: GhRunner = async (args) => {
      const path = args.at(-1) ?? '';
      if (path.includes('pulls?state=all')) {
        return lines(Array.from({ length: OPEN_PR_COUNT }, (_, i) => openPr(i + 1)));
      }
      if (!path.includes('/files')) return '';
      fileCalls += 1;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      return lines(['a.md']);
    };
    const { part: snapshot } = await collectSnapshot(
      gh,
      REPO,
      new Date('2026-10-12T00:00:00.000Z'),
      [],
    );
    expect(fileCalls).toBe(OPEN_PR_COUNT);
    expect(peak).toBe(CHANGED_FILES_CONCURRENCY);
    expect(snapshot.prs.every((pr) => pr.changedFiles.length === 1)).toBe(true);
  });

  it('returns a failure only after every running gh call has finished', async () => {
    let inFlight = 0;
    const gh: GhRunner = async (args) => {
      const path = args.at(-1) ?? '';
      inFlight += 1;
      try {
        if (path.includes('issues?state=all')) throw new Error('gh failed');
        for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
        return '';
      } finally {
        inFlight -= 1;
      }
    };
    await expect(
      collectSnapshot(gh, REPO, new Date('2026-10-12T00:00:00.000Z'), []),
    ).rejects.toThrow('gh failed');
    expect(inFlight).toBe(0);
  });
});

describe('collectSnapshot: order of the lists', () => {
  it('waits for the PR list before reading the Issues, so an Issue created in between keeps its link', async () => {
    const calls: string[] = [];
    // The PR list answers only when released by hand; Issue #2 is created after that answer.
    const prList = Promise.withResolvers<string>();
    let issueTwoExists = false;
    const gh: GhRunner = async (args) => {
      const path = args.at(-1) ?? '';
      if (path.includes('pulls?state=all')) {
        calls.push('prs');
        return prList.promise;
      }
      if (path.includes('issues?state=all')) {
        calls.push('issues');
        return lines(issueTwoExists ? [openIssue(2), openIssue(1)] : [openIssue(1)]);
      }
      await Promise.resolve();
      return '';
    };
    const run = collectSnapshot(gh, REPO, new Date('2026-10-12T00:00:00.000Z'), []);
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls).toEqual(['prs']);
    prList.resolve(lines([{ ...openPr(10), body: 'Closes #2' }]));
    issueTwoExists = true;
    const { part: snapshot } = await run;
    expect(calls).toEqual(['prs', 'issues']);
    expect(snapshot.prs.map((pr) => pr.linkedIssues)).toEqual([[2]]);
  });
});
