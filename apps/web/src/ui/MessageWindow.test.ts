import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import type { GuildMessage } from '../app/messageQueue';
import type { Narration } from '../app/narrator';
import MessageWindow from './MessageWindow.vue';

const message: GuildMessage = { id: 1, text: 'テスト', event: null };

function render(
  msg: GuildMessage | null,
  remaining: number,
  narration: Narration | null = null,
): Promise<string> {
  return renderToString(createSSRApp(MessageWindow, { message: msg, remaining, narration }));
}

describe('MessageWindow', () => {
  it('has one button covering the window, not nested, labelled for assistive tech', async () => {
    const html = await render(message, 2);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('aria-label="つぎへ（あと 2 件）"');
    expect(html).toContain('class="message__next"');
    // The mark is plain text inside the button, so a click on it cannot emit twice.
    expect(html).toMatch(/<button[^>]*><span[^>]*aria-hidden="true"[^>]*>▼/);
    expect(html).not.toMatch(/<button[^>]*>[\s\S]*<button/);
  });

  it('says とじる on the last message', async () => {
    expect(await render(message, 0)).toContain('aria-label="とじる"');
  });

  it('has no button while nothing happened', async () => {
    const html = await render(null, 0);
    expect(html).not.toContain('<button');
    expect(html).toContain('あたらしい できごとは まだ ない。');
  });

  it('tells the narration while nothing happened, with ▼ for the next one', async () => {
    const html = await render(null, 0, { id: 1, text: 'みのりは うとうと している…' });
    expect(html).toContain('みのりは うとうと している…');
    expect(html).not.toContain('あたらしい できごとは まだ ない。');
    expect(html).toContain('aria-label="つぎの ようす"');
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it('shows the event message instead of the narration', async () => {
    const html = await render(message, 0, { id: 1, text: 'みのりは うとうと している…' });
    expect(html).toContain('テスト');
    expect(html).not.toContain('うとうと');
    expect(html).toContain('aria-label="とじる"');
  });

  it('writes the narration as text, not HTML', async () => {
    const html = await render(null, 0, { id: 1, text: '<b>x</b>' });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('MessageWindow: the show mode (Issue #144)', () => {
  const line: GuildMessage = {
    id: 2,
    text: 'たびびと の PR #12「取引先の看板」がマージされた',
    maskedText: 'たびびと の PR #12「＊＊＊＊＊＊」がマージされた',
    event: null,
    guest: 0,
  };

  function renderLine(msg: GuildMessage, masked: boolean): Promise<string> {
    return renderToString(
      createSSRApp(MessageWindow, { message: msg, remaining: 0, narration: null, masked }),
    );
  }

  it('shows the masked line: no title, the name and the number stay', async () => {
    const html = await renderLine(line, true);
    expect(html).not.toContain('取引先の看板');
    expect(html).toContain('たびびと の PR #12「＊＊＊＊＊＊」がマージされた');
  });

  it('shows the line as it is when not masked, and a notice as it is either way', async () => {
    expect(await renderLine(line, false)).toContain('「取引先の看板」');
    expect(await renderLine(message, true)).toContain('テスト');
  });
});
