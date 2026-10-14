import {
  SESSION_DEPARTMENTS,
  type SnapshotSession,
  type SnapshotSessions,
} from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { DEPARTMENT_LABELS, SESSION_STALE_AFTER_MS } from '../guild.config';
import { at, T0 } from './fixtures.test-util';
import { liveStatesOf, memberOfSession } from './session';

function okSessions(members: SnapshotSession[]): SnapshotSessions {
  return { status: 'ok', checkedAt: T0, members, guests: [] };
}

describe('memberOfSession', () => {
  it('maps null to かなめ and each department to its member', () => {
    expect(memberOfSession(null)).toBe('kaname');
    expect(SESSION_DEPARTMENTS.map(memberOfSession)).toEqual([
      'minori',
      'hibiki',
      'hirame',
      'sasae',
    ]);
  });

  it('knows the same departments as the guild config', () => {
    expect([...SESSION_DEPARTMENTS]).toEqual([...DEPARTMENT_LABELS]);
  });
});

describe('liveStatesOf', () => {
  it('keeps awaiting-permission and working, and drops resting and idle', () => {
    const sessions = okSessions([
      { department: null, state: 'working' },
      { department: '経理', state: 'awaiting-permission' },
      { department: '広報', state: 'resting' },
      { department: '企画', state: 'idle' },
    ]);
    expect(liveStatesOf(sessions, at(T0))).toEqual({
      kaname: 'working',
      minori: 'awaiting-permission',
    });
  });

  it('is null when the sessions are unavailable', () => {
    expect(liveStatesOf({ status: 'unavailable', checkedAt: T0 }, at(T0))).toBeNull();
  });

  it('is null once the reading is older than the stale limit, and not before', () => {
    const sessions = okSessions([{ department: '経理', state: 'working' }]);
    expect(liveStatesOf(sessions, at(T0) + SESSION_STALE_AFTER_MS)).toEqual({ minori: 'working' });
    expect(liveStatesOf(sessions, at(T0) + SESSION_STALE_AFTER_MS + 1)).toBeNull();
  });

  it('is empty when no session is busy', () => {
    expect(liveStatesOf(okSessions([]), at(T0))).toEqual({});
  });
});
