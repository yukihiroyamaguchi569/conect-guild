import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MixupsBanner from './MixupsBanner.vue';

/** Issue #94: the live screen's banner for the departments suspected to be mixed up. */
describe('MixupsBanner', () => {
  it('names the departments and links to the fix in docs/setup.md', async () => {
    const mixups = [
      { kind: 'swap', a: { position: 1, label: '広報' }, b: { position: 2, label: '企画' } },
    ] as const;
    const html = await renderToString(createSSRApp(MixupsBanner, { mixups }));
    expect(html).toContain('role="status"');
    expect(html).toContain(
      '部門の設定が入れ替わっているかもしれません: 広報（departments[1]）と企画（departments[2]）の接頭辞の PR が、互いに相手のラベルの Issue に結び付いています',
    );
    expect(html).toContain('直し方（docs/setup.md の 3 章）');
    expect(html).toContain(
      'href="https://github.com/yukihiroyamaguchi569/conect-guild/blob/main/docs/setup.md#画面の帯に部門の設定が入れ替わっているかもしれませんと出る"',
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('draws a label as text, never as HTML', async () => {
    const mixups = [
      {
        kind: 'one-way',
        from: { position: 0, label: '<b>経理</b>' },
        to: { position: 3, label: '総務' },
      },
    ] as const;
    const html = await renderToString(createSSRApp(MixupsBanner, { mixups }));
    expect(html).toContain('&lt;b&gt;経理&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });
});
