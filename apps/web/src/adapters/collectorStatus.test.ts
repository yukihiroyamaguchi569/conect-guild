import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultCollectorStatusUrl, loadCollectorStatus } from './collectorStatus';
import type { FetchFn } from './snapshot';

const FAILED = { ok: false, attemptedAt: '2026-10-12T00:00:00.000Z', kind: 'gh-failed' };

function respondWith(body: string | null, status = 200): FetchFn {
  return () => Promise.resolve(new Response(body, { status }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('loadCollectorStatus', () => {
  it('returns a valid status, read with no-store', async () => {
    const fetchFn = vi.fn(respondWith(JSON.stringify(FAILED)));
    await expect(loadCollectorStatus({ url: '/c.json', fetchFn })).resolves.toEqual({
      kind: 'status',
      status: FAILED,
    });
    expect(fetchFn).toHaveBeenCalledWith('/c.json', expect.objectContaining({ cache: 'no-store' }));
  });

  it('is absent on 204 (the collector has not run)', async () => {
    await expect(loadCollectorStatus({ fetchFn: respondWith(null, 204) })).resolves.toEqual({
      kind: 'absent',
    });
  });

  it.each([
    ['an HTTP error', respondWith('', 500)],
    ['a 404', respondWith('', 404)],
    ['broken JSON', respondWith('{"ok":')],
    ['an unknown kind', respondWith(JSON.stringify({ ...FAILED, kind: 'auth-failed' }))],
    ['extra fields', respondWith(JSON.stringify({ ...FAILED, repo: 'owner/name' }))],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ] satisfies [string, FetchFn][])(
    'is unreadable on %s, never throwing',
    async (_label, fetchFn) => {
      await expect(loadCollectorStatus({ fetchFn })).resolves.toEqual({ kind: 'unreadable' });
    },
  );

  it('is unreadable when the server hangs past the timeout', async () => {
    vi.useFakeTimers();
    const hanging: FetchFn = (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const read = loadCollectorStatus({ fetchFn: hanging, timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(read).resolves.toEqual({ kind: 'unreadable' });
  });

  it('reads next to the snapshot', () => {
    expect(defaultCollectorStatusUrl()).toBe('/collector-status.json');
  });
});
