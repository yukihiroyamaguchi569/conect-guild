import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@conect-guild/snapshot';
import { parseBaseline, toBaseline } from './baseline';
import { diffSnapshot, GAP_NOTICE_MESSAGE } from './events';
import type { DepartmentLabel } from '../guild.config';
import { closedIssue, issue, minutesAfter, snapshot, T0 } from './fixtures.test-util';
import { levelUps, memberLevels, type MemberLevels } from './levelUp';
import { diffMessages } from './message';

const T1 = minutesAfter(T0, 1);

/** `n` completed Issues of a department (10 each), numbered from `from`. */
function cleared(department: DepartmentLabel, n: number, from: number) {
  return Array.from({ length: n }, (_, i) => ({ number: from + i, departments: [department] }));
}

/** A snapshot whose history gives the levels below (Lv2 at 10, Lv3 at 30, Lv4 at 60). */
function withHistory(
  fetchedAt: string,
  history: Partial<Snapshot['history']>,
  over: Partial<Snapshot> = {},
): Snapshot {
  return snapshot({
    fetchedAt,
    history: { openedIssueCount: 0, completedIssues: [], mergedPrs: [], ...history },
    ...over,
  });
}

/** What the screen before the levels stored (version 2): the same baseline with no `levels`. */
function versionTwo(snap: Snapshot) {
  const { fetchedAt, repo, issues, prs } = toBaseline(snap);
  return { schemaVersion: 2, fetchedAt, repo, issues, prs };
}

const ALL_ONE: MemberLevels = { kaname: 1, minori: 1, hibiki: 1, hirame: 1, sasae: 1 };

describe('memberLevels', () => {
  it('is 1 for everyone with no history, and has no level for the king', () => {
    const levels = memberLevels(withHistory(T0, {}));
    expect(levels).toEqual(ALL_ONE);
    expect(Object.keys(levels)).not.toContain('yukihiro');
  });

  it('counts each member from the history (domain/xp.ts)', () => {
    const levels = memberLevels(
      withHistory(T0, {
        // かなめ: 4 scrolls × 3 = 12 → Lv 2. みのり: 3 clears = 30 → Lv 3. ささえ: 1 clear → Lv 2.
        openedIssueCount: 4,
        completedIssues: [...cleared('経理', 3, 1), ...cleared('総務', 1, 10)],
      }),
    );
    expect(levels).toEqual({ ...ALL_ONE, kaname: 2, minori: 3, sasae: 2 });
  });
});

describe('levelUps', () => {
  it('finds nobody when nothing changed', () => {
    expect(levelUps(ALL_ONE, ALL_ONE)).toEqual([]);
  });

  it('tells nothing for a level that went down (a label moved, an Issue reopened)', () => {
    expect(levelUps({ ...ALL_ONE, minori: 5 }, { ...ALL_ONE, minori: 4 })).toEqual([]);
  });

  it('tells two levels at once only once, with the level reached', () => {
    expect(levelUps(ALL_ONE, { ...ALL_ONE, hibiki: 3 })).toEqual([
      { department: '広報', level: 3 },
    ]);
  });

  it('tells several members at once: かなめ first, then the departments in their order', () => {
    expect(levelUps(ALL_ONE, { ...ALL_ONE, sasae: 2, kaname: 2, minori: 4 })).toEqual([
      { department: null, level: 2 },
      { department: '経理', level: 4 },
      { department: '総務', level: 2 },
    ]);
  });

  it('tells only who went up when another went down in the same fetch', () => {
    expect(levelUps({ ...ALL_ONE, minori: 3 }, { ...ALL_ONE, minori: 2, hirame: 2 })).toEqual([
      { department: '企画', level: 2 },
    ]);
  });
});

describe('the baseline keeps the levels', () => {
  it('stores each level as a number, and reads it back', () => {
    const base = toBaseline(withHistory(T0, { completedIssues: cleared('経理', 1, 1) }));
    expect(base.levels).toEqual({ ...ALL_ONE, minori: 2 });
    expect(parseBaseline(JSON.parse(JSON.stringify(base)))).toEqual(base);
  });

  it('takes a baseline of the version before the levels (2) as absent', () => {
    expect(parseBaseline(versionTwo(withHistory(T0, {})))).toBeNull();
  });

  it('rejects levels out of range and a level for the king', () => {
    const base = toBaseline(withHistory(T0, {}));
    for (const levels of [
      { ...ALL_ONE, minori: 0 },
      { ...ALL_ONE, minori: 100 },
      { ...ALL_ONE, minori: 2.5 },
      { ...ALL_ONE, yukihiro: 1 },
      { ...ALL_ONE, neko: 1 },
    ]) {
      expect(parseBaseline({ ...base, levels })).toBeNull();
    }
  });

  it('reads a baseline that lacks a member (one with no desk then, Issue #18)', () => {
    const base = toBaseline(withHistory(T0, {}));
    const levels = { kaname: 1, minori: 1, hibiki: 1, hirame: 1 };
    expect(parseBaseline({ ...base, levels, crew: '00000000' })?.levels).toEqual(levels);
    expect(parseBaseline({ ...base, levels, crew: undefined })?.levels).toEqual(levels);
  });

  it('rejects a baseline of the mapping in use that lacks a member (as before #18)', () => {
    const base = toBaseline(withHistory(T0, {}));
    expect(
      parseBaseline({ ...base, levels: { kaname: 1, minori: 1, hibiki: 1, hirame: 1 } }),
    ).toBeNull();
    expect(parseBaseline({ ...base, levels: {} })).toBeNull();
  });
});

