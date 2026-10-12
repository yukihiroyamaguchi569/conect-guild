import type { Snapshot } from '@conect-guild/snapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotLoadResult } from '../adapters/snapshot';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import { closedIssue, issue, minutesAfter, snapshot, T0 } from '../domain/fixtures.test-util';
import {
  BASELINE_STORAGE_KEY,
  createGuildStore,
  MESSAGE_HOLD_MS,
  REFRESH_INTERVAL_MS,
  type GuildStoreOptions,
} from './guildStore';

/** In-memory Storage whose reads and writes can be made to throw separately. */
class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();
  readError: Error | null = null;
  writeError: Error | null = null;

  getItem(key: string): string | null {
    if (this.readError !== null) throw this.readError;
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.writeError !== null) throw this.writeError;
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    if (this.writeError !== null) throw this.writeError;
    this.items.delete(key);
  }
}

const quotaError = () => new DOMException('full', 'QuotaExceededError');

const first = snapshot({
  fetchedAt: T0,
  issues: [
    issue(101, { title: '架空の請求書', labels: ['経理'] }),
    issue(102, { labels: ['広報'] }),
  ],
});

function laterSnapshot(minutes: number, over: Partial<Snapshot> = {}): Snapshot {
  return { ...first, fetchedAt: minutesAfter(T0, minutes), ...over };
}

/** #101 closed half a minute after the first fetch. */
const clearedInvoice = issue(101, {
  title: '架空の請求書',
  labels: ['経理'],
  state: 'closed',
  closedAt: minutesAfter(T0, 0.5),
});

const withClear = laterSnapshot(1, {
  issues: [clearedInvoice, issue(102, { labels: ['広報'] })],
});

const ok = (snap: Snapshot): SnapshotLoadResult => ({ ok: true, snapshot: snap });

function setup(results: SnapshotLoadResult[], over: GuildStoreOptions = {}) {
  const storage = new FakeStorage();
  const loader = vi.fn(() => {
    const next = results.shift();
    return Promise.resolve(next ?? ({ ok: false, reason: 'network' } as const));
  });
  const store = createGuildStore({
    loadSnapshot: loader,
    storage: createKeyValueStore(() => storage),
    ...over,
  });
  return { store, storage, loader };
}

/** A loader whose promises stay pending until resolveAll. */
function manualLoader() {
  const pending: ((value: SnapshotLoadResult) => void)[] = [];
  const load = vi.fn(
    () =>
      new Promise<SnapshotLoadResult>((resolve) => {
        pending.push(resolve);
      }),
  );
  return {
    load,
    resolveAll(value: SnapshotLoadResult) {
      for (const resolve of pending) resolve(value);
    },
  };
}

