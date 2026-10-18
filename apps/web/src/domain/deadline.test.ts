import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  daysToDeadline,
  daysToDoDay,
  isNearQuest,
  isTodayQuest,
  NEAR_DEADLINE_DAYS,
} from './deadline';

/** Local time, so the tests hold in any time zone. */
const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).getTime();

const OCT_17 = at(2026, 10, 17);

describe('daysToDeadline: reading 〆M/D (Issue #174)', () => {
  it.each([
    ['〆10/24 資料を作る', 7],
    ['〆 10/24 資料を作る', 7],
    ['〆　10/24 資料を作る', 7],
    ['〆１０／２４ 資料を作る', 7],
    ['〆10／24 資料を作る', 7],
    ['資料を作る 〆10/24', 7],
    ['資料を作る（〆10/18）', 1],
    ['〆10/17 今日まで', 0],
    ['〆10/16 きのうまで', -1],
  ])('reads %s', (title, days) => {
    expect(daysToDeadline(title, OCT_17)).toBe(days);
  });

  it('reads the first 〆M/D only', () => {
    expect(daysToDeadline('〆10/20 下書き、〆12/1 清書', OCT_17)).toBe(3);
    expect(daysToDeadline('〆切は 〆10/20', OCT_17)).toBe(3);
  });

  it.each([
    ['資料を作る', 'no 〆'],
    ['〆切を決める', 'no date'],
    ['10/24 資料を作る', 'a date without 〆'],
    ['〆2/30 資料', 'a day the month does not have'],
    ['〆13/1 資料', 'month 13'],
    ['〆0/10 資料', 'month 0'],
    ['〆10/0 資料', 'day 0'],
    ['〆10/32 資料', 'day 32'],
    ['〆10/245 資料', 'three digits'],
    ['〆10-24 資料', 'another separator'],
    ['〆10/ 24 資料', 'a space after the slash'],
    ['', 'an empty title'],
  ])('has no deadline: %s (%s)', (title) => {
    expect(daysToDeadline(title, OCT_17)).toBeNull();
  });

  it('does not go on to a later 〆M/D when the first is not a date', () => {
    expect(daysToDeadline('〆2/30 と 〆10/20', OCT_17)).toBeNull();
  });
});

describe('daysToDeadline: the year is the one nearest to the day of the fetch', () => {
  it('puts 〆1/5 seen in December into next year', () => {
    expect(daysToDeadline('〆1/5', at(2026, 12, 20))).toBe(16);
  });

  it('puts 〆9/30 seen in October into this year: already past', () => {
    expect(daysToDeadline('〆9/30', OCT_17)).toBe(-17);
  });

  it('puts 〆12/28 seen in January into last year: past', () => {
    expect(daysToDeadline('〆12/28', at(2027, 1, 3))).toBe(-6);
  });

  it('keeps a date half a year ahead in the coming year when it is nearer than the past one', () => {
    // 2027-04-10 is 175 days ahead; 2026-04-10 was 190 days ago.
    expect(daysToDeadline('〆4/10', OCT_17)).toBe(175);
    // 2026-04-20 was 180 days ago; 2027-04-20 is 185 days ahead.
    expect(daysToDeadline('〆4/20', OCT_17)).toBe(-180);
  });

  it('breaks a tie between two years towards the coming one', () => {
    // From 2027-07-02, 2027-01-01 is 182 days ago and 2028-01-01 is 183 days ahead: no tie.
    expect(daysToDeadline('〆1/1', at(2027, 7, 2))).toBe(-182);
    // From 2027-07-02 (365-day year to 2028-07-01), 〆12/31: 2026-12-31 was 183 days ago and
    // 2027-12-31 is 182 days ahead.
    expect(daysToDeadline('〆12/31', at(2027, 7, 2))).toBe(182);
    // 2028 is a leap year: from 2028-07-02, 2028-01-01 was 183 days ago, 2029-01-01 is 183 ahead.
    expect(daysToDeadline('〆1/1', at(2028, 7, 2))).toBe(183);
  });

  it('reads 2/29 as the nearest leap year’s, never as no deadline', () => {
    expect(daysToDeadline('〆2/29', at(2028, 2, 20))).toBe(9);
    expect(daysToDeadline('〆2/29', at(2027, 12, 1))).toBe(90);
    expect(daysToDeadline('〆2/29', at(2028, 3, 5))).toBe(-5);
    // From 2026-10-17: 2028-02-29 is 500 days ahead, 2024-02-29 was 961 days ago.
    expect(daysToDeadline('〆2/29', OCT_17)).toBe(500);
    expect(isNearQuest('〆2/29', OCT_17)).toBe(false);
  });

  it('has no deadline for a day no year has', () => {
    expect(daysToDeadline('〆4/31', OCT_17)).toBeNull();
    expect(daysToDeadline('〆2/30', at(2028, 2, 20))).toBeNull();
  });

  it('counts calendar days, whatever the hour of the fetch', () => {
    expect(daysToDeadline('〆10/18', at(2026, 10, 17, 0))).toBe(1);
    expect(daysToDeadline('〆10/18', at(2026, 10, 17, 23))).toBe(1);
  });

  it('is not shifted by a daylight saving change in between', () => {
    expect(daysToDeadline('〆4/5', at(2027, 3, 1))).toBe(35);
    expect(daysToDeadline('〆11/10', at(2026, 10, 20))).toBe(21);
  });
});

