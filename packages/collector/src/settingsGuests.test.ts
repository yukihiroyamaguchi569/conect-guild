import { describe, expect, it } from 'vitest';
import { repoFromRemoteUrl, resolveGuestRepos, type GitRunner } from './settingsGuests.ts';

describe('repoFromRemoteUrl (Issue #118)', () => {
  it.each([
    ['https://github.com/me/side.git\n', 'me/side'],
    ['https://github.com/me/side', 'me/side'],
    ['https://github.com/me/side/', 'me/side'],
    ['https://token@github.com/me/side.git', 'me/side'],
    ['git@github.com:me/side.git', 'me/side'],
    ['ssh://git@github.com/me/my.app.git', 'me/my.app'],
  ])('reads %j as %s', (url, repo) => {
    expect(repoFromRemoteUrl(url)).toBe(repo);
  });

  it.each([
    'https://gitlab.com/me/side.git',
    'https://github.com.evil.example/me/side',
    'git@github.com:me/side/extra.git',
    'https://github.com/me',
    'https://github.com/-me/side',
    '/home/me/bare.git',
    '',
  ])('suggests nothing for %j', (url) => {
    expect(repoFromRemoteUrl(url)).toBeNull();
  });
});

describe('resolveGuestRepos', () => {
  const calls: (readonly string[])[] = [];
  const git: GitRunner = (args) => {
    calls.push(args);
    return args[1] === '/home/me/side'
      ? Promise.resolve('git@github.com:me/side.git\n')
      : Promise.reject(new Error('git-failed'));
  };
  const reader = { home: '/home/me', isDirectory: (path: string) => path !== '/home/me/gone', git };

  it('keeps a given repo, suggests a missing one, and leaves null and failures without', async () => {
    calls.length = 0;
    const resolved = await resolveGuestRepos(
      [
        { name: 'a', sessionDir: '~/x', repo: 'me/x' },
        { name: 'b', sessionDir: '~/side' },
        { name: 'c', sessionDir: '~/side', repo: null },
        { name: 'd', sessionDir: '~/plain' },
      ],
      reader,
    );
    expect(resolved).toEqual([
      { guest: { name: 'a', sessionDir: '~/x', repo: 'me/x' }, repoFrom: 'input' },
      { guest: { name: 'b', sessionDir: '~/side', repo: 'me/side' }, repoFrom: 'git' },
      { guest: { name: 'c', sessionDir: '~/side' }, repoFrom: 'none' },
      { guest: { name: 'd', sessionDir: '~/plain' }, repoFrom: 'none' },
    ]);
    expect(calls).toEqual([
      ['-C', '/home/me/side', 'remote', 'get-url', 'origin'],
      ['-C', '/home/me/plain', 'remote', 'get-url', 'origin'],
    ]);
  });

  it('does not run git for a folder that is not there or that the settings would not take', async () => {
    calls.length = 0;
    const resolved = await resolveGuestRepos(
      [
        { name: 'a', sessionDir: '~/gone' },
        { name: 'b', sessionDir: '--upload-pack=x' },
        { name: 'c', sessionDir: 'relative/side' },
      ],
      reader,
    );
    expect(resolved.map((r) => r.repoFrom)).toEqual(['none', 'none', 'none']);
    expect(calls).toEqual([]);
  });
});
