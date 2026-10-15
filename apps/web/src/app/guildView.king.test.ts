import { describe, expect, it } from 'vitest';
import { at, issue, pr, snapshot, T0 } from '../domain/fixtures.test-util';
import { MEMBERS } from '../guild.config';
import { buildBoard, buildParty } from './guildView';

/** Issue #141: the king's quests on the board and in the party window. */

const now = at(T0);
const PRESIDENT = {
  issues: [
    { number: 7, title: '架空の勅命 A', updatedAt: '2026-10-11T01:00:00.000Z' },
    { number: 8, title: '架空の勅命 B', updatedAt: '2026-10-11T02:00:00.000Z' },
  ],
};

describe('buildBoard: the king’s quests', () => {
  it('puts おうさまの クエスト first, in the king’s colour, the most recently updated first', () => {
    const board = buildBoard(snapshot({ issues: [issue(1)], president: PRESIDENT }), true);
    expect(board.map((group) => group.key)).toEqual(['king', 'reception']);
    expect(board[0]).toEqual({
      key: 'king',
      label: 'おうさまの クエスト',
      color: MEMBERS.yukihiro.color,
      quests: [
        { number: 8, title: '架空の勅命 B' },
        { number: 7, title: '架空の勅命 A' },
      ],
    });
  });

  it('has no king’s section without quests or without president in the settings', () => {
    expect(buildBoard(snapshot({ president: { issues: [] } }), true)).toEqual([]);
    expect(buildBoard(snapshot({ president: PRESIDENT }), false)).toEqual([]);
    expect(buildBoard(snapshot(), true)).toEqual([]);
  });
});

describe('buildParty: the king’s row', () => {
  const king = (over: Parameters<typeof snapshot>[0], enabled = true) =>
    buildParty(snapshot(over), now, enabled).at(-1);

  it('shows やること N 件 beside the approvals, or しごと中 with it (Issue #142), his state unchanged', () => {
    const approvals = { prs: [pr(10, { changedFiles: ['CLAUDE.md'] })] };
    expect(king({ ...approvals, president: PRESIDENT })).toMatchObject({
      id: 'yukihiro',
      state: 'awaiting-president',
      stateLabel: '承認まち 1 件・やること 2 件',
    });
    expect(king({ president: PRESIDENT })).toMatchObject({
      state: 'idle',
      stateLabel: 'しごと中・やること 2 件',
      tooltip: '承認まちの PR はありません。おうさまの クエストが 2 件あります',
    });
  });

  it('shows nothing of them with none, or without president in the settings', () => {
    expect(king({ president: { issues: [] } })?.stateLabel).toBe('玉座で待機');
    expect(king({ president: PRESIDENT }, false)?.stateLabel).toBe('玉座で待機');
    expect(king({})?.stateLabel).toBe('玉座で待機');
  });

  it('carries how many quests are open for his murmurs (Issue #151), 0 on the other rows', () => {
    const rows = buildParty(snapshot({ president: PRESIDENT }), now, true);
    expect(rows.at(-1)?.quests).toBe(2);
    expect(rows.slice(0, -1).map((row) => row.quests)).toEqual(rows.slice(0, -1).map(() => 0));
    expect(king({ president: PRESIDENT }, false)?.quests).toBe(0);
    expect(
      king({ prs: [pr(10, { changedFiles: ['CLAUDE.md'] })], president: PRESIDENT })?.quests,
    ).toBe(2);
  });
});
