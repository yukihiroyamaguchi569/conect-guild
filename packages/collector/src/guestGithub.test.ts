import { describe, expect, it } from 'vitest';
import { CollectorError } from './errors.ts';
import type { GhRunner } from './gh.ts';
import {
  buildGuestPart,
  fetchGuestGithub,
  GUEST_RECENT_WINDOW_MS,
  type RawGuestClosed,
  type RawGuestOpen,
} from './guestGithub.ts';

/** Issue #108: a guest's repository. Fictional repository and titles. */

const REPO = 'example-visitor/potion-shop';
const NOW = new Date('2026-10-14T00:00:00.000Z');
const WINDOW_START = new Date(NOW.getTime() - GUEST_RECENT_WINDOW_MS).toISOString();
const JUST_BEFORE = new Date(NOW.getTime() - GUEST_RECENT_WINDOW_MS - 1).toISOString();
const T = '2026-10-13T00:00:00Z';

const OPEN: RawGuestOpen = {
  number: 5,
  title: '薬草の在庫表',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: T,
  is_pull_request: false,
};

const COMPLETED: RawGuestClosed = {
  number: 3,
  title: '地図を描く',
  state_reason: 'completed',
  closed_at: T,
  merged_at: null,
  is_pull_request: false,
};
const MERGED: RawGuestClosed = {
  ...COMPLETED,
  number: 4,
  title: '値札を直す',
  state_reason: null,
  closed_at: '2026-10-12T00:00:00Z',
  merged_at: '2026-10-12T00:00:00Z',
  is_pull_request: true,
};

function lines(items: readonly unknown[]): string {
  return items.map((item) => `${JSON.stringify(item)}\n`).join('');
}

/** A gh that records its arguments and answers the open and closed lists. */
function guestGh(open: readonly unknown[], closed: readonly unknown[]) {
  const calls: (readonly string[])[] = [];
  const gh: GhRunner = (args) => {
    calls.push(args);
    const path = args.at(-1) ?? '';
    return Promise.resolve(lines(path.includes('state=open') ? open : closed));
  };
  return { gh, calls };
}

describe('fetchGuestGithub', () => {
  it('reads one projected page of each list: open, then closed since the window start', async () => {
    const { gh, calls } = guestGh([OPEN], [COMPLETED, MERGED]);
    await fetchGuestGithub(gh, REPO, NOW);
    expect(calls.map((args) => args.at(-1))).toEqual([
      `repos/${REPO}/issues?state=open&sort=updated&direction=desc&per_page=100`,
      `repos/${REPO}/issues?state=closed&since=${WINDOW_START}&sort=updated&direction=desc&per_page=100`,
    ]);
    for (const args of calls) {
      // One page only: exactly two calls per guest, however big the repository.
      expect(args).not.toContain('--paginate');
      expect(args.slice(0, 2)).toEqual(['api', '--jq']);
      const filter = args[2] ?? '';
      // Only the projected fields: never a body, labels, a branch or a user.
      expect(filter).not.toMatch(/body|labels|head|user|assignee/);
      expect(filter).toMatch(/^if type != "array"/);
    }
  });

  it('builds the part from both lists', async () => {
    const { gh } = guestGh([OPEN], [COMPLETED, MERGED]);
    await expect(fetchGuestGithub(gh, REPO, NOW)).resolves.toEqual({
      repo: REPO,
      fetchedAt: NOW.toISOString(),
      open: [
        { number: 5, title: '薬草の在庫表', isPr: false, createdAt: OPEN.created_at, updatedAt: T },
      ],
      recent: [
        { kind: 'issue-completed', number: 3, title: '地図を描く', at: T },
        { kind: 'pr-merged', number: 4, title: '値札を直す', at: '2026-10-12T00:00:00Z' },
      ],
    });
  });

  it.each([
    ['a body that slipped through', [{ ...OPEN, body: 'secret' }], []],
    ['a missing field', [{ ...OPEN, title: undefined }], []],
    ['a closed item with labels', [], [{ ...COMPLETED, labels: ['x'] }]],
  ])('fails validation for %s', async (_label, open, closed) => {
    const { gh } = guestGh(open, closed);
    await expect(fetchGuestGithub(gh, REPO, NOW)).rejects.toEqual(
      new CollectorError('validation-failed'),
    );
  });

  it('passes a gh failure on as gh-failed', async () => {
    const gh: GhRunner = () => Promise.reject(new CollectorError('gh-failed'));
    await expect(fetchGuestGithub(gh, REPO, NOW)).rejects.toEqual(new CollectorError('gh-failed'));
  });
});

