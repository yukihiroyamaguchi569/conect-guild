import { describe, expect, it } from 'vitest';
import { HOME } from './trialCells.fixtures.test-util.ts';
import {
  BAK,
  BASE,
  CLAUDE_MD,
  checkIn,
  depsOf,
  FOLDER,
  REPO,
  repoJson,
  SETTINGS,
  settingsJson,
  trialWorld,
} from './trialCheck.fixtures.test-util.ts';

const cleanup = ['cleanup', REPO] as const;

describe('trial:check cleanup', () => {
  it('gives the repository, the folder and both settings files of a trial as /guild-trial left it', async () => {
    const world = trialWorld();
    expect(await checkIn(world, cleanup)).toEqual({
      code: 0,
      result: {
        ok: true,
        repo: REPO,
        folder: FOLDER,
        settings: true,
        settingsBak: true,
        kept: [],
      },
      errors: '',
    });
    expect(world.ghCalls).toEqual([
      ['repo', 'view', REPO, '--json', 'nameWithOwner,isPrivate,description'],
    ]);
  });

  it('still gives the repository when the folder is gone and the settings point at it', async () => {
    const world = trialWorld();
    world.dirs.delete(FOLDER);
    expect((await checkIn(world, cleanup)).result).toMatchObject({
      ok: true,
      repo: REPO,
      folder: null,
      kept: [],
    });
  });

  it('links the repository through the folder origin when the settings are elsewhere', async () => {
    const world = trialWorld();
    world.files.set(SETTINGS, settingsJson('tester/real', '~/real'));
    expect((await checkIn(world, cleanup)).result).toMatchObject({
      ok: true,
      repo: REPO,
      folder: FOLDER,
      settings: false,
      settingsBak: false,
    });
  });

  it('accepts an ssh origin without .git', async () => {
    const world = trialWorld();
    world.files.delete(SETTINGS);
    world.origins.set(FOLDER, `git@github.com:${REPO}`);
    expect((await checkIn(world, cleanup)).result).toMatchObject({ repo: REPO });
  });
});

describe('trial:check cleanup keeps', () => {
  it('keeps the folder and the repository, and asks no gh, when the origin is another repository and the settings are elsewhere', async () => {
    const world = trialWorld();
    world.files.delete(SETTINGS);
    world.origins.set(FOLDER, 'https://github.com/tester/real.git');
    expect((await checkIn(world, cleanup)).result).toMatchObject({
      ok: true,
      repo: null,
      folder: null,
      kept: ['folder-not-trial', 'repo-not-linked'],
    });
    expect(world.ghCalls).toEqual([]);
  });

  it('keeps a folder that is a symbolic link, and does not follow its origin', async () => {
    const world = trialWorld();
    world.files.delete(SETTINGS);
    world.links.add(FOLDER);
    expect((await checkIn(world, cleanup)).result).toMatchObject({
      repo: null,
      folder: null,
      kept: ['folder-symlink', 'repo-not-linked'],
    });
  });

  it.each([
    [
      'without the trial mark',
      (w: ReturnType<typeof trialWorld>) => w.files.set(CLAUDE_MD, '# 経理\n'),
    ],
    ['without a CLAUDE.md', (w: ReturnType<typeof trialWorld>) => w.files.delete(CLAUDE_MD)],
    ['whose CLAUDE.md is a link', (w: ReturnType<typeof trialWorld>) => w.links.add(CLAUDE_MD)],
    // The mark alone is any text; /guild-trial's folder always has the trial's origin.
    ['without an origin', (w: ReturnType<typeof trialWorld>) => w.origins.delete(FOLDER)],
    [
      'whose origin is another repository',
      (w: ReturnType<typeof trialWorld>) =>
        w.origins.set(FOLDER, 'https://github.com/tester/real.git'),
    ],
  ])('keeps a folder %s', async (_, change) => {
    const world = trialWorld();
    change(world);
    expect((await checkIn(world, cleanup)).result).toMatchObject({
      repo: REPO,
      folder: null,
      kept: ['folder-not-trial'],
    });
  });
});

