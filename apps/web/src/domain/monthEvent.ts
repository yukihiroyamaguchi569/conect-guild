/**
 * The month's gathering (Issue #214, a thing for fun): once a day, in the afternoon (local time),
 * those with nothing to do gather in front of the month's ornament (Issue #192) and one says a word
 * of the season. It ends before the Friday toast (domain/toast.ts) may start, so the two never meet.
 * Pure: the local time and the day it was last held are passed in.
 */

/** From 15 o'clock until 18, the toast's hour on a Friday. */
export const MONTH_EVENT_TIME = { fromHour: 15, toHour: 18 } as const;

/** True when it is time: from 15 to 18 o'clock (`hour`, 0 to 24), not held yet on `day` (dayKey). */
export function isMonthEventTime(
  local: { readonly hour: number; readonly day: string },
  lastDay: string | null,
): boolean {
  return (
    local.hour >= MONTH_EVENT_TIME.fromHour &&
    local.hour < MONTH_EVENT_TIME.toHour &&
    lastDay !== local.day
  );
}
