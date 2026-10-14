import {
  GUEST_RECENT_LIMIT,
  guestGithubPartSchema,
  type GuestGithubPart,
  type GuestOpenItem,
  type GuestRecentItem,
} from '@conect-guild/snapshot';
import { z } from 'zod';
import { ghApiProjectedPage, parseOrThrow, type GhRunner } from './gh.ts';

/**
 * Issue #108: a guest's repository, read for its open Issues and PRs and the ones finished in the
 * last 7 days (docs/DESIGN.md 4.1). One page each of two lists of the issues endpoint (which also
 * returns the PRs, with `pull_request.merged_at`), so a guest costs exactly two calls however big
 * its repository is. Each is projected inside gh to the fields below, so bodies, labels and branch
 * names never reach the collector.
 */

const OPEN_PROJECTION =
  '{number, title, created_at, updated_at, is_pull_request: has("pull_request")}';
const CLOSED_PROJECTION =
  '{number, title, state_reason, closed_at, merged_at: .pull_request.merged_at, is_pull_request: has("pull_request")}';

const rawOpenSchema = z.strictObject({
  number: z.number().int().positive(),
  title: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  is_pull_request: z.boolean(),
});

const rawClosedSchema = z.strictObject({
  number: z.number().int().positive(),
  title: z.string(),
  // A string so a reason GitHub adds later does not stop the guest; only `completed` counts.
  state_reason: z.string().nullable(),
  closed_at: z.iso.datetime().nullable(),
  // null for an Issue and for a PR closed without merging.
  merged_at: z.iso.datetime().nullable(),
  is_pull_request: z.boolean(),
});

export type RawGuestOpen = z.infer<typeof rawOpenSchema>;
export type RawGuestClosed = z.infer<typeof rawClosedSchema>;

/** How far back the finished Issues and PRs go, as for the company (docs/DESIGN.md 4.1). */
export const GUEST_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The most recently updated first; one page of at most this many items per list. */
const GUEST_PAGE_SIZE = 100;
const LIST = `sort=updated&direction=desc&per_page=${String(GUEST_PAGE_SIZE)}`;

/** The start of the window, for the closed list's `since` (it filters by update time). */
function guestWindowStart(now: Date): Date {
  return new Date(now.getTime() - GUEST_RECENT_WINDOW_MS);
}

/** The items read last win (a single page should not repeat one, but GitHub is not trusted). */
function lastByNumber<T extends { readonly number: number }>(items: readonly T[]): T[] {
  return [...new Map(items.map((item) => [item.number, item])).values()];
}

/** The open items, the most recently updated first, at most one page. */
function openItems(raw: readonly RawGuestOpen[]): GuestOpenItem[] {
  return lastByNumber(raw)
    .map((item) => ({
      number: item.number,
      title: item.title,
      isPr: item.is_pull_request,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }))
    .toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.number - a.number)
    .slice(0, GUEST_PAGE_SIZE);
}

/** A completed Issue or a merged PR, with when; null for anything else. */
function finished(item: RawGuestClosed): GuestRecentItem | null {
  const base = { number: item.number, title: item.title };
  if (item.is_pull_request) {
    return item.merged_at === null ? null : { kind: 'pr-merged', ...base, at: item.merged_at };
  }
  if (item.state_reason !== 'completed' || item.closed_at === null) return null;
  return { kind: 'issue-completed', ...base, at: item.closed_at };
}

/**
 * Completed Issues and merged PRs finished at or after the window start, newest first (then the
 * higher number), at most GUEST_RECENT_LIMIT.
 */
function recentItems(raw: readonly RawGuestClosed[], now: Date): GuestRecentItem[] {
  const from = guestWindowStart(now).getTime();
  return lastByNumber(raw)
    .map(finished)
    .filter((item): item is GuestRecentItem => item !== null && Date.parse(item.at) >= from)
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.number - a.number)
    .slice(0, GUEST_RECENT_LIMIT);
}

/** The guest part of the snapshot from the two lists, validated. Pure. */
export function buildGuestPart(
  repo: string,
  now: Date,
  open: readonly RawGuestOpen[],
  closed: readonly RawGuestClosed[],
): GuestGithubPart {
  return parseOrThrow(guestGithubPartSchema, {
    repo,
    fetchedAt: now.toISOString(),
    open: openItems(open),
    recent: recentItems(closed, now),
  });
}

/**
 * Reads a guest's repository: the 100 open Issues and PRs updated last, then the 100 closed ones
 * updated last within the window (enough for the 20 recent items in all but the busiest weeks).
 * Throws a CollectorError (gh-failed or validation-failed) like the company fetch.
 */
export async function fetchGuestGithub(
  gh: GhRunner,
  repo: string,
  now: Date,
): Promise<GuestGithubPart> {
  const open = parseOrThrow(
    z.array(rawOpenSchema),
    await ghApiProjectedPage(gh, `repos/${repo}/issues?state=open&${LIST}`, OPEN_PROJECTION),
  );
  const since = guestWindowStart(now).toISOString();
  const closed = parseOrThrow(
    z.array(rawClosedSchema),
    await ghApiProjectedPage(
      gh,
      `repos/${repo}/issues?state=closed&since=${since}&${LIST}`,
      CLOSED_PROJECTION,
    ),
  );
  return buildGuestPart(repo, now, open, closed);
}
