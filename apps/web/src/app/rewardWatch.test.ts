import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createKeyValueStore, createMemoryStorage } from '../adapters/storage';
import { closedIssue, issue, snapshot } from '../domain/fixtures.test-util';
import { createRewardWatch, REWARD_STORAGE_KEY } from './rewardWatch';

/** The reward of the day told once when it comes (Issue #194). Times are local. */

const local = (hour: number, minute = 0): string =>
  new Date(2026, 9, 12, hour, minute).toISOString();
const at = (hour: number, minute = 0): number => new Date(2026, 9, 12, hour, minute).getTime();
const memory = () => {
  const storage = createMemoryStorage();
  return createKeyValueStore(() => storage);
};
const fetchedAt = (hour: number, minute = 0) =>
  snapshot({ fetchedAt: local(hour, minute), issues: [closedIssue(1, local(9), ['総務'])] });

describe('createRewardWatch', () => {
  it('tells the reward once, on the first fetch after 17:00', () => {
    const watch = createRewardWatch(memory(), at(16));
    expect(watch.observe(fetchedAt(16, 59), at(16, 59))).toEqual([]);
    expect(watch.reward.value).toBeNull();
    const [entry, ...rest] = watch.observe(fetchedAt(17, 0), at(17, 0));
    expect(rest).toEqual([]);
    expect(entry?.event).toBeNull();
    // Dropped unshown if its turn comes after midnight.
    expect(entry?.until).toBe(new Date(2026, 9, 13).getTime());
    expect(entry?.text).toMatch(
      /^おうさまから ささえに ほうびの (おにぎり|おだんご|くんしょう)が とどいた！$/u,
    );
    expect(watch.observe(fetchedAt(17, 1), at(17, 1))).toEqual([]);
    expect(watch.reward.value?.member).toBe('sasae');
  });

  it('tells nothing when the screen opens after 17:00: the reward is on the desk already', () => {
    const watch = createRewardWatch(memory(), at(16));
    expect(watch.observe(fetchedAt(18), at(18))).toEqual([]);
    expect(watch.observe(fetchedAt(18, 1), at(18, 1))).toEqual([]);
    expect(watch.reward.value?.member).toBe('sasae');
  });

  it('keeps the reward of the day for a screen opened again, whatever the snapshot says by then', () => {
    const storage = memory();
    createRewardWatch(storage, at(16)).observe(fetchedAt(17), at(17));
    expect(storage.read(REWARD_STORAGE_KEY, z.unknown())).toMatchObject({
      ok: true,
      value: { desk: 3, delivery: at(17) },
    });
    // #1 reopened at 17:30; the screen is opened again at 18:00.
    const again = createRewardWatch(storage, at(18));
    const reopened = snapshot({ fetchedAt: local(18), issues: [issue(1, { labels: ['総務'] })] });
    expect(again.observe(reopened, at(18))).toEqual([]);
    expect(again.reward.value?.member).toBe('sasae');
  });

  it('forgets a kept reward of another day', () => {
    const storage = memory();
    createRewardWatch(storage, at(16)).observe(fetchedAt(17), at(17));
    const nextDay = createRewardWatch(storage, new Date(2026, 9, 13, 18).getTime());
    const tomorrow = new Date(2026, 9, 13, 18).toISOString();
    nextDay.observe(snapshot({ fetchedAt: tomorrow, issues: [] }), Date.parse(tomorrow));
    expect(nextDay.reward.value).toBeNull();
  });

  it('puts the kept reward on the desk at once, before any fetch, while its day lasts', () => {
    const storage = memory();
    createRewardWatch(storage, at(16)).observe(fetchedAt(17), at(17));
    expect(createRewardWatch(storage, at(19)).reward.value?.member).toBe('sasae');
    expect(createRewardWatch(storage, at(16)).reward.value).toBeNull();
    const nextDay = new Date(2026, 9, 13, 9).getTime();
    expect(createRewardWatch(storage, nextDay).reward.value).toBeNull();
  });
});
