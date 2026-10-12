import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chooseSettingsFile,
  DEFAULT_SETTINGS_FILE,
  defaultSettingsFile,
  loadSettingsFile,
  LOCAL_SETTINGS_FILE,
  SETTINGS_ROOT,
  type SettingsReader,
} from './settingsFile.ts';
import { checkGuildSettings } from './settingsSchema.ts';

const ROOT = '/repo';

describe('chooseSettingsFile', () => {
  it('uses guild.settings.local.json when it exists', () => {
    expect(chooseSettingsFile(ROOT, (path) => path === '/repo/guild.settings.local.json')).toEqual({
      name: LOCAL_SETTINGS_FILE,
      path: '/repo/guild.settings.local.json',
    });
  });

  it('falls back to guild.settings.json when there is no local file', () => {
    expect(chooseSettingsFile(ROOT, () => false)).toEqual({
      name: DEFAULT_SETTINGS_FILE,
      path: '/repo/guild.settings.json',
    });
  });

  it('looks only at the local file under the root', () => {
    const asked: string[] = [];
    chooseSettingsFile(ROOT, (path) => {
      asked.push(path);
      return false;
    });
    expect(asked).toEqual(['/repo/guild.settings.local.json']);
  });

  it('ignores a local file elsewhere (say in the current directory)', () => {
    const file = chooseSettingsFile(ROOT, (path) => path === 'guild.settings.local.json');
    expect(file.name).toBe(DEFAULT_SETTINGS_FILE);
  });
});

describe('the settings root', () => {
  it('is the repository root, where guild.settings.json sits', () => {
    expect(defaultSettingsFile(SETTINGS_ROOT).path).toBe(
      join(import.meta.dirname, '../../../guild.settings.json'),
    );
  });
});

/** The shipped default, as text. */
const DEFAULT_TEXT = readFileSync(join(SETTINGS_ROOT, DEFAULT_SETTINGS_FILE), 'utf8');

/** A fake root `/repo` holding the given files. */
function filesOf(files: Readonly<Record<string, string>>): SettingsReader {
  const text = new Map(Object.entries(files).map(([name, content]) => [join(ROOT, name), content]));
  return {
    exists: (path) => text.has(path),
    readText: (path) => {
      const content = text.get(path);
      if (content === undefined) throw new Error(`ENOENT ${path}`);
      return content;
    },
  };
}

/** The default settings with another repo, as JSON text. */
function localText(repo: string): string {
  return JSON.stringify({ ...checkGuildSettings(JSON.parse(DEFAULT_TEXT)), repo });
}

describe('loadSettingsFile', () => {
  it('reads and checks the default when there is no local file', () => {
    const loaded = loadSettingsFile(ROOT, filesOf({ 'guild.settings.json': DEFAULT_TEXT }));
    expect(loaded.file.name).toBe(DEFAULT_SETTINGS_FILE);
    expect(loaded.settings.repo).toBe('yukihiroyamaguchi569/conect-management');
  });

  it('reads the local file instead when it exists', () => {
    const loaded = loadSettingsFile(
      ROOT,
      filesOf({
        'guild.settings.json': DEFAULT_TEXT,
        'guild.settings.local.json': localText('someone/else'),
      }),
    );
    expect(loaded.file).toEqual({
      name: LOCAL_SETTINGS_FILE,
      path: '/repo/guild.settings.local.json',
    });
    expect(loaded.settings.repo).toBe('someone/else');
  });

  it('stops with a message when the local file is not JSON', () => {
    const files = filesOf({
      'guild.settings.json': DEFAULT_TEXT,
      'guild.settings.local.json': '{ repo: ',
    });
    expect(() => loadSettingsFile(ROOT, files)).toThrow(
      /^guild\.settings\.local\.json を JSON として読めません: /,
    );
  });

  it('stops with the schema message naming the file when a value is invalid', () => {
    const files = filesOf({
      'guild.settings.json': DEFAULT_TEXT,
      'guild.settings.local.json': localText('no-slash'),
    });
    expect(() => loadSettingsFile(ROOT, files)).toThrow(
      /^guild\.settings\.local\.json is invalid[\s\S]*repo/,
    );
  });
});

describe('loadSettingsFile with an old guild.settings.local.ts', () => {
  it('stops and asks to move it, even next to the JSON', () => {
    const cases: Readonly<Record<string, string>>[] = [
      { 'guild.settings.json': DEFAULT_TEXT, 'guild.settings.local.ts': 'export {};' },
      {
        'guild.settings.json': DEFAULT_TEXT,
        'guild.settings.local.json': DEFAULT_TEXT,
        'guild.settings.local.ts': 'export {};',
      },
    ];
    for (const files of cases) {
      expect(() => loadSettingsFile(ROOT, filesOf(files))).toThrow(
        /guild\.settings\.local\.ts は読まなくなりました。値を guild\.settings\.local\.json に移し/,
      );
    }
  });

  it('never runs the file: code in it is only text that fails to parse', () => {
    const files = filesOf({
      'guild.settings.json': DEFAULT_TEXT,
      'guild.settings.local.json': 'globalThis.ran = true; export default {};',
    });
    expect(() => loadSettingsFile(ROOT, files)).toThrow(/JSON として読めません/);
    expect('ran' in globalThis).toBe(false);
  });
});
