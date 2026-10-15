import { describe, expect, it } from 'vitest';
import { kingQuestsOf } from './kingQuests';

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
