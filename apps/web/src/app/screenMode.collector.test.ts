import type { CollectorStatus } from '@conect-guild/snapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectorStatusRead } from '../adapters/collectorStatus';
import type { SnapshotLoadResult } from '../adapters/snapshot';
import { snapshot, T0 } from '../domain/fixtures.test-util';
import { STALE_AFTER_MS } from '../guild.config';
import { createCollectorWatch } from './collectorWatch';
import { REFRESH_INTERVAL_MS } from './guildStore';
import { createScreenMode } from './screenMode';

/** Issue #74: the collector's status during the automatic demo. */

const NOT_COLLECTED: SnapshotLoadResult = { ok: false, reason: 'not-collected' };
const COLLECTED: SnapshotLoadResult = { ok: true, snapshot: snapshot({ fetchedAt: T0 }) };
const NOW = Date.parse(T0);
const ABSENT: CollectorStatusRead = { kind: 'absent' };
const UNREADABLE: CollectorStatusRead = { kind: 'unreadable' };

function failedAt(at: number, kind: 'gh-failed' | 'validation-failed' = 'gh-failed') {
  const status: CollectorStatus = { ok: false, attemptedAt: new Date(at).toISOString(), kind };
  return { kind: 'status', status } as const satisfies CollectorStatusRead;
}

/** Answers `reads` in turn, then the last one again. */
function reader<T>(reads: T[], fallback: T) {
  return vi.fn(() => Promise.resolve((reads.length > 1 ? reads.shift() : reads[0]) ?? fallback));
}

