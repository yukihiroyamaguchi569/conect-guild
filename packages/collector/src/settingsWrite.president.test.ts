import { describe, expect, it } from 'vitest';
import { checkGuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { runSettingsWrite } from './settingsWrite.ts';
import { DEFAULT_TEXT, fake, input, LOCAL, type Fake } from './settingsWrite.fixtures.test-util.ts';

/** Issue #141: `president` is written by hand; settings:write keeps it as it was. */

function localWithPresident(label: string): string {
  const base = checkGuildSettings(JSON.parse(DEFAULT_TEXT));
  return `${JSON.stringify({ ...base, president: { label } }, null, 2)}\n`;
}

function writtenPresident(f: Fake): unknown {
  const text = f.files.get(LOCAL);
  if (text === undefined) throw new Error('not written');
  return checkGuildSettings(JSON.parse(text)).president;
}

describe('runSettingsWrite with president (Issue #141)', () => {
  it('keeps the president of the settings it starts from', async () => {
    const f = fake();
    f.files.set(LOCAL, localWithPresident('社長'));
    expect(await runSettingsWrite(['--write', '--overwrite'], f.deps)).toBe(0);
    expect(writtenPresident(f)).toEqual({ label: '社長' });
  });

  it('writes no president key when the starting settings have none', async () => {
    const f = fake();
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(0);
    expect(f.files.get(LOCAL)).not.toContain('president');
  });

  it('stops when a new department takes the president’s label', async () => {
    const data = input();
    const first = data.departments[0];
    if (first === undefined) throw new Error('no department');
    data.departments[0] = { ...first, label: '社長' };
    const f = fake({ stdin: JSON.stringify(data), repoLabels: ['社長', '広報', '企画', '総務'] });
    f.files.set(LOCAL, localWithPresident('社長'));
    expect(await runSettingsWrite(['--write', '--overwrite'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain('president.label');
  });
});
