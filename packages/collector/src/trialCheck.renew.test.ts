import { describe, expect, it } from 'vitest';
import { TRIAL_MARK } from './trialCells.ts';
import {
  BASE,
  CLAUDE_MD,
  checkIn,
  COMMANDER_MD,
  FOLDER,
  NOT_FOUND,
  REPO,
  repoJson,
  SETTINGS,
  settingsJson,
  TRIAL_ID,
  trialWorld,
  type World,
} from './trialCheck.fixtures.test-util.ts';

const renew = ['renew', REPO] as const;

describe('trial:check renew', () => {
  it('gives the repository and the folder of a trial as /guild-trial left it', async () => {
    expect(await checkIn(trialWorld(), renew)).toEqual({
      code: 0,
      result: { ok: true, repo: REPO, folder: FOLDER, id: TRIAL_ID },
      errors: '',
    });
  });

  it.each<[string, (w: World) => void]>([
    ['settings-not-trial', (w) => w.files.set(SETTINGS, settingsJson('tester/real', '~/real'))],
    ['settings-not-trial', (w) => w.files.delete(SETTINGS)],
    ['settings-unreadable', (w) => w.files.set(SETTINGS, 'x')],
    ['base-symlink', (w) => w.links.add(BASE)],
    ['note-count', (w) => w.files.set(CLAUDE_MD, `# CLAUDE.md\n\n${TRIAL_MARK}\n`)],
    ['mark-count', (w) => w.files.set(CLAUDE_MD, `${COMMANDER_MD}${TRIAL_MARK}\n`)],
    ['origin', (w) => w.origins.set(FOLDER, 'https://github.com/tester/real.git')],
    ['origin', (w) => w.origins.delete(FOLDER)],
    ['repo-public', (w) => w.repos.set(REPO, repoJson(REPO, false))],
    ['repo-description', (w) => w.repos.set(REPO, repoJson(REPO, true, 'guild-trial の会社'))],
    ['repo-name', (w) => w.repos.set(REPO, repoJson('tester/x', true))],
    ['repo-missing', (w) => w.repos.set(REPO, NOT_FOUND)],
    ['gh-failed', (w) => w.repos.set(REPO, { ok: false, notFound: false })],
    ['gh-invalid', (w) => w.repos.set(REPO, { ok: true, stdout: '[]' })],
  ])('refuses with %s', async (kind, change) => {
    const world = trialWorld();
    change(world);
    expect(await checkIn(world, renew)).toMatchObject({
      code: 1,
      result: { ok: false, failed: [kind] },
    });
  });
});

describe('trial:check renew refuses', () => {
  it('refuses a folder that is a symbolic link or missing', async () => {
    const linked = trialWorld();
    linked.links.add(FOLDER);
    expect((await checkIn(linked, renew)).result).toEqual({
      ok: false,
      failed: ['folder-symlink'],
    });
    const gone = trialWorld();
    gone.dirs.delete(FOLDER);
    expect((await checkIn(gone, renew)).result).toEqual({
      ok: false,
      failed: ['folder-missing'],
    });
  });

  it('refuses an old-form name (its repository has no description to take off)', async () => {
    const world = trialWorld();
    const old = 'tester/20261015-a3f9';
    world.files.set(SETTINGS, settingsJson(old, '~/guild-trial/20261015-a3f9'));
    expect((await checkIn(world, ['renew', old])).result).toEqual({
      ok: false,
      failed: ['name-old-form', 'folder-missing', 'repo-missing'],
    });
  });

  it('lists every condition that fails', async () => {
    const world = trialWorld();
    world.links.add(CLAUDE_MD);
    world.repos.set(REPO, repoJson(REPO, false, ''));
    expect((await checkIn(world, renew)).result).toEqual({
      ok: false,
      failed: ['claude-md-symlink', 'mark-count', 'note-count', 'repo-public', 'repo-description'],
    });
  });
});

const RENAMED = 'tester/acme';
const renewing = ['renewing', REPO, 'acme', TRIAL_ID] as const;

/** The trial after renew's step 4-1 (and 4-2): its description is `acme の会社`. */
function describedWorld(): World {
  const world = trialWorld();
  world.repos.set(REPO, repoJson(REPO, true, 'acme の会社'));
  world.files.set(CLAUDE_MD, '# CLAUDE.md\n');
  return world;
}

describe('trial:check renewing', () => {
  it('gives the old repository before it is renamed', async () => {
    const world = describedWorld();
    expect(await checkIn(world, renewing)).toMatchObject({
      code: 0,
      result: { ok: true, repo: REPO, folder: FOLDER },
    });
    expect(world.ghCalls.map((call) => call[2])).toEqual([RENAMED, REPO]);
  });

  it('gives the renamed repository once it is renamed and origin follows it', async () => {
    const world = describedWorld();
    world.repos.delete(REPO);
    world.repos.set(RENAMED, repoJson(RENAMED, true, 'acme の会社'));
    world.origins.set(FOLDER, `git@github.com:${RENAMED}.git`);
    expect((await checkIn(world, renewing)).result).toEqual({
      ok: true,
      repo: RENAMED,
      folder: FOLDER,
    });
  });

  it.each<[string, (w: World) => void]>([
    ['repo-description', (w) => w.repos.set(REPO, repoJson(REPO))],
    ['repo-description', (w) => w.repos.set(RENAMED, repoJson(RENAMED, true, '別の会社'))],
    ['repo-public', (w) => w.repos.set(REPO, repoJson(REPO, false, 'acme の会社'))],
    // Another private repository under the new name, with the same description, is not the trial.
    ['repo-id', (w) => w.repos.set(RENAMED, repoJson(RENAMED, true, 'acme の会社', 'R_kgDOother'))],
    ['repo-id', (w) => w.repos.set(REPO, repoJson(REPO, true, 'acme の会社', 'R_kgDOother'))],
    ['repo-missing', (w) => w.repos.delete(REPO)],
    ['origin', (w) => w.origins.set(FOLDER, 'https://github.com/tester/real.git')],
    ['settings-not-trial', (w) => w.files.set(SETTINGS, settingsJson(RENAMED, '~/acme'))],
    ['folder-missing', (w) => w.dirs.delete(FOLDER)],
  ])('refuses with %s', async (kind, change) => {
    const world = describedWorld();
    change(world);
    expect(await checkIn(world, renewing)).toMatchObject({
      code: 1,
      result: { ok: false, failed: [kind] },
    });
  });

  it.each(['guild-trial-9', 'guild-trial-acme', '20261015-a3f9', 'Acme', 'a/b', '-acme', ''])(
    'refuses the new name %j',
    async (name) => {
      const world = describedWorld();
      expect(await checkIn(world, ['renewing', REPO, name, TRIAL_ID])).toMatchObject({
        code: 1,
        result: { ok: false, failed: ['new-name'] },
      });
      expect(world.ghCalls).toEqual([]);
    },
  );

  it.each(['', 'R kg', 'R_/x', 'x'.repeat(201)])('refuses the id %j', async (id) => {
    const world = describedWorld();
    expect(await checkIn(world, ['renewing', REPO, 'acme', id])).toMatchObject({
      code: 1,
      result: { ok: false, failed: ['id'] },
    });
    expect(world.ghCalls).toEqual([]);
  });
});