function fakeConsole() {
  return { info: vi.fn<(text: string) => void>(), warn: vi.fn<(text: string) => void>() };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function autoDemo(statuses: CollectorStatusRead[], snapshots: SnapshotLoadResult[] = []) {
  const console = fakeConsole();
  const loadCollectorStatus = reader(statuses, ABSENT);
  const screen = createScreenMode({
    search: '',
    loadSnapshot: reader(snapshots.length > 0 ? snapshots : [NOT_COLLECTED], NOT_COLLECTED),
    loadCollectorStatus,
    console,
  });
  screen.notCollected();
  return { screen, console, loadCollectorStatus };
}

describe('createScreenMode: the collector status', () => {
  it('reads nothing of the collector while live or in ?demo=1', async () => {
    const loadCollectorStatus = reader<CollectorStatusRead>([failedAt(NOW)], ABSENT);
    const console = fakeConsole();
    for (const search of ['', '?demo=1']) {
      const screen = createScreenMode({
        search,
        loadSnapshot: reader([COLLECTED], COLLECTED),
        loadCollectorStatus,
        console,
      });
      await vi.advanceTimersByTimeAsync(2 * REFRESH_INTERVAL_MS);
      expect(screen.collectorFailure.value).toBeNull();
      screen.dispose();
    }
    expect(loadCollectorStatus).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
  });

  it('starts the automatic demo with one console hint and a first read', async () => {
    const { screen, console, loadCollectorStatus } = autoDemo([ABSENT]);
    await vi.advanceTimersByTimeAsync(0);
    expect(loadCollectorStatus).toHaveBeenCalledOnce();
    expect(console.info).toHaveBeenCalledOnce();
    expect(console.info.mock.calls[0]?.[0]).toContain('デモ（架空のデータ）を表示しています');
    expect(console.warn).not.toHaveBeenCalled();
    expect(screen.collectorFailure.value).toBeNull();
    screen.dispose();
  });

  it('shows a failure at once, and warns once while it lasts', async () => {
    const { screen, console, loadCollectorStatus } = autoDemo([failedAt(NOW)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.collectorFailure.value).toBe('gh-failed');
    await vi.advanceTimersByTimeAsync(3 * REFRESH_INTERVAL_MS);
    expect(loadCollectorStatus).toHaveBeenCalledTimes(4);
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.warn.mock.calls[0]?.[0]).toBe(
      '[conect-guild] collector が失敗しています（認証・取得）。ターミナルを確認してください（gh-failed）',
    );
    screen.dispose();
  });
});

describe('createScreenMode: the collector status as it changes', () => {
  it('warns again only when the kind changes, and never for a success', async () => {
    const { screen, console } = autoDemo([
      failedAt(NOW),
      failedAt(NOW, 'validation-failed'),
      { kind: 'status', status: { ok: true, attemptedAt: T0 } },
      failedAt(NOW, 'validation-failed'),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(screen.collectorFailure.value).toBe('validation-failed');
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(screen.collectorFailure.value).toBeNull();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(console.warn.mock.calls.map(([text]) => /（([\w-]+)）$/.exec(text)?.[1])).toEqual([
      'gh-failed',
      'validation-failed',
      'validation-failed',
    ]);
    screen.dispose();
  });

  it('keeps the last status through an unreadable read; drops it on 204', async () => {
    const { screen } = autoDemo([failedAt(NOW), UNREADABLE, ABSENT]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(screen.collectorFailure.value).toBe('gh-failed');
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(screen.collectorFailure.value).toBeNull();
    screen.dispose();
  });

  it('drops a failure gone stale (the collector stopped) as the time passes', async () => {
    const { screen } = autoDemo([failedAt(NOW - STALE_AFTER_MS + REFRESH_INTERVAL_MS)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.collectorFailure.value).toBe('gh-failed');
    await vi.advanceTimersByTimeAsync(2 * REFRESH_INTERVAL_MS);
    expect(screen.collectorFailure.value).toBeNull();
    screen.dispose();
  });
});

describe('createScreenMode: the collector status and the switch to live', () => {
  it('forgets the failure when the page turns live, and stops reading the status', async () => {
    const { screen, loadCollectorStatus } = autoDemo([failedAt(NOW)], [NOT_COLLECTED, COLLECTED]);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(screen.collectorFailure.value).toBe('gh-failed');
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(screen.mode.value).toBe('live');
    expect(screen.collectorFailure.value).toBeNull();
    const reads = loadCollectorStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3 * REFRESH_INTERVAL_MS);
    expect(loadCollectorStatus).toHaveBeenCalledTimes(reads);
    screen.dispose();
  });

  it('drops a status read that ends after dispose', async () => {
    const pending: ((read: CollectorStatusRead) => void)[] = [];
    const console = fakeConsole();
    const screen = createScreenMode({
      search: '',
      loadSnapshot: reader([NOT_COLLECTED], NOT_COLLECTED),
      loadCollectorStatus: () =>
        new Promise((done) => {
          pending.push(done);
        }),
      console,
    });
    screen.notCollected();
    screen.dispose();
    pending[0]?.(failedAt(NOW));
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.collectorFailure.value).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('createCollectorWatch', () => {
  it('drops a read that ends after a later one (the slow read at the start)', async () => {
    const pending: ((read: CollectorStatusRead) => void)[] = [];
    const console = fakeConsole();
    const watch = createCollectorWatch({
      loadStatus: () =>
        new Promise((done) => {
          pending.push(done);
        }),
      now: () => NOW,
      console,
    });
    const first = watch.start();
    const second = watch.refresh();
    pending[1]?.(failedAt(NOW));
    await second;
    expect(watch.failure.value).toBe('gh-failed');
    pending[0]?.(ABSENT);
    await first;
    expect(watch.failure.value).toBe('gh-failed');
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('warns again for the same failure after a new start (a new automatic demo)', async () => {
    const console = fakeConsole();
    const watch = createCollectorWatch({
      loadStatus: () => Promise.resolve(failedAt(NOW)),
      now: () => NOW,
      console,
    });
    await watch.start();
    await watch.refresh();
    watch.stop();
    expect(watch.failure.value).toBeNull();
    await watch.start();
    expect(console.info).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});
