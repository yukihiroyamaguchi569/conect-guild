import type { SessionState, SnapshotSessions } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { SESSION_STALE_AFTER_MS } from '../guild.config';
import { at, T0 } from './fixtures.test-util';
import { comparedReading, readSessions, summonedMembers, type SessionReading } from './summons';

/** かなめ, 経理, 広報, 企画, 総務 in this order. */
type Five = readonly [SessionState, SessionState, SessionState, SessionState, SessionState];

const ALL_IDLE: Five = ['idle', 'idle', 'idle', 'idle', 'idle'];

function sessions(states: Five, checkedAt: string = T0): SnapshotSessions {
  const [kaname, keiri, kouhou, kikaku, soumu] = states;
  return {
    status: 'ok',
    guests: [],
    checkedAt,
    members: [
      { department: null, state: kaname },
      { department: '経理', state: keiri },
      { department: '広報', state: kouhou },
      { department: '企画', state: kikaku },
      { department: '総務', state: soumu },
    ],
  };
}

function reading(states: Five, checkedAt: number = at(T0)): SessionReading {
  const [kaname, minori, hibiki, hirame, sasae] = states;
  return { checkedAt, states: { kaname, minori, hibiki, hirame, sasae } };
}

describe('readSessions', () => {
  it('keeps every member state with the time of the reading', () => {
    const read = readSessions(
      sessions(['working', 'resting', 'idle', 'awaiting-permission', 'idle']),
      at(T0),
    );
    expect(read).toEqual(reading(['working', 'resting', 'idle', 'awaiting-permission', 'idle']));
  });

  it('is null while the sessions are unavailable', () => {
    expect(readSessions({ status: 'unavailable', checkedAt: T0 }, at(T0))).toBeNull();
  });

  it('is null once the reading is older than the stale limit, not at the limit', () => {
    const read = sessions(ALL_IDLE);
    expect(readSessions(read, at(T0) + SESSION_STALE_AFTER_MS)).not.toBeNull();
    expect(readSessions(read, at(T0) + SESSION_STALE_AFTER_MS + 1)).toBeNull();
  });
});

describe('summonedMembers', () => {
  const later = at(T0) + 5_000;

  it('finds a session that went from idle or resting to working', () => {
    const before = reading(['idle', 'resting', 'idle', 'idle', 'idle']);
    const after = reading(['working', 'working', 'idle', 'idle', 'idle'], later);
    expect(summonedMembers(before, after)).toEqual(['kaname', 'minori']);
  });

  it('lists several at once in the party order', () => {
    const before = reading(ALL_IDLE);
    const after = reading(['idle', 'idle', 'working', 'working', 'working'], later);
    expect(summonedMembers(before, after)).toEqual(['hibiki', 'hirame', 'sasae']);
  });

  it('says nothing on the first reading', () => {
    expect(summonedMembers(null, reading(['working', 'idle', 'idle', 'idle', 'idle']))).toEqual([]);
  });

  it('says nothing coming back from unavailable or stale sessions', () => {
    // The caller keeps null as the previous reading while the sessions were not usable.
    const after = reading(['working', 'idle', 'idle', 'idle', 'idle'], later);
    expect(summonedMembers(null, after)).toEqual([]);
    expect(summonedMembers(reading(ALL_IDLE), null)).toEqual([]);
  });

  it('says nothing when the readings are further apart than the stale limit', () => {
    const before = reading(ALL_IDLE);
    const working: Five = ['working', 'idle', 'idle', 'idle', 'idle'];
    expect(summonedMembers(before, reading(working, at(T0) + SESSION_STALE_AFTER_MS))).toEqual([
      'kaname',
    ]);
    expect(summonedMembers(before, reading(working, at(T0) + SESSION_STALE_AFTER_MS + 1))).toEqual(
      [],
    );
  });

  it('says nothing when the next reading is not later than the previous one', () => {
    const before = reading(ALL_IDLE, later);
    const working: Five = ['working', 'idle', 'idle', 'idle', 'idle'];
    expect(summonedMembers(before, reading(working, later))).toEqual([]);
    expect(summonedMembers(before, reading(working, later - 1))).toEqual([]);
    expect(summonedMembers(before, reading(working, later + 1))).toEqual(['kaname']);
  });
});

describe('summonedMembers: changes that are not orders', () => {
  const later = at(T0) + 5_000;

  it('does not repeat while the session stays at work', () => {
    const working: Five = ['working', 'idle', 'idle', 'idle', 'idle'];
    expect(summonedMembers(reading(working), reading(working, later))).toEqual([]);
  });

  it('ignores work stopping, waiting for a permission and the way back from it', () => {
    const cases: readonly [SessionState, SessionState][] = [
      ['working', 'resting'],
      ['working', 'idle'],
      ['idle', 'awaiting-permission'],
      ['awaiting-permission', 'working'],
      ['resting', 'idle'],
    ];
    for (const [from, to] of cases) {
      const before = reading([from, 'idle', 'idle', 'idle', 'idle']);
      const after = reading([to, 'idle', 'idle', 'idle', 'idle'], later);
      expect(summonedMembers(before, after), `${from} → ${to}`).toEqual([]);
    }
  });

  it('ignores a member missing from the previous reading', () => {
    const before: SessionReading = { checkedAt: at(T0), states: {} };
    const after = reading(['working', 'idle', 'idle', 'idle', 'idle'], later);
    expect(summonedMembers(before, after)).toEqual([]);
  });
});

describe('comparedReading', () => {
  const before = reading(['working', 'idle', 'idle', 'idle', 'idle'], at(T0) + 5_000);

  it('moves on to a later reading', () => {
    const next = reading(ALL_IDLE, at(T0) + 5_001);
    expect(comparedReading(before, next)).toBe(next);
  });

  it('keeps the previous one for a reading that is not later (same time or the clock moved back)', () => {
    expect(comparedReading(before, reading(ALL_IDLE, at(T0) + 5_000))).toBe(before);
    expect(comparedReading(before, reading(ALL_IDLE, at(T0)))).toBe(before);
  });

  it('starts over from a missing reading, and from nothing', () => {
    expect(comparedReading(before, null)).toBeNull();
    expect(comparedReading(null, before)).toBe(before);
  });
});
