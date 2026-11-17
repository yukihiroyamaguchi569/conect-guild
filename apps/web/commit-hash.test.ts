import { describe, expect, it } from 'vitest';
import { commitHashFor, E2E_COMMIT_HASH, readCommitHash, type RunFile } from './commit-hash.ts';

describe('readCommitHash (Issue #281)', () => {
  it('asks git for the short hash of HEAD with an argument array, in the given directory', () => {
    const calls: [string, readonly string[], string][] = [];
    const run: RunFile = (file, args, cwd) => {
      calls.push([file, args, cwd]);
      return 'a1b2c3d\n';
    };
    expect(readCommitHash('/repo', run)).toBe('a1b2c3d');
    expect(calls).toEqual([['git', ['rev-parse', '--short', 'HEAD'], '/repo']]);
  });

  it('is null when git fails (missing, or not a repository)', () => {
    const run: RunFile = () => {
      throw new Error('spawn git ENOENT');
    };
    expect(readCommitHash('/repo', run)).toBeNull();
  });

  it('is null when git prints something other than a hash', () => {
    expect(readCommitHash('/repo', () => '')).toBeNull();
    expect(readCommitHash('/repo', () => 'HEAD\n')).toBeNull();
  });

  it('keeps a hash of up to 12 characters, so that the tab keeps its buttons whole', () => {
    expect(readCommitHash('/repo', () => 'a1b2c3d4e5f6\n')).toBe('a1b2c3d4e5f6');
  });

  it('is null for 13 characters or more (a long core.abbrev)', () => {
    expect(readCommitHash('/repo', () => 'a1b2c3d4e5f6a\n')).toBeNull();
    expect(readCommitHash('/repo', () => `${'a'.repeat(40)}\n`)).toBeNull();
  });
});

describe('commitHashFor (Issue #281)', () => {
  it('gives the E2E modes the fixed hash of 12 characters, without asking git', () => {
    let reads = 0;
    const read = (): string => {
      reads += 1;
      return 'a1b2c3d';
    };
    expect(commitHashFor('e2e', read)).toBe(E2E_COMMIT_HASH);
    expect(commitHashFor('e2e-departments', read)).toBe(E2E_COMMIT_HASH);
    expect(E2E_COMMIT_HASH).toMatch(/^[0-9a-f]{12}$/);
    expect(reads).toBe(0);
  });

  it('asks git in every other mode', () => {
    expect(commitHashFor('development', () => 'a1b2c3d')).toBe('a1b2c3d');
    expect(commitHashFor('production', () => null)).toBeNull();
  });
});
