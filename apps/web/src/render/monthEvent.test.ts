import { PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import { describe, expect, it } from 'vitest';
import { createKeyValueStore, createMemoryStorage } from '../adapters/storage';
import { toastDaySchema } from '../domain/toast';
import { ACTIVE_MEMBER_IDS } from '../guild.config';
import type { AmbientMoods } from './ambient';
import { EMPTY_DIRECTOR, isAnimating, sendHome, type Director } from './director';
import { SELECTED_LAYOUT } from './layouts';
import { contains, isWalkable } from './map';
import { walkSegment } from './motion';
import {
  createGatheringsStage,
  MONTH_EVENT,
  MONTH_EVENT_DAY_KEY,
  MONTH_SPOTS,
  planMonthEvent,
  seasonLine,
} from './monthEvent';
import { levelTags } from './levelTags';
import { LOGICAL_WIDTH } from './map';
import { meet, overheadLift, overheadSide, tagBox, WINDOWS, wordsBox } from './overhead';
import { tileToPoint } from './path';
import { showMs } from './lines';
import { DEFAULT_SEATS } from './scenes';
import { TOAST_DAY_KEY } from './toastStage';

/** The month's gathering at the ornament (Issue #214). */

const FREE: AmbientMoods = { minori: 'idle', hibiki: 'idle', hirame: 'desk-work' };
const QUIET = { t: 0, moods: FREE, idle: {}, calling: false, halted: false, visiting: false };
/** Wednesday 14 and Friday 16 October 2026, local time. */
const wednesday = (hour: number, minute = 0) => new Date(2026, 9, 14, hour, minute).getTime();
const friday = (hour: number) => new Date(2026, 9, 16, hour).getTime();

function stageAt(wall: number) {
  const memory = createMemoryStorage();
  const store = createKeyValueStore(() => memory);
  return { store, stage: createGatheringsStage(store, () => wall) };
}

const actors = (director: Director) => director.tracks.map((track) => track.actor);

describe('seasonLine', () => {
  it('has a word of the season for every month, January first', () => {
    expect(seasonLine(1)).toBe('あけまして！');
    expect(seasonLine(2)).toBe('おにはそと！');
    expect(seasonLine(10)).toBe('トリックオア…');
    expect(seasonLine(12)).toBe('メリクリ！');
    const all = Array.from({ length: 12 }, (_, i) => seasonLine(i + 1));
    expect(new Set(all).size).toBe(12);
  });
});

describe('MONTH_SPOTS', () => {
  const spot = SELECTED_LAYOUT.ornamentSpot;

  it('are walkable tiles right in front of the ornament, enough for everyone', () => {
    const everyone = ACTIVE_MEMBER_IDS.filter((id) => id !== PRESIDENT_ID);
    expect(MONTH_SPOTS.length).toBeGreaterThanOrEqual(everyone.length);
    for (const at of MONTH_SPOTS) {
      expect(isWalkable(at)).toBe(true);
      expect(contains(spot, at)).toBe(false);
      expect(at.row).toBeGreaterThanOrEqual(spot.row + spot.h);
      expect(at.row - (spot.row + spot.h)).toBeLessThan(4);
      expect(at.col).toBeGreaterThanOrEqual(spot.col - 3);
      expect(at.col).toBeLessThan(spot.col + spot.w + 3);
    }
  });
});

describe('the month’s word over the head', () => {
  const levels = Object.fromEntries(ACTIVE_MEMBER_IDS.map((id) => [id, 12]));
  const tags = levelTags(levels, DEFAULT_SEATS);
  const words = Array.from({ length: 12 }, (_, i) => seasonLine(i + 1));

  it.each(MONTH_SPOTS)('stays on the canvas, off the windows and the tags at %o', (spot) => {
    for (const line of words) {
      const pose = { point: tileToPoint(spot), held: null };
      const lift = overheadLift(pose, line, tags);
      const box = wordsBox(pose.point, Array.from(line).length, lift, overheadSide(pose, line));
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(LOGICAL_WIDTH);
      expect(WINDOWS.some((area) => meet(box, area))).toBe(false);
      expect(tags.map(tagBox).some((tag) => meet(box, tag))).toBe(false);
    }
  });
});

describe('planMonthEvent', () => {
  const everyone = ACTIVE_MEMBER_IDS.filter((id) => id !== PRESIDENT_ID);

  it('brings everyone free to the ornament, and the first says the month’s word once all are there', () => {
    const plan = planMonthEvent(everyone, 1_000, DEFAULT_SEATS, 10);
    if (plan === null) throw new Error('no gathering');
    expect(plan.tracks.map((track) => track.actor)).toEqual(everyone);
    const arrivals = plan.tracks.map((track) => track.segments[0]?.end ?? 0);
    const all = Math.max(...arrivals);
    expect(plan.lines).toEqual([
      { actor: everyone[0], line: 'トリックオア…', start: all, end: all + showMs('season') },
    ]);
    for (const track of plan.tracks) {
      const stay = track.segments.find((segment) => segment.start === all);
      expect(stay?.end).toBe(all + MONTH_EVENT.stayMs);
      expect(stay?.held ?? null).toBeNull();
      // Back at the seat in the end.
      expect(track.segments.at(-1)?.path.at(-1)).toEqual(DEFAULT_SEATS[track.actor]);
    }
  });

  it('is nothing with fewer than two', () => {
    expect(planMonthEvent(['minori'], 0, DEFAULT_SEATS, 1)).toBeNull();
    expect(planMonthEvent([], 0, DEFAULT_SEATS, 1)).toBeNull();
  });
});

describe('createGatheringsStage', () => {
  it('holds the month’s gathering once a day from 15 o’clock, keeping the date', () => {
    const { stage, store } = stageAt(wednesday(15, 30));
    const director = stage.start(EMPTY_DIRECTOR, QUIET);
    expect(actors(director)).toEqual(['minori', 'hibiki']);
    expect(director.lines.map((said) => said.line)).toEqual([seasonLine(10)]);
    expect(store.read(MONTH_EVENT_DAY_KEY, toastDaySchema)).toEqual({
      ok: true,
      value: '2026-10-14',
    });
    expect(stage.start(EMPTY_DIRECTOR, { ...QUIET, t: 200_000 })).toBe(EMPTY_DIRECTOR);
  });

  it('holds nothing before 15 o’clock, nor after a reload the same day', () => {
    expect(stageAt(wednesday(14, 59)).stage.start(EMPTY_DIRECTOR, QUIET)).toBe(EMPTY_DIRECTOR);
    const { store } = stageAt(wednesday(16));
    store.write(MONTH_EVENT_DAY_KEY, '2026-10-14');
    const reloaded = createGatheringsStage(store, () => wednesday(16));
    expect(reloaded.start(EMPTY_DIRECTOR, QUIET)).toBe(EMPTY_DIRECTOR);
  });

  it('raises the toast on a Friday evening, not the month’s gathering', () => {
    const { stage, store } = stageAt(friday(18));
    const director = stage.start(EMPTY_DIRECTOR, QUIET);
    expect(director.lines.map((said) => said.line)).toEqual(['かんぱーい！']);
    expect(store.read(TOAST_DAY_KEY, toastDaySchema).ok).toBe(true);
    expect(store.read(MONTH_EVENT_DAY_KEY, toastDaySchema).ok).toBe(false);
  });

  it('waits while a scene, a call or a visitor is on, or the screen is halted', () => {
    const seat = DEFAULT_SEATS.kaname;
    const walk = walkSegment([seat, { col: seat.col + 1, row: seat.row }, seat], 0);
    const busy = sendHome(EMPTY_DIRECTOR, 'kaname', walk);
    const { stage } = stageAt(wednesday(16));
    expect(stage.start(busy, QUIET)).toBe(busy);
    for (const flag of ['calling', 'halted', 'visiting'] as const) {
      expect(stage.start(EMPTY_DIRECTOR, { ...QUIET, [flag]: true })).toBe(EMPTY_DIRECTOR);
    }
    expect(actors(stage.start(EMPTY_DIRECTOR, QUIET))).toHaveLength(2);
  });

  it('releases the members of the month’s gathering', () => {
    const { stage } = stageAt(wednesday(16));
    const director = stage.start(EMPTY_DIRECTOR, QUIET);
    const released = stage.release(director, ['minori', 'hibiki'], 100);
    expect(released.lines).toEqual([]);
    expect(isAnimating(released, 100_000)).toBe(false);
  });
});