/** Lets the pending load promise settle without moving the clock. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

async function nextTick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createGuildStore: loading', () => {
  it('loads at start and then every 5 seconds', async () => {
    expect(REFRESH_INTERVAL_MS).toBe(5_000);
    const { store, loader } = setup([ok(first), ok(first), ok(first)]);
    store.start();
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(loader).toHaveBeenCalledTimes(2);
    await nextTick();
    expect(loader).toHaveBeenCalledTimes(3);
    store.stop();
  });

  it('shows the first snapshot without any event and stores the baseline', async () => {
    const { store, storage } = setup([ok(first)]);
    store.start();
    await settle();
    expect(store.state.snapshot).toEqual(first);
    expect(store.state.messages).toEqual([]);
    expect(store.state.effectsAvailable).toBe(true);
    expect(storage.items.has(BASELINE_STORAGE_KEY)).toBe(true);
    store.stop();
  });

  it('never stores titles or labels in the baseline', async () => {
    const { store, storage } = setup([ok(first)]);
    store.start();
    await settle();
    const stored = storage.items.get(BASELINE_STORAGE_KEY) ?? '';
    expect(stored).not.toContain('架空の請求書');
    expect(stored).not.toContain('経理');
    expect(stored).not.toContain('title');
    store.stop();
  });

  it('announces a clear on the second load, with number and title', async () => {
    const { store } = setup([ok(first), ok(withClear)]);
    store.start();
    await settle();
    await nextTick();
    expect(store.state.messages.map((m) => m.text)).toEqual([
      'みのりは クエスト#101「架空の請求書」を クリアした！',
    ]);
    store.stop();
  });

  it('announces the same clear only once', async () => {
    const { store } = setup([
      ok(first),
      ok(withClear),
      ok({ ...withClear, fetchedAt: minutesAfter(T0, 2) }),
    ]);
    store.start();
    await settle();
    await nextTick();
    await nextTick();
    expect(store.state.messages).toHaveLength(1);
    store.stop();
  });
});

describe('createGuildStore: failed fetches', () => {
  it('keeps the previous snapshot and the baseline when a fetch fails', async () => {
    const { store, storage } = setup([ok(first), { ok: false, reason: 'timeout' }]);
    store.start();
    await settle();
    const baseline = storage.items.get(BASELINE_STORAGE_KEY);
    await nextTick();
    expect(store.state.snapshot).toEqual(first);
    expect(store.state.failure).toBe('timeout');
    expect(store.state.halted).toBe(false);
    expect(storage.items.get(BASELINE_STORAGE_KEY)).toBe(baseline);
    store.stop();
  });

  it('clears the failure after the next success', async () => {
    const { store } = setup([{ ok: false, reason: 'http', status: 500 }, ok(first)]);
    store.start();
    await settle();
    expect(store.state.failure).toBe('http');
    expect(store.state.snapshot).toBeNull();
    await nextTick();
    expect(store.state.failure).toBeNull();
    expect(store.state.snapshot).toEqual(first);
    store.stop();
  });

  it('waits for the collector without halting, then shows its first snapshot (Issue #67)', async () => {
    const notCollected = { ok: false, reason: 'not-collected' } as const;
    const { store, storage, loader } = setup([notCollected, notCollected, ok(first)]);
    store.start();
    await settle();
    expect(store.state.failure).toBe('not-collected');
    expect(store.state.halted).toBe(false);
    expect(store.state.snapshot).toBeNull();
    expect(storage.items.has(BASELINE_STORAGE_KEY)).toBe(false);
    // Polling goes on: the file appears without reloading the page.
    await nextTick();
    expect(store.state.failure).toBe('not-collected');
    await nextTick();
    expect(loader).toHaveBeenCalledTimes(3);
    expect(store.state.failure).toBeNull();
    expect(store.state.snapshot).toEqual(first);
    // The first snapshot is only the baseline: no events.
    expect(store.state.messages).toEqual([]);
    expect(storage.items.has(BASELINE_STORAGE_KEY)).toBe(true);
    store.stop();
  });

  it('stays halted when a later fetch fails for another reason', async () => {
    const { store } = setup([
      ok(first),
      { ok: false, reason: 'schema-version' },
      { ok: false, reason: 'network' },
      ok(first),
    ]);
    store.start();
    await settle();
    await nextTick();
    await nextTick();
    expect(store.state.halted).toBe(true);
    expect(store.state.failure).toBe('network');
    await nextTick();
    expect(store.state.halted).toBe(false);
    store.stop();
  });

  it('halts on a schema-version mismatch and recovers once the collector is updated', async () => {
    const { store, storage } = setup([
      ok(first),
      { ok: false, reason: 'schema-version' },
      ok(withClear),
    ]);
    store.start();
    await settle();
    const baseline = storage.items.get(BASELINE_STORAGE_KEY);
    await nextTick();
    expect(store.state.halted).toBe(true);
    expect(store.state.failure).toBe('schema-version');
    expect(storage.items.get(BASELINE_STORAGE_KEY)).toBe(baseline);
    await nextTick();
    expect(store.state.halted).toBe(false);
    store.stop();
  });
});

describe('createGuildStore: bookkeeping', () => {
  it('records when the latest fetch finished', async () => {
    const { store } = setup([ok(first)]);
    store.start();
    await settle();
    expect(store.state.checkedAt).toBe(Date.parse(T0));
    store.stop();
  });

  it('skips a refresh while one is in flight', async () => {
    const manual = manualLoader();
    const store = createGuildStore({
      loadSnapshot: manual.load,
      storage: createKeyValueStore(() => new FakeStorage()),
    });
    const a = store.refresh();
    const b = store.refresh();
    manual.resolveAll(ok(first));
    await Promise.all([a, b]);
    expect(manual.load).toHaveBeenCalledTimes(1);
  });
});

describe('createGuildStore: localStorage unavailable', () => {
  it('keeps showing snapshots without events when reads throw', async () => {
    const { store, storage } = setup([ok(first), ok(withClear)]);
    storage.readError = new DOMException('blocked', 'SecurityError');
    store.start();
    await settle();
    await nextTick();
    expect(store.state.snapshot).toEqual(withClear);
    expect(store.state.messages).toEqual([]);
    expect(store.state.effectsAvailable).toBe(false);
    store.stop();
  });

  it('drops events when the new baseline cannot be written', async () => {
    const { store, storage } = setup([ok(first), ok(withClear), ok(withClear)]);
    store.start();
    await settle();
    storage.writeError = quotaError();
    await nextTick();
    expect(store.state.snapshot).toEqual(withClear);
    expect(store.state.messages).toEqual([]);
    expect(store.state.effectsAvailable).toBe(false);
    store.stop();
  });

  it('treats a corrupted baseline as the first load', async () => {
    const { store, storage } = setup([ok(withClear)]);
    storage.items.set(BASELINE_STORAGE_KEY, '{not json');
    store.start();
    await settle();
    expect(store.state.messages).toEqual([]);
    expect(store.state.effectsAvailable).toBe(true);
    expect(storage.items.get(BASELINE_STORAGE_KEY)).toContain('"schemaVersion":3');
    store.stop();
  });
});

describe('createGuildStore: clearBaseline', () => {
  it('removes the baseline so the next load shows no events', async () => {
    const { store, storage } = setup([ok(first), ok(withClear)]);
    store.start();
    await settle();
    store.clearBaseline();
    expect(storage.items.has(BASELINE_STORAGE_KEY)).toBe(false);
    expect(store.state.baselineNotice).toBe('基準を消しました');
    await nextTick();
    expect(store.state.messages).toEqual([]);
    store.stop();
  });

  it('reports when the baseline cannot be removed', () => {
    const { store, storage } = setup([]);
    storage.writeError = new DOMException('blocked', 'SecurityError');
    store.clearBaseline();
    expect(store.state.baselineNotice).toContain('消せませんでした');
  });
});

describe('createGuildStore: messages', () => {
  const twoClears = laterSnapshot(1, {
    issues: [clearedInvoice, closedIssue(102, minutesAfter(T0, 0.5), ['広報'])],
  });

  async function withTwoMessages() {
    const ctx = setup([ok(first), ok(twoClears)], { refreshIntervalMs: 60 * 60_000 });
    ctx.store.start();
    await settle();
    await ctx.store.refresh();
    return ctx;
  }

  it('shows queued messages one by one and keeps the last one', async () => {
    const { store } = await withTwoMessages();
    expect(store.state.messages.map((m) => m.text)).toEqual([
      'みのりは クエスト#101「架空の請求書」を クリアした！',
      'ひびきは クエスト#102「架空の依頼 102」を クリアした！',
    ]);
    await vi.advanceTimersByTimeAsync(MESSAGE_HOLD_MS);
    expect(store.state.messages.map((m) => m.text)).toEqual([
      'ひびきは クエスト#102「架空の依頼 102」を クリアした！',
    ]);
    await vi.advanceTimersByTimeAsync(MESSAGE_HOLD_MS * 3);
    expect(store.state.messages).toHaveLength(1);
    store.stop();
  });

  it('advances on demand and empties the window after the last one', async () => {
    const { store } = await withTwoMessages();
    store.nextMessage();
    store.nextMessage();
    expect(store.state.messages).toEqual([]);
    store.nextMessage();
    expect(store.state.messages).toEqual([]);
    store.stop();
  });

  it('gives every message its own id', async () => {
    const { store } = await withTwoMessages();
    const ids = store.state.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    store.stop();
  });
});

describe('createGuildStore: stop', () => {
  it('stops polling', async () => {
    const { store, loader } = setup([ok(first), ok(first)]);
    store.start();
    await settle();
    store.stop();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('drops the result of a fetch that finishes after stop', async () => {
    const manual = manualLoader();
    const storage = new FakeStorage();
    const store = createGuildStore({
      loadSnapshot: manual.load,
      storage: createKeyValueStore(() => storage),
    });
    store.start();
    store.stop();
    manual.resolveAll(ok(first));
    await settle();
    expect(store.state.snapshot).toBeNull();
    expect(storage.items.size).toBe(0);
  });

  it('cancels the pending message hold', async () => {
    const after = vi.fn(() => () => undefined);
    const cancelHold = vi.fn();
    after.mockReturnValue(cancelHold);
    const twoClears = laterSnapshot(1, {
      issues: [clearedInvoice, closedIssue(102, minutesAfter(T0, 0.5), ['広報'])],
    });
    const { store } = setup([ok(first), ok(twoClears)], {
      scheduler: { every: () => () => undefined, after },
    });
    await store.refresh();
    await store.refresh();
    expect(after).toHaveBeenCalledTimes(1);
    store.stop();
    expect(cancelHold).toHaveBeenCalledTimes(1);
  });

  it('starts only one polling loop', async () => {
    const { store, loader } = setup([ok(first), ok(first), ok(first)]);
    store.start();
    store.start();
    await settle();
    await nextTick();
    expect(loader).toHaveBeenCalledTimes(2);
    store.stop();
  });
});
