import { makeSettings } from '@conect-guild/snapshot/settings.fixtures';
import { describe, expect, it } from 'vitest';
import {
  DEMO_LOOP_MS,
  demoIssueNumber,
  demoSnapshotAt,
  laneDepartments,
  questCarriers,
} from './demo';
import { DEMO_LANES, DEMO_TITLES } from './demoScript';

/**
 * The demo for other numbers of departments (Issue #18): made-up labels, never the settings'. The
 * four-department demo keeps its times (demo.test.ts).
 */

const NOW = Date.parse('2026-10-12T03:00:00.000Z');

/** Made-up labels of `count` departments (makeSettings has four; the rest are named here). */
function labelsOf(count: number): string[] {
  const four = makeSettings(4).departments.map((d) => d.label);
  return [...four, '予備一', '予備二'].slice(0, count);
}

describe('questCarriers', () => {
  it('keeps the four-department order: 1st and 3rd, then 2nd and 4th', () => {
    expect(questCarriers(0, 4)).toEqual([0, 2]);
    expect(questCarriers(1, 4)).toEqual([1, 3]);
    expect(questCarriers(2, 4)).toEqual([0, 2]);
  });

  it.each([2, 3, 4, 5, 6])(
    'gives %i departments two different carriers, all within ceil(n / 2) loops',
    (count) => {
      const cycle = Math.ceil(count / 2);
      const carried = new Set<number>();
      for (let loop = 0; loop < cycle; loop += 1) {
        const [first, second] = questCarriers(loop, count);
        expect(first).not.toBe(second);
        for (const index of [first, second]) {
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(count);
          carried.add(index);
        }
        expect(questCarriers(loop + cycle, count)).toEqual([first, second]);
      }
      expect(carried.size).toBe(count);
    },
  );

  it.each([0, 1, 2.5, Number.NaN])('refuses %d departments', (count) => {
    expect(() => questCarriers(0, count)).toThrow(RangeError);
  });
});

describe('laneDepartments for other counts', () => {
  it('leaves both helper lanes out with two departments', () => {
    const labels = labelsOf(2);
    expect(laneDepartments(0, labels)).toEqual({
      commander: null,
      quest1: labels[0],
      quest2: labels[1],
    });
    expect(laneDepartments(1, labels)).toEqual(laneDepartments(0, labels));
  });

  it('has one helper with three departments, and every department carries in two loops', () => {
    const labels = labelsOf(3);
    expect(laneDepartments(0, labels)).toEqual({
      commander: null,
      quest1: labels[0],
      quest2: labels[2],
      helper1: labels[1],
    });
    expect(laneDepartments(1, labels)).toEqual({
      commander: null,
      quest1: labels[1],
      quest2: labels[0],
      helper1: labels[2],
    });
  });

  it('gives six departments two helpers and every department a quest in three loops', () => {
    const labels = labelsOf(6);
    expect(laneDepartments(0, labels)).toEqual({
      commander: null,
      quest1: labels[0],
      quest2: labels[3],
      helper1: labels[1],
      helper2: labels[2],
    });
  });
});

describe('demoSnapshotAt for other counts', () => {
  it.each([2, 3])(
    'uses only the %i departments given, a session each and one for かなめ',
    (count) => {
      const labels = labelsOf(count);
      for (let t = 0; t < 3 * DEMO_LOOP_MS; t += 2_500) {
        const snapshot = demoSnapshotAt(t, NOW + t, labels);
        for (const issue of snapshot.issues)
          for (const label of issue.labels) expect(labels).toContain(label);
        for (const issue of snapshot.history.completedIssues)
          for (const label of issue.departments) expect(labels).toContain(label);
        if (snapshot.sessions.status !== 'ok') throw new Error('the demo sessions are always ok');
        expect(snapshot.sessions.members.map((m) => m.department)).toEqual([null, ...labels]);
      }
    },
  );

  it.each([2, 3])('clears two quests a loop with %i departments', (count) => {
    const labels = labelsOf(count);
    const before = demoSnapshotAt(0, NOW, labels).history;
    const after = demoSnapshotAt(DEMO_LOOP_MS - 1, NOW + DEMO_LOOP_MS - 1, labels).history;
    expect(after.completedIssues.length - before.completedIssues.length).toBe(2);
    expect(after.mergedPrs.length - before.mergedPrs.length).toBe(2);
  });

  it('opens no Issue for a lane without a department', () => {
    const labels = labelsOf(2);
    const snapshot = demoSnapshotAt(DEMO_LOOP_MS - 1, NOW, labels);
    const numbers = snapshot.issues.map((issue) => issue.number);
    for (const lane of DEMO_LANES.filter((l) => l.startsWith('helper')))
      expect(numbers).not.toContain(demoIssueNumber(0, lane));
  });

  it('gives a department carrying in back-to-back loops its next title each time', () => {
    // Three departments: the 1st carries quest1 in even loops and quest2 in odd ones.
    const labels = labelsOf(3);
    const titles = [0, 1, 2, 3].map((loop) => {
      const at = loop * DEMO_LOOP_MS + DEMO_LOOP_MS - 1;
      const snapshot = demoSnapshotAt(at, NOW + at, labels);
      const lane = loop % 2 === 0 ? 'quest1' : 'quest2';
      return snapshot.issues.find((issue) => issue.number === demoIssueNumber(loop, lane))?.title;
    });
    const pool = (DEMO_TITLES[0] ?? []).map((t) => t.issue);
    expect(titles).toEqual([pool[0], pool[1], pool[2], pool[0]]);
  });
});
