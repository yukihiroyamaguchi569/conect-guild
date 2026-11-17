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

// At most 12 characters: a longer one (a large core.abbrev) could push the tab's buttons out.
const SHORT_HASH = /^[0-9a-f]{4,12}$/;

/**
 * The short hash of the commit this checkout is on (Issue #281), shown in the fetch status so
 * that one can tell which version is running. Null when git is missing, this is not a repository,
 * the hash is longer than 12 characters, or anything else goes wrong: the build and the dev
 * server go on without it.
 */
export function readCommitHash(cwd: string, run: RunFile = runFile): string | null {
  try {
    const hash = run('git', ['rev-parse', '--short', 'HEAD'], cwd).trim();
    return SHORT_HASH.test(hash) ? hash : null;
  } catch {
    return null;
  }
}

/**
 * The hash the E2E servers show instead of the real one: fixed, and as long as a hash may be, so
 * that the tests can see it and check that the tab keeps its buttons whole with it.
 */
export const E2E_COMMIT_HASH = 'abcdef123456';

/** The hash for a Vite mode: the fixed one in the E2E modes (`e2e`, `e2e-departments`), else git's. */
export function commitHashFor(mode: string, read: () => string | null): string | null {
  return mode.startsWith('e2e') ? E2E_COMMIT_HASH : read();
}
