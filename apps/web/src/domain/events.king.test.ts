import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@conect-guild/snapshot';
import { parseBaseline, toBaseline, type Baseline } from './baseline';
import { diffSnapshot, type DiffResult } from './events';
import { closedIssue, issue, minutesAfter, snapshot, T0 } from './fixtures.test-util';
import { diffMessages, eventMessage } from './message';

/** Issue #142: the king's quests that appeared or went away between two fetches. */

const T1 = minutesAfter(T0, 1);

function president(...numbers: number[]): NonNullable<Snapshot['president']> {
  return {
    issues: numbers.map((number) => ({
      number,
      title: `架空の勅命 ${String(number)}`,
      updatedAt: T0,
    })),
  };
}

function baselineOf(over: Partial<Snapshot>, kingQuests = true): Baseline {
  return toBaseline(snapshot({ fetchedAt: T0, ...over }), kingQuests);
}

const ids = (result: DiffResult) => result.events.map((event) => event.id);

describe('toBaseline / parseBaseline: the king’s quests', () => {
  it('keeps the numbers only, and none without president in the settings or the snapshot', () => {
    expect(baselineOf({ president: president(9, 3) }).king).toEqual([3, 9]);
    expect(baselineOf({ president: president(9, 3) }, false)).not.toHaveProperty('king');
    expect(baselineOf({})).not.toHaveProperty('king');
  });

  it('reads a baseline with and without them, but not with a malformed list', () => {
    const base = baselineOf({ president: president(3) });
    expect(parseBaseline(JSON.parse(JSON.stringify(base)))).toEqual(base);
    expect(parseBaseline(baselineOf({}))).not.toBeNull();
    expect(parseBaseline({ ...base, king: [0] })).toBeNull();
    expect(parseBaseline({ ...base, king: ['3'] })).toBeNull();
  });
});

describe('diffSnapshot: the king’s quests', () => {
  it('tells a new one as opened and a gone one as cleared, after the Issue events', () => {
    const base = baselineOf({ issues: [issue(1)], president: president(3, 5) });
    const next = snapshot({
      fetchedAt: T1,
      issues: [closedIssue(1, T1)],
      president: president(5, 8, 7),
    });
    const result = diffSnapshot(base, next, undefined, true);
    expect(ids(result)).toEqual([
      'issue-closed#1',
      'king-quest-opened#7',
      'king-quest-opened#8',
      'king-quest-cleared#3',
    ]);
    expect(result.events.filter((e) => e.kind.startsWith('king')).map((e) => e.department)).toEqual(
      [null, null, null],
    );
    expect(result.baselineUpdate).toEqual({
      action: 'replace',
      baseline: toBaseline(next, true),
    });
  });

  it('tells nothing for the same quests, and nothing twice', () => {
    const base = baselineOf({ president: president(3) });
    const next = snapshot({ fetchedAt: T1, president: president(3, 4) });
    const first = diffSnapshot(base, next, undefined, true);
    expect(ids(first)).toEqual(['king-quest-opened#4']);
    if (first.baselineUpdate.action !== 'replace') throw new Error('not replaced');
    const again = snapshot({ fetchedAt: minutesAfter(T0, 2), president: president(3, 4) });
    expect(diffSnapshot(first.baselineUpdate.baseline, again, undefined, true).events).toEqual([]);
  });

  it('tells nothing from a baseline without them (stored before, or no president then)', () => {
    const base = baselineOf({});
    const next = snapshot({ fetchedAt: T1, president: president(3) });
    const result = diffSnapshot(base, next, undefined, true);
    expect(result.events).toEqual([]);
    expect(result.baselineUpdate).toEqual({ action: 'replace', baseline: toBaseline(next, true) });
  });

  it('tells nothing without president in the settings, or in the new snapshot', () => {
    const base = baselineOf({ president: president(3) });
    expect(
      diffSnapshot(base, snapshot({ fetchedAt: T1, president: president(4) }), undefined, false)
        .events,
    ).toEqual([]);
    expect(diffSnapshot(base, snapshot({ fetchedAt: T1 }), undefined, true).events).toEqual([]);
  });

  it('tells nothing on the first load, a rewind or after a long gap', () => {
    const next = snapshot({ fetchedAt: T1, president: president(4) });
    expect(diffSnapshot(null, next, undefined, true).events).toEqual([]);
    const base = baselineOf({ president: president(3) });
    const old = snapshot({ fetchedAt: T0, president: president(4) });
    expect(diffSnapshot(base, old, undefined, true).events).toEqual([]);
    const late = snapshot({
      fetchedAt: minutesAfter(T0, 7 * 24 * 60 + 1),
      president: president(4),
    });
    expect(diffSnapshot(base, late, undefined, true).events).toEqual([]);
  });
});

describe('eventMessage: the king’s quests', () => {
  it('says the scroll reached the king, with its title, and the clear without one', () => {
    const base = baselineOf({ president: president(3) });
    const next = snapshot({ fetchedAt: T1, president: president(4) });
    const result = diffSnapshot(base, next, undefined, true);
    expect(diffMessages(result, next)).toEqual([
      'おうさまに クエスト#4「架空の勅命 4」が とどいた！',
      'おうさまは クエスト#3 を クリアした！',
    ]);
  });

  it('leaves the title out when it is not in the snapshot', () => {
    const opened = {
      id: 'king-quest-opened#4',
      kind: 'king-quest-opened',
      number: 4,
      department: null,
    } as const;
    expect(eventMessage(opened, snapshot())).toBe('おうさまに クエスト#4 が とどいた！');
    // A department Issue with the same number is not the king's.
    expect(eventMessage(opened, snapshot({ issues: [issue(4)] }))).toBe(
      'おうさまに クエスト#4 が とどいた！',
    );
  });
});
