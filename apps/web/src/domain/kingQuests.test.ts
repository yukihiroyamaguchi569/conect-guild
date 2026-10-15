import { describe, expect, it } from 'vitest';
import { kingQuestChanges, kingQuestNumbers, kingQuestsOf } from './kingQuests';

const PRESIDENT = {
  issues: [
    { number: 3, title: '架空の勅命 A', updatedAt: '2026-10-12T01:00:00.000Z' },
    { number: 9, title: '架空の勅命 B', updatedAt: '2026-10-12T03:00:00.000Z' },
    { number: 5, title: '架空の勅命 C', updatedAt: '2026-10-12T02:00:00.000Z' },
  ],
};

describe('kingQuestsOf', () => {
  it('lists the king’s quests, the most recently updated first', () => {
    expect(kingQuestsOf(PRESIDENT, true)).toEqual([
      { number: 9, title: '架空の勅命 B' },
      { number: 5, title: '架空の勅命 C' },
      { number: 3, title: '架空の勅命 A' },
    ]);
  });

  it('has none without president in the settings or in the snapshot', () => {
    expect(kingQuestsOf(PRESIDENT, false)).toEqual([]);
    expect(kingQuestsOf(undefined, true)).toEqual([]);
    expect(kingQuestsOf({ issues: [] }, true)).toEqual([]);
  });
});

describe('kingQuestNumbers (Issue #142)', () => {
  it('keeps the numbers only, ascending', () => {
    expect(kingQuestNumbers(PRESIDENT, true)).toEqual([3, 5, 9]);
    expect(kingQuestNumbers({ issues: [] }, true)).toEqual([]);
  });

  it('is unknown without president in the settings or in the snapshot', () => {
    expect(kingQuestNumbers(PRESIDENT, false)).toBeUndefined();
    expect(kingQuestNumbers(undefined, true)).toBeUndefined();
  });
});

describe('kingQuestChanges (Issue #142)', () => {
  it('tells the numbers that appeared and those that went away, ascending', () => {
    expect(kingQuestChanges([3, 9], [12, 3, 10])).toEqual({ opened: [10, 12], cleared: [9] });
  });

  it('tells nothing when nothing changed', () => {
    expect(kingQuestChanges([3, 9], [9, 3])).toEqual({ opened: [], cleared: [] });
    expect(kingQuestChanges([], [])).toEqual({ opened: [], cleared: [] });
  });

  it('tells every quest from none, and every clear down to none', () => {
    expect(kingQuestChanges([], [4, 2])).toEqual({ opened: [2, 4], cleared: [] });
    expect(kingQuestChanges([4, 2], [])).toEqual({ opened: [], cleared: [2, 4] });
  });

  it('tells nothing while either side is unknown', () => {
    expect(kingQuestChanges(undefined, [1])).toEqual({ opened: [], cleared: [] });
    expect(kingQuestChanges([1], undefined)).toEqual({ opened: [], cleared: [] });
  });
});