describe('isNearQuest', () => {
  it(`keeps deadlines up to ${String(NEAR_DEADLINE_DAYS)} days ahead, today and past ones`, () => {
    expect(isNearQuest('〆10/24', OCT_17)).toBe(true);
    expect(isNearQuest('〆10/17', OCT_17)).toBe(true);
    expect(isNearQuest('〆9/30', OCT_17)).toBe(true);
  });

  it('drops a deadline 8 days ahead or later', () => {
    expect(isNearQuest('〆10/25', OCT_17)).toBe(false);
    expect(isNearQuest('〆12/1', OCT_17)).toBe(false);
  });

  it('keeps quests with no deadline, or one that is not a date', () => {
    expect(isNearQuest('資料を作る', OCT_17)).toBe(true);
    expect(isNearQuest('〆2/30 資料', OCT_17)).toBe(true);
  });
});

describe('daysToDeadline in a given time zone (Node reads TZ when it changes)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('takes the local day of the fetch, not its UTC day', () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');
    // 2026-10-17 01:00 in Tokyo, still the 16th in UTC.
    expect(daysToDeadline('〆10/24', Date.parse('2026-10-16T16:00:00Z'))).toBe(7);
  });

  it('counts whole days across a daylight saving change', () => {
    vi.stubEnv('TZ', 'America/New_York');
    // Clocks go back on 2026-11-01 and forward on 2027-03-14.
    expect(daysToDeadline('〆11/2', Date.parse('2026-10-31T23:30:00-04:00'))).toBe(2);
    expect(daysToDeadline('〆3/15', Date.parse('2027-03-13T23:30:00-05:00'))).toBe(2);
  });
});

describe('daysToDoDay: reading @M/D (Issue #176)', () => {
  it.each([
    ['@10/24 資料を作る', 7],
    ['@ 10/24 資料を作る', 7],
    ['＠１０／２４ 資料を作る', 7],
    ['＠10/24 資料を作る', 7],
    ['資料を作る @10/20', 3],
    ['@10/17 今日から', 0],
    ['@9/30 もう来た', -17],
  ])('reads %s', (title, days) => {
    expect(daysToDoDay(title, OCT_17)).toBe(days);
  });

  it('chooses the year as 〆 does', () => {
    expect(daysToDoDay('@1/5', at(2026, 12, 20))).toBe(16);
    expect(daysToDoDay('@2/29', OCT_17)).toBe(500);
  });

  it.each([
    ['taro@example.com に送る', 'an e-mail address'],
    ['@yukihiro に聞く', '@username'],
    ['@ 資料', 'nothing after @'],
    ['@10-24 資料', 'another separator'],
    ['@2/30 資料', 'a day no year has'],
    ['@10/245 資料', 'three digits'],
    ['〆10/24 資料', 'a deadline only'],
  ])('has no day to do it: %s (%s)', (title) => {
    expect(daysToDoDay(title, OCT_17)).toBeNull();
  });

  it('reads the first @M/D, past an e-mail address or @username', () => {
    expect(daysToDoDay('taro@example.com に @10/20 送る', OCT_17)).toBe(3);
    expect(daysToDoDay('@yukihiro と @10/20、@11/1', OCT_17)).toBe(3);
  });

  it('keeps the two marks apart', () => {
    expect(daysToDeadline('@10/20 〆10/30', OCT_17)).toBe(13);
    expect(daysToDoDay('〆10/30 @10/20', OCT_17)).toBe(3);
  });
});

