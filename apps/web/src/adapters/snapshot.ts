import { SNAPSHOT_SCHEMA_VERSION, snapshotSchema, type Snapshot } from '@conect-guild/snapshot';
import { GUILD_SETTINGS } from '@conect-guild/snapshot/settings';
import { z } from 'zod';

/**
 * Why a snapshot could not be loaded. The adapter never throws; it returns one of these.
 * 'not-collected' is a 204 No Content: the collector has not written the file yet (Issue #67).
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
  /** The guests the snapshot's guests must fit; defaults to {@link defaultExpectedGuests}. */
  readonly expectedGuests?: ExpectedGuests | null;
}

/** Issue #108: the settings' guests by position, each its repository or null when it has none. */
export type ExpectedGuests = readonly (string | null)[];

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
 * The real data must be of the repository in guild.settings.json: after the settings change, the
 * old snapshot stays until the collector succeeds for the new one. The fictional sample of a build
 * is of no real repository, so it is not checked.
 */
export function defaultExpectedRepo(): string | null {
  return import.meta.env.DEV ? GUILD_SETTINGS.repo : null;
}

/**
 * The real data's guests must be the settings' guests (Issue #108). The fictional sample of a
 * build is not checked, like its repository.
 */
export function defaultExpectedGuests(): ExpectedGuests | null {
  return import.meta.env.DEV ? (GUILD_SETTINGS.guests ?? []).map((g) => g.repo ?? null) : null;
}

/**
 * True when the snapshot's guests are the expected ones: as many, and each part (when fetched) of
 * the repository the settings give that guest.
 */
function guestsFit(snapshot: Snapshot, expected: ExpectedGuests): boolean {
  if (snapshot.guests.length !== expected.length) return false;
  return snapshot.guests.every((part, i) => part === null || part.repo === expected[i]);
}

/**
 * The snapshot with its guests dropped when they do not fit the settings (the settings changed and
 * the collector has not caught up). Only the guests are ignored: the rest is shown as usual.
 */
export function withFittingGuests(snapshot: Snapshot, expected: ExpectedGuests | null): Snapshot {
  if (expected === null || guestsFit(snapshot, expected)) return snapshot;
  const { sessions } = snapshot;
  return {
    ...snapshot,
    guests: [],
    sessions: sessions.status === 'ok' ? { ...sessions, guests: [] } : sessions,
  };
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
 * Validates already-parsed JSON, and its repository when `expectedRepo` is given. Guests that do
 * not fit `expectedGuests` are dropped, never failing the snapshot. Exported for tests and for
 * callers that read JSON elsewhere.
 */
export function validateSnapshot(
  value: unknown,
  expectedRepo: string | null = null,
  expectedGuests: ExpectedGuests | null = null,
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
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  return { ok: true, snapshot: withFittingGuests(parsed.data, expectedGuests) };
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
  // The dev server answers 204 while the collector has not written the file (DESIGN.md 4.3).
  // Checked before `ok`, which a 204 also is. A 404 is an ordinary HTTP error (a wrong route).
  if (response.status === 204) return { ok: false, reason: 'not-collected' };
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
    const expectedGuests =
      options.expectedGuests === undefined ? defaultExpectedGuests() : options.expectedGuests;
    return validateSnapshot(json.value, options.expectedRepo ?? null, expectedGuests);
  } finally {
    clearTimeout(timer);
  }
}
