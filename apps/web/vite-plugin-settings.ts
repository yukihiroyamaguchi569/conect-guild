import { existsSync, realpathSync } from 'node:fs';
import {
  chooseSettingsFile,
  DEFAULT_SETTINGS_FILE,
  defaultSettingsFile,
  SETTINGS_ROOT,
} from '@conect-guild/snapshot/settingsFile';
import type { Plugin } from 'vite';

/** Where the files are and how to look at them; tests pass a fake file system. */
export interface SettingsFiles {
  readonly root: string;
  readonly exists: (path: string) => boolean;
  readonly realpath: (path: string) => string;
}

/** Imports of the module at `from` (a real path, as Vite resolves ids) go to `to`. */
export interface SettingsRedirect {
  readonly from: string;
  readonly to: string;
}

/**
 * Only the dev server in its default mode (`vite`, `npm run dev`) reads guild.settings.local.ts.
 * The build and the E2E server (`--mode e2e`) keep guild.settings.ts, like vitest, which does not
 * load this config at all. A mode can only fall back to the default; nothing can name a file.
 */
export function readsLocalSettings(command: 'build' | 'serve', mode: string): boolean {
  return command === 'serve' && mode === 'development';
}

/** The redirect to guild.settings.local.ts, or null when guild.settings.ts is used. */
export function settingsRedirect(
  command: 'build' | 'serve',
  mode: string,
  files: SettingsFiles,
): SettingsRedirect | null {
  if (!readsLocalSettings(command, mode)) return null;
  const file = chooseSettingsFile(files.root, files.exists);
  if (file.name === DEFAULT_SETTINGS_FILE) return null;
  return { from: files.realpath(defaultSettingsFile(files.root).path), to: file.path };
}

const NODE_FILES: SettingsFiles = {
  root: SETTINGS_ROOT,
  exists: existsSync,
  realpath: (path) => realpathSync(path),
};

/**
 * Sends the import of guild.settings.ts in packages/snapshot/src/settings.ts to
 * guild.settings.local.ts when that file exists, so the screen uses the same settings as the
 * collector (docs/DESIGN.md 4.1). Chosen once when the server starts; the schema check is the same.
 */
export function settingsPlugin(files: SettingsFiles = NODE_FILES): Plugin {
  let redirect: SettingsRedirect | null = null;
  return {
    name: 'conect-guild-settings',
    enforce: 'pre',
    configResolved(config) {
      redirect = settingsRedirect(config.command, config.mode, files);
    },
    async resolveId(source, importer, options) {
      if (redirect === null || !source.endsWith(DEFAULT_SETTINGS_FILE)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id === redirect.from ? redirect.to : resolved;
    },
  };
}