describe('isNearQuest with a day to do it (Issue #176)', () => {
  it('hides a quest until its day, then keeps it however long it has passed', () => {
    expect(isNearQuest('@10/18 資料', OCT_17)).toBe(false);
    expect(isNearQuest('@10/18 資料', at(2026, 10, 18, 0))).toBe(true);
    expect(isNearQuest('@10/17 資料', OCT_17)).toBe(true);
    expect(isNearQuest('@9/1 資料', OCT_17)).toBe(true);
  });

  it('reads a day passed by half a year as next year’s: hidden again (a known limit)', () => {
    // From 2027-04-20, 2027-10-17 (180 days ahead) is nearer than 2026-10-17 (185 days ago).
    expect(daysToDoDay('@10/17 資料', at(2027, 4, 20))).toBe(180);
    expect(isNearQuest('@10/17 資料', at(2027, 4, 20))).toBe(false);
  });

  it('does not let a day to do it within a week show it early', () => {
    expect(isNearQuest('@10/20 資料', OCT_17)).toBe(false);
  });

  it('shows a quest with both marks when either one allows it', () => {
    // Deadline near, day to do it ahead.
    expect(isNearQuest('@10/20 〆10/22 資料', OCT_17)).toBe(true);
    // Deadline far, day to do it come.
    expect(isNearQuest('@10/15 〆11/30 資料', OCT_17)).toBe(true);
    // Both ahead.
    expect(isNearQuest('@10/20 〆10/30 資料', OCT_17)).toBe(false);
  });

  it('treats a mark that is not a date as none', () => {
    expect(isNearQuest('@2/30 資料', OCT_17)).toBe(true);
    expect(isNearQuest('@2/30 〆11/30 資料', OCT_17)).toBe(false);
    expect(isNearQuest('〆2/30 @10/20 資料', OCT_17)).toBe(false);
    expect(isNearQuest('taro@example.com に送る', OCT_17)).toBe(true);
  });
});

describe('isTodayQuest (Issue #178)', () => {
  it('keeps a deadline today or past and drops one from tomorrow on', () => {
    expect(isTodayQuest('〆10/17 資料', OCT_17)).toBe(true);
    expect(isTodayQuest('〆10/16 資料', OCT_17)).toBe(true);
    expect(isTodayQuest('〆9/1 資料', OCT_17)).toBe(true);
    expect(isTodayQuest('〆10/18 資料', OCT_17)).toBe(false);
    expect(isTodayQuest('〆10/24 資料', OCT_17)).toBe(false);
  });

  it('keeps a day to do it today or past and drops one from tomorrow on', () => {
    expect(isTodayQuest('@10/17 資料', OCT_17)).toBe(true);
    expect(isTodayQuest('@10/16 資料', OCT_17)).toBe(true);
    expect(isTodayQuest('@10/18 資料', OCT_17)).toBe(false);
  });

  it('turns at local midnight', () => {
    expect(isTodayQuest('〆10/18 資料', at(2026, 10, 17, 23))).toBe(false);
    expect(isTodayQuest('〆10/18 資料', at(2026, 10, 18, 0))).toBe(true);
  });

  it('drops a quest with no mark, or one that is not a date', () => {
    expect(isTodayQuest('資料を作る', OCT_17)).toBe(false);
    expect(isTodayQuest('〆2/30 資料', OCT_17)).toBe(false);
    expect(isTodayQuest('taro@example.com に送る', OCT_17)).toBe(false);
  });

  it('keeps a quest with both marks when either one is today or past', () => {
    expect(isTodayQuest('@10/17 〆10/24 資料', OCT_17)).toBe(true);
    expect(isTodayQuest('@10/20 〆10/16 資料', OCT_17)).toBe(true);
    expect(isTodayQuest('@10/10 〆10/12 資料', OCT_17)).toBe(true);
    expect(isTodayQuest('@10/18 〆10/20 資料', OCT_17)).toBe(false);
  });

  it('drops a deadline within the week that the near filter keeps', () => {
    expect(isNearQuest('〆10/20 資料', OCT_17)).toBe(true);
    expect(isTodayQuest('〆10/20 資料', OCT_17)).toBe(false);
  });
});
