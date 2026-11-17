import { execFileSync } from 'node:child_process';

/** Runs a command with an argument array (never a shell string) and returns its stdout. */
export type RunFile = (file: string, args: readonly string[], cwd: string) => string;

const runFile: RunFile = (file, args, cwd) =>
  execFileSync(file, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
  });

const SHORT_HASH = /^[0-9a-f]{4,40}$/;

/**
 * The short hash of the commit this checkout is on (Issue #281), shown in the fetch status so
 * that one can tell which version is running. Null when git is missing, this is not a repository,
 * or anything else goes wrong: the build and the dev server go on without it.
 */
export function readCommitHash(cwd: string, run: RunFile = runFile): string | null {
  try {
    const hash = run('git', ['rev-parse', '--short', 'HEAD'], cwd).trim();
    return SHORT_HASH.test(hash) ? hash : null;
  } catch {
    return null;
  }
}
