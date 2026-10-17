/**
 * Deadlines written in an Issue's title as 「〆M/D」 (Issue #174), e.g. 「〆10/24 資料を作る」. Pure:
 * the time to judge from (the snapshot's fetch) is passed in. Dates are local calendar days.
 */

/** How many days ahead a deadline still counts as near; past deadlines are always near. */
export const NEAR_DEADLINE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Years tried on each side of the fetch's: enough to reach a leap year for 〆2/29. */
const YEARS_AROUND = 4;

/**
 * The first 〆M/D of a title: spaces after 〆 allowed, full-width digits and slash too. A third
 * digit right after the day (〆10/245) is not a date.
 */
const DEADLINE = /〆\s*([0-9０-９]{1,2})[/／]([0-9０-９]{1,2})(?![0-9０-９])/u;

/** Full-width digits to ASCII ones. */
function toAsciiDigits(text: string): string {
  return text.replace(/[０-９]/gu, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - '０'.charCodeAt(0) + '0'.charCodeAt(0)),
  );
}

/** Day number (days since the epoch) of a calendar date; null when it does not exist (2/30). */
function dayOf(year: number, month: number, day: number): number | null {
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  const exists = date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return exists ? ms / DAY_MS : null;
}

/** The local calendar day of `nowMs` as a day number. */
function localDayOf(nowMs: number): { readonly year: number; readonly day: number } {
  const now = new Date(nowMs);
  const year = now.getFullYear();
  // Always exists: it is today's date.
  const day = dayOf(year, now.getMonth() + 1, now.getDate()) ?? 0;
  return { year, day };
}

/**
 * Days from the day of `nowMs` to the title's deadline (negative: past); null when the title has
 * no 〆M/D or it is not a date. The year is not written, so it is the one that puts the date
 * nearest to today (last year, this year or next year for any day but 2/29). In December 〆1/5 is
 * next January; in October 〆9/30 is this September (already past). 〆2/29 is the nearest leap
 * year's. A date no year has (2/30, 4/31) is no deadline. A tie (exactly between two years) goes
 * to the later, the coming one.
 */
export function daysToDeadline(title: string, nowMs: number): number | null {
  const match = DEADLINE.exec(title);
  if (match === null) return null;
  const month = Number(toAsciiDigits(match[1] ?? ''));
  const day = Number(toAsciiDigits(match[2] ?? ''));
  const today = localDayOf(nowMs);
  let nearest: number | null = null;
  // From the latest year down: on a tie the coming date, met first, stays.
  for (let offset = YEARS_AROUND; offset >= -YEARS_AROUND; offset -= 1) {
    const date = dayOf(today.year + offset, month, day);
    if (date === null) continue;
    const diff = date - today.day;
    if (nearest === null || Math.abs(diff) < Math.abs(nearest)) nearest = diff;
  }
  return nearest;
}

/**
 * Whether the board shows the quest while it lists the near ones only: a deadline within
 * NEAR_DEADLINE_DAYS days (today and past ones included) or no deadline at all.
 */
export function isNearOrNoDeadline(title: string, nowMs: number): boolean {
  const days = daysToDeadline(title, nowMs);
  return days === null || days <= NEAR_DEADLINE_DAYS;
}
