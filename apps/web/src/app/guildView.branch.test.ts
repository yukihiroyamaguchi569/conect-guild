import { describe, expect, it } from 'vitest';
import { issue, pr, snapshot } from '../domain/fixtures.test-util';
import { buildBoard, countWaits } from './guildView';

/** Issue #164: the board puts an unlabelled Issue at the desk of its open PR's branch prefix. */

describe('buildBoard: Issues without department labels', () => {
  it('moves an unlabelled Issue to the desk of its open PR’s prefix', () => {
    const snap = snapshot({
      issues: [issue(1), issue(2)],
      prs: [pr(3, { headRef: 'pr/news', linkedIssues: [1] })],
    });
    const board = buildBoard(snap, false);
    expect(board.map((g) => [g.key, g.quests.map((q) => q.number)])).toEqual([
      ['reception', [2]],
      ['department:広報', [1]],
    ]);
    expect(countWaits(snap).reception).toBe(1);
  });

  it('keeps an Issue linked from a king’s quest number with the king (not in issues)', () => {
    const president = {
      issues: [{ number: 7, title: '架空の勅命', updatedAt: '2026-10-11T00:00:00Z' }],
    };
    const snap = snapshot({
      president,
      prs: [pr(3, { headRef: 'accounting/x', linkedIssues: [7] })],
    });
    expect(buildBoard(snap, true).map((g) => g.key)).toEqual(['king']);
  });
});
