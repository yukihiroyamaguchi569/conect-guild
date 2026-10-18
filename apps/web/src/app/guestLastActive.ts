import { z } from 'zod';
import { MAX_GUESTS } from '@conect-guild/snapshot/settings';
import { createKeyValueStore, type KeyValueStore } from '../adapters/storage';
import type { GuestState } from '../domain/guests';
import type { GuestIdleSince } from '../render/guests';
import { IDLE } from '../render/metrics';

/**
 * When each guest last had something to do (Issue #183), as for the members (lastActive.ts):
 * working or waiting for a permission. Kept in localStorage as one epoch ms (or null) per guest
 * index only (no name, no folder), so a reload does not wake the guests up.
 */

/** localStorage key of the guests' last-active times. */
export const GUEST_LAST_ACTIVE_STORAGE_KEY = 'conect-guild:guest-last-active';

const guestLastActiveSchema = z.array(z.number().int().nonnegative().nullable()).max(MAX_GUESTS);
/** By guest index; null (or absent) when not known yet. */
export type GuestLastActive = z.infer<typeof guestLastActiveSchema>;

export interface GuestStateRow {
  readonly index: number;
  readonly state: GuestState;
}

/** Nothing to do: the session rests or is idle (or cannot be read: domain/guests.ts). */
function isRestful(state: GuestState): boolean {
  return state === 'resting' || state === 'idle';
}

/**
 * Guests with work are active now; a guest seen idle for the first time starts counting now.
 * A time in the future (the clock moved back) counts as now.
 */
export function observeGuests(
  last: GuestLastActive,
  rows: readonly GuestStateRow[],
  now: number,
): GuestLastActive {
  const next = [...last];
  for (const { index, state } of rows) {
    if (index < 0 || index >= MAX_GUESTS) continue;
    while (next.length < index) next.push(null);
    const seen = last[index] ?? null;
    next[index] = !isRestful(state) || seen === null || seen > now ? now : seen;
  }
  return next;
}

/** Since when each guest with nothing to do has had nothing to do; null for the others. */
export function guestIdleSinceOf(
  last: GuestLastActive,
  rows: readonly GuestStateRow[],
): GuestIdleSince {
  const since: (number | null)[] = [];
  for (const { index, state } of rows) {
    since[index] = isRestful(state) ? (last[index] ?? null) : null;
  }
  return Array.from(since, (at) => at ?? null);
}

/** True when a write is due: a guest was added, or a time moved on by IDLE.persistStepMs. */
export function guestNeedsWrite(stored: GuestLastActive, next: GuestLastActive): boolean {
  return next.some((after, index) => {
    if (after === null) return false;
    const before = stored[index] ?? null;
    return before === null || Math.abs(after - before) >= IDLE.persistStepMs;
  });
}

export interface GuestLastActiveTracker {
  /** Takes the guests' states at `now` and returns who has been idle since when. */
  observe(rows: readonly GuestStateRow[], now: number): GuestIdleSince;
}

export function createGuestLastActiveTracker(
  storage: KeyValueStore = createKeyValueStore(),
): GuestLastActiveTracker {
  const read = storage.read(GUEST_LAST_ACTIVE_STORAGE_KEY, guestLastActiveSchema);
  let stored: GuestLastActive = read.ok ? read.value : [];
  let last = stored;
  return {
    observe(rows, now) {
      last = observeGuests(last, rows, now);
      const due = guestNeedsWrite(stored, last);
      if (due && storage.write(GUEST_LAST_ACTIVE_STORAGE_KEY, last).ok) stored = last;
      return guestIdleSinceOf(last, rows);
    },
  };
}
