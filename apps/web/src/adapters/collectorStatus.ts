import { collectorStatusSchema, type CollectorStatus } from '@conect-guild/snapshot';
import type { FetchFn } from './snapshot';

/**
 * A read of /collector-status.json (Issue #74). Never throws.
 * - 'absent': 204, the collector has not written it (it has not run)
 * - 'status': a valid status
 * - 'unreadable': any other failure (network, HTTP error, timeout, broken or invalid JSON); the
 *   caller keeps what it had, so one bad read does not make the banner flicker
 */
export type CollectorStatusRead =
  | { readonly kind: 'absent' }
  | { readonly kind: 'status'; readonly status: CollectorStatus }
  | { readonly kind: 'unreadable' };

export interface LoadCollectorStatusOptions {
  readonly url?: string;
  readonly fetchFn?: FetchFn;
  /** Covers both the request and reading the body. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const UNREADABLE: CollectorStatusRead = { kind: 'unreadable' };

/** Served by the dev server's plugin next to /snapshot.json (vite-plugin-snapshot.ts). */
export function defaultCollectorStatusUrl(): string {
  return `${import.meta.env.BASE_URL}collector-status.json`;
}

async function readStatus(
  url: string,
  fetchFn: FetchFn,
  signal: AbortSignal,
): Promise<CollectorStatusRead> {
  const response = await fetchFn(url, { cache: 'no-store', signal });
  if (response.status === 204) return { kind: 'absent' };
  if (!response.ok) return UNREADABLE;
  const parsed = collectorStatusSchema.safeParse(JSON.parse(await response.text()));
  return parsed.success ? { kind: 'status', status: parsed.data } : UNREADABLE;
}

/** Fetches the collector's status with no-store and a timeout, then validates it. */
export async function loadCollectorStatus(
  options: LoadCollectorStatusOptions = {},
): Promise<CollectorStatusRead> {
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await readStatus(options.url ?? defaultCollectorStatusUrl(), fetchFn, controller.signal);
  } catch {
    // A network error, the timeout, or JSON.parse on a broken body.
    return UNREADABLE;
  } finally {
    clearTimeout(timer);
  }
}
