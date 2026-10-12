import { randomUUID } from 'node:crypto';
import { link, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/**
 * Replace `target` atomically: write a 0600 temp file in the same directory,
 * then rename it over the target. Readers never see a half-written file.
 * The directory is created as 0700 when missing.
 */
export async function writeFileAtomic(target: string, content: string): Promise<void> {
  const dir = dirname(target);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = join(dir, `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, content, { mode: 0o600, flag: 'wx' });
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/**
 * Create `target` only if it does not exist yet, never half-written: write a 0600 temp file in the
 * same directory, then hard-link it to the target, which fails with EEXIST instead of replacing a
 * file that appeared meanwhile (rename would replace it). The temp file is removed either way.
 */
export async function createFileExclusive(target: string, content: string): Promise<void> {
  const temp = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, content, { mode: 0o600, flag: 'wx' });
    await link(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}