describe('diffSnapshot: level-ups', () => {
  const before = withHistory(
    T0,
    { completedIssues: cleared('経理', 2, 1) },
    {
      issues: [issue(3, { labels: ['経理'] })],
    },
  );

  it('shows none on the first load, however high the levels are', () => {
    const result = diffSnapshot(null, withHistory(T1, { completedIssues: cleared('経理', 9, 1) }));
    expect(result.events).toEqual([]);
  });

  it('shows none after the baseline version moved on (the old baseline reads as absent)', () => {
    const stored = parseBaseline(versionTwo(before));
    expect(stored).toBeNull();
    const next = withHistory(T1, { completedIssues: cleared('経理', 9, 1) });
    expect(diffSnapshot(stored, next).events).toEqual([]);
  });

  it('tells the level-up after the clear that brought it, in that order', () => {
    // みのり: 2 clears (20, Lv 2) → 3 clears (30, Lv 3) as #3 closes.
    const next = withHistory(
      T1,
      { completedIssues: cleared('経理', 3, 1) },
      { issues: [closedIssue(3, T1, ['経理'])] },
    );
    const result = diffSnapshot(toBaseline(before), next);
    expect(result.events.map((e) => e.id)).toEqual(['issue-closed#3', 'level-up:経理#3']);
    expect(result.events[1]).toEqual({
      id: 'level-up:経理#3',
      kind: 'level-up',
      number: 3,
      department: '経理',
    });
    expect(diffMessages(result, next)).toEqual([
      'みのりは クエスト#3「架空の依頼 3」を クリアした！',
      'みのりは レベル 3 に あがった！',
    ]);
  });

  it('tells nothing when a level went down, and lowers the stored level', () => {
    const next = withHistory(T1, { completedIssues: cleared('経理', 0, 1) });
    const result = diffSnapshot(toBaseline(before), next);
    expect(result.events).toEqual([]);
    expect(result.baselineUpdate).toEqual({ action: 'replace', baseline: toBaseline(next) });
    expect(toBaseline(next).levels.minori).toBe(1);
  });
});

describe('diffSnapshot: level-ups, repeats and gaps', () => {
  const before = withHistory(T0, { completedIssues: cleared('経理', 2, 1) });

  it('tells two levels at once in one line', () => {
    // 20 → 60: Lv 2 → Lv 4.
    const next = withHistory(T1, { completedIssues: cleared('経理', 6, 1) });
    const result = diffSnapshot(toBaseline(before), next);
    expect(diffMessages(result, next)).toEqual(['みのりは レベル 4 に あがった！']);
  });

  it('tells each member who went up in the same fetch', () => {
    const next = withHistory(T1, {
      openedIssueCount: 4,
      completedIssues: [...cleared('経理', 3, 1), ...cleared('企画', 1, 20)],
    });
    expect(diffMessages(diffSnapshot(toBaseline(before), next), next)).toEqual([
      'かなめは レベル 2 に あがった！',
      'みのりは レベル 3 に あがった！',
      'ひらめは レベル 2 に あがった！',
    ]);
  });

  it('never rewinds: an older fetch tells nothing, even with higher levels', () => {
    const next = withHistory(minutesAfter(T0, -1), { completedIssues: cleared('経理', 9, 1) });
    expect(diffSnapshot(toBaseline(before), next)).toEqual({
      events: [],
      baselineUpdate: { action: 'keep' },
      notice: null,
    });
  });

  it('does not tell the same level-up again once the new baseline is stored', () => {
    const next = withHistory(T1, { completedIssues: cleared('経理', 3, 1) });
    const update = diffSnapshot(toBaseline(before), next).baselineUpdate;
    if (update.action !== 'replace') throw new Error('expected a new baseline');
    const again = withHistory(minutesAfter(T0, 2), { completedIssues: cleared('経理', 3, 1) });
    expect(diffSnapshot(update.baseline, again).events).toEqual([]);
  });

  it('still tells level-ups after a gap of more than 7 days, after the notice', () => {
    const next = withHistory(
      minutesAfter(T0, 7 * 24 * 60 + 1),
      {
        completedIssues: cleared('経理', 3, 1),
      },
      { issues: [closedIssue(3, T1, ['経理'])] },
    );
    const result = diffSnapshot(toBaseline(before), next);
    expect(diffMessages(result, next)).toEqual([
      GAP_NOTICE_MESSAGE,
      'みのりは レベル 3 に あがった！',
    ]);
  });

  it('leaves the level-up message without numbers of Issues or titles', () => {
    const next = withHistory(
      T1,
      { completedIssues: cleared('経理', 3, 1) },
      { issues: [closedIssue(3, T1, ['経理'])] },
    );
    const [, line] = diffMessages(diffSnapshot(toBaseline(before), next), next);
    expect(line).not.toContain('#');
    expect(line).not.toContain('架空');
  });
});
