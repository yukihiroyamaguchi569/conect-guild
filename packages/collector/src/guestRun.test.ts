import { describe, expect, it } from 'vitest';
import { guestsSummary, isGuestFetchDue } from './guestRun.ts';

const SCHEDULE = { intervalMs: 300_000, offsetMs: 20_000 };

describe('isGuestFetchDue', () => {
  it.each([
    [0, 19_999, false],
    [0, 20_000, true],
    [1, 39_999, false],
    [1, 40_000, true],
  ])('first fetch of guest %i at %i ms: %s', (index, now, due) => {
    expect(isGuestFetchDue({ index, startedAt: 0, lastAttemptAt: null }, now, SCHEDULE)).toBe(due);
  });

  it('counts the first fetch from the loop start', () => {
    const timing = { index: 0, startedAt: 1_000_000, lastAttemptAt: null };
    expect(isGuestFetchDue(timing, 1_019_999, SCHEDULE)).toBe(false);
    expect(isGuestFetchDue(timing, 1_020_000, SCHEDULE)).toBe(true);
  });

  it('is due again a whole interval after the last attempt, whatever the position', () => {
    for (const index of [0, 1]) {
      const timing = { index, startedAt: 0, lastAttemptAt: 40_000 };
      expect(isGuestFetchDue(timing, 339_999, SCHEDULE)).toBe(false);
      expect(isGuestFetchDue(timing, 340_000, SCHEDULE)).toBe(true);
    }
  });
});

describe('guestsSummary', () => {
  const part = { repo: 'a/b', fetchedAt: '2026-10-12T00:00:00Z', open: [], recent: [] };
  const ok = { ok: true, part } as const;
  const failed = { ok: false, kind: 'gh-failed' } as const;

  it('counts the guests with a repository only', () => {
    expect(guestsSummary([ok, ok])).toBe('guests: 2 ok');
    expect(guestsSummary([null, ok])).toBe('guests: 1 ok');
    expect(guestsSummary([failed, ok])).toBe('guests: 1 ok, 1 failed');
    expect(guestsSummary([failed])).toBe('guests: 0 ok, 1 failed');
  });

  it('says nothing without a guest repository', () => {
    expect(guestsSummary([])).toBeNull();
    expect(guestsSummary([null, null])).toBeNull();
  });
});
