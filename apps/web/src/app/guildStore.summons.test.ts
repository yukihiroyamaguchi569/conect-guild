import type { SessionState, Snapshot } from '@conect-guild/snapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotLoadResult } from '../adapters/snapshot';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import { snapshot, T0 } from '../domain/fixtures.test-util';
import { SESSION_STALE_AFTER_MS } from '../guild.config';
import { createGuildStore } from './guildStore';

/** The president's orders (Issue #28): sessions that go from waiting to working, once per fetch. */

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

/** A snapshot read `seconds` after T0, with かなめ and 経理 in the given states. */
function reading(seconds: number, kaname: SessionState, keiri: SessionState = 'idle'): Snapshot {
  const checkedAt = new Date(Date.parse(T0) + seconds * 1000).toISOString();
  return snapshot({
    sessions: {
      status: 'ok',
      guests: [],
      checkedAt,
      members: [
        { department: null, state: kaname },
        { department: '経理', state: keiri },
        { department: '広報', state: 'idle' },
        { department: '企画', state: 'idle' },
        { department: '総務', state: 'idle' },
      ],
    },
  });
}

const ok = (snap: Snapshot): SnapshotLoadResult => ({ ok: true, snapshot: snap });
const halt: SnapshotLoadResult = { ok: false, reason: 'schema-version' };
const network: SnapshotLoadResult = { ok: false, reason: 'network' };

/** A store that loads `results` in turn, with the wall clock at T0 + `seconds` on each load. */
function setup() {
  const queue: { result: SnapshotLoadResult; seconds: number }[] = [];
  let clock = Date.parse(T0);
  const store = createGuildStore({
    loadSnapshot: () => {
      const next = queue.shift();
      if (next === undefined) return Promise.resolve(network);
      clock = Date.parse(T0) + next.seconds * 1000;
      return Promise.resolve(next.result);
    },
    storage: createKeyValueStore(memoryStorage),
    now: () => clock,
  });
  const load = async (result: SnapshotLoadResult, seconds: number): Promise<void> => {
    queue.push({ result, seconds });
    await store.refresh();
  };
  return { store, load };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('guild store summons', () => {
  it('stays quiet on the first load, even with a session already working', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'working')), 0);
    expect(store.state.summons).toBeNull();
  });

  it('reports a session that goes from waiting to working, once', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'idle')), 0);
    await load(ok(reading(5, 'working')), 5);
    expect(store.state.summons).toEqual({ id: 1, members: ['kaname'], from: 'king' });
    await load(ok(reading(10, 'working')), 10);
    expect(store.state.summons).toEqual({ id: 1, members: ['kaname'], from: 'king' });
  });

  it('reports several sessions of one fetch together', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'resting', 'idle')), 0);
    await load(ok(reading(5, 'working', 'working')), 5);
    expect(store.state.summons).toEqual({ id: 1, members: ['kaname', 'minori'], from: 'king' });
  });

  it('gives each new order a new id', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'idle')), 0);
    await load(ok(reading(5, 'working')), 5);
    await load(ok(reading(10, 'resting')), 10);
    await load(ok(reading(15, 'working')), 15);
    expect(store.state.summons).toEqual({ id: 2, members: ['kaname'], from: 'king' });
  });

  it('does not report work stopping', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'working')), 0);
    await load(ok(reading(5, 'idle')), 5);
    expect(store.state.summons).toBeNull();
  });
});

describe('guild store summons after an interruption', () => {
  it('starts over after a halt: the first reading after it is not compared', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'idle')), 0);
    await load(halt, 5);
    expect(store.state.halted).toBe(true);
    await load(ok(reading(10, 'working')), 10);
    expect(store.state.halted).toBe(false);
    expect(store.state.summons).toBeNull();
  });

  it('keeps comparing across a short network failure', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'idle')), 0);
    await load(network, 5);
    await load(ok(reading(10, 'working')), 10);
    expect(store.state.summons).toEqual({ id: 1, members: ['kaname'], from: 'king' });
  });

  it('stays quiet coming back from stale sessions', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'idle')), 0);
    // The collector stopped: the same reading is read again after it went stale.
    const stale = SESSION_STALE_AFTER_MS / 1000 + 5;
    await load(ok(reading(0, 'idle')), stale);
    await load(ok(reading(stale + 5, 'working')), stale + 5);
    expect(store.state.summons).toBeNull();
  });

  it('does not take a reading older than the last as the new starting point', async () => {
    const { store, load } = setup();
    // At work at 10 s; an older reading (waiting, at 5 s) comes in late; then at work at 15 s.
    await load(ok(reading(10, 'working')), 10);
    await load(ok(reading(5, 'idle')), 12);
    await load(ok(reading(15, 'working')), 15);
    expect(store.state.summons).toBeNull();
  });

  it('stays quiet when the sessions were unavailable in between', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'idle')), 0);
    await load(ok(snapshot({ sessions: { status: 'unavailable', checkedAt: T0 } })), 5);
    await load(ok(reading(10, 'working')), 10);
    expect(store.state.summons).toBeNull();
  });
});

