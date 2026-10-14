import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SETTINGS_FILE, SETTINGS_ROOT } from '@conect-guild/snapshot/settingsFile';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkGuildSettings } from '@conect-guild/snapshot/settingsSchema';
import {
  E2E_DEPARTMENTS_ENV,
  E2E_DEPARTMENTS_MODE,
  E2E_SETTINGS_FILES,
  readsLocalSettings,
  settingsPlugin,
  settingsRedirect,
  type SettingsFiles,
} from './vite-plugin-settings.ts';

/** The shipped default, as text: a valid settings file. */
const VALID = readFileSync(join(SETTINGS_ROOT, DEFAULT_SETTINGS_FILE), 'utf8');

/**
 * A fake file system under /repo, reached through the /link symlink to show real paths. `local`
 * is the text of guild.settings.local.json (none when undefined); `oldLocal` adds the old .ts.
 */
function files(local: string | undefined, oldLocal = false): SettingsFiles {
  const text = new Map([['/link/guild.settings.json', VALID]]);
  if (local !== undefined) text.set('/link/guild.settings.local.json', local);
  if (oldLocal) text.set('/link/guild.settings.local.ts', 'export {};');
  return {
    root: '/link',
    exists: (path) => text.has(path),
    readText: (path) => text.get(path) ?? '',
    realpath: (path) => path.replace(/^\/link\//, '/repo/'),
  };
}

describe('readsLocalSettings', () => {
  it('is only the dev server in its default mode', () => {
    expect(readsLocalSettings('serve', 'development')).toBe(true);
  });

  it('is never the build, whatever the mode', () => {
    expect(readsLocalSettings('build', 'production')).toBe(false);
    expect(readsLocalSettings('build', 'development')).toBe(false);
  });

  it('is never the E2E server or the test mode', () => {
    expect(readsLocalSettings('serve', 'e2e')).toBe(false);
    expect(readsLocalSettings('serve', 'test')).toBe(false);
  });
});

describe('settingsRedirect', () => {
  it('sends guild.settings.json (by its real path) to guild.settings.local.json when it exists', () => {
    expect(settingsRedirect('serve', 'development', files(VALID))).toEqual({
      from: '/repo/guild.settings.json',
      to: '/link/guild.settings.local.json',
    });
  });

  it('keeps guild.settings.json when there is no local file', () => {
    expect(settingsRedirect('serve', 'development', files(undefined))).toBeNull();
  });

  it('keeps guild.settings.json for the build and E2E even with a local file', () => {
    expect(settingsRedirect('build', 'production', files(VALID))).toBeNull();
    expect(settingsRedirect('serve', 'e2e', files(VALID))).toBeNull();
  });

  it('leaves the local file unread for the build and E2E, even when it is broken', () => {
    expect(settingsRedirect('build', 'production', files('{', true))).toBeNull();
    expect(settingsRedirect('serve', 'e2e', files('{', true))).toBeNull();
  });

  it('stops the dev server when the local file is not JSON or invalid', () => {
    expect(() => settingsRedirect('serve', 'development', files('{'))).toThrow(
      /^guild\.settings\.local\.json を JSON として読めません/,
    );
    expect(() => settingsRedirect('serve', 'development', files('{}'))).toThrow(
      /^guild\.settings\.local\.json is invalid/,
    );
  });

  it('stops the dev server and asks to move an old guild.settings.local.json', () => {
    expect(() => settingsRedirect('serve', 'development', files(undefined, true))).toThrow(
      /guild\.settings\.local\.ts は読まなくなりました/,
    );
  });
});

describe('the E2E department mode (Issue #18, test only)', () => {
  const FIXTURE = E2E_SETTINGS_FILES['2'] ?? '';

  /** The fake files with the two-department fixture (the real one) under /link. */
  function withFixture(): SettingsFiles {
    const base = files(VALID);
    const fixture = readFileSync(join(SETTINGS_ROOT, FIXTURE), 'utf8');
    return {
      ...base,
      exists: (path) => path === `/link/${FIXTURE}` || base.exists(path),
      readText: (path) => (path === `/link/${FIXTURE}` ? fixture : base.readText(path)),
    };
  }

  it('sends guild.settings.json to the named fictional fixture, never the local file', () => {
    const env = { [E2E_DEPARTMENTS_ENV]: '2' };
    expect(settingsRedirect('serve', E2E_DEPARTMENTS_MODE, withFixture(), env)).toEqual({
      from: '/repo/guild.settings.json',
      to: `/link/${FIXTURE}`,
    });
  });

  it.each([undefined, '', '1', '4', '7', '../guild.settings.local.json', '__proto__', 'toString'])(
    'stops on %j: the variable only picks a fixture',
    (choice) => {
      const env = { [E2E_DEPARTMENTS_ENV]: choice };
      expect(() => settingsRedirect('serve', E2E_DEPARTMENTS_MODE, withFixture(), env)).toThrow(
        /needs GUILD_E2E_DEPARTMENTS=2, 3, 5, 6/,
      );
    },
  );

  it('is ignored by every other mode and by the build', () => {
    const env = { [E2E_DEPARTMENTS_ENV]: '2' };
    expect(settingsRedirect('serve', 'development', withFixture(), env)?.to).toBe(
      '/link/guild.settings.local.json',
    );
    expect(settingsRedirect('serve', 'e2e', withFixture(), env)).toBeNull();
    expect(settingsRedirect('build', 'production', withFixture(), env)).toBeNull();
    expect(settingsRedirect('build', E2E_DEPARTMENTS_MODE, withFixture(), env)).toBeNull();
  });

  it.each(Object.entries(E2E_SETTINGS_FILES))(
    'has a valid, fictional fixture of %s departments',
    (count, path) => {
      const settings = checkGuildSettings(
        JSON.parse(readFileSync(join(SETTINGS_ROOT, path), 'utf8')),
      );
      const real = checkGuildSettings(JSON.parse(VALID));
      // The guests' fixtures (Issue #108) are of four and of six departments.
      const guestFixtures: Readonly<Record<string, number>> = { guests: 4, 'guests-6': 6 };
      const departments = guestFixtures[count] ?? Number(count);
      expect(settings.departments).toHaveLength(departments);
      expect(settings.repo).not.toBe(real.repo);
      const realLabels = real.departments.map((d) => d.label);
      for (const d of settings.departments) {
        expect(realLabels).not.toContain(d.label);
        expect(real.departments.map((r) => r.sessionDir)).not.toContain(d.sessionDir);
      }
    },
  );
});

describe('the E2E fixtures with guests (Issue #108, test only)', () => {
  it.each(['guests', 'guests-6'])(
    'has two fictional guests in the %s fixture (Issue #108)',
    (key) => {
      const path = E2E_SETTINGS_FILES[key] ?? '';
      const settings = checkGuildSettings(
        JSON.parse(readFileSync(join(SETTINGS_ROOT, path), 'utf8')),
      );
      expect(settings.guests?.map((g) => g.repo?.startsWith('example-'))).toEqual([true, true]);
    },
  );
});

/** The real file system, for the dev server below. */
const NODE_FS = {
  exists: existsSync,
  readText: (path: string) => readFileSync(path, 'utf8'),
  realpath: realpathSync,
};

describe('settingsPlugin in a Vite dev server', () => {
  let base = '';
  let real = '';
  let server: ViteDevServer | undefined;

  beforeEach(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), 'guild-vite-')));
    real = join(base, 'real');
    await mkdir(join(real, 'nested'), { recursive: true });
    for (const file of ['guild.settings.json', 'guild.settings.local.json']) {
      await writeFile(join(real, file), VALID);
    }
    await writeFile(join(real, 'other.ts'), 'export {};\n');
    await writeFile(join(real, 'nested', 'guild.settings.json'), '{}\n');
    // The root is reached through a symlink, as /tmp is on macOS.
    await symlink(real, join(base, 'link'));
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    await rm(base, { recursive: true, force: true });
  });

  /** Starts a dev server (serve, development) with the plugin on the files under /link. */
  async function resolveWith(withLocal: boolean, source: string): Promise<string | undefined> {
    if (!withLocal) await rm(join(real, 'guild.settings.local.json'));
    server = await createServer({
      configFile: false,
      root: real,
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, ws: false },
      plugins: [settingsPlugin({ root: join(base, 'link'), ...NODE_FS })],
    });
    return (await server.pluginContainer.resolveId(source, join(real, 'importer.ts')))?.id;
  }

  it('sends the import of guild.settings.json to guild.settings.local.json', async () => {
    expect(await resolveWith(true, './guild.settings.json')).toBe(
      join(base, 'link', 'guild.settings.local.json'),
    );
  });

  it('sends an import through the symlinked path as well', async () => {
    expect(await resolveWith(true, join(base, 'link', 'guild.settings.json'))).toBe(
      join(base, 'link', 'guild.settings.local.json'),
    );
  });

  it('leaves other imports alone, even another file named guild.settings.json', async () => {
    expect(await resolveWith(true, './other.ts')).toBe(join(real, 'other.ts'));
    await server?.close();
    expect(await resolveWith(true, './nested/guild.settings.json')).toBe(
      join(real, 'nested', 'guild.settings.json'),
    );
  });

  it('keeps guild.settings.json when there is no local file', async () => {
    expect(await resolveWith(false, './guild.settings.json')).toBe(
      join(real, 'guild.settings.json'),
    );
  });
});
