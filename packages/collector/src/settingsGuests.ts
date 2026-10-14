import { execFile } from 'node:child_process';
import { isRepoName, isSessionDir } from '@conect-guild/snapshot/settingsSchema';
import { expandHome } from './home.ts';
import type { InputGuest } from './settingsInput.ts';

/**
 * Issue #118: the guests `npm run settings:write` takes from its input. A guest without `repo` gets
 * the one its folder's git origin names on GitHub, as a suggestion the report shows; `repo: null`
 * asks for none.
 */

/** Runs `git` with an argument array and resolves with its stdout. */
export type GitRunner = (args: readonly string[]) => Promise<string>;

const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 64 * 1024;

/**
 * Real runner: execFile with an argument array (never a shell string). stderr and the error are
 * dropped (they can name the folder); a failure is only a rejection.
 */
export function createGitRunner(): GitRunner {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(
        // git is looked up on PATH like gh (gh.ts): the user's own installed CLI.
        // eslint-disable-next-line sonarjs/no-os-command-from-path -- PATH lookup is intended, see above
        'git',
        [...args],
        { encoding: 'utf8', timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
        (error, stdout) => {
          if (error) {
            reject(new Error('git-failed'));
            return;
          }
          resolve(stdout);
        },
      );
    });
}

/** The URL schemes of a GitHub remote, with the port each may name (its default). */
const GITHUB_SCHEMES: Readonly<Record<string, string>> = { 'https:': '443', 'ssh:': '22' };

/** The path of a GitHub remote: an https or ssh URL (any user, the default port) or scp-like ssh. */
function githubPath(text: string): string | null {
  const scp = /^git@github\.com:/i.exec(text);
  if (scp !== null) return text.slice(scp[0].length);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const port = GITHUB_SCHEMES[url.protocol];
  if (port === undefined || url.hostname !== 'github.com') return null;
  if (url.port !== '' && url.port !== port) return null;
  return url.search === '' && url.hash === '' ? url.pathname.slice(1) : null;
}

/**
 * `owner/name` from a GitHub remote URL (`.git` and a trailing `/` dropped), or null for anything
 * else (another host, a local path, a name the settings would not take).
 */
export function repoFromRemoteUrl(url: string): string | null {
  let path = githubPath(url.trim());
  if (path === null) return null;
  if (path.endsWith('/')) path = path.slice(0, -1);
  if (path.endsWith('.git')) path = path.slice(0, -'.git'.length);
  return isRepoName(path) ? path : null;
}

/** Where a guest's repo came from: the input, the folder's git origin, or none. */
export type RepoSource = 'input' | 'git' | 'none';

export interface ResolvedGuest {
  readonly guest: { name: string; sessionDir: string; repo?: string };
  readonly repoFrom: RepoSource;
}

export interface GuestRepoReader {
  readonly home: string;
  readonly isDirectory: (path: string) => boolean;
  readonly git: GitRunner;
}

async function suggestedRepo(sessionDir: string, reader: GuestRepoReader): Promise<string | null> {
  // Only a folder the settings would take and that is there: git gets no option-like argument.
  if (!isSessionDir(sessionDir)) return null;
  const dir = expandHome(sessionDir, reader.home);
  if (!reader.isDirectory(dir)) return null;
  try {
    return repoFromRemoteUrl(await reader.git(['-C', dir, 'remote', 'get-url', 'origin']));
  } catch {
    return null;
  }
}

async function resolveOne(input: InputGuest, reader: GuestRepoReader): Promise<ResolvedGuest> {
  const base = { name: input.name, sessionDir: input.sessionDir };
  if (typeof input.repo === 'string') {
    return { guest: { ...base, repo: input.repo }, repoFrom: 'input' };
  }
  const repo = input.repo === null ? null : await suggestedRepo(input.sessionDir, reader);
  return repo === null
    ? { guest: base, repoFrom: 'none' }
    : { guest: { ...base, repo }, repoFrom: 'git' };
}

/** Each input guest with its repo: as given, suggested from git when left out, none for null. */
export async function resolveGuestRepos(
  guests: readonly InputGuest[],
  reader: GuestRepoReader,
): Promise<ResolvedGuest[]> {
  const resolved: ResolvedGuest[] = [];
  for (const guest of guests) resolved.push(await resolveOne(guest, reader));
  return resolved;
}
