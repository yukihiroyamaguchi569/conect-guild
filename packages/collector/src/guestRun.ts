import type { GuestGithubPart } from '@conect-guild/snapshot';
import { errorKind } from './errors.ts';
import { fetchGuestGithub } from './guestGithub.ts';
import { prefix } from './report.ts';
import type { RunDeps } from './runTypes.ts';

/**
 * Issue #108: fetching the guests' repositories, apart from the company fetch. A guest is named
 * only by its position in the settings: logs never carry its name, repository or titles.
 */

type GuestDeps = Pick<RunDeps, 'now' | 'log' | 'error' | 'gh' | 'guestRepos' | 'signal'>;

export type GuestResult =
  | { readonly ok: true; readonly part: GuestGithubPart }
  | { readonly ok: false; readonly kind: ReturnType<typeof errorKind> };

/** When the guests are fetched: every `intervalMs`, guest i first `offsetMs × (i + 1)` in. */
export interface GuestSchedule {
  readonly intervalMs: number;
  readonly offsetMs: number;
}

/** Where guest `index` stands: the loop's start and its last attempt (epoch ms). */
export interface GuestTiming {
  readonly index: number;
  readonly startedAt: number;
  readonly lastAttemptAt: number | null;
}

/** True when the guest should start a fetch at `now` (epoch ms). Pure. */
export function isGuestFetchDue(
  timing: GuestTiming,
  now: number,
  schedule: GuestSchedule,
): boolean {
  if (timing.lastAttemptAt === null) {
    return now >= timing.startedAt + schedule.offsetMs * (timing.index + 1);
  }
  return now - timing.lastAttemptAt >= schedule.intervalMs;
}

async function fetchGuest(deps: GuestDeps, repo: string, now: Date): Promise<GuestResult> {
  try {
    return { ok: true, part: await fetchGuestGithub(deps.gh, repo, now) };
  } catch (error) {
    return { ok: false, kind: errorKind(error) };
  }
}

/** Counts and the error kind only, by position. */
export function reportGuest(deps: GuestDeps, index: number, result: GuestResult): void {
  const who = `guests[${String(index)}] github`;
  if (result.ok) {
    const { open, recent } = result.part;
    deps.log(
      `${prefix(deps)} ${who} ok: open=${String(open.length)} recent=${String(recent.length)}`,
    );
  } else {
    deps.error(`${prefix(deps)} ${who} failed: ${result.kind}`);
  }
}

/** e.g. `guests: 2 ok` or `guests: 1 ok, 1 failed`; null when no guest has a repository. */
export function guestsSummary(results: readonly (GuestResult | null)[]): string | null {
  const tried = results.filter((result) => result !== null);
  if (tried.length === 0) return null;
  const ok = tried.filter((result) => result.ok).length;
  const failed = tried.length - ok;
  const failures = failed > 0 ? `, ${String(failed)} failed` : '';
  return `guests: ${String(ok)} ok${failures}`;
}

/** `--once`: every guest with a repository, side by side; null for a guest without one. */
export function fetchGuestsOnce(deps: GuestDeps, now: Date): Promise<(GuestResult | null)[]> {
  return Promise.all(
    deps.guestRepos.map((repo) =>
      repo === null ? Promise.resolve(null) : fetchGuest(deps, repo, now),
    ),
  );
}

interface GuestSlot {
  readonly repo: string | null;
  /** The last good part; a failed fetch keeps it. */
  part: GuestGithubPart | null;
  attemptAt: number | null;
  inFlight: Promise<void> | null;
}

/** What the loop keeps of the guests between ticks. */
export interface GuestLoop {
  readonly startedAt: number;
  readonly slots: readonly GuestSlot[];
}

export function createGuestLoop(repos: readonly (string | null)[], startedAt: number): GuestLoop {
  return {
    startedAt,
    slots: repos.map((repo) => ({ repo, part: null, attemptAt: null, inFlight: null })),
  };
}

/**
 * Starts the fetch of every guest that is due, in the background: the loop never waits for it,
 * and a guest's failure touches only its own slot (the last good part stays).
 */
export function startDueGuestFetches(
  deps: GuestDeps,
  loop: GuestLoop,
  now: Date,
  schedule: GuestSchedule,
): void {
  loop.slots.forEach((slot, index) => {
    const { repo } = slot;
    if (repo === null || slot.inFlight !== null) return;
    const timing = { index, startedAt: loop.startedAt, lastAttemptAt: slot.attemptAt };
    if (!isGuestFetchDue(timing, now.getTime(), schedule)) return;
    slot.attemptAt = now.getTime();
    slot.inFlight = fetchGuest(deps, repo, now).then((result) => {
      slot.inFlight = null;
      if (deps.signal.aborted) return;
      reportGuest(deps, index, result);
      if (result.ok) slot.part = result.part;
    });
  });
}

/** The parts to write, in the settings' order (null: no repository or nothing fetched yet). */
export function guestParts(loop: GuestLoop): (GuestGithubPart | null)[] {
  return loop.slots.map((slot) => slot.part);
}

/** Waits for the fetches still running, so no gh process outlives the loop. */
export async function settleGuestFetches(loop: GuestLoop): Promise<void> {
  await Promise.all(loop.slots.map((slot) => slot.inFlight ?? Promise.resolve()));
}
