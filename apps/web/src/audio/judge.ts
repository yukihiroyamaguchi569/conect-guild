import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { MemberState } from '../domain/party';
import type { MemberId } from '../guild.config';
import type { SoundCue } from './scores';

/** Which sound each event plays when its message reaches the window. */
const EVENT_CUES: Readonly<Record<GuildEventKind, SoundCue>> = {
  'issue-opened': 'scroll',
  'pr-merged': 'chest',
  'issue-closed': 'clear',
  'level-up': 'levelup',
  'king-quest-opened': 'scroll',
  'king-quest-cleared': 'clear',
};

/**
 * The sound of a message that reached the window: its event's, or the soft ピピピ for a notice
 * (no event). Event messages do not add the ピピピ, so two sounds never start together.
 */
export function cueForMessage(message: { readonly event: GuildEvent | null }): SoundCue {
  return message.event === null ? 'text' : EVENT_CUES[message.event.kind];
}

/**
 * Whether the king's call rings when it starts on the stage at `now` (Issue #28): not while
 * another sound still plays (until `otherEndsAt`, null when none has played), so two never sound
 * together and the call gives way.
 */
export function callRings(now: number, otherEndsAt: number | null): boolean {
  return otherEndsAt === null || now >= otherEndsAt;
}

export interface PartyMember {
  readonly id: MemberId;
  readonly state: MemberState;
}

function awaitingIds(rows: readonly PartyMember[]): Set<MemberId> {
  return new Set(rows.filter((row) => row.state === 'awaiting-permission').map((row) => row.id));
}

/**
 * Members who wait for a permission in `next` but did not in `previous`. With no previous party
 * (the first snapshot) nobody is new: those already waiting at load do not ring.
 */
export function newlyAwaiting(
  previous: readonly PartyMember[] | null,
  next: readonly PartyMember[],
): MemberId[] {
  if (previous === null) return [];
  const before = awaitingIds(previous);
  return [...awaitingIds(next)].filter((id) => !before.has(id));
}

export interface SoundGate {
  /** The viewer turned the sound on. */
  readonly enabled: boolean;
  /** The page is hidden: nothing rings now, nor later when it is shown again. */
  readonly hidden: boolean;
  /** The screen is halted (schema mismatch): the windows are not live. */
  readonly halted: boolean;
}

export function mayPlay(gate: SoundGate): boolean {
  return gate.enabled && !gate.hidden && !gate.halted;
}
