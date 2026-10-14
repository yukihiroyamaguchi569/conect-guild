import { execFile } from 'node:child_process';
import { z } from 'zod';
import { CollectorError } from './errors.ts';

/** Runs `gh` with an argument array and resolves with its stdout. */
export type GhRunner = (args: readonly string[]) => Promise<string>;

const GH_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Real runner: execFile with an argument array (never a shell string), using the
 * user's own gh authentication. stderr and the error message are dropped so
 * nothing from GitHub can reach the logs.
 */
export function createGhRunner(signal?: AbortSignal): GhRunner {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(
        // gh is looked up on PATH on purpose: the user's own installed and
        // authenticated CLI is the only credential source (docs/DESIGN.md 4.1).
        // eslint-disable-next-line sonarjs/no-os-command-from-path -- PATH lookup is intended, see above
        'gh',
        [...args],
        { encoding: 'utf8', maxBuffer: GH_MAX_BUFFER, signal },
        (error, stdout) => {
          if (error) {
            reject(new CollectorError('gh-failed'));
            return;
          }
          resolve(stdout);
        },
      );
    });
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    throw new CollectorError('validation-failed');
  }
}

/** Parse output with one JSON value per line (what `--jq '... | @json'` prints). */
export function parseJsonLines(stdout: string): unknown[] {
  return stdout
    .split('\n')
    .filter((line) => line !== '')
    .map(parseJsonLine);
}

/**
 * jq filter for one page. A page that is not an array (e.g. `{}`) would make
 * `.[]` print nothing and look like an empty list, so it fails gh instead.
 */
export function projectionFilter(projection: string): string {
  return `if type != "array" then error("unexpected page") else .[] end | ${projection} | @json`;
}

/**
 * GET every page of a list endpoint and keep only `projection` of each item.
 * The projection runs inside gh (`--jq`), so fields it leaves out (bodies,
 * diffs) never reach this process. `--slurp` cannot be combined with `--jq`;
 * gh applies the filter to each page, so the lines of all pages are the items.
 */
export async function ghApiProjected(
  gh: GhRunner,
  path: string,
  projection: string,
): Promise<unknown[]> {
  const stdout = await gh(['api', '--paginate', '--jq', projectionFilter(projection), path]);
  return parseJsonLines(stdout);
}

/**
 * Like {@link ghApiProjected} but only the first page (no `--paginate`): the caller bounds the
 * cost by `per_page` (Issue #108, the guests' lists).
 */
export async function ghApiProjectedPage(
  gh: GhRunner,
  path: string,
  projection: string,
): Promise<unknown[]> {
  const stdout = await gh(['api', '--jq', projectionFilter(projection), path]);
  return parseJsonLines(stdout);
}

/** Validate with zod; a mismatch becomes a validation-failed error. */
export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new CollectorError('validation-failed');
  return result.data;
}
