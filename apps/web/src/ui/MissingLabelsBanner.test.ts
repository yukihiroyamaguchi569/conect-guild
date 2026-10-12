import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MissingLabelsBanner from './MissingLabelsBanner.vue';

/** Issue #85: the live screen's banner for the department labels missing in the repository. */
describe('MissingLabelsBanner', () => {
  it('names the departments and links to the fix in docs/setup.md', async () => {
    const html = await renderToString(
      createSSRApp(MissingLabelsBanner, { missing: [{ position: 2, label: '企画' }] }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain(
      '部門のラベルがリポジトリにありません: 企画（departments[2]）。この部門の Issue は受付に置かれます',
    );
    expect(html).toContain('直し方（docs/setup.md）');
    expect(html).toContain(
      'href="https://github.com/yukihiroyamaguchi569/conect-guild/blob/main/docs/setup.md#画面の帯に部門のラベルがリポジトリにありませんと出る"',
    );
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('draws a label as text, never as HTML', async () => {
    const html = await renderToString(
      createSSRApp(MissingLabelsBanner, { missing: [{ position: 0, label: '<b>経理</b>' }] }),
    );
    expect(html).toContain('&lt;b&gt;経理&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });
});
