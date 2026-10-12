// Issue #67: the live store built after the automatic demo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotLoadResult } from '../adapters/snapshot';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import { issue, minutesAfter, snapshot, T0 } from '../domain/fixtures.test-util';
import {
  BASELINE_STORAGE_KEY,
  createGuildStore,
  REFRESH_INTERVAL_MS,
  type GuildStoreOptions,
} from './guildStore';

function memoryStorage(): StorageLike & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

const open101 = issue(101, { title: '架空の請求書', labels: ['経理'] });
const open102 = issue(102, { labels: ['広報'] });
const first = snapshot({ fetchedAt: T0, issues: [open101, open102] });
const closed101 = { ...open101, state: 'closed' as const, closedAt: minutesAfter(T0, 0.5) };
const closed102 = { ...open102, state: 'closed' as const, closedAt: minutesAfter(T0, 1.5) };
const withClear = snapshot({ fetchedAt: minutesAfter(T0, 1), issues: [closed101, open102] });
const withTwoClears = snapshot({ fetchedAt: minutesAfter(T0, 2), issues: [closed101, closed102] });

const ok = (snap: typeof first): SnapshotLoadResult => ({ ok: true, snapshot: snap });

function storeOn(
  storage: StorageLike,
  results: SnapshotLoadResult[],
  over: GuildStoreOptions = {},
) {
  const loader = vi.fn(() => Promise.resolve(results.shift() ?? ok(withClear)));
  const store = createGuildStore({
    loadSnapshot: loader,
    storage: createKeyValueStore(() => storage),
    ...over,
  });
  return { store, loader };
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

async function nextTick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
}

/** A storage holding the baseline of `first`, as an earlier visit left it. */
async function storedBaseline() {
  const storage = memoryStorage();
  const { store } = storeOn(storage, [ok(first)]);
  store.start();
  await settle();
  store.stop();
  expect(storage.items.has(BASELINE_STORAGE_KEY)).toBe(true);
  return storage;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createGuildStore: a fresh baseline after the automatic demo', () => {
  it('diffs against an old baseline on an ordinary first load (the burst it avoids)', async () => {
    const storage = await storedBaseline();
    const { store } = storeOn(storage, [ok(withClear)]);
    store.start();
    await settle();
    expect(store.state.messages.length).toBeGreaterThan(0);
    store.stop();
  });

  it('takes the first snapshot as a new baseline, without events, when fresh', async () => {
    const storage = await storedBaseline();
    const before = storage.items.get(BASELINE_STORAGE_KEY);
    const { store } = storeOn(storage, [ok(withClear)], { freshBaseline: true });
    store.start();
    await settle();
    expect(store.state.messages).toEqual([]);
    expect(storage.items.get(BASELINE_STORAGE_KEY)).not.toBe(before);
    store.stop();
  });

  it('stays fresh until the first snapshot, then diffs as usual', async () => {
    const storage = await storedBaseline();
    const failed = { ok: false, reason: 'network' } as const;
    const { store } = storeOn(storage, [failed, ok(withClear), ok(withTwoClears)], {
      freshBaseline: true,
    });
    store.start();
    await settle();
    await nextTick();
    expect(store.state.messages).toEqual([]);
    await nextTick();
    expect(store.state.messages.length).toBeGreaterThan(0);
    store.stop();
  });
});

describe('createGuildStore: an error ends the automatic demo', () => {
  const serverError: SnapshotLoadResult = { ok: false, reason: 'http', status: 500 };
  const afterDemo = { firstResult: serverError, freshBaseline: true };

  it('keeps the stored baseline through the error and a 204 back to the demo', async () => {
    const storage = await storedBaseline();
    const before = storage.items.get(BASELINE_STORAGE_KEY);
    const { store } = storeOn(storage, [{ ok: false, reason: 'not-collected' }], afterDemo);
    store.start();
    await settle();
    expect(store.state.failure).toBe('http');
    await nextTick();
    expect(store.state.failure).toBe('not-collected');
    expect(storage.items.get(BASELINE_STORAGE_KEY)).toBe(before);
    store.stop();
  });

  it('replaces it with the first good snapshot after the error, without events', async () => {
    const storage = await storedBaseline();
    const before = storage.items.get(BASELINE_STORAGE_KEY);
    const { store } = storeOn(storage, [ok(withClear)], afterDemo);
    store.start();
    await settle();
    expect(storage.items.get(BASELINE_STORAGE_KEY)).toBe(before);
    await nextTick();
    expect(store.state.snapshot).toEqual(withClear);
    expect(store.state.messages).toEqual([]);
    expect(storage.items.get(BASELINE_STORAGE_KEY)).not.toBe(before);
    store.stop();
  });
});

describe('createGuildStore: the handed first result', () => {
  it('applies it first, without loading, so its error shows', async () => {
    const { store, loader } = storeOn(memoryStorage(), [{ ok: false, reason: 'not-collected' }], {
      firstResult: { ok: false, reason: 'http', status: 500 },
    });
    store.start();
    await settle();
    expect(loader).not.toHaveBeenCalled();
    expect(store.state.failure).toBe('http');
    await nextTick();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(store.state.failure).toBe('not-collected');
    store.stop();
  });

  it('applies a handed snapshot once, then loads as usual', async () => {
    const { store, loader } = storeOn(memoryStorage(), [ok(withClear)], {
      firstResult: ok(first),
    });
    store.start();
    await settle();
    expect(loader).not.toHaveBeenCalled();
    expect(store.state.snapshot).toEqual(first);
    await nextTick();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(store.state.snapshot).toEqual(withClear);
    store.stop();
  });
});
