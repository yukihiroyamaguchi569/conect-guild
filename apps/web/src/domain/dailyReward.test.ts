import { describe, expect, it } from 'vitest';
import {
  dayRandom,
  deliveryOf,
  NO_REWARD_WATCH,
  REWARD_KINDS,
  rewardAt,
  rewardMessage,
  topClearer,
  watchReward,
} from './dailyReward';
import { closedIssue, issue, mergedPr } from './fixtures.test-util';

/** The king's reward of the day (Issue #194). Times are local, as the screen reads them. */

/** Epoch ms of 2026-10-12 (local) at `hour`:`minute`. */
const local = (hour: number, minute = 0, second = 0): number =>
  new Date(2026, 9, 12, hour, minute, second).getTime();
const iso = (hour: number, minute = 0): string => new Date(local(hour, minute)).toISOString();
const snapshotOf = (
  issues: ReturnType<typeof issue>[],
  prs: ReturnType<typeof mergedPr>[] = [],
) => ({
  issues,
  prs,
});
const first = () => 0;

describe('deliveryOf', () => {
  it('is 17:00 of the local day', () => {
    expect(deliveryOf(local(0, 0))).toBe(local(17));
    expect(deliveryOf(local(23, 59, 59))).toBe(local(17));
  });
});

describe('topClearer', () => {
  const day = [local(0), local(17)] as const;

  it('finds the department that cleared the most', () => {
    const snapshot = snapshotOf([
      closedIssue(1, iso(9), ['経理']),
      closedIssue(2, iso(10), ['総務']),
      closedIssue(3, iso(11), ['総務']),
    ]);
    expect(topClearer(snapshot, ...day)).toBe('総務');
  });

  it('gives a tie to the one who reached the count first', () => {
    const snapshot = snapshotOf([
      closedIssue(1, iso(9), ['総務']),
      closedIssue(2, iso(10), ['経理']),
      closedIssue(3, iso(11), ['経理']),
      closedIssue(4, iso(12), ['総務']),
    ]);
    expect(topClearer(snapshot, ...day)).toBe('経理');
  });

  it('gives a tie at the same moment to the settings’ order', () => {
    const snapshot = snapshotOf([
      closedIssue(1, iso(9), ['総務']),
      closedIssue(2, iso(9), ['広報']),
    ]);
    expect(topClearer(snapshot, ...day)).toBe('広報');
  });

  it('counts the day from midnight until 17:00 only', () => {
    const snapshot = snapshotOf([
      closedIssue(1, new Date(local(0) - 1).toISOString(), ['経理']),
      closedIssue(2, iso(17), ['経理']),
      closedIssue(3, iso(16, 59), ['広報']),
    ]);
    expect(topClearer(snapshot, ...day)).toBe('広報');
  });

  it('counts no one with no clear, the reception’s or open Issues', () => {
    expect(topClearer(snapshotOf([]), ...day)).toBeNull();
    const snapshot = snapshotOf([
      closedIssue(1, iso(9)),
      issue(2, { labels: ['経理'], closedAt: iso(9) }),
    ]);
    expect(topClearer(snapshot, ...day)).toBeNull();
  });

  it('counts a clear where its desk does: by a merged PR’s branch when it has no label', () => {
    const snapshot = snapshotOf(
      [closedIssue(1, iso(9))],
      [mergedPr(5, iso(9), { linkedIssues: [1], headRef: 'general-affairs/fix' })],
    );
    expect(topClearer(snapshot, ...day)).toBe('総務');
  });
});

describe('rewardAt', () => {
  const snapshot = snapshotOf([closedIssue(1, iso(9), ['総務'])]);

  it('is none before 17:00 and on the desk from 17:00 to the end of the day', () => {
    expect(rewardAt(snapshot, local(16, 59, 59), first)).toBeNull();
    expect(rewardAt(snapshot, local(17), first)).toEqual({
      department: '総務',
      member: 'sasae',
      kind: 'onigiri',
    });
    expect(rewardAt(snapshot, local(23, 59, 59), first)?.member).toBe('sasae');
  });

  it('is gone the next day', () => {
    const tomorrow = new Date(2026, 9, 13, 18).getTime();
    expect(rewardAt(snapshot, tomorrow, first)).toBeNull();
  });

  it('is none when nobody cleared a quest that day', () => {
    expect(rewardAt(snapshotOf([]), local(18), first)).toBeNull();
  });

  it('picks the kind with the random number, evenly', () => {
    const kinds = [0, 0.34, 0.67, 0.9999].map((r) => rewardAt(snapshot, local(18), () => r)?.kind);
    expect(kinds).toEqual(['onigiri', 'dango', 'medal', 'medal']);
  });
});

describe('dayRandom', () => {
  it('is the same all day and in [0, 1)', () => {
    const morning = dayRandom(local(0))();
    expect(dayRandom(local(23, 59))()).toBe(morning);
    expect(morning).toBeGreaterThanOrEqual(0);
    expect(morning).toBeLessThan(1);
  });

  it('gives every kind over a month of days', () => {
    const kinds = new Set(
      Array.from({ length: 30 }, (_, i) => {
        const r = dayRandom(new Date(2026, 9, i + 1, 12).getTime())();
        return REWARD_KINDS[Math.floor(r * REWARD_KINDS.length)];
      }),
    );
    expect(kinds.size).toBe(REWARD_KINDS.length);
  });
});

