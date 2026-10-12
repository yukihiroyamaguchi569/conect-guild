import { join, resolve } from 'node:path';
import { checkGuildSettings, type GuildSettings } from './settingsSchema.ts';

/** The repository root, where both settings files sit. */
export const SETTINGS_ROOT = resolve(import.meta.dirname, '../../..');

/** conect.llc's settings, checked in. The tests, the type check and the build always use it. */
export const DEFAULT_SETTINGS_FILE = 'guild.settings.json';

/** A team's own settings, git-ignored. Used instead of the default when the file exists. */
export const LOCAL_SETTINGS_FILE = 'guild.settings.local.json';

/** The local settings before Issue #89. No longer read: its values must move to the JSON file. */
export const OLD_LOCAL_SETTINGS_FILE = 'guild.settings.local.ts';

export interface SettingsFile {
  readonly name: typeof DEFAULT_SETTINGS_FILE | typeof LOCAL_SETTINGS_FILE;
  readonly path: string;
}

/** The default settings file under `root`. */
export function defaultSettingsFile(root: string): SettingsFile {
  return { name: DEFAULT_SETTINGS_FILE, path: join(root, DEFAULT_SETTINGS_FILE) };
}

/**
 * The settings file the collector and the dev server use: guild.settings.local.json when it
 * exists under `root`, else guild.settings.json. Only the file's presence decides; no argument or
 * environment variable can point anywhere else (docs/DESIGN.md 4.1).
 */
export function chooseSettingsFile(root: string, exists: (path: string) => boolean): SettingsFile {
  const local = join(root, LOCAL_SETTINGS_FILE);
  return exists(local) ? { name: LOCAL_SETTINGS_FILE, path: local } : defaultSettingsFile(root);
}

/** How to look at the files; tests pass a fake file system. */
export interface SettingsReader {
  readonly exists: (path: string) => boolean;
  readonly readText: (path: string) => string;
}

export interface LoadedSettings {
  readonly file: SettingsFile;
  readonly settings: GuildSettings;
}

/**
 * Chooses the settings file under `root`, reads it as JSON and checks it against the schema. The
 * file is only parsed, never run. Throws with a message saying what to do when an old
 * guild.settings.local.ts is still there (it is never silently skipped), when the file is not
 * JSON, or when the values are invalid.
 */
export function loadSettingsFile(root: string, reader: SettingsReader): LoadedSettings {
  if (reader.exists(join(root, OLD_LOCAL_SETTINGS_FILE))) {
    throw new Error(
      `${OLD_LOCAL_SETTINGS_FILE} は読まなくなりました。値を ${LOCAL_SETTINGS_FILE} に移し、${OLD_LOCAL_SETTINGS_FILE} を消してから起動し直してください（docs/setup.md）`,
    );
  }
  const file = chooseSettingsFile(root, reader.exists);
  let raw: unknown;
  try {
    raw = JSON.parse(reader.readText(file.path));
  } catch (error) {
    const reason = error instanceof SyntaxError ? error.message : 'could not be read';
    throw new Error(`${file.name} を JSON として読めません: ${reason}`, { cause: error });
  }
  return { file, settings: checkGuildSettings(raw, file.name) };
}
