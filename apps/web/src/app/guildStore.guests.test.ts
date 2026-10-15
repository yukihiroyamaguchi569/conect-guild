import type { GuestGithubPart, GuestRecentItem, Snapshot } from '@conect-guild/snapshot';
import { FICTIONAL_GUESTS } from '@conect-guild/snapshot/settings.fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotLoadResult } from '../adapters/snapshot';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import { snapshot, T0 } from '../domain/fixtures.test-util';
import { createGuildStore } from './guildStore';
import { guestCue } from './guildView';

/** Issue #108: the guests' merges and completions reach the message window as plain lines. */

const REPO = 'example-visitor/visitor-app';

function memoryStorage(): StorageLike {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

function done(kind: GuestRecentItem['kind'], number: number): GuestRecentItem {
  return { kind, number, title: `架空の完了 ${String(number)}`, at: T0 };
}

function withRecent(recent: GuestRecentItem[]): Snapshot {
  const part: GuestGithubPart = { repo: REPO, fetchedAt: T0, open: [], recent };
  return snapshot({ guests: [part, null] });
}

const ok = (snap: Snapshot): SnapshotLoadResult => ({ ok: true, snapshot: snap });

function setup(results: SnapshotLoadResult[], guests = [...FICTIONAL_GUESTS]) {
  return createGuildStore({
    refreshIntervalMs: 60_000,
    loadSnapshot: () =>
      Promise.resolve(results.shift() ?? ({ ok: false, reason: 'network' } as const)),
    storage: createKeyValueStore(memoryStorage),
    guests,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createGuildStore: the guests', () => {
  it('says nothing about the guests on the first snapshot', async () => {
    const store = setup([ok(withRecent([done('pr-merged', 12)]))]);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.state.messages).toEqual([]);
    store.stop();
  });

  it('tells a new merge and a new completion, oldest first, with no scene', async () => {
    const store = setup([
      ok(withRecent([done('pr-merged', 12)])),
      ok(withRecent([done('issue-completed', 5), done('pr-merged', 13), done('pr-merged', 12)])),
    ]);
    store.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.state.messages.map(({ text, event, guest }) => ({ text, event, guest }))).toEqual([
      { text: 'たびびと の PR #13「架空の完了 13」がマージされた', event: null, guest: 0 },
      { text: 'たびびと の Issue #5「架空の完了 5」が完了した', event: null, guest: 0 },
    ]);
    // Queued with its masked line, so the show mode masks it even when turned on later (Issue #144).
    expect(store.state.messages.map(({ maskedText }) => maskedText)).toEqual([
      'たびびと の PR #13「＊＊＊＊＊＊＊＊」がマージされた',
      'たびびと の Issue #5「＊＊＊＊＊＊＊」が完了した',
    ]);
    expect(guestCue(store.state.messages[0] ?? null)).toEqual({
      id: store.state.messages[0]?.id,
      guest: 0,
    });
    store.stop();
  });

  it('reads no guests beyond the settings (the sample of a build is not checked)', async () => {
    const store = setup([ok(withRecent([])), ok(withRecent([done('pr-merged', 13)]))], []);
    store.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.state.messages).toEqual([]);
    expect(store.guests).toEqual([]);
    store.stop();
  });

  it('keeps what it saw across a failed fetch', async () => {
    const store = setup([
      ok(withRecent([])),
      { ok: false, reason: 'network' },
      ok(withRecent([done('pr-merged', 13)])),
    ]);
    store.start();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(store.state.messages.map((m) => m.guest)).toEqual([0]);
    store.stop();
  });
});

describe('guestCue', () => {
  it('is null without a message or for a line about no guest', () => {
    expect(guestCue(null)).toBeNull();
    expect(guestCue({ id: 1, text: 'x', event: null })).toBeNull();
    expect(guestCue({ id: 2, text: 'x', event: null, guest: 1 })).toEqual({ id: 2, guest: 1 });
  });
});
