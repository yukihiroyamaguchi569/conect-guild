import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import type { FetchStatusView } from '../app/guildView';
import FetchStatus from './FetchStatus.vue';

const EVERY_NOTE: FetchStatusView = {
  fetchedAt: '12:34',
  stale: true,
  sessions: 'セッションの状態が古いままです',
  failure: '取得失敗（ネットワーク）',
  notCollected: false,
};

function render(tab: boolean): Promise<string> {
  return renderToString(
    createSSRApp({
      render: () =>
        h(
          FetchStatus,
          {
            status: EVERY_NOTE,
            effectsAvailable: false,
            baselineNotice: '基準を消せませんでした',
            tab,
          },
          { default: () => h('span', { class: 'sound' }, '音') },
        ),
    }),
  );
}

describe('FetchStatus as the tab on the message window (Issues #121, #132)', () => {
  it('keeps every note and puts their whole text in the tooltip', async () => {
    const html = await render(true);
    expect(html).toContain('fetch--tab');
    for (const note of [
      '最終取得 12:34',
      '情報が古い',
      'title="セッションの状態が古いままです。作業中・許可待ちは',
      'title="取得失敗（ネットワーク）"',
      'title="localStorage が使えないため、演出は出ません"',
      'title="基準を消せませんでした"',
      '基準を消す',
      'class="sound"',
    ]) {
      expect(html).toContain(note);
    }
  });

  it('stays the window of the column when halted, with no tooltips added', async () => {
    const html = await render(false);
    expect(html).not.toContain('fetch--tab');
    expect(html).toContain('取得失敗（ネットワーク）');
    expect(html).not.toContain('title="取得失敗（ネットワーク）"');
    expect(html).not.toContain('title="基準を消せませんでした"');
    expect(html).toContain('title="作業中・許可待ちは GitHub');
  });
});
