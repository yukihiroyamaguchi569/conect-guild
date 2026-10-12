import { SNAPSHOT_SCHEMA_VERSION, snapshotSchema, type Snapshot } from '@conect-guild/snapshot';
import { GUILD_SETTINGS } from '@conect-guild/snapshot/settings';
import { z } from 'zod';

/**
 * Why a snapshot could not be loaded. The adapter never throws; it returns one of these.
 * 'not-collected' is a 404: the collector has not written the file yet (Issue #67).
 */
export type SnapshotLoadFailure =
  | 'network'
  | 'timeout'
  | 'not-collected'
  | 'http'
  | 'parse'
  | 'schema-version'
  | 'invalid'
  | 'repo-mismatch';

export type SnapshotLoadResult =
  | { readonly ok: true; readonly snapshot: Snapshot }
  | { readonly ok: false; readonly reason: 'http'; readonly status: number }
  | { readonly ok: false; readonly reason: Exclude<SnapshotLoadFailure, 'http'> };

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export interface LoadSnapshotOptions {
  /** Defaults to {@link defaultSnapshotUrl}. */
  readonly url?: string;
  /** Defaults to the global fetch. Injected by tests. */
  readonly fetchFn?: FetchFn;
  /** Covers both the request and reading the body. */
  readonly timeoutMs?: number;
  /** The repository the snapshot must be of; null (the default) checks none. */
  readonly expectedRepo?: string | null;
}

const DEFAULT_SNAPSHOT_TIMEOUT_MS = 10_000;

/**
 * The dev server serves the real data at /snapshot.json (vite-plugin-snapshot.ts).
 * A production build only ever reads the fictional sample (docs/DESIGN.md 5).
 */
export function defaultSnapshotUrl(): string {
  const file = import.meta.env.DEV ? 'snapshot.json' : 'snapshot.sample.json';
  return `${import.meta.env.BASE_URL}${file}`;
}

/**
 * The real data must be of the repository in guild.settings.ts: after the settings change, the
 * old snapshot stays until the collector succeeds for the new one. The fictional sample of a build
 * is of no real repository, so it is not checked.
 */
export function defaultExpectedRepo(): string | null {
  return import.meta.env.DEV ? GUILD_SETTINGS.repo : null;
}

const versionProbeSchema = z.looseObject({ schemaVersion: z.number() });
const repoProbeSchema = z.looseObject({ repo: z.string() });

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

/**
 * Validates already-parsed JSON, and its repository when `expectedRepo` is given. Exported for
 * tests and for callers that read JSON elsewhere.
 */
export function validateSnapshot(
  value: unknown,
  expectedRepo: string | null = null,
): SnapshotLoadResult {
  const probe = versionProbeSchema.safeParse(value);
  if (probe.success && probe.data.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, reason: 'schema-version' };
  }
  // The repository first: a snapshot of the previous team may no longer fit the new settings'
  // departments, and the screen should still say why it stopped.
  const repo = repoProbeSchema.safeParse(value);
  if (expectedRepo !== null && repo.success && repo.data.repo !== expectedRepo) {
    return { ok: false, reason: 'repo-mismatch' };
  }
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? { ok: true, snapshot: parsed.data } : { ok: false, reason: 'invalid' };
}

async function fetchText(
  url: string,
  fetchFn: FetchFn,
  signal: AbortSignal,
): Promise<{ ok: true; text: string } | Exclude<SnapshotLoadResult, { ok: true }>> {
  const failure = () => ({ ok: false, reason: signal.aborted ? 'timeout' : 'network' }) as const;
  let response: Response;
  try {
    response = await fetchFn(url, { cache: 'no-store', signal });
  } catch {
    return failure();
  }
  // The dev server answers 404 only while the collector has not written the file (DESIGN.md 4.3).
  if (response.status === 404) return { ok: false, reason: 'not-collected' };
  if (!response.ok) return { ok: false, reason: 'http', status: response.status };
  try {
    return { ok: true, text: await response.text() };
  } catch {
    return failure();
  }
}

/** Fetches the snapshot with no-store and a timeout, then validates it. Never throws. */
export async function loadSnapshot(options: LoadSnapshotOptions = {}): Promise<SnapshotLoadResult> {
  const url = options.url ?? defaultSnapshotUrl();
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS);
  try {
    const fetched = await fetchText(url, fetchFn, controller.signal);
    if (!fetched.ok) return fetched;
    const json = parseJson(fetched.text);
    if (!json.ok) return { ok: false, reason: 'parse' };
    return validateSnapshot(json.value, options.expectedRepo ?? null);
  } finally {
    clearTimeout(timer);
  }
}
