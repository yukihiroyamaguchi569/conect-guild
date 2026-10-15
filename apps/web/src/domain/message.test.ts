import { describe, expect, it } from 'vitest';
import type { GuildEvent } from './events';
import { GAP_NOTICE_MESSAGE } from './events';
import { closedIssue, issue, mergedPr, snapshot, T0 } from './fixtures.test-util';
import { maskTitle } from './mask';
import { actorName, diffEntries, diffMessages, eventMessage, shownText } from './message';

const snap = snapshot({
  issues: [closedIssue(98, T0, ['総務']), issue(104, { title: '受付の題名' })],
  prs: [mergedPr(108, T0, { title: '棚卸しの結果' })],
});

function event(kind: GuildEvent['kind'], number: number, department: GuildEvent['department']) {
  return { id: `${kind}#${String(number)}`, kind, number, department } satisfies GuildEvent;
}

describe('actorName', () => {
  it('maps departments to member names and the reception to かなめ', () => {
    expect(actorName('経理')).toBe('みのり');
    expect(actorName('総務')).toBe('ささえ');
    expect(actorName(null)).toBe('かなめ');
  });
});

describe('eventMessage', () => {
  it('announces a clear with the number and the title from the snapshot', () => {
    expect(eventMessage(event('issue-closed', 98, '総務'), snap)).toBe(
      'ささえは クエスト#98「架空の依頼 98」を クリアした！',
    );
  });

  it('announces a merged PR with the PR title', () => {
    expect(eventMessage(event('pr-merged', 108, '総務'), snap)).toBe(
      'ささえは PR#108「棚卸しの結果」を かなめに とどけた！',
    );
  });

  it('announces an opened quest handed to a department', () => {
    expect(eventMessage(event('issue-opened', 104, '企画'), snap)).toBe(
      'かなめは ひらめに クエスト#104「受付の題名」を わたした！',
    );
  });

  it('announces an opened quest that stays at the reception', () => {
    expect(eventMessage(event('issue-opened', 104, null), snap)).toBe(
      'かなめの受付に クエスト#104「受付の題名」が とどいた！',
    );
  });

  it('lets かなめ clear a reception quest', () => {
    expect(eventMessage(event('issue-closed', 98, null), snap)).toMatch(/^かなめは クエスト#98/);
  });

  it('omits the title when the number is not in the snapshot', () => {
    expect(eventMessage(event('issue-closed', 999, '経理'), snap)).toBe(
      'みのりは クエスト#999 を クリアした！',
    );
  });

  it('says a PR with no department arrived at the reception', () => {
    expect(eventMessage(event('pr-merged', 108, null), snap)).toBe(
      'かなめの受付に PR#108「棚卸しの結果」が とどいた！',
    );
  });

  it('does not take an Issue title for a PR with the same number', () => {
    const clash = snapshot({ issues: [issue(5, { title: 'Issue の題名' })], prs: [] });
    expect(eventMessage(event('pr-merged', 5, '経理'), clash)).toBe(
      'みのりは PR#5 を かなめに とどけた！',
    );
  });
});

describe('diffMessages', () => {
  it('returns one line per event in order', () => {
    const diff = {
      events: [event('pr-merged', 108, '総務'), event('issue-closed', 98, '総務')],
      baselineUpdate: { action: 'keep' },
      notice: null,
    } as const;
    expect(diffMessages(diff, snap)).toEqual([
      'ささえは PR#108「棚卸しの結果」を かなめに とどけた！',
      'ささえは クエスト#98「架空の依頼 98」を クリアした！',
    ]);
  });

  it('puts the gap notice first', () => {
    const diff = {
      events: [],
      baselineUpdate: { action: 'keep' },
      notice: { kind: 'gap-unrecoverable', message: GAP_NOTICE_MESSAGE },
    } as const;
    expect(diffMessages(diff, snap)).toEqual([GAP_NOTICE_MESSAGE]);
  });

  it('returns nothing for an empty diff', () => {
    const diff = { events: [], baselineUpdate: { action: 'keep' }, notice: null } as const;
    expect(diffMessages(diff, snap)).toEqual([]);
  });
});

describe('diffEntries', () => {
  it('pairs each line with its event, in order', () => {
    const closed = event('issue-closed', 98, '総務');
    const merged = event('pr-merged', 108, '総務');
    const diff = {
      events: [merged, closed],
      baselineUpdate: { action: 'keep' },
      notice: null,
    } as const;
    expect(diffEntries(diff, snap)).toEqual([
      {
        text: 'ささえは PR#108「棚卸しの結果」を かなめに とどけた！',
        maskedText: 'ささえは PR#108「＊＊＊＊＊＊」を かなめに とどけた！',
        event: merged,
      },
      {
        text: 'ささえは クエスト#98「架空の依頼 98」を クリアした！',
        maskedText: 'ささえは クエスト#98「＊＊＊＊＊＊＊＊」を クリアした！',
        event: closed,
      },
    ]);
  });

  it('keeps no masked text for a line without a title (Issue #144)', () => {
    const levelUp = event('level-up', 10, '経理');
    const cleared = event('king-quest-cleared', 7, null);
    const diff = {
      events: [levelUp, cleared],
      baselineUpdate: { action: 'keep' },
      notice: null,
    } as const;
    expect(diffEntries(diff, snap)).toEqual([
      { text: 'みのりは レベル 10 に あがった！', event: levelUp },
      { text: 'おうさまは クエスト#7 を クリアした！', event: cleared },
    ]);
  });

  it('gives the gap notice no event', () => {
    const diff = {
      events: [event('issue-closed', 98, '総務')],
      baselineUpdate: { action: 'keep' },
      notice: { kind: 'gap-unrecoverable', message: GAP_NOTICE_MESSAGE },
    } as const;
    const entries = diffEntries(diff, snap);
    expect(entries[0]).toEqual({ text: GAP_NOTICE_MESSAGE, event: null });
    expect(entries).toHaveLength(2);
  });
});

describe('the show mode (Issue #144)', () => {
  it('masks only the title: the sentence, the number and the names stay', () => {
    expect(eventMessage(event('issue-opened', 104, '企画'), snap, maskTitle)).toBe(
      'かなめは ひらめに クエスト#104「＊＊＊＊＊」を わたした！',
    );
  });

  it('masks the king quest as it arrives, with the same sentence', () => {
    const kingSnap = snapshot({
      president: { issues: [{ number: 7, title: '取引先との打ち合わせ', updatedAt: T0 }] },
    });
    const opened = event('king-quest-opened', 7, null);
    expect(eventMessage(opened, kingSnap)).toBe(
      'おうさまに クエスト#7「取引先との打ち合わせ」が とどいた！',
    );
    expect(eventMessage(opened, kingSnap, maskTitle)).toBe(
      'おうさまに クエスト#7「＊＊＊＊＊＊＊＊」が とどいた！',
    );
  });

  it('shows the masked line only while masked, and the text when there is none', () => {
    const entry = { text: 'A「題名」', maskedText: 'A「＊＊＊＊」' };
    expect(shownText(entry, false)).toBe('A「題名」');
    expect(shownText(entry, true)).toBe('A「＊＊＊＊」');
    expect(shownText({ text: 'お知らせ' }, true)).toBe('お知らせ');
  });
});
