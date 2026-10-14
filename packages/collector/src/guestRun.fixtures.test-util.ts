import type { SessionState } from '@conect-guild/snapshot';
import { SESSION_MEMBERS } from './run.fixtures.test-util.ts';
import type { SessionsReading } from './sessions.ts';

/**
 * Issue #108: fictional guests for the run tests. Their repositories and titles are secrets that
 * must stay out of every log line and the status file.
 */

export const GUEST_REPO_A = 'secret-visitor/hidden-app';
export const GUEST_REPO_B = 'secret-wanderer/quiet-tool';
export const GUEST_TITLE = 'Secret guest client contract';

const T = '2026-10-11T00:00:00Z';
const OPEN = {
  number: 7,
  title: GUEST_TITLE,
  created_at: T,
  updated_at: T,
  is_pull_request: false,
};
const MERGED = {
  number: 6,
  title: GUEST_TITLE,
  state_reason: null,
  closed_at: T,
  merged_at: T,
  is_pull_request: true,
};

/** Outputs for fakeGh: one open Issue and one merged PR in each guest repository. */
export const GUEST_OUTPUTS: Record<string, unknown[][]> = {
  [`${GUEST_REPO_A}/issues?state=open`]: [[OPEN]],
  [`${GUEST_REPO_A}/issues?state=closed`]: [[MERGED]],
  [`${GUEST_REPO_B}/issues?state=open`]: [[OPEN, { ...OPEN, number: 8 }]],
  [`${GUEST_REPO_B}/issues?state=closed`]: [[MERGED]],
};

/** The company sessions with these guest states (as many as the guest repositories). */
export function sessionsWithGuests(guests: readonly SessionState[]): SessionsReading {
  return { ok: true, found: 5, members: SESSION_MEMBERS, guests, guestsFound: 1 };
}

export const SESSIONS_WITH_GUESTS = sessionsWithGuests(['working', 'idle']);
