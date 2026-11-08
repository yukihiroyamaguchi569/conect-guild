import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import type { QuestCard as Card } from '../app/questCard';
import QuestCard from './QuestCard.vue';

const CARD: Card = {
  number: 12,
  title: '<b>架空の請求書</b>',
  cost: '3',
  deadline: '〆10/20 あと 3 日',
  doDay: '@10/18 あと 1 日',
  owner: {
    name: 'みのり',
    label: '経理',
    frame: '#4caf50',
    crown: false,
    face: { fill: '#c3adbe', ink: '#000000' },
  },
  rarity: 'rare',
  prs: [
    { number: 110, files: 2, wait: 'かなめ待ち' },
    { number: 112, files: 1, wait: '社長待ち' },
  ],
};

function render(card: Card, masked = false): Promise<string> {
  return renderToString(createSSRApp(QuestCard, { card, masked }));
}

describe('QuestCard (Issue #267)', () => {
  it('is a named modal dialog with the number, the title as text, the cost and the owner', async () => {
    const html = await render(CARD);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="クエスト #12 のカード"');
    expect(html).toContain('&lt;b&gt;架空の請求書&lt;/b&gt;');
    expect(html).not.toContain('<b>');
    expect(html).toMatch(/class="card__cost"[^>]*>3</);
    expect(html).toContain('みのり（経理）');
    expect(html).toContain('〆10/20 あと 3 日');
    expect(html).toContain('@10/18 あと 1 日');
    expect(html).toContain('レア');
    expect(html).toContain('card--rare');
    expect(html).toContain('とじる');
  });

  it('lists the PRs with their files and waits, or PR なし', async () => {
    const html = await render(CARD);
    expect(html).toContain('#110・2 ファイル・かなめ待ち');
    expect(html).toContain('#112・1 ファイル・社長待ち');
    expect(await render({ ...CARD, prs: [] })).toContain('PR なし');
  });

  it('masks the title in the show mode, not the number or the names', async () => {
    const html = await render(CARD, true);
    expect(html).not.toContain('架空の請求書');
    expect(html).toContain('＊＊＊＊＊＊＊＊');
    expect(html).toContain('#12');
    expect(html).toContain('みのり（経理）');
  });

  it('leaves out the rarity when it is not known, and crowns the king', async () => {
    const html = await render({
      ...CARD,
      rarity: null,
      owner: { ...CARD.owner, name: 'ゆきひろ', label: '社長', crown: true },
    });
    expect(html).not.toContain('レア度');
    expect(html).not.toContain('card--');
    expect(html).toContain('card__crown');
  });
});
