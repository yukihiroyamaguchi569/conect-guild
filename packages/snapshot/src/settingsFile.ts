import { join, resolve } from 'node:path';

/** The repository root, where both settings files sit. */
export const SETTINGS_ROOT = resolve(import.meta.dirname, '../../..');

/** conect.llc's settings, checked in. The tests, the type check and the build always use it. */
export const DEFAULT_SETTINGS_FILE = 'guild.settings.ts';

/** A team's own settings, git-ignored. Used instead of the default when the file exists. */
export const LOCAL_SETTINGS_FILE = 'guild.settings.local.ts';

export interface SettingsFile {
  readonly name: typeof DEFAULT_SETTINGS_FILE | typeof LOCAL_SETTINGS_FILE;
  readonly path: string;
}

/** The default settings file under `root`. */
export function defaultSettingsFile(root: string): SettingsFile {
  return { name: DEFAULT_SETTINGS_FILE, path: join(root, DEFAULT_SETTINGS_FILE) };
}

/**
 * The settings file the collector and the dev server use: guild.settings.local.ts when it exists
 * under `root`, else guild.settings.ts. Only the file's presence decides; no argument or
 * environment variable can point anywhere else (docs/DESIGN.md 4.1).
 */
export function chooseSettingsFile(root: string, exists: (path: string) => boolean): SettingsFile {
  const local = join(root, LOCAL_SETTINGS_FILE);
  return exists(local) ? { name: LOCAL_SETTINGS_FILE, path: local } : defaultSettingsFile(root);
}