// The fetches of the watch: #1 (経理) cleared at 9:00.
const cleared = [closedIssue(1, iso(9), ['経理'])];
const fetched = (when: number, issues = cleared) => ({
  ...snapshotOf(issues),
  fetchedAt: new Date(when).toISOString(),
});
/**
 * Each fetch in turn from no watch, seen when it was fetched: what was told at each, and the
 * reward kept at the end.
 */
function run(...fetches: ReturnType<typeof fetched>[]) {
  return runSeen(
    ...fetches.map((snapshot) => ({ snapshot, seenAt: Date.parse(snapshot.fetchedAt) })),
  );
}
function runSeen(...fetches: { snapshot: ReturnType<typeof fetched>; seenAt: number }[]) {
  let watch = NO_REWARD_WATCH;
  const told = fetches.map(({ snapshot, seenAt }) => {
    const next = watchReward(watch, snapshot, seenAt);
    watch = next.watch;
    return next.told?.member ?? null;
  });
  return { told, kept: watch.kept };
}

describe('watchReward', () => {
  it('tells the reward once, at the first fetch from 17:00, and keeps it until midnight', () => {
    const { told, kept } = run(fetched(local(16, 59)), fetched(local(17)), fetched(local(17, 1)));
    expect(told).toEqual([null, 'minori', null]);
    expect(kept).toMatchObject({ member: 'minori', delivery: local(17) });
    expect(kept?.until).toBe(new Date(2026, 9, 13).getTime());
  });

  it('keeps nothing before 17:00, and tells nothing to a screen opened after it', () => {
    expect(run(fetched(local(16, 59))).kept).toBeNull();
    const late = run(fetched(local(18)), fetched(local(18, 1)));
    expect(late.told).toEqual([null, null]);
    expect(late.kept?.member).toBe('minori');
  });
});

describe('watchReward: late data, a late screen, the next day', () => {
  it('keeps the reward of the day when a clear is reopened after 17:00', () => {
    const reopened = [issue(1, { labels: ['経理'] })];
    const { told, kept } = run(
      fetched(local(16)),
      fetched(local(17)),
      fetched(local(18), reopened),
    );
    expect(told).toEqual([null, 'minori', null]);
    expect(kept?.member).toBe('minori');
  });

  it('tells a reward late when the clear before 17:00 reaches the screen late', () => {
    const { told } = run(fetched(local(16), []), fetched(local(17), []), fetched(local(17, 5)));
    expect(told).toEqual([null, null, 'minori']);
  });

  it('tells nothing to a screen opened after 17:00 on a fetch from before it', () => {
    const { told, kept } = runSeen(
      { snapshot: fetched(local(16, 50)), seenAt: local(18) },
      { snapshot: fetched(local(18, 1)), seenAt: local(18, 1) },
    );
    expect(told).toEqual([null, null]);
    expect(kept?.member).toBe('minori');
  });
});

describe('watchReward: days over', () => {
  it('tells nothing when the fetch reaches the screen after the day was over', () => {
    const nextMorning = new Date(2026, 9, 13, 8).getTime();
    const { told, kept } = runSeen(
      { snapshot: fetched(local(16)), seenAt: local(16) },
      { snapshot: fetched(local(17)), seenAt: nextMorning },
    );
    expect(told).toEqual([null, null]);
    expect(kept).toBeNull();
  });

  it('keeps the new day’s reward when the day before’s snapshot comes late', () => {
    const tomorrow = (hour: number) => new Date(2026, 9, 13, hour).getTime();
    const nextDay = fetched(tomorrow(18), [
      closedIssue(2, new Date(tomorrow(9)).toISOString(), ['総務']),
    ]);
    const { kept } = runSeen(
      { snapshot: nextDay, seenAt: tomorrow(18) },
      { snapshot: fetched(local(18)), seenAt: tomorrow(18) + 1 },
    );
    expect(kept?.member).toBe('sasae');
  });

  it('keeps the day’s reward when an older snapshot comes later that day', () => {
    const { told, kept } = runSeen(
      { snapshot: fetched(local(16)), seenAt: local(16) },
      { snapshot: fetched(local(17)), seenAt: local(17) },
      { snapshot: fetched(local(16, 30)), seenAt: local(17, 1) },
      { snapshot: fetched(local(17, 2), []), seenAt: local(17, 2) },
    );
    expect(told).toEqual([null, 'minori', null, null]);
    expect(kept?.member).toBe('minori');
  });

  it('clears the desk at the next day’s first fetch', () => {
    const tomorrow = new Date(2026, 9, 13, 9).getTime();
    expect(run(fetched(local(18)), fetched(tomorrow)).kept).toBeNull();
  });

  it('keeps nothing when nobody cleared a quest that day', () => {
    expect(run(fetched(local(16), []), fetched(local(18), [])).kept).toBeNull();
  });
});

describe('rewardMessage', () => {
  it('names the member and the reward, never a title', () => {
    expect(rewardMessage({ department: '総務', member: 'sasae', kind: 'onigiri' })).toBe(
      'おうさまから ささえに ほうびの おにぎりが とどいた！',
    );
    expect(rewardMessage({ department: '経理', member: 'minori', kind: 'medal' })).toBe(
      'おうさまから みのりに ほうびの くんしょうが とどいた！',
    );
  });
});
