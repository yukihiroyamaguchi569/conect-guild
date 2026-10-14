import { describe, expect, it } from 'vitest';
import { checkGuildSettings, type GuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { runSettingsWrite } from './settingsWrite.ts';
import { DEFAULT_TEXT, fake, LOCAL, type Fake } from './settingsWrite.fixtures.test-util.ts';

function written(f: Fake): GuildSettings {
  const text = f.files.get(LOCAL);
  if (text === undefined) throw new Error('not written');
  return checkGuildSettings(JSON.parse(text));
}

describe('runSettingsWrite with guests (Issue #108)', () => {
  const GUESTS = [
    { name: 'たびびと', sessionDir: '~/visitor', repo: 'visitor/app' },
    { name: 'ぼうけんしゃ', sessionDir: '/srv/wanderer' },
  ];

  function localWithGuests(guests: unknown): string {
    const base = checkGuildSettings(JSON.parse(DEFAULT_TEXT));
    return `${JSON.stringify({ ...base, guests }, null, 2)}\n`;
  }

  it('keeps the guests of the settings it starts from', async () => {
    const f = fake();
    f.files.set(LOCAL, localWithGuests(GUESTS));
    expect(await runSettingsWrite(['--write', '--overwrite'], f.deps)).toBe(0);
    expect(written(f).guests).toEqual(GUESTS);
  });

  it('writes no guests key when the starting settings have none', async () => {
    const f = fake();
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(0);
    expect(f.files.get(LOCAL)).not.toContain('guests');
  });

  it('stops when a kept guest now sits in a new company folder or on the new repo', async () => {
    const f = fake();
    f.files.set(
      LOCAL,
      localWithGuests([{ name: 'たびびと', sessionDir: '~/company/pr', repo: 'ME/Company' }]),
    );
    expect(await runSettingsWrite(['--write', '--overwrite'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain('guests[0].sessionDir');
    expect(f.output()).toContain('guests[0].repo');
  });
});
