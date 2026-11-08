import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardIndexSchema, defaultCardsBase, loadCardIndex } from './cardIndex';
import type { FetchFn } from './snapshot';

const INDEX = { cards: [{ number: 101, updatedAt: 1_700_000_000_000 }] };

function respondWith(body: string | null, status = 200): FetchFn {
  return () => Promise.resolve(new Response(body, { status }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('cardIndexSchema (Issue #271)', () => {
  it('accepts the plugin’s list, an empty one included', () => {
    expect(cardIndexSchema.safeParse(INDEX).success).toBe(true);
    expect(cardIndexSchema.safeParse({ cards: [] }).success).toBe(true);
  });

  it.each([
    ['a number that is not a whole positive one', { cards: [{ number: 0, updatedAt: 1 }] }],
    ['a fractional number', { cards: [{ number: 1.5, updatedAt: 1 }] }],
    ['a number as a string', { cards: [{ number: '101', updatedAt: 1 }] }],
    ['a negative time', { cards: [{ number: 1, updatedAt: -1 }] }],
    ['a path in place of the number', { cards: [{ number: 1, updatedAt: 1, path: '../x' }] }],
    ['extra fields', { ...INDEX, dir: '/x' }],
    ['no list', {}],
  ])('rejects %s', (_label, value) => {
    expect(cardIndexSchema.safeParse(value).success).toBe(false);
  });
});

describe('loadCardIndex (Issue #271)', () => {
  it('returns the list, read with no-store from /cards/index.json', async () => {
    const fetchFn = vi.fn(respondWith(JSON.stringify(INDEX)));
    await expect(loadCardIndex({ fetchFn })).resolves.toEqual(INDEX);
    expect(fetchFn).toHaveBeenCalledWith(
      `${defaultCardsBase()}index.json`,
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(defaultCardsBase()).toBe('/cards/');
  });

  it.each([
    ['an HTTP error', respondWith('', 500)],
    ['a 404', respondWith('', 404)],
    ['broken JSON', respondWith('{"cards":')],
    ['an invalid list', respondWith(JSON.stringify({ cards: [{ number: -1, updatedAt: 0 }] }))],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ] satisfies [string, FetchFn][])('is null on %s, never throwing', async (_label, fetchFn) => {
    await expect(loadCardIndex({ fetchFn })).resolves.toBeNull();
  });

  it('is null when the server hangs past the timeout', async () => {
    vi.useFakeTimers();
    const hanging: FetchFn = (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const read = loadCardIndex({ fetchFn: hanging, timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    await expect(read).resolves.toBeNull();
  });
});
