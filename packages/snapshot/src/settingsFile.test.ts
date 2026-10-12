import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chooseSettingsFile,
  DEFAULT_SETTINGS_FILE,
  defaultSettingsFile,
  LOCAL_SETTINGS_FILE,
  SETTINGS_ROOT,
} from './settingsFile.ts';

const ROOT = '/repo';

describe('chooseSettingsFile', () => {
  it('uses guild.settings.local.ts when it exists', () => {
    expect(chooseSettingsFile(ROOT, (path) => path === '/repo/guild.settings.local.ts')).toEqual({
      name: LOCAL_SETTINGS_FILE,
      path: '/repo/guild.settings.local.ts',
    });
  });

  it('falls back to guild.settings.ts when there is no local file', () => {
    expect(chooseSettingsFile(ROOT, () => false)).toEqual({
      name: DEFAULT_SETTINGS_FILE,
      path: '/repo/guild.settings.ts',
    });
  });

  it('looks only at the local file under the root', () => {
    const asked: string[] = [];
    chooseSettingsFile(ROOT, (path) => {
      asked.push(path);
      return false;
    });
    expect(asked).toEqual(['/repo/guild.settings.local.ts']);
  });

  it('ignores a local file elsewhere (say in the current directory)', () => {
    const file = chooseSettingsFile(ROOT, (path) => path === 'guild.settings.local.ts');
    expect(file.name).toBe(DEFAULT_SETTINGS_FILE);
  });
});

describe('the settings root', () => {
  it('is the repository root, where guild.settings.ts sits', () => {
    expect(defaultSettingsFile(SETTINGS_ROOT).path).toBe(
      join(import.meta.dirname, '../../../guild.settings.ts'),
    );
  });
});
