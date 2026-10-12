import type { SnapshotSession } from '@conect-guild/snapshot';
import type { GhRunner } from './gh.ts';
import type { RunDeps } from './run.ts';
import type { SessionsReading } from './sessions.ts';

/** Shared fakes for the run tests. Titles, bodies and branch names are the secrets to keep out. */

/** The line after `failed: gh-failed` (Issue #74), written out here so a change shows. */
export const GH_FAILED_NEXT_STEP =
  '次にやること: guild.settings.local.json（無ければ guild.settings.json）の repo を gh のアカウントで読めるか、gh repo view <owner/name> で確かめてください';

export const SECRET_TITLE = 'Secret client Ltd invoice';
export const SECRET_BRANCH = 'accounting/secret-client';
const SECRET_BODY = 'Confidential body Closes #1';

const ISSUE = {
  number: 1,
  title: SECRET_TITLE,
  state: 'open',
  state_reason: null,
  labels: ['経理'],
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-11T00:00:00Z',
  closed_at: null,
  is_pull_request: false,
};
const PR_AS_ISSUE = { ...ISSUE, number: 2, is_pull_request: true };
const OLD_CLOSED_ISSUE = {
  ...ISSUE,
  number: 3,
  state: 'closed',
  state_reason: 'completed',
  closed_at: '2026-09-01T00:00:00Z',
};
/** Closed long ago as not planned: counted as opened, never as completed. */
const NOT_PLANNED_ISSUE = { ...OLD_CLOSED_ISSUE, number: 5, state_reason: 'not_planned' };
const OPEN_PR = {
  number: 2,
  title: SECRET_TITLE,
  body: SECRET_BODY,
  state: 'open',
  merged_at: null,
  closed_at: null,
  head_ref: SECRET_BRANCH,
};
const MERGED_PR = {
  ...OPEN_PR,
  number: 4,
  state: 'closed',
  merged_at: '2026-10-11T00:00:00Z',
  closed_at: '2026-10-11T00:00:00Z',
};

/** Projected items per endpoint, one array per page; issues span three pages and files two. */
const OUTPUTS: Record<string, unknown[][]> = {
  'issues?state=all': [[ISSUE, PR_AS_ISSUE], [OLD_CLOSED_ISSUE], [NOT_PLANNED_ISSUE]],
  'pulls?state=all': [[OPEN_PR], [MERGED_PR]],
  'pulls/2/files': [['a/CLAUDE.md'], ['b.md']],
  // Issue #85: every department label of guild.settings.json, over two pages, among others.
  labels: [
    ['bug', '経理', '広報'],
    ['企画', '総務'],
  ],
};

export function fakeGh(
  overrides: Record<string, string | Error> = {},
): GhRunner & { calls: string[] } {
  const calls: string[] = [];
  const gh = (args: readonly string[]): Promise<string> => {
    const path = args.at(-1) ?? '';
    calls.push(path);
    const key = Object.keys(OUTPUTS).find((k) => path.includes(k)) ?? 'missing';
    const override = overrides[key];
    if (override instanceof Error) return Promise.reject(override);
    const pages = OUTPUTS[key] ?? [];
    // gh --paginate --jq prints the lines of every page one after another.
    const stdout = pages
      .flat()
      .map((item) => `${JSON.stringify(item)}\n`)
      .join('');
    return Promise.resolve(override ?? stdout);
  };
  return Object.assign(gh, { calls });
}

export const SESSION_MEMBERS: readonly SnapshotSession[] = [
  { department: null, state: 'working' },
  { department: '経理', state: 'awaiting-permission' },
  { department: '広報', state: 'resting' },
  { department: '企画', state: 'idle' },
  { department: '総務', state: 'idle' },
];

export const SESSIONS_OK: SessionsReading = { ok: true, found: 5, members: SESSION_MEMBERS };

export interface Harness extends RunDeps {
  readonly logs: string[];
  readonly errors: string[];
  readonly writes: string[];
  /** The status files written (Issue #74), parsed later by the tests. */
  readonly statuses: string[];
}

export function harness(gh: GhRunner, patch: Partial<RunDeps> = {}): Harness {
  const logs: string[] = [];
  const errors: string[] = [];
  const writes: string[] = [];
  const statuses: string[] = [];
  return {
    logs,
    errors,
    writes,
    statuses,
    now: () => new Date('2026-10-12T00:00:00.000Z'),
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
    gh,
    readSessions: () => Promise.resolve(SESSIONS_OK),
    writeSnapshot: (content) => {
      writes.push(content);
      return Promise.resolve();
    },
    writeStatus: (content) => {
      statuses.push(content);
      return Promise.resolve();
    },
    sleep: () => Promise.resolve(),
    signal: new AbortController().signal,
    ...patch,
  };
}

/**
 * A clock that only moves when the loop sleeps, or by `workMs` while it reads the sessions (the
 * time a tick takes); aborts once `untilMs` has passed.
 */
export function clockedHarness(
  gh: GhRunner,
  untilMs: number,
  patch: Partial<RunDeps> = {},
  workMs = 0,
) {
  const controller = new AbortController();
  const start = Date.parse('2026-10-12T00:00:00.000Z');
  let elapsed = 0;
  const sleeps: number[] = [];
  const sessionReads: number[] = [];
  const deps = harness(gh, {
    signal: controller.signal,
    now: () => new Date(start + elapsed),
    readSessions: () => {
      sessionReads.push(elapsed);
      elapsed += workMs;
      return Promise.resolve(SESSIONS_OK);
    },
    // Like a real sleep, it lets background work (a GitHub fetch) settle before the next tick.
    sleep: async (ms) => {
      sleeps.push(ms);
      await new Promise((resolve) => setImmediate(resolve));
      elapsed += ms;
      if (elapsed >= untilMs) controller.abort();
    },
    ...patch,
  });
  return { deps, sleeps, sessionReads, elapsed: () => elapsed };
}
