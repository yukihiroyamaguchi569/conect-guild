import { describe, expect, it } from 'vitest';
import { isMonthEventTime } from './monthEvent';
import { isToastTime } from './toast';

const DAY = { day: '2026-10-16' };

describe('isMonthEventTime', () => {
  it('is from 15 o’clock until 18, any day', () => {
    expect(isMonthEventTime({ ...DAY, hour: 14.99 }, null)).toBe(false);
    expect(isMonthEventTime({ ...DAY, hour: 15 }, null)).toBe(true);
    expect(isMonthEventTime({ ...DAY, hour: 17.99 }, null)).toBe(true);
    expect(isMonthEventTime({ ...DAY, hour: 18 }, null)).toBe(false);
  });

  it('is once a day', () => {
    expect(isMonthEventTime({ ...DAY, hour: 16 }, '2026-10-16')).toBe(false);
    expect(isMonthEventTime({ ...DAY, hour: 16 }, '2026-10-15')).toBe(true);
  });

  it('never meets the Friday toast', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const both =
        isMonthEventTime({ ...DAY, hour }, null) && isToastTime({ ...DAY, weekday: 5, hour }, null);
      expect(both).toBe(false);
    }
  });
});