describe('trial:check cleanup keeps the repository', () => {
  it.each([
    ['repo-public', repoJson(REPO, false)],
    ['repo-description', repoJson(REPO, true, '本物の会社')],
    ['repo-name', repoJson('tester/other', true)],
    ['repo-missing', { ok: false, notFound: true } as const],
  ])('keeps the repository: %s', async (kind, answer) => {
    const world = trialWorld();
    world.repos.set(REPO, answer);
    expect(await checkIn(world, cleanup)).toMatchObject({
      code: 0,
      result: { ok: true, repo: null, folder: FOLDER, kept: [kind] },
    });
  });

  it('does not ask for the description of an old-form name', async () => {
    const world = trialWorld();
    const old = 'tester/20261015-a3f9';
    world.files.set(SETTINGS, settingsJson(old, '~/guild-trial/20261015-a3f9'));
    world.repos.set(old, repoJson(old, true, ''));
    expect((await checkIn(world, ['cleanup', old])).result).toMatchObject({
      repo: old,
      folder: null,
    });
  });

  it('leaves a .bak that backs up another company', async () => {
    const world = trialWorld();
    world.files.set(BAK, settingsJson('tester/real', '~/real'));
    expect((await checkIn(world, cleanup)).result).toMatchObject({
      settings: true,
      settingsBak: false,
    });
  });
});

describe('trial:check cleanup stops', () => {
  it.each([
    ['base-symlink', (w: ReturnType<typeof trialWorld>) => w.links.add(BASE)],
    ['settings-unreadable', (w: ReturnType<typeof trialWorld>) => w.files.set(SETTINGS, '{')],
    [
      'settings-unreadable',
      (w: ReturnType<typeof trialWorld>) => w.files.set(SETTINGS, '{"repo":"tester/guild-trial"}'),
    ],
    ['settings-unreadable', (w: ReturnType<typeof trialWorld>) => w.files.set(BAK, '[]')],
    ['settings-unreadable', (w: ReturnType<typeof trialWorld>) => w.dirs.add(SETTINGS)],
    [
      'gh-failed',
      (w: ReturnType<typeof trialWorld>) => w.repos.set(REPO, { ok: false, notFound: false }),
    ],
    [
      'gh-invalid',
      (w: ReturnType<typeof trialWorld>) => w.repos.set(REPO, { ok: true, stdout: 'not json' }),
    ],
    [
      'gh-invalid',
      (w: ReturnType<typeof trialWorld>) =>
        w.repos.set(REPO, { ok: true, stdout: '{"nameWithOwner":"tester/guild-trial"}' }),
    ],
  ])('stops when it cannot tell: %s', async (kind, change) => {
    const world = trialWorld();
    change(world);
    expect(await checkIn(world, cleanup)).toMatchObject({
      code: 1,
      result: { ok: false, failed: [kind] },
    });
  });

  it('stops when the file system cannot be read', async () => {
    const world = trialWorld();
    const deps = {
      ...depsOf(world),
      entry: (): never => {
        throw new Error('EACCES');
      },
    };
    expect(await checkIn(world, cleanup, deps)).toMatchObject({
      code: 1,
      result: { ok: false, failed: ['unreadable'] },
    });
  });
});

describe('trial:check input', () => {
  it.each([
    ['tester/../real', ['owner', 'name']],
    ['tester/guild-trial/..', ['owner']],
    ['tester/guild-trial-0', ['name']],
    ['tester/real', ['name']],
    ['tester/GUILD-TRIAL', ['name']],
    ['te ster/guild-trial', ['owner']],
    ['guild-trial', ['name']],
    [`${'a'.repeat(40)}/guild-trial`, ['owner']],
  ])('refuses %s before it reads anything', async (arg, failed) => {
    const world = trialWorld();
    const deps = {
      ...depsOf(world),
      entry: (): never => {
        throw new Error('must not read');
      },
    };
    expect(await checkIn(world, ['cleanup', arg], deps)).toMatchObject({
      code: 1,
      result: { ok: false, failed },
    });
    expect(world.ghCalls).toEqual([]);
  });

  it.each([
    [[]],
    [['cleanup']],
    [['delete', REPO]],
    [['cleanup', REPO, 'x']],
    [['renewing', REPO]],
  ])('prints the usage for %j', async (args) => {
    const { code, result, errors } = await checkIn(trialWorld(), args);
    expect(code).toBe(2);
    expect(result).toBeNull();
    expect(errors).toContain('使い方');
  });

  it('prints paths under the home it was given', async () => {
    const { result } = await checkIn(trialWorld(), cleanup);
    expect(result).toMatchObject({ folder: `${HOME}/guild-trial/guild-trial` });
  });
});
