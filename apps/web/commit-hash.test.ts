import { describe, expect, it } from 'vitest';
import { readCommitHash, type RunFile } from './commit-hash.ts';

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