describe('guild store summons from かなめ (Issue #155)', () => {
  it('has かなめ hand the work on when she was working just before the department starts', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'working', 'idle')), 0);
    await load(ok(reading(5, 'resting', 'idle')), 5);
    await load(ok(reading(10, 'idle', 'working')), 10);
    expect(store.state.summons).toEqual({ id: 1, members: ['minori'], from: 'kaname' });
  });

  it.each([
    { startsAt: 60, from: 'kaname' },
    { startsAt: 65, from: 'king' },
  ])('a department starting $startsAt s after かなめ was last seen working: $from', async (c) => {
    const { store, load } = setup();
    await load(ok(reading(0, 'working', 'idle')), 0);
    for (let s = 5; s < c.startsAt; s += 5) await load(ok(reading(s, 'idle', 'idle')), s);
    await load(ok(reading(c.startsAt, 'idle', 'working')), c.startsAt);
    expect(store.state.summons).toEqual({ id: 1, members: ['minori'], from: c.from });
  });

  it('keeps the king when かなめ was waiting all along', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'idle', 'idle')), 0);
    await load(ok(reading(5, 'idle', 'working')), 5);
    expect(store.state.summons).toEqual({ id: 1, members: ['minori'], from: 'king' });
  });

  it('keeps the king when かなめ starts working in the same fetch', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'working', 'idle')), 0);
    await load(ok(reading(5, 'idle', 'idle')), 5);
    await load(ok(reading(10, 'working', 'working')), 10);
    expect(store.state.summons).toEqual({ id: 1, members: ['kaname', 'minori'], from: 'king' });
  });

});

describe('guild store summons from かなめ after an interruption (Issue #155)', () => {
  it('forgets かなめ’s work over a halt', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'working', 'idle')), 0);
    await load(halt, 5);
    await load(ok(reading(10, 'idle', 'idle')), 10);
    await load(ok(reading(15, 'idle', 'working')), 15);
    expect(store.state.summons).toEqual({ id: 1, members: ['minori'], from: 'king' });
  });

  it('forgets かなめ’s work over a stale reading', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'working', 'idle')), 0);
    const stale = SESSION_STALE_AFTER_MS / 1000 + 5;
    await load(ok(reading(0, 'working', 'idle')), stale);
    await load(ok(reading(stale + 5, 'idle', 'idle')), stale + 5);
    await load(ok(reading(stale + 10, 'idle', 'working')), stale + 10);
    expect(store.state.summons).toEqual({ id: 1, members: ['minori'], from: 'king' });
  });

  it('does not take かなめ’s work from a reading older than the compared one', async () => {
    const { store, load } = setup();
    // Waiting at 10 s; an older reading (at work, at 5 s) comes in late; then 経理 at 15 s.
    await load(ok(reading(10, 'idle', 'idle')), 10);
    await load(ok(reading(5, 'working', 'idle')), 12);
    await load(ok(reading(15, 'idle', 'working')), 15);
    expect(store.state.summons).toEqual({ id: 1, members: ['minori'], from: 'king' });
  });

  it('keeps かなめ’s work across a short network failure', async () => {
    const { store, load } = setup();
    await load(ok(reading(0, 'working', 'idle')), 0);
    await load(network, 5);
    await load(ok(reading(10, 'idle', 'working')), 10);
    expect(store.state.summons).toEqual({ id: 1, members: ['minori'], from: 'kaname' });
  });
});
