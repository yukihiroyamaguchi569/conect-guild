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
