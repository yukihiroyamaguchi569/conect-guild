import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@conect-guild/snapshot';
import { GUILD_SETTINGS } from '@conect-guild/snapshot/settings';
import { LEVEL_MEMBER_IDS, type DepartmentLabel } from '../guild.config';
import { CREW_FINGERPRINT, crewFingerprint, parseBaseline, toBaseline } from './baseline';
import { diffSnapshot } from './events';
import { closedIssue, issue, minutesAfter, snapshot, T0 } from './fixtures.test-util';
import { levelUps, memberLevels } from './levelUp';

/**
 * The levels when the department → member mapping changes (Issue #18): the baseline keeps a
 * fingerprint of the mapping, a changed one restarts the levels instead of telling level-ups, and a
 * member who was not there before gets no fanfare.
 */

const T1 = minutesAfter(T0, 1);

const DEPARTMENTS = [
  { label: '錬金', member: 'minori' },
  { label: '鍛冶', member: 'hibiki' },
] as const;

/** `n` completed Issues of a department (10 xp each), numbered from `from`. */
function cleared(department: DepartmentLabel, n: number, from: number) {
  return Array.from({ length: n }, (_, i) => ({ number: from + i, departments: [department] }));
}

function withHistory(fetchedAt: string, completed: number, over: Partial<Snapshot> = {}): Snapshot {
  return snapshot({
    fetchedAt,
    history: {
      openedIssueCount: 0,
      completedIssues: cleared('経理', completed, 1),
      mergedPrs: [],
    },
    ...over,
  });
}

// みのり: 2 clears (Lv 2) → 3 clears (Lv 3) as #9 closes.
const BEFORE = withHistory(T0, 2, { issues: [issue(9, { labels: ['経理'] })] });
const AFTER = withHistory(T1, 3, { issues: [closedIssue(9, T1, ['経理'])] });

describe('crewFingerprint', () => {
  it('is 8 hex digits and stable', () => {
    expect(crewFingerprint(DEPARTMENTS)).toMatch(/^[0-9a-f]{8}$/);
    expect(crewFingerprint(DEPARTMENTS)).toBe(crewFingerprint([...DEPARTMENTS]));
  });

  it('changes when a member moves, a label changes, the order changes or a department is added', () => {
    const base = crewFingerprint(DEPARTMENTS);
    const [a, b] = DEPARTMENTS;
    expect(
      crewFingerprint([
        { ...a, member: 'hibiki' },
        { ...b, member: 'minori' },
      ]),
    ).not.toBe(base);
    expect(crewFingerprint([{ ...a, label: '錬金術' }, b])).not.toBe(base);
    expect(crewFingerprint([b, a])).not.toBe(base);
    expect(crewFingerprint([...DEPARTMENTS, { label: '占術', member: 'hirame' }])).not.toBe(base);
    expect(crewFingerprint([])).not.toBe(base);
  });

  it('does not run label and member together', () => {
    expect(crewFingerprint([{ label: 'ab', member: 'c' }])).not.toBe(
      crewFingerprint([{ label: 'a', member: 'bc' }]),
    );
  });

  it('is kept for the settings in use, without the labels', () => {
    expect(CREW_FINGERPRINT).toBe(crewFingerprint(GUILD_SETTINGS.departments));
    const stored = JSON.stringify(toBaseline(BEFORE));
    expect(stored).toContain(CREW_FINGERPRINT);
    for (const d of GUILD_SETTINGS.departments) expect(stored).not.toContain(d.label);
  });
});

describe('parseBaseline: the mapping fingerprint', () => {
  it('still reads a baseline stored before the fingerprint (no crew)', () => {
    const { crew, ...old } = toBaseline(BEFORE);
    expect(crew).toBe(CREW_FINGERPRINT);
    const parsed = parseBaseline(JSON.parse(JSON.stringify(old)));
    expect(parsed).not.toBeNull();
    expect(parsed?.crew).toBeUndefined();
    expect(parsed?.levels).toEqual(old.levels);
  });

  it.each([
    ['not hex', 'zzzzzzzz'],
    ['too short', 'abc'],
    ['a label', '経理'],
    ['a number', 1],
  ])('rejects a crew that is %s', (_label, crew) => {
    expect(parseBaseline({ ...toBaseline(BEFORE), crew })).toBeNull();
  });
});

describe('diffSnapshot: a changed mapping restarts the levels', () => {
  it('tells the level-up while the mapping is the same', () => {
    const ids = diffSnapshot(toBaseline(BEFORE), AFTER).events.map((e) => e.id);
    expect(ids).toEqual(['issue-closed#9', 'level-up:経理#3']);
  });

  it('tells no level-up when the mapping changed, but the other events still', () => {
    const stored = { ...toBaseline(BEFORE), crew: crewFingerprint(DEPARTMENTS) };
    const result = diffSnapshot(stored, AFTER);
    expect(result.events.map((e) => e.id)).toEqual(['issue-closed#9']);
    expect(result.baselineUpdate).toEqual({ action: 'replace', baseline: toBaseline(AFTER) });
  });

  it('tells no level-up from a baseline stored before the fingerprint, then tells them again', () => {
    // Stored as JSON, so the absent crew is dropped as in a baseline written before it.
    const old: unknown = JSON.parse(JSON.stringify({ ...toBaseline(BEFORE), crew: undefined }));
    const first = diffSnapshot(parseBaseline(old), AFTER);
    expect(first.events.map((e) => e.id)).toEqual(['issue-closed#9']);
    if (first.baselineUpdate.action !== 'replace') throw new Error('expected a new baseline');
    const later = withHistory(minutesAfter(T0, 2), 6);
    const second = diffSnapshot(first.baselineUpdate.baseline, later);
    expect(second.events.map((e) => e.id)).toEqual(['level-up:経理#4']);
  });

  it('tells no level-up after a long gap when the mapping changed, only the notice', () => {
    const stored = { ...toBaseline(BEFORE), crew: crewFingerprint(DEPARTMENTS) };
    const result = diffSnapshot(stored, withHistory(minutesAfter(T0, 8 * 24 * 60), 9), 60_000);
    expect(result.events).toEqual([]);
    expect(result.notice?.kind).toBe('gap-unrecoverable');
  });
});

describe('levelUps: members who were not there before', () => {
  it('gives no fanfare to a member missing from the earlier levels', () => {
    expect(levelUps({ kaname: 1 }, { kaname: 1, minori: 5 })).toEqual([]);
    expect(levelUps({ kaname: 1 }, { kaname: 2, minori: 5 })).toEqual([
      { department: null, level: 2 },
    ]);
  });

  it('tells nothing for a member missing from the later levels', () => {
    expect(levelUps({ kaname: 1, minori: 1 }, { kaname: 1 })).toEqual([]);
  });
});

describe('memberLevels', () => {
  it('has exactly the members with a level now, in their order', () => {
    expect(Object.keys(memberLevels(BEFORE))).toEqual([...LEVEL_MEMBER_IDS]);
  });
});
