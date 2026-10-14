import { describe, expect, it, vi } from 'vitest';
import { makeSettings } from '@conect-guild/snapshot/settings.fixtures';

// Reading the real settings (guild.settings.json) happens when this module is evaluated.
vi.mock('@conect-guild/snapshot/settings', () => {
  throw new Error('the real settings were read');
});

describe('guildFromSettings without the real settings', () => {
  it('loads and derives the guild when the real settings cannot be read', async () => {
    const { guildFromSettings } = await import('./guildFromSettings');
    const settings = makeSettings(4);
    expect(guildFromSettings(settings).departmentMember).toEqual(
      Object.fromEntries(settings.departments.map((d) => [d.label, d.member])),
    );
  });

  it('seats the members from the layout for the number of departments (Issue #18)', async () => {
    const { guildFromSettings } = await import('./guildFromSettings');
    const { LAYOUT4 } = await import('./render/layouts/layout4');
    const members = guildFromSettings(makeSettings(4)).members;
    expect(members.minori.seat).toEqual(LAYOUT4.desks[0]?.seat);
    expect(members.kaname.seat).toEqual(LAYOUT4.commanderSeat);
  });
});
