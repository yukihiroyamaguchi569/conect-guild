import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotLoadResult } from '../adapters/snapshot';
import { snapshot, T0 } from '../domain/fixtures.test-util';
import { createKeyValueStore, createMemoryStorage } from '../adapters/storage';
import { createGuildStore, REFRESH_INTERVAL_MS } from './guildStore';
import { buildFetchStatus } from './guildView';
import { createScreenMode, endsAutoDemo, initialScreenMode, liveGuildOptions } from './screenMode';

const NOT_COLLECTED: SnapshotLoadResult = { ok: false, reason: 'not-collected' };
const COLLECTED: SnapshotLoadResult = { ok: true, snapshot: snapshot({ fetchedAt: T0 }) };

/** A loader answering `results` in turn, then the last one again. */
function loader(results: SnapshotLoadResult[]) {
  return vi.fn(() => {
    const next = results.length > 1 ? results.shift() : results[0];
    return Promise.resolve(next ?? NOT_COLLECTED);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('initialScreenMode', () => {
  it('is the demo for ?demo=1 only, live otherwise', () => {
    expect(initialScreenMode('?demo=1')).toBe('demo');
    expect(initialScreenMode('')).toBe('live');
    expect(initialScreenMode('?demo=0')).toBe('live');
  });
});

describe('endsAutoDemo', () => {
  it('keeps the demo only while nothing is collected', () => {
    expect(endsAutoDemo(NOT_COLLECTED)).toBe(false);
    expect(endsAutoDemo(COLLECTED)).toBe(true);
    // Errors are shown by the live screen, as before (not hidden behind the demo).
    expect(endsAutoDemo({ ok: false, reason: 'http', status: 500 })).toBe(true);
    for (const reason of ['network', 'timeout', 'parse', 'invalid', 'repo-mismatch'] as const)
      expect(endsAutoDemo({ ok: false, reason })).toBe(true);
  });
});

describe('createScreenMode', () => {
  it('starts live without reading anything itself', async () => {
    const load = loader([COLLECTED]);
    const screen = createScreenMode({ search: '', loadSnapshot: load });
    await vi.advanceTimersByTimeAsync(3 * REFRESH_INTERVAL_MS);
    expect(screen.mode.value).toBe('live');
    expect(screen.demo.value).toBeNull();
    expect(load).not.toHaveBeenCalled();
    screen.dispose();
  });

  it('keeps ?demo=1 as the demo with はじめる, even if told nothing is collected', () => {
    const screen = createScreenMode({ search: '?demo=1', loadSnapshot: loader([COLLECTED]) });
    expect(screen.mode.value).toBe('demo');
    expect(screen.demo.value?.auto).toBe(false);
    screen.notCollected();
    expect(screen.mode.value).toBe('demo');
    expect(screen.generation.value).toBe(0);
    screen.dispose();
  });

  it('plays the automatic demo while nothing is collected, reading every 5 seconds', async () => {
    const load = loader([NOT_COLLECTED]);
    const screen = createScreenMode({ search: '', loadSnapshot: load });
    screen.notCollected();
    expect(screen.mode.value).toBe('auto-demo');
    expect(screen.demo.value?.auto).toBe(true);
    expect(screen.generation.value).toBe(1);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS - 1);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1 + 2 * REFRESH_INTERVAL_MS);
    expect(load).toHaveBeenCalledTimes(3);
    expect(screen.mode.value).toBe('auto-demo');
    screen.dispose();
  });

  it('turns live once the collector wrote the file, and stops reading', async () => {
    const load = loader([NOT_COLLECTED, COLLECTED]);
    const screen = createScreenMode({ search: '', loadSnapshot: load });
    screen.notCollected();
    await vi.advanceTimersByTimeAsync(2 * REFRESH_INTERVAL_MS);
    expect(screen.mode.value).toBe('live');
    expect(screen.demo.value).toBeNull();
    // A new screen: the live store starts afresh, with its own first fetch.
    expect(screen.generation.value).toBe(2);
    await vi.advanceTimersByTimeAsync(3 * REFRESH_INTERVAL_MS);
    expect(load).toHaveBeenCalledTimes(2);
    screen.dispose();
  });

  it('turns live on a server error, which the live screen then shows', async () => {
    const screen = createScreenMode({
      search: '',
      loadSnapshot: loader([{ ok: false, reason: 'http', status: 500 }]),
    });
    screen.notCollected();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(screen.mode.value).toBe('live');
    screen.dispose();
  });
});

describe('createScreenMode: repeats and races', () => {
  it('a new automatic demo each time nothing is collected again', async () => {
    const screen = createScreenMode({ search: '', loadSnapshot: loader([COLLECTED]) });
    screen.notCollected();
    const first = screen.demo.value;
    screen.notCollected();
    expect(screen.demo.value).toBe(first);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    screen.notCollected();
    expect(screen.mode.value).toBe('auto-demo');
    expect(screen.demo.value).not.toBe(first);
    screen.dispose();
  });

  it('skips a read while one is in flight, and drops one that ends after dispose', async () => {
    const pending: ((result: SnapshotLoadResult) => void)[] = [];
    const load = vi.fn(
      () =>
        new Promise<SnapshotLoadResult>((done) => {
          pending.push(done);
        }),
    );
    const screen = createScreenMode({ search: '', loadSnapshot: load });
    screen.notCollected();
    await vi.advanceTimersByTimeAsync(3 * REFRESH_INTERVAL_MS);
    expect(load).toHaveBeenCalledTimes(1);
    screen.dispose();
    pending[0]?.(COLLECTED);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(screen.mode.value).toBe('auto-demo');
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('createScreenMode: the handoff to the live screen', () => {
  it('hands the read that ended the demo to the live screen', async () => {
    const serverError: SnapshotLoadResult = { ok: false, reason: 'http', status: 500 };
    const screen = createScreenMode({ search: '', loadSnapshot: loader([serverError]) });
    expect(screen.handoff.value).toBeNull();
    screen.notCollected();
    expect(screen.handoff.value).toBeNull();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(screen.mode.value).toBe('live');
    expect(screen.handoff.value).toEqual(serverError);
    // The automatic demo again: nothing is handed to it.
    screen.notCollected();
    expect(screen.handoff.value).toBeNull();
    screen.dispose();
  });

  it('builds the live store from the handoff: its result first, a fresh baseline', () => {
    expect(liveGuildOptions(null)).toEqual({});
    expect(liveGuildOptions(COLLECTED)).toEqual({ firstResult: COLLECTED, freshBaseline: true });
  });
});

describe('the automatic demo and the live store together', () => {
  it('shows the error that ended the demo, then goes back to the demo on the next 204', async () => {
    const serverError: SnapshotLoadResult = { ok: false, reason: 'http', status: 500 };
    // One /snapshot.json for both: the watch reads the 500, the live store then a 204.
    const load = loader([serverError, NOT_COLLECTED]);
    const screen = createScreenMode({ search: '', loadSnapshot: load });
    screen.notCollected();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(screen.mode.value).toBe('live');

    // What GuildScreen.vue builds for the live screen.
    const memory = createMemoryStorage();
    const store = createGuildStore({
      ...liveGuildOptions(screen.handoff.value),
      loadSnapshot: load,
      storage: createKeyValueStore(() => memory),
    });
    const status = () => buildFetchStatus(store.state.snapshot, store.state.failure, 0);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(status().failure).toBe('取得失敗（サーバーがエラーを返しました）');
    expect(status().notCollected).toBe(false);

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(status().notCollected).toBe(true);
    // GuildScreen.vue tells App.vue, which starts the automatic demo again.
    screen.notCollected();
    expect(screen.mode.value).toBe('auto-demo');
    store.stop();
    screen.dispose();
  });
});
