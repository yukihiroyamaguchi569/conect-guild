import { describe, expect, it } from 'vitest';
import {
  MIXUP_MIN_COUNT,
  MIXUP_WINDOW_MS,
  departmentPositionsOf,
  mixupFindings,
  suspectedMixups,
  type MixupPr,
} from './mixup.ts';

const NOW = Date.parse('2026-10-13T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** A PR on `from`'s prefix merged a day ago, tied to one Issue with `labels` (positions). */
function pr(from: number | null, labels: number[], mergedAt: number = NOW - DAY): MixupPr {
  return { branchPosition: from, mergedAt, linkedIssuePositions: [labels] };
}

function times<T>(n: number, make: () => T): T[] {
  return Array.from({ length: n }, make);
}

describe('suspectedMixups', () => {
  it('finds nothing when the PRs tie to their own department', () => {
    expect(
      suspectedMixups(
        times(5, () => pr(1, [1])),
        4,
        NOW,
      ),
    ).toEqual([]);
  });

  it('finds 3 PRs out of 3 tied to another department', () => {
    expect(
      suspectedMixups(
        times(3, () => pr(1, [2])),
        4,
        NOW,
      ),
    ).toEqual([{ from: 1, to: 2, count: 3, total: 3 }]);
  });

  it('needs at least 3: 2 out of 2 is not enough', () => {
    expect(MIXUP_MIN_COUNT).toBe(3);
    expect(
      suspectedMixups(
        times(2, () => pr(1, [2])),
        4,
        NOW,
      ),
    ).toEqual([]);
  });

  it('needs more than half: exactly half is not enough', () => {
    const prs = [...times(3, () => pr(0, [3])), ...times(3, () => pr(0, [0]))];
    expect(suspectedMixups(prs, 4, NOW)).toEqual([]);
  });

  it('finds a majority just over half', () => {
    const prs = [...times(4, () => pr(0, [3])), ...times(3, () => pr(0, [0]))];
    expect(suspectedMixups(prs, 4, NOW)).toEqual([{ from: 0, to: 3, count: 4, total: 7 }]);
  });

  it('counts the other departments in the total too', () => {
    // 3 to 2, 2 to 3, 1 own: 3 is not more than half of 6.
    const prs = [...times(3, () => pr(1, [2])), ...times(2, () => pr(1, [3])), pr(1, [1])];
    expect(suspectedMixups(prs, 4, NOW)).toEqual([]);
  });
});

describe('suspectedMixups: the 30 days', () => {
  it('looks back 30 days from now: exactly 30 days still counts, a millisecond more does not', () => {
    expect(MIXUP_WINDOW_MS).toBe(30 * DAY);
    const edge = NOW - MIXUP_WINDOW_MS;
    expect(
      suspectedMixups(
        times(3, () => pr(1, [2], edge)),
        4,
        NOW,
      ),
    ).toHaveLength(1);
    expect(
      suspectedMixups(
        times(3, () => pr(1, [2], edge - 1)),
        4,
        NOW,
      ),
    ).toEqual([]);
  });

  it('leaves old PRs out of the total as well', () => {
    const old = NOW - MIXUP_WINDOW_MS - 1;
    const prs = [...times(3, () => pr(1, [2])), ...times(5, () => pr(1, [1], old))];
    expect(suspectedMixups(prs, 4, NOW)).toEqual([{ from: 1, to: 2, count: 3, total: 3 }]);
  });

  it('takes the window and the minimum from the options', () => {
    const prs = times(2, () => pr(1, [2], NOW - 5 * DAY));
    expect(suspectedMixups(prs, 4, NOW, { minCount: 2 })).toHaveLength(1);
    expect(suspectedMixups(prs, 4, NOW, { minCount: 2, windowMs: 4 * DAY })).toEqual([]);
  });
});

describe('suspectedMixups: what is not counted', () => {
  it('leaves out Issues with two or more department labels', () => {
    const prs = [...times(2, () => pr(1, [2])), ...times(5, () => pr(1, [2, 3]))];
    expect(suspectedMixups(prs, 4, NOW)).toEqual([]);
    // They are not in the total either: 3 of 3 counted.
    expect(suspectedMixups([...prs, pr(1, [2])], 4, NOW)).toEqual([
      { from: 1, to: 2, count: 3, total: 3 },
    ]);
  });

  it('leaves out Issues without a department label', () => {
    const prs = [...times(3, () => pr(1, [2])), ...times(5, () => pr(1, []))];
    expect(suspectedMixups(prs, 4, NOW)).toEqual([{ from: 1, to: 2, count: 3, total: 3 }]);
  });

  it('leaves out PRs tied to no Issue', () => {
    const untied: MixupPr = { branchPosition: 1, mergedAt: NOW - DAY, linkedIssuePositions: [] };
    const prs = [...times(3, () => pr(1, [2])), ...times(5, () => untied)];
    expect(suspectedMixups(prs, 4, NOW)).toEqual([{ from: 1, to: 2, count: 3, total: 3 }]);
  });

  it('leaves out PRs whose branch has no department prefix', () => {
    expect(
      suspectedMixups(
        times(5, () => pr(null, [2])),
        4,
        NOW,
      ),
    ).toEqual([]);
  });

  it('counts a PR tied to several Issues once, when their single labels agree', () => {
    const several: MixupPr = {
      branchPosition: 1,
      mergedAt: NOW - DAY,
      linkedIssuePositions: [[2], [2], [], [0, 3]],
    };
    expect(
      suspectedMixups(
        times(3, () => several),
        4,
        NOW,
      ),
    ).toEqual([{ from: 1, to: 2, count: 3, total: 3 }]);
  });

  it('leaves out a PR tied to Issues of different departments (work across departments)', () => {
    const across: MixupPr = {
      branchPosition: 1,
      mergedAt: NOW - DAY,
      linkedIssuePositions: [[2], [3]],
    };
    expect(
      suspectedMixups(
        times(5, () => across),
        4,
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('suspectedMixups: shapes', () => {
  it('finds both ways round, ordered by from', () => {
    const prs = [...times(3, () => pr(2, [1])), ...times(4, () => pr(1, [2]))];
    expect(suspectedMixups(prs, 4, NOW)).toEqual([
      { from: 1, to: 2, count: 4, total: 4 },
      { from: 2, to: 1, count: 3, total: 3 },
    ]);
  });

  it('works with other numbers of departments', () => {
    const two = [...times(3, () => pr(0, [1])), ...times(3, () => pr(1, [0]))];
    expect(suspectedMixups(two, 2, NOW)).toEqual([
      { from: 0, to: 1, count: 3, total: 3 },
      { from: 1, to: 0, count: 3, total: 3 },
    ]);
    expect(
      suspectedMixups(
        times(3, () => pr(5, [4])),
        6,
        NOW,
      ),
    ).toEqual([{ from: 5, to: 4, count: 3, total: 3 }]);
    expect(
      suspectedMixups(
        times(3, () => pr(0, [0])),
        1,
        NOW,
      ),
    ).toEqual([]);
    expect(suspectedMixups([], 0, NOW)).toEqual([]);
  });

  it('ignores positions outside the departments', () => {
    const prs = [...times(3, () => pr(4, [1])), ...times(3, () => pr(1, [4]))];
    expect(suspectedMixups(prs, 4, NOW)).toEqual([]);
  });
});

describe('departmentPositionsOf', () => {
  const departments = ['経理', '広報', '企画', '総務'];

  it('gives the positions of the department labels, in the settings order', () => {
    expect(departmentPositionsOf(['bug', '総務', '広報'], departments)).toEqual([1, 3]);
    expect(departmentPositionsOf(['bug'], departments)).toEqual([]);
  });

  it('matches exactly, as the collector ties labels to departments', () => {
    expect(departmentPositionsOf(['広報 ', 'Ｘ'], ['広報', 'X'])).toEqual([]);
  });
});

describe('mixupFindings', () => {
  it('pairs both ways round into one swap, lower position first', () => {
    expect(
      mixupFindings([
        { from: 1, to: 2 },
        { from: 2, to: 1 },
      ]),
    ).toEqual([{ kind: 'swap', a: 1, b: 2 }]);
  });

  it('keeps one way as it is', () => {
    expect(mixupFindings([{ from: 3, to: 0 }])).toEqual([{ kind: 'one-way', from: 3, to: 0 }]);
  });

  it('does not pair a chain that is not both ways round', () => {
    expect(
      mixupFindings([
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 2, to: 0 },
      ]),
    ).toEqual([
      { kind: 'one-way', from: 0, to: 1 },
      { kind: 'one-way', from: 1, to: 2 },
      { kind: 'one-way', from: 2, to: 0 },
    ]);
  });

  it('orders swaps and one-way findings by their first position', () => {
    expect(
      mixupFindings([
        { from: 0, to: 3 },
        { from: 1, to: 2 },
        { from: 2, to: 1 },
      ]),
    ).toEqual([
      { kind: 'one-way', from: 0, to: 3 },
      { kind: 'swap', a: 1, b: 2 },
    ]);
    expect(
      mixupFindings([
        { from: 0, to: 2 },
        { from: 1, to: 0 },
        { from: 2, to: 0 },
      ]),
    ).toEqual([
      { kind: 'swap', a: 0, b: 2 },
      { kind: 'one-way', from: 1, to: 0 },
    ]);
  });

  it('finds nothing in nothing', () => {
    expect(mixupFindings([])).toEqual([]);
  });
});
