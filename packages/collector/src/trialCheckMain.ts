import { execFile } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { SETTINGS_ROOT } from '@conect-guild/snapshot/settingsFile';
import { runTrialCheck, type Entry, type GhResult } from './trialCheck.ts';

// Issue #253: `npm run trial:check`. Reads only; gh and git get an argument array, never a shell
// string. Their stderr is not printed (only whether gh said the repository does not exist).

const TIMEOUT_MS = 60_000;

function entry(path: string): Entry {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) return 'missing';
  if (stat.isSymbolicLink()) return 'link';
  if (stat.isDirectory()) return 'dir';
  return stat.isFile() ? 'file' : 'other';
}

/** Runs a command found on PATH (the user's own gh and git) and resolves either way. */
function run(
  command: 'gh' | 'git',
  args: readonly string[],
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { encoding: 'utf8', timeout: TIMEOUT_MS },
      (error, stdout, stderr) => {
        resolve({ ok: error === null, stdout, stderr });
      },
    );
  });
}

process.exitCode = await runTrialCheck(
  process.argv.slice(2),
  {
    root: SETTINGS_ROOT,
    home: homedir(),
    entry,
    readText: (path) => readFileSync(path, 'utf8'),
    origin: async (dir) => {
      const result = await run('git', ['-C', dir, 'remote', 'get-url', 'origin']);
      return result.ok ? result.stdout.trim() : null;
    },
    gh: async (args): Promise<GhResult> => {
      const result = await run('gh', args);
      if (result.ok) return { ok: true, stdout: result.stdout };
      return { ok: false, notFound: result.stderr.includes('Could not resolve to a Repository') };
    },
  },
  (text) => {
    process.stdout.write(text);
  },
  (text) => {
    process.stderr.write(text);
  },
);
