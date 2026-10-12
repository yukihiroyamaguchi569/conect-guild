import { existsSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readsLocalSettings,
  settingsPlugin,
  settingsRedirect,
  type SettingsFiles,
} from './vite-plugin-settings.ts';

/** A fake file system under /repo, reached through the /link symlink to show real paths. */
function files(withLocal: boolean): SettingsFiles {
  return {
    root: '/link',
    exists: (path) => withLocal && path === '/link/guild.settings.local.ts',
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
  it('sends guild.settings.ts (by its real path) to guild.settings.local.ts when it exists', () => {
    expect(settingsRedirect('serve', 'development', files(true))).toEqual({
      from: '/repo/guild.settings.ts',
      to: '/link/guild.settings.local.ts',
    });
  });

  it('keeps guild.settings.ts when there is no local file', () => {
    expect(settingsRedirect('serve', 'development', files(false))).toBeNull();
  });

  it('keeps guild.settings.ts for the build and E2E even with a local file', () => {
    expect(settingsRedirect('build', 'production', files(true))).toBeNull();
    expect(settingsRedirect('serve', 'e2e', files(true))).toBeNull();
  });
});

describe('settingsPlugin in a Vite dev server', () => {
  let base = '';
  let real = '';
  let server: ViteDevServer | undefined;

  beforeEach(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), 'guild-vite-')));
    real = join(base, 'real');
    await mkdir(join(real, 'nested'), { recursive: true });
    for (const file of ['guild.settings.ts', 'guild.settings.local.ts', 'other.ts']) {
      await writeFile(join(real, file), 'export {};\n');
    }
    await writeFile(join(real, 'nested', 'guild.settings.ts'), 'export {};\n');
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
    if (!withLocal) await rm(join(real, 'guild.settings.local.ts'));
    server = await createServer({
      configFile: false,
      root: real,
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, ws: false },
      plugins: [
        settingsPlugin({ root: join(base, 'link'), exists: existsSync, realpath: realpathSync }),
      ],
    });
    return (await server.pluginContainer.resolveId(source, join(real, 'importer.ts')))?.id;
  }

  it('sends the import of guild.settings.ts to guild.settings.local.ts', async () => {
    expect(await resolveWith(true, './guild.settings.ts')).toBe(
      join(base, 'link', 'guild.settings.local.ts'),
    );
  });

  it('sends an import through the symlinked path as well', async () => {
    expect(await resolveWith(true, join(base, 'link', 'guild.settings.ts'))).toBe(
      join(base, 'link', 'guild.settings.local.ts'),
    );
  });

  it('leaves other imports alone, even another file named guild.settings.ts', async () => {
    expect(await resolveWith(true, './other.ts')).toBe(join(real, 'other.ts'));
    await server?.close();
    expect(await resolveWith(true, './nested/guild.settings.ts')).toBe(
      join(real, 'nested', 'guild.settings.ts'),
    );
  });

  it('keeps guild.settings.ts when there is no local file', async () => {
    expect(await resolveWith(false, './guild.settings.ts')).toBe(join(real, 'guild.settings.ts'));
  });
});
