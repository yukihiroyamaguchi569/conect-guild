import type { CollectorStatus } from '@conect-guild/snapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectorStatusRead } from '../adapters/collectorStatus';
import { DEPARTMENT_LABELS, STALE_AFTER_MS } from '../guild.config';
import { createLabelWatch } from './labelWatch';
import { globalScheduler } from './scheduler';

/** Issue #85: the missing department labels on the live screen. */

const NOW = Date.parse('2026-10-12T00:00:00.000Z');
const INTERVAL_MS = 5_000;
const ABSENT: CollectorStatusRead = { kind: 'absent' };
const UNREADABLE: CollectorStatusRead = { kind: 'unreadable' };

function found(missingLabels: number[] | undefined, at: number = NOW): CollectorStatusRead {
  const status: CollectorStatus =
    missingLabels === undefined
      ? { ok: true, attemptedAt: new Date(at).toISOString() }
      : { ok: true, attemptedAt: new Date(at).toISOString(), missingLabels };
  return { kind: 'status', status };
}

/** Answers `reads` in turn, then the last one again. */
function reader(reads: (CollectorStatusRead | Error)[]) {
  return vi.fn(() => {
    const read = reads.length > 1 ? reads.shift() : reads[0];
    return read instanceof Error ? Promise.reject(read) : Promise.resolve(read ?? ABSENT);
  });
}

function watchWith(loadStatus: () => Promise<CollectorStatusRead>) {
  return createLabelWatch({
    loadStatus,
    now: Date.now,
    scheduler: globalScheduler,
    intervalMs: INTERVAL_MS,
  });
}

function positions(watch: ReturnType<typeof watchWith>): number[] {
  return watch.missing.value.map((m) => m.position);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createLabelWatch', () => {
  it('reads nothing until started', async () => {
    const load = reader([found([1])]);
    const watch = watchWith(load);
    await vi.advanceTimersByTimeAsync(3 * INTERVAL_MS);
    expect(load).not.toHaveBeenCalled();
    expect(watch.missing.value).toEqual([]);
  });

  it('shows a finding right away and reads again on every interval', async () => {
    const load = reader([found([1])]);
    const watch = watchWith(load);
    watch.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(watch.missing.value).toEqual([{ position: 1, label: DEPARTMENT_LABELS[1] }]);
    await vi.advanceTimersByTimeAsync(2 * INTERVAL_MS);
    expect(load).toHaveBeenCalledTimes(3);
    watch.stop();
  });

  it('drops the finding once the collector finds every label', async () => {
    const watch = watchWith(reader([found([0, 2]), found(undefined)]));
    watch.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(positions(watch)).toEqual([0, 2]);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(watch.missing.value).toEqual([]);
    watch.stop();
  });

  it('keeps the last finding through an unreadable or throwing read, and 204 clears it', async () => {
    const watch = watchWith(reader([found([3]), UNREADABLE, new Error('network'), ABSENT]));
    watch.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(positions(watch)).toEqual([3]);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(positions(watch)).toEqual([3]);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(positions(watch)).toEqual([3]);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(watch.missing.value).toEqual([]);
    watch.stop();
  });
});

describe('createLabelWatch: stale, unchanged and stopped', () => {
  it('drops a finding once its status is stale (the collector stopped)', async () => {
    const watch = watchWith(reader([found([1], NOW - STALE_AFTER_MS - 1)]));
    watch.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(watch.missing.value).toEqual([]);
    watch.stop();
  });

  it('does not replace the shown list when the finding stays the same', async () => {
    const watch = watchWith(reader([found([1])]));
    watch.start();
    await vi.advanceTimersByTimeAsync(0);
    const shown = watch.missing.value;
    await vi.advanceTimersByTimeAsync(2 * INTERVAL_MS);
    expect(watch.missing.value).toBe(shown);
    watch.stop();
  });

  it('stops reading on stop, and a read in flight then changes nothing', async () => {
    const pending: ((read: CollectorStatusRead) => void)[] = [];
    const load = vi.fn(
      () =>
        new Promise<CollectorStatusRead>((resolve) => {
          pending.push(resolve);
        }),
    );
    const watch = watchWith(load);
    watch.start();
    watch.stop();
    for (const resolve of pending) resolve(found([1]));
    await vi.advanceTimersByTimeAsync(3 * INTERVAL_MS);
    expect(watch.missing.value).toEqual([]);
    expect(load).toHaveBeenCalledOnce();
  });

  it('skips a beat while a read is still going', async () => {
    const load = vi.fn(() => new Promise<CollectorStatusRead>(() => undefined));
    const watch = watchWith(load);
    watch.start();
    await vi.advanceTimersByTimeAsync(3 * INTERVAL_MS);
    expect(load).toHaveBeenCalledOnce();
    watch.stop();
  });
});
