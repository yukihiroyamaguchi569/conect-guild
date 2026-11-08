import type { Snapshot, SnapshotPr } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { MEMBERS } from '../guild.config';
import type { BoardGroup } from './guildView';
import { buildQuestCard, costOf, CROWN_FRAME, markText, prsOf, RARITY_DAYS } from './questCard';

/** Local noon of 2026-10-17, so the dates hold in any time zone. */
const NOW = new Date(2026, 9, 17, 12).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number): string => new Date(NOW - days * DAY_MS).toISOString();

function pr(number: number, linkedIssues: number[], extra: Partial<SnapshotPr> = {}): SnapshotPr {
  return {
    number,
    title: '架空の PR',
    state: 'open',
    mergedAt: null,
    closedAt: null,
    headRef: 'accounting/x',
    linkedIssues,
    changedFiles: ['accounting/a.md', 'accounting/b.md'],
    ...extra,
  };
}

const GROUPS: readonly BoardGroup[] = [
  {
    key: 'king',
    label: 'おうさまの クエスト',
    color: '#000000',
    quests: [{ number: 30, title: '架空の勅命' }],
  },
  {
    key: 'reception',
    label: '受付',
    color: '#000000',
    quests: [{ number: 104, title: '架空の受付' }],
  },
  {
    key: 'department:経理',
    label: 'みのり（経理）',
    color: '#000000',
    quests: [{ number: 101, title: '〆10/20 架空の請求書' }],
  },
];

function snapshot(
  extra: Partial<Snapshot> = {},
  openedDaysAgo = 3,
): Pick<Snapshot, 'fetchedAt' | 'issues' | 'prs' | 'president'> {
  const issue = (number: number, title: string, createdAt: string) => ({
    number,
    title,
    labels: [],
    state: 'open' as const,
    createdAt,
    updatedAt: createdAt,
    closedAt: null,
  });
  return {
    fetchedAt: new Date(NOW).toISOString(),
    issues: [
      issue(101, '〆10/20 架空の請求書', ago(openedDaysAgo)),
      issue(104, '架空の受付', ago(40)),
    ],
    prs: [],
    president: {
      issues: [{ number: 30, title: '架空の勅命', createdAt: ago(10), updatedAt: ago(1) }],
    },
    ...extra,
  };
}

describe('costOf and markText', () => {
  it('shows the days left, ! past the deadline, ― without one', () => {
    expect(costOf(3)).toBe('3');
    expect(costOf(0)).toBe('0');
    expect(costOf(-1)).toBe('!');
    expect(costOf(null)).toBe('―');
  });

  it('writes the date and the days to it', () => {
    expect(markText('〆', 3, NOW)).toBe('〆10/20 あと 3 日');
    expect(markText('〆', 0, NOW)).toBe('〆10/17 きょう');
    expect(markText('〆', -2, NOW)).toBe('〆10/15 2 日 すぎた');
    expect(markText('@', 1, NOW)).toBe('@10/18 あと 1 日');
    expect(markText('@', null, NOW)).toBeNull();
  });
});

describe('buildQuestCard (Issue #267)', () => {
  it('builds a department quest’s card: cost, deadline, the member and the department', () => {
    const card = buildQuestCard(GROUPS, snapshot(), 101);
    expect(card).toEqual({
      number: 101,
      title: '〆10/20 架空の請求書',
      cost: '3',
      deadline: '〆10/20 あと 3 日',
      doDay: null,
      owner: {
        name: MEMBERS.minori.name,
        label: '経理',
        frame: MEMBERS.minori.color,
        crown: false,
        id: 'minori',
      },
      rarity: 'normal',
      prs: [],
    });
  });

  it('gives a reception quest to かなめ, and a king’s quest to the king in a gold frame', () => {
    const reception = buildQuestCard(GROUPS, snapshot(), 104);
    expect(reception?.owner).toMatchObject({
      name: MEMBERS.kaname.name,
      label: '受付',
      crown: false,
    });
    expect(reception?.owner.frame).toBe(MEMBERS.kaname.color);
    expect(reception?.cost).toBe('―');
    expect(reception?.deadline).toBeNull();
    const king = buildQuestCard(GROUPS, snapshot(), 30);
    expect(king?.owner).toMatchObject({
      name: MEMBERS.yukihiro.name,
      crown: true,
      frame: CROWN_FRAME,
    });
    expect(king?.rarity).toBe('rare');
  });

  it('marks a past deadline with ! and reads the day to do it', () => {
    const groups: BoardGroup[] = [
      {
        key: 'reception',
        label: '受付',
        color: '#000000',
        quests: [{ number: 104, title: '〆10/15 @10/19 架空' }],
      },
    ];
    const card = buildQuestCard(groups, snapshot(), 104);
    expect(card?.cost).toBe('!');
    expect(card?.deadline).toBe('〆10/15 2 日 すぎた');
    expect(card?.doDay).toBe('@10/19 あと 2 日');
  });
});

describe('buildQuestCard: rarity by the days open', () => {
  it.each([
    [6, 'normal'],
    [6.99, 'normal'],
    [7, 'rare'],
    [29, 'rare'],
    [30, 'super-rare'],
  ] as const)('a quest open %s days is %s', (days, rarity) => {
    const card = buildQuestCard(GROUPS, snapshot({}, days), 101);
    expect(card?.rarity).toBe(rarity);
  });

  it('keeps the thresholds in one place', () => {
    expect(RARITY_DAYS).toEqual({ rare: 7, superRare: 30 });
  });

  it('has no rarity for a king’s quest without createdAt (an older collector)', () => {
    const card = buildQuestCard(
      GROUPS,
      snapshot({ president: { issues: [{ number: 30, title: '架空の勅命', updatedAt: ago(1) }] } }),
      30,
    );
    expect(card?.rarity).toBeNull();
  });

  it('is null for a quest no section lists (closed or gone)', () => {
    expect(buildQuestCard(GROUPS, snapshot(), 999)).toBeNull();
    expect(buildQuestCard([], snapshot(), 101)).toBeNull();
  });
});

describe('prsOf', () => {
  it('lists open linked PRs by number, with the files and who they wait for', () => {
    const prs = [
      pr(112, [101], { changedFiles: ['CLAUDE.md'] }),
      pr(110, [101, 102]),
      pr(108, [101], { state: 'closed', changedFiles: [] }),
      pr(111, [103]),
    ];
    expect(prsOf(prs, 101)).toEqual([
      { number: 110, files: 2, wait: `${MEMBERS.kaname.name}待ち` },
      { number: 112, files: 1, wait: `${MEMBERS.yukihiro.role}待ち` },
    ]);
    expect(buildQuestCard(GROUPS, snapshot({ prs }), 101)?.prs).toHaveLength(2);
  });

  it('is empty without an open linked PR', () => {
    expect(prsOf([pr(108, [101], { state: 'closed' })], 101)).toEqual([]);
    expect(prsOf([], 101)).toEqual([]);
  });
});
