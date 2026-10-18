import { z } from 'zod';

/**
 * The Friday evening toast (Issue #193, a thing for fun): from 18 o'clock local time on a Friday,
 * once that day, those with nothing to do gather in front of the counter and raise a tankard.
 * Pure: the local time and the day it was last raised are passed in.
 */

export const TOAST_TIME = { weekday: 5, fromHour: 18 } as const;
/** Fewer than this many free hands: no toast. */
export const MIN_TOASTERS = 2;

/** The day of the last toast as kept in localStorage: the local date only (dayKey). */
export const toastDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * True when it is time to toast: a Friday (`weekday` as Date.getDay) from 18 o'clock, and not
 * toasted yet on `day` (the local date, dayKey).
 */
export function isToastTime(
  local: { readonly weekday: number; readonly hour: number; readonly day: string },
  lastDay: string | null,
): boolean {
  return (
    local.weekday === TOAST_TIME.weekday &&
    local.hour >= TOAST_TIME.fromHour &&
    lastDay !== local.day
  );
}
