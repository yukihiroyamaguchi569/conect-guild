import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { checkGuildSettings } from '@conect-guild/snapshot/settingsSchema';
import {
  DEFAULT_SETTINGS_FILE,
  defaultSettingsFile,
  loadSettingsFile,
  SETTINGS_ROOT,
  type SettingsReader,
} from '@conect-guild/snapshot/settingsFile';
import type { Plugin } from 'vite';

/** Where the files are and how to look at them; tests pass a fake file system. */
export interface SettingsFiles extends SettingsReader {
  readonly root: string;
  readonly realpath: (path: string) => string;
}

/** Imports of the module at `from` (a real path, as Vite resolves ids) go to `to`. */
export interface SettingsRedirect {
  readonly from: string;
  readonly to: string;
}

/**
 * Only the dev server in its default mode (`vite`, `npm run dev`) reads guild.settings.local.json.
 * The build and the E2E server (`--mode e2e`) keep guild.settings.json, like vitest, which does
 * not load this config at all. A mode can only fall back to the default; nothing can name a file.
 */
export function readsLocalSettings(command: 'build' | 'serve', mode: string): boolean {
  return command === 'serve' && mode === 'development';
}

/**
 * Test only (Issue #18): the E2E servers of other department counts start in this mode with
 * E2E_DEPARTMENTS_ENV naming one of E2E_SETTINGS_FILES, the fictional settings checked in under
 * apps/web/e2e/settings. Neither `npm run dev` (mode development) nor the build (production) is
 * in this mode, and the variable can only pick one of these files, never name a path; the
 * collector does not read it at all.
 */
export const E2E_DEPARTMENTS_MODE = 'e2e-departments';
export const E2E_DEPARTMENTS_ENV = 'GUILD_E2E_DEPARTMENTS';
export const E2E_SETTINGS_FILES: Readonly<Record<string, string>> = {
  '2': 'apps/web/e2e/settings/departments-2.json',
  '3': 'apps/web/e2e/settings/departments-3.json',
  '5': 'apps/web/e2e/settings/departments-5.json',
  '6': 'apps/web/e2e/settings/departments-6.json',
  // Four departments and two fictional guests (Issue #108).
  guests: 'apps/web/e2e/settings/guests.json',
  // Six departments and the same two guests, for a look at the guests by the right-hand door.
  'guests-6': 'apps/web/e2e/settings/guests-6.json',
};

/** The fixture of the E2E department mode, checked like any settings file; it must be named. */
function e2eRedirect(
  files: SettingsFiles,
  env: Readonly<Record<string, string | undefined>>,
): SettingsRedirect {
  const choice = env[E2E_DEPARTMENTS_ENV] ?? '';
  const fixture = Object.hasOwn(E2E_SETTINGS_FILES, choice)
    ? E2E_SETTINGS_FILES[choice]
    : undefined;
  if (fixture === undefined) {
    const known = Object.keys(E2E_SETTINGS_FILES).join(', ');
    throw new Error(`--mode ${E2E_DEPARTMENTS_MODE} needs ${E2E_DEPARTMENTS_ENV}=${known}`);
  }
  const to = join(files.root, fixture);
  checkGuildSettings(JSON.parse(files.readText(to)), fixture);
  return { from: files.realpath(defaultSettingsFile(files.root).path), to };
}

/**
 * The redirect to guild.settings.local.json, or null when guild.settings.json is used. For the
 * dev server the chosen file is read as JSON and checked first, so an old guild.settings.local.json,
 * a file that is not JSON or an invalid value stops the server with the same message as the
 * collector. The E2E department mode goes to its fictional fixture instead (E2E_DEPARTMENTS_MODE).
 */
export function settingsRedirect(
  command: 'build' | 'serve',
  mode: string,
  files: SettingsFiles,
  env: Readonly<Record<string, string | undefined>> = {},
): SettingsRedirect | null {
  if (command === 'serve' && mode === E2E_DEPARTMENTS_MODE) return e2eRedirect(files, env);
  if (!readsLocalSettings(command, mode)) return null;
  const { file } = loadSettingsFile(files.root, files);
  if (file.name === DEFAULT_SETTINGS_FILE) return null;
  return { from: files.realpath(defaultSettingsFile(files.root).path), to: file.path };
}

const NODE_FILES: SettingsFiles = {
  root: SETTINGS_ROOT,
  exists: existsSync,
  readText: (path) => readFileSync(path, 'utf8'),
  realpath: (path) => realpathSync(path),
};

/**
 * Sends the import of guild.settings.json in packages/snapshot/src/settings.ts to
 * guild.settings.local.json when that file exists, so the screen uses the same settings as the
 * collector (docs/DESIGN.md 4.1). Chosen once when the server starts; the schema check is the same.
 */
export function settingsPlugin(
  files: SettingsFiles = NODE_FILES,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Plugin {
  let redirect: SettingsRedirect | null = null;
  return {
    name: 'conect-guild-settings',
    enforce: 'pre',
    // The E2E servers of each department count start together: each keeps its own dependency
    // cache, as two servers writing the same one fail to rename it.
    config(_config, { command, mode }) {
      if (command !== 'serve' || mode !== E2E_DEPARTMENTS_MODE) return null;
      const choice = env[E2E_DEPARTMENTS_ENV] ?? '';
      return Object.hasOwn(E2E_SETTINGS_FILES, choice)
        ? { cacheDir: `node_modules/.vite-${E2E_DEPARTMENTS_MODE}-${choice}` }
        : null;
    },
    configResolved(config) {
      redirect = settingsRedirect(config.command, config.mode, files, env);
    },
    async resolveId(source, importer, options) {
      if (redirect === null || !source.endsWith(DEFAULT_SETTINGS_FILE)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id === redirect.from ? redirect.to : resolved;
    },
  };
}
