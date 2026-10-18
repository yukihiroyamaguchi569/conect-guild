import { describe, expect, it } from 'vitest';
import { isToastTime, toastDaySchema } from './toast';

const FRIDAY = { weekday: 5, day: '2026-10-16' };

describe('isToastTime', () => {
  it('is a Friday from 18 o’clock to midnight', () => {
    expect(isToastTime({ ...FRIDAY, hour: 17.99 }, null)).toBe(false);
    expect(isToastTime({ ...FRIDAY, hour: 18 }, null)).toBe(true);
    expect(isToastTime({ ...FRIDAY, hour: 23.99 }, null)).toBe(true);
  });

  it('is never another day of the week', () => {
    for (const weekday of [0, 1, 2, 3, 4, 6]) {
      expect(isToastTime({ weekday, hour: 19, day: '2026-10-17' }, null)).toBe(false);
    }
  });

  it('is once a Friday: not again the day it was raised, again the next Friday', () => {
    expect(isToastTime({ ...FRIDAY, hour: 19 }, '2026-10-16')).toBe(false);
    expect(isToastTime({ ...FRIDAY, hour: 19 }, '2026-10-09')).toBe(true);
  });
});

describe('toastDaySchema', () => {
  it('takes a date only', () => {
    expect(toastDaySchema.safeParse('2026-10-16').success).toBe(true);
    for (const bad of ['2026-10-16T18:00', 'friday', '', 20_261_016, null]) {
      expect(toastDaySchema.safeParse(bad).success).toBe(false);
    }
  });
});
