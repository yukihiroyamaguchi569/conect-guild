import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS_FILE, SETTINGS_ROOT } from '@conect-guild/snapshot/settingsFile';
import { checkGuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { contractHome } from './home.ts';
import { LIST_USAGE, listedDirs, runListSessions, type ListSessionsDeps } from './listSessions.ts';
import { readSessionDirs, type SessionDirsReading } from './sessionFiles.ts';
import { sessionDirsNewestFirst } from './sessions.ts';
import { readFileSync } from 'node:fs';

const ID = (n: number): string => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HOME = '/home/me';

describe('sessionDirsNewestFirst (Issue #118)', () => {
  it('lists each folder once, newest first, by the last line of each id', async () => {
    const lines = [
      `${ID(1)} /home/me/old`,
      `${ID(2)} /home/me/side`,
      `${ID(3)} /home/me/old`,
      `${ID(4)} /home/me/moved-from`,
      `${ID(4)} /home/me/moved-to`,
      'not a line',
      '',
    ];
    expect(await sessionDirsNewestFirst(lines, new Set())).toEqual([
      '/home/me/moved-to',
      '/home/me/old',
      '/home/me/side',
    ]);
  });

  it('leaves out the excluded folders (exact match only)', async () => {
    const lines = [
      `${ID(1)} /home/me/company`,
      `${ID(2)} /home/me/company/pr`,
      `${ID(3)} /home/me/company/pr/worktree`,
      `${ID(4)} /home/me/side`,
    ];
    const excluded = new Set(['/home/me/company', '/home/me/company/pr']);
    expect(await sessionDirsNewestFirst(lines, excluded)).toEqual([
      '/home/me/side',
      '/home/me/company/pr/worktree',
    ]);
  });

  it('drops a folder whose only session moved to a company folder', async () => {
    const lines = [`${ID(1)} /home/me/side`, `${ID(1)} /home/me/company`];
    expect(await sessionDirsNewestFirst(lines, new Set(['/home/me/company']))).toEqual([]);
  });
});

describe('listedDirs', () => {
  it('writes the home directory as ~ and leaves out folders a guest could not be', () => {
    expect(
      listedDirs(
        ['/home/me/side', '/home/me', '/srv/app', '/home/me/a\u0007b', '/home/meow'],
        HOME,
      ),
    ).toEqual(['~/side', '~', '/srv/app', '/home/meow']);
  });

  it('contractHome does not touch a sibling of the home directory', () => {
    expect(contractHome('/home/meow/x', HOME)).toBe('/home/meow/x');
  });
});

describe('readSessionDirs on the files', () => {
  let dir = '';
  let log = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'guild-list-'));
    log = join(dir, 'dev-terminal-cwds.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('counts the unterminated last line when it stayed the same between the two reads', async () => {
    await writeFile(log, `\n${ID(1)} /x/side\n${ID(2)} /x/newest`);
    const settle = vi.fn(() => Promise.resolve());
    expect(await readSessionDirs(log, new Set(), settle)).toEqual({
      ok: true,
      dirs: ['/x/newest', '/x/side'],
    });
    expect(settle).toHaveBeenCalledOnce();
  });

  it('does not take a last line that was still being written', async () => {
    await writeFile(log, `\n${ID(1)} /x/side\n${ID(2)} /x/new`);
    const settle = () => writeFile(log, `\n${ID(1)} /x/side\n${ID(2)} /x/newer`);
    expect(await readSessionDirs(log, new Set(), settle)).toEqual({ ok: true, dirs: ['/x/side'] });
  });

  it('says the log is missing, and throws nothing', async () => {
    const settle = () => Promise.resolve();
    expect(await readSessionDirs(join(dir, 'none'), new Set(), settle)).toEqual({
      ok: false,
      kind: 'missing',
    });
  });
});

/** The checked-in settings: commander ~/conect-management and four departments under it. */
const DEFAULT_TEXT = readFileSync(join(SETTINGS_ROOT, DEFAULT_SETTINGS_FILE), 'utf8');

function deps(reading: SessionDirsReading, files = new Map<string, string>()) {
  const out: string[] = [];
  const excludedSeen: ReadonlySet<string>[] = [];
  const all = new Map([[join('/repo', DEFAULT_SETTINGS_FILE), DEFAULT_TEXT], ...files]);
  const value: ListSessionsDeps = {
    root: '/repo',
    home: HOME,
    exists: (path) => all.has(path),
    readText: (path) => {
      const text = all.get(path);
      if (text === undefined) throw new Error('ENOENT');
      return text;
    },
    readDirs: (excluded) => {
      excludedSeen.push(excluded);
      return Promise.resolve(reading);
    },
    out: (text) => {
      out.push(text);
    },
  };
  return { value, out: () => out.join(''), excludedSeen };
}

describe('runListSessions', () => {
  it('passes the company folders (expanded) to leave out, and numbers the rest', async () => {
    const d = deps({ ok: true, dirs: ['/home/me/side', '/srv/app'] });
    expect(await runListSessions([], d.value)).toBe(0);
    expect([...(d.excludedSeen[0] ?? [])]).toEqual([
      '/home/me/conect-management',
      '/home/me/conect-management/accounting',
      '/home/me/conect-management/pr',
      '/home/me/conect-management/planning',
      '/home/me/conect-management/general-affairs',
    ]);
    expect(d.out()).toBe(
      [
        'お客さんは 2 人まで（4 部門）。いまのお客さん: 0 人',
        'セッションのフォルダ（新しい順。司令塔と部門のフォルダは除く）:',
        '  1. ~/side',
        '  2. /srv/app',
        '',
      ].join('\n'),
    );
  });

  it('shows the guests of the settings in use', async () => {
    const local = {
      ...checkGuildSettings(JSON.parse(DEFAULT_TEXT)),
      guests: [{ name: 'たびびと', sessionDir: '~/side', repo: 'me/side' }],
    };
    const files = new Map([[join('/repo', 'guild.settings.local.json'), JSON.stringify(local)]]);
    const d = deps({ ok: true, dirs: [] }, files);
    expect(await runListSessions([], d.value)).toBe(0);
    expect(d.out()).toContain(
      'いまのお客さん: 1 人\n  guests[0] "たびびと" "~/side" repo "me/side"',
    );
    expect(d.out()).toContain('司令塔と部門のほかに、セッションのフォルダは見つかりません');
  });

  it('escapes a folder name for the terminal', async () => {
    const d = deps({ ok: true, dirs: ['/srv/a‮b'] });
    await runListSessions([], d.value);
    expect(d.out()).toContain('  1. /srv/a\\u202eb\n');
  });

  it('fails with the kind only when the log cannot be read', async () => {
    const d = deps({ ok: false, kind: 'missing' });
    expect(await runListSessions([], d.value)).toBe(1);
    expect(d.out()).toContain('MulmoTerminal のセッションの記録を読めません（missing）');
  });

  it('stops before reading the log when the settings are invalid', async () => {
    const files = new Map([[join('/repo', 'guild.settings.local.json'), '{']]);
    const d = deps({ ok: true, dirs: ['/srv/app'] }, files);
    expect(await runListSessions([], d.value)).toBe(1);
    expect(d.excludedSeen).toEqual([]);
    expect(d.out()).not.toContain('/srv/app');
  });

  it('takes no argument', async () => {
    const d = deps({ ok: true, dirs: [] });
    expect(await runListSessions(['--json'], d.value)).toBe(2);
    expect(d.out()).toBe(LIST_USAGE);
    expect(d.excludedSeen).toEqual([]);
  });
});
