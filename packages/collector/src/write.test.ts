import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileExclusive, writeFileAtomic } from './write.ts';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'collector-write-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function mode(stats: { mode: number }): number {
  return stats.mode & 0o777;
}

describe('writeFileAtomic', () => {
  it('creates a missing directory as 0700 and the file as 0600', async () => {
    const target = join(root, '.data', 'snapshot.json');
    await writeFileAtomic(target, '{"a":1}\n');
    expect(await readFile(target, 'utf8')).toBe('{"a":1}\n');
    expect(mode(await stat(target))).toBe(0o600);
    expect(mode(await stat(join(root, '.data')))).toBe(0o700);
  });

  it('replaces an existing file by rename, leaving no temp file behind', async () => {
    const target = join(root, 'snapshot.json');
    await writeFile(target, 'old', { mode: 0o644 });
    const before = await stat(target);
    await writeFileAtomic(target, 'new');
    const after = await stat(target);
    expect(await readFile(target, 'utf8')).toBe('new');
    // A new inode proves the file was swapped in, not rewritten in place.
    expect(after.ino).not.toBe(before.ino);
    expect(mode(after)).toBe(0o600);
    expect(await readdir(root)).toEqual(['snapshot.json']);
  });

  it('keeps the previous file and removes the temp file when rename fails', async () => {
    const target = join(root, 'snapshot.json');
    // Renaming a file over a non-empty directory fails.
    await mkdir(join(target, 'occupied'), { recursive: true });
    await expect(writeFileAtomic(target, 'new')).rejects.toThrow();
    expect(await readdir(root)).toEqual(['snapshot.json']);
    expect(await readdir(target)).toEqual(['occupied']);
  });

  it('fails without touching the target when the directory is not writable', async () => {
    const dir = join(root, 'locked');
    const target = join(dir, 'snapshot.json');
    await mkdir(dir);
    await writeFile(target, 'old');
    await chmod(dir, 0o500);
    try {
      await expect(writeFileAtomic(target, 'new')).rejects.toThrow();
      expect(await readFile(target, 'utf8')).toBe('old');
    } finally {
      await chmod(dir, 0o700);
    }
  });
});

describe('createFileExclusive', () => {
  it('creates a missing file as 0600, leaving no temp file behind', async () => {
    const target = join(root, 'a.json');
    await createFileExclusive(target, '{"a":1}\n');
    expect(await readFile(target, 'utf8')).toBe('{"a":1}\n');
    expect(mode(await stat(target))).toBe(0o600);
    expect(await readdir(root)).toEqual(['a.json']);
  });

  it('refuses a file that is already there, keeping it and leaving no temp file', async () => {
    const target = join(root, 'a.json');
    await writeFile(target, 'theirs');
    await expect(createFileExclusive(target, 'mine')).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(target, 'utf8')).toBe('theirs');
    expect(await readdir(root)).toEqual(['a.json']);
  });
});