describe('buildGuestPart: what counts as finished', () => {
  it.each([
    ['an Issue closed as not planned', { ...COMPLETED, state_reason: 'not_planned' }],
    ['an Issue closed as a duplicate', { ...COMPLETED, state_reason: 'duplicate' }],
    ['an Issue closed with no reason', { ...COMPLETED, state_reason: null }],
    ['a PR closed without merging', { ...MERGED, merged_at: null }],
  ])('leaves out %s', (_label, item) => {
    expect(buildGuestPart(REPO, NOW, [], [item]).recent).toEqual([]);
  });

  it('dates a merged PR by its merge, not its close', () => {
    const late = { ...MERGED, closed_at: T, merged_at: JUST_BEFORE };
    expect(buildGuestPart(REPO, NOW, [], [late]).recent).toEqual([]);
  });
});

describe('buildGuestPart: the 7-day window', () => {
  it('keeps what finished exactly at the window start, drops a millisecond before', () => {
    const atStart = { ...COMPLETED, number: 1, closed_at: WINDOW_START };
    const before = { ...COMPLETED, number: 2, closed_at: JUST_BEFORE };
    const mergedBefore = { ...MERGED, number: 6, merged_at: JUST_BEFORE };
    const recent = buildGuestPart(REPO, NOW, [], [atStart, before, mergedBefore]).recent;
    expect(recent.map((item) => item.number)).toEqual([1]);
  });

  it('keeps a time past now (the collector clock behind GitHub), like the company window', () => {
    const ahead = { ...COMPLETED, closed_at: new Date(NOW.getTime() + 60_000).toISOString() };
    expect(buildGuestPart(REPO, NOW, [], [ahead]).recent).toHaveLength(1);
  });

  it('keeps the 20 newest, newest first, the higher number first on a tie', () => {
    const closed = Array.from({ length: 25 }, (_, i) => ({
      ...COMPLETED,
      number: i + 1,
      closed_at: new Date(NOW.getTime() - (i % 12) * 60_000).toISOString(),
    }));
    const recent = buildGuestPart(REPO, NOW, [], closed).recent;
    expect(recent).toHaveLength(20);
    expect(recent.slice(0, 4).map((item) => item.number)).toEqual([25, 13, 1, 14]);
    const times = recent.map((item) => Date.parse(item.at));
    expect(times).toEqual(times.toSorted((a, b) => b - a));
  });
});

describe('buildGuestPart: repeated items', () => {
  it('keeps the copy read last of a repeated open or closed item', () => {
    const open = [OPEN, { ...OPEN, number: 9 }, { ...OPEN, title: '新しい題名' }];
    const part = buildGuestPart(REPO, NOW, open, [COMPLETED, { ...COMPLETED, title: '後の題名' }]);
    expect(part.open.map((item) => [item.number, item.title])).toEqual([
      [9, '薬草の在庫表'],
      [5, '新しい題名'],
    ]);
    expect(part.recent.map((item) => item.title)).toEqual(['後の題名']);
  });

  it('keeps at most one page of open items, the most recently updated first', () => {
    const open = Array.from({ length: 130 }, (_, i) => ({
      ...OPEN,
      number: i + 1,
      updated_at: new Date(NOW.getTime() - (i % 50) * 60_000).toISOString(),
    }));
    const items = buildGuestPart(REPO, NOW, open, []).open;
    expect(items).toHaveLength(100);
    expect(items.slice(0, 3).map((item) => item.number)).toEqual([101, 51, 1]);
    const times = items.map((item) => Date.parse(item.updatedAt));
    expect(times).toEqual(times.toSorted((a, b) => b - a));
  });

  it('marks open PRs', () => {
    const part = buildGuestPart(REPO, NOW, [{ ...OPEN, is_pull_request: true }], []);
    expect(part.open[0]?.isPr).toBe(true);
  });
});
