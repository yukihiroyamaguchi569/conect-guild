import type { SessionDepartment, SnapshotSessions } from '@conect-guild/snapshot';
import { departmentMember, SESSION_STALE_AFTER_MS, type MemberId } from '../guild.config';

/**
 * What the company sessions are doing right now (docs/DESIGN.md 4.7). Only the two states that
 * change the party window are kept: resting and idle sessions fall back to GitHub.
 */
export type LiveState = 'awaiting-permission' | 'working';

export type LiveStates = Readonly<Partial<Record<MemberId, LiveState>>>;

export const NO_LIVE_STATES: LiveStates = {};

/** かなめ has no department (null); the others sit at their department's desk. */
export function memberOfSession(department: SessionDepartment | null): MemberId {
  return department === null ? 'kaname' : departmentMember(department);
}

/**
 * The live states by member, or null when the sessions are unavailable or older than
 * `staleAfterMs` (then the party is judged from GitHub only). `now` is epoch ms.
 */
export function liveStatesOf(
  sessions: SnapshotSessions,
  now: number,
  staleAfterMs: number = SESSION_STALE_AFTER_MS,
): LiveStates | null {
  if (sessions.status !== 'ok') return null;
  if (now - Date.parse(sessions.checkedAt) > staleAfterMs) return null;
  const live: Partial<Record<MemberId, LiveState>> = {};
  for (const member of sessions.members) {
    if (member.state === 'awaiting-permission' || member.state === 'working') {
      live[memberOfSession(member.department)] = member.state;
    }
  }
  return live;
}
