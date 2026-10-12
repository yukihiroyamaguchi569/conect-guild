import { describe, expect, it } from 'vitest';
import {
  readsLocalSettings,
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
