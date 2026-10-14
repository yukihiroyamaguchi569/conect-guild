import type {
  GuestGithubPart,
  GuestOpenItem,
  GuestRecentItem,
  SessionState,
  Snapshot,
} from '@conect-guild/snapshot';
import type { GuildGuest } from '@conect-guild/snapshot/settings';
import { SESSION_STALE_AFTER_MS } from '../guild.config';

/**
 * The guests (Issue #108): projects outside the company named in the settings, at most two. Their
 * names come from the settings and everything else from the snapshot, by position. Pure.
 */

/** What the guest looks like on the stage: the session state, or idle when it cannot be read. */
export type GuestState = SessionState;

/** An open Issue or PR of the guest's repository, as the board lists it. */
export interface GuestItem {
  readonly number: number;
  readonly title: string;
  readonly isPr: boolean;
}

export interface GuestView {
  /** Position in the settings' `guests` (0 or 1): which spot and which picture. */
  readonly index: number;
  readonly name: string;
  readonly state: GuestState;
  /** Null while the guest has no repository or it has not been fetched yet. */
  readonly repo: GuestRepoView | null;
}

export interface GuestRepoView {
  readonly openIssues: number;
  readonly openPrs: number;
  /** Open Issues and PRs, the most recently updated first. */
  readonly open: readonly GuestItem[];
}

/**
 * The state of each guest's session, as for the members (domain/session.ts): only while the
 * sessions were read and are fresh; otherwise the guests doze (idle).
 */
function guestStates(
  sessions: Snapshot['sessions'],
  now: number,
  staleAfterMs: number,
): readonly GuestState[] {
  if (sessions.status !== 'ok') return [];
  if (now - Date.parse(sessions.checkedAt) > staleAfterMs) return [];
  return sessions.guests;
}

function repoView(part: GuestGithubPart): GuestRepoView {
  const open = part.open
    .toSorted(
      (a: GuestOpenItem, b: GuestOpenItem) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    )
    .map(({ number, title, isPr }) => ({ number, title, isPr }));
  const openPrs = open.filter((item) => item.isPr).length;
  return { openIssues: open.length - openPrs, openPrs, open };
}

/**
 * One view per guest of the settings, in their order. A snapshot whose guests were dropped
 * (adapters/snapshot.ts: they did not fit the settings) leaves them idle with no repository.
 * `now` is epoch ms.
 */
export function buildGuests(
  guests: readonly GuildGuest[],
  snapshot: Pick<Snapshot, 'sessions' | 'guests'>,
  now: number,
  staleAfterMs: number = SESSION_STALE_AFTER_MS,
): GuestView[] {
  const states = guestStates(snapshot.sessions, now, staleAfterMs);
  return guests.map((guest, index) => {
    const part = snapshot.guests[index] ?? null;
    return {
      index,
      name: guest.name,
      state: states[index] ?? 'idle',
      repo: part === null ? null : repoView(part),
    };
  });
}

/** A guest's PR merged or Issue completed since the last snapshot. */
export interface GuestEvent {
  readonly guest: number;
  readonly kind: GuestRecentItem['kind'];
  readonly number: number;
  readonly title: string;
}

/** What was already finished in each guest's repository; null where nothing was seen yet. */
export type GuestBaseline = readonly (GuestSeen | null)[];

export interface GuestSeen {
  readonly repo: string;
  /**
   * `kind:number:at` of the finished items seen. The time counts: an Issue reopened and completed
   * again is finished anew.
   */
  readonly finished: ReadonlySet<string>;
}

const keyOf = (item: GuestRecentItem): string => `${item.kind}:${String(item.number)}:${item.at}`;

function seenOf(part: GuestGithubPart): GuestSeen {
  return { repo: part.repo, finished: new Set(part.recent.map(keyOf)) };
}

/** The new finished items of one guest, oldest first (the snapshot lists them newest first). */
function newItems(seen: GuestSeen | null, part: GuestGithubPart): GuestRecentItem[] {
  if (seen?.repo !== part.repo) return [];
  return part.recent.filter((item) => !seen.finished.has(keyOf(item))).toReversed();
}

/**
 * The events of the guests between the last baseline and `guests` (a snapshot's), oldest first
 * across the guests, and the next baseline. The first snapshot (`previous` null), a guest seen for
 * the first time and a guest whose repository changed only set the baseline: no events. A guest
 * whose part is missing (not fetched yet, or dropped) forgets what was seen, so when it comes back
 * it only sets the baseline again instead of reporting the gap in a burst. The baseline is kept in
 * memory only: a reload starts afresh.
 */
export function guestEvents(
  previous: GuestBaseline | null,
  guests: Snapshot['guests'],
): { readonly events: GuestEvent[]; readonly baseline: GuestBaseline } {
  const count = Math.max(guests.length, previous?.length ?? 0);
  const found: { readonly at: number; readonly event: GuestEvent }[] = [];
  const baseline = Array.from({ length: count }, (_, guest): GuestSeen | null => {
    const part = guests[guest] ?? null;
    if (part === null) return null;
    if (previous !== null) {
      for (const item of newItems(previous[guest] ?? null, part)) {
        const event = { guest, kind: item.kind, number: item.number, title: item.title };
        found.push({ at: Date.parse(item.at), event });
      }
    }
    return seenOf(part);
  });
  // A stable sort: items of the same time keep each guest's order, the first guest first.
  const events = found.toSorted((a, b) => a.at - b.at).map(({ event }) => event);
  return { events, baseline };
}

/** The message window's line, e.g. `たびびと の PR #12「…」がマージされた`. */
export function guestEventMessage(event: GuestEvent, name: string): string {
  const n = String(event.number);
  return event.kind === 'pr-merged'
    ? `${name} の PR #${n}「${event.title}」がマージされた`
    : `${name} の Issue #${n}「${event.title}」が完了した`;
}
