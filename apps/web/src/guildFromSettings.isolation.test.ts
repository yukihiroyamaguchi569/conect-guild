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
});
