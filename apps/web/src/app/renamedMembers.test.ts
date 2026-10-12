import { describe, expect, it, vi } from 'vitest';
import { eventMessage } from '../domain/message';
import { deriveMemberStatuses } from '../domain/party';
import { T0, at, issue, pr, snapshot } from '../domain/fixtures.test-util';
import { STATE_LABELS, buildBoard, buildParty } from './guildView';

// Another team's settings: every name and the president's role differ from conect.llc's.
vi.mock('@conect-guild/snapshot/settings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@conect-guild/snapshot/settings')>();
  const members = {
    kaname: { name: 'アリス', role: '司令塔', color: '#e0b040' },
    minori: { name: 'ボブ', role: '経理', color: '#4caf50' },
    hibiki: { name: 'キャロル', role: '広報', color: '#e91e63' },
    hirame: { name: 'デイブ', role: '企画', color: '#2196f3' },
    sasae: { name: 'イブ', role: '総務', color: '#9c6b3f' },
    yukihiro: { name: 'フランク', role: '代表', color: '#8e44ad' },
  };
  return {
    ...original,
    GUILD_SETTINGS: original.checkGuildSettings({ ...original.GUILD_SETTINGS, members }),
  };
});

const FIXED_NAMES = /かなめ|みのり|ひびき|ひらめ|ささえ|ゆきひろ|社長/;
const reception = { id: 'x', number: 7, department: null } as const;
const desk = { id: 'y', number: 8, department: '経理' } as const;

describe('names from guild.settings.json', () => {
  it('writes the event messages with the configured names', () => {
    const lists = { issues: [], prs: [] };
    const lines = [
      eventMessage({ ...reception, kind: 'issue-opened' }, lists),
      eventMessage({ ...reception, kind: 'pr-merged' }, lists),
      eventMessage({ ...desk, kind: 'issue-opened' }, lists),
      eventMessage({ ...desk, kind: 'pr-merged' }, lists),
      eventMessage({ ...desk, kind: 'issue-closed' }, lists),
    ];
    expect(lines).toEqual([
      'アリスの受付に クエスト#7 が とどいた！',
      'アリスの受付に PR#7 が とどいた！',
      'アリスは ボブに クエスト#8 を わたした！',
      'ボブは PR#8 を アリスに とどけた！',
      'ボブは クエスト#8 を クリアした！',
    ]);
  });

  it('labels the waiting states with the configured name and role', () => {
    expect(STATE_LABELS['awaiting-kaname']).toBe('アリスの確認まち');
    expect(STATE_LABELS['awaiting-president']).toBe('代表の承認まち');
  });

  it('names the reception in the idle reason', () => {
    const snap = { issues: [issue(1)], prs: [pr(2, { headRef: 'misc' })] };
    const [first] = deriveMemberStatuses(snap, at(T0));
    expect(first?.reason).toContain('アリスの受付にあります');
  });

  it('leaves no conect.llc name in the board, the party or the state labels', () => {
    const snap = snapshot({
      issues: [issue(1), issue(2, { labels: ['経理'] })],
      prs: [pr(3, { changedFiles: ['CLAUDE.md'] }), pr(4, { linkedIssues: [2] })],
    });
    const texts = [
      ...Object.values(STATE_LABELS),
      ...buildBoard(snap).map((g) => g.label),
      ...buildParty(snap, at(T0)).flatMap((r) => [r.name, r.role, r.stateLabel, r.tooltip ?? '']),
    ];
    for (const text of texts) expect(text).not.toMatch(FIXED_NAMES);
  });
});
