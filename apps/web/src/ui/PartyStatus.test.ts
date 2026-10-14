import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import PartyStatus from './PartyStatus.vue';

function render(props: { dense?: boolean; tight?: boolean }): Promise<string> {
  return renderToString(createSSRApp(PartyStatus, { rows: [], ...props }));
}

describe('PartyStatus packing', () => {
  it('packs the rows tighter only where the layout says (six departments, Issue #121)', async () => {
    const tight = await render({ dense: true, tight: true });
    expect(tight).toContain('party--dense');
    expect(tight).toContain('party--tight');
    const dense = await render({ dense: true });
    expect(dense).toContain('party--dense');
    expect(dense).not.toContain('party--tight');
    expect(await render({})).not.toMatch(/party--(dense|tight)/);
  });
});

describe('PartyStatus names', () => {
  it('puts the whole name and role in the name’s tooltip (cut with an ellipsis when long)', async () => {
    const html = await renderToString(
      createSSRApp(PartyStatus, {
        rows: [
          {
            id: 'musubi',
            name: 'むすび',
            role: '遠い国々との交渉をまとめる使節',
            face: { fill: '#594f56', ink: '#ffffff' },
            state: 'idle',
            stateLabel: '待機中',
            tooltip: null,
            rewards: 0,
            level: { label: 'Lv 1', detail: '', progress: 0 },
          },
        ],
      }),
    );
    expect(html).toContain('title="むすび 遠い国々との交渉をまとめる使節"');
  });
});
