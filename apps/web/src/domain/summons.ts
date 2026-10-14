import type { SessionState, SnapshotSessions } from '@conect-guild/snapshot';
import { LEVEL_MEMBER_IDS, SESSION_STALE_AFTER_MS, type MemberId } from '../guild.config';
import { memberOfSession } from './session';

/**
 * The president gave an order (Issue #28): a company session went from waiting (resting or idle)
 * to working between two readings. Only the president talks to these sessions, so that change is
 * taken as his prompt; what he said is never read (the snapshot does not have it). Pure: the time
 * is passed in.
 */

/** One fresh reading of the company sessions: when the collector read them, and their states. */
export interface SessionReading {
  /** Epoch ms of `sessions.checkedAt`. */
  readonly checkedAt: number;
  readonly states: Readonly<Partial<Record<MemberId, SessionState>>>;
}

/**
 * The reading of a snapshot's sessions, or null when they are unavailable or older than
 * `staleAfterMs` at `now` (epoch ms): then nothing can be said about a change.
 */
export function readSessions(
  sessions: SnapshotSessions,
  now: number,
  staleAfterMs: number = SESSION_STALE_AFTER_MS,
): SessionReading | null {
  if (sessions.status !== 'ok') return null;
  const checkedAt = Date.parse(sessions.checkedAt);
  if (now - checkedAt > staleAfterMs) return null;
  const states: Partial<Record<MemberId, SessionState>> = {};
  for (const member of sessions.members) states[memberOfSession(member.department)] = member.state;
  return { checkedAt, states };
}

const WAITING: ReadonlySet<SessionState> = new Set<SessionState>(['resting', 'idle']);

/** The order the summoned are listed in: かなめ, then the departments, as the party window. */
const ORDER: readonly MemberId[] = LEVEL_MEMBER_IDS;

/**
 * Members whose session went from waiting (resting / idle) to working between `previous` and
 * `next`. None on the first reading (no previous), when either reading is missing (unavailable or
 * stale: coming back from old information is not an order) or when the readings are more than
 * `staleAfterMs` apart (the change may be long past) or the next is not later than the previous. A session that goes back to work after a
 * permission (awaiting-permission → working) was not given an order.
 */
export function summonedMembers(
  previous: SessionReading | null,
  next: SessionReading | null,
  staleAfterMs: number = SESSION_STALE_AFTER_MS,
): MemberId[] {
  if (previous === null || next === null) return [];
  const gap = next.checkedAt - previous.checkedAt;
  // Not after the previous one (a clock moved back): which state came first is unknown.
  if (gap <= 0 || gap > staleAfterMs) return [];
  return ORDER.filter((id) => {
    const before = previous.states[id];
    return before !== undefined && WAITING.has(before) && next.states[id] === 'working';
  });
}

/**
 * The reading the one after `next` is compared with: `next`, unless it is not later than
 * `previous` (the same file read again, or a clock moved back), which keeps `previous`. A missing
 * reading (unavailable or stale) is kept as null, so the next one only starts over.
 */
export function comparedReading(
  previous: SessionReading | null,
  next: SessionReading | null,
): SessionReading | null {
  if (previous === null || next === null) return next;
  return next.checkedAt > previous.checkedAt ? next : previous;
}
