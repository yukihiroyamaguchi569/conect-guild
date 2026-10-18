import { describe, expect, it } from 'vitest';
import { createKeyValueStore, createMemoryStorage } from '../adapters/storage';
import { toastDaySchema } from '../domain/toast';
import type { AmbientMoods } from './ambient';
import { EMPTY_DIRECTOR, isAnimating, sendHome, type Director } from './director';
import { walkSegment } from './motion';
import { DEFAULT_SEATS } from './scenes';
import { createToastStage, localDayOf, TOAST_DAY_KEY } from './toastStage';

/** Friday 16 October 2026, local time. */
const friday = (hour: number, minute = 0) => new Date(2026, 9, 16, hour, minute).getTime();
const FREE: AmbientMoods = { minori: 'idle', hibiki: 'idle', hirame: 'desk-work' };
const QUIET = { t: 0, moods: FREE, idle: {}, calling: false, halted: false };

function stageAt(wall: number, stored?: unknown) {
  const memory = createMemoryStorage();
  const store = createKeyValueStore(() => memory);
  if (stored !== undefined) store.write(TOAST_DAY_KEY, stored);
  return { store, stage: createToastStage(store, () => wall) };
}

const started = (director: Director) => director.tracks.length > 0;

describe('localDayOf', () => {
  it('reads the local weekday, hour and date', () => {
    expect(localDayOf(friday(18, 30))).toEqual({ weekday: 5, hour: 18.5, day: '2026-10-16' });
  });
});

describe('createToastStage', () => {
  it('starts on a Friday evening once, and keeps the date', () => {
    const { stage, store } = stageAt(friday(18, 30));
    const director = stage.start(EMPTY_DIRECTOR, QUIET);
    expect(director.tracks.map((track) => track.actor)).toEqual(['minori', 'hibiki']);
    expect(store.read(TOAST_DAY_KEY, toastDaySchema)).toEqual({ ok: true, value: '2026-10-16' });
    const later = { ...QUIET, t: 200_000 };
    expect(started(stage.start(EMPTY_DIRECTOR, later))).toBe(false);
  });

  it('does not start before 18 o’clock or on another day', () => {
    expect(started(stageAt(friday(17, 59)).stage.start(EMPTY_DIRECTOR, QUIET))).toBe(false);
    const thursday = new Date(2026, 9, 15, 19).getTime();
    expect(started(stageAt(thursday).stage.start(EMPTY_DIRECTOR, QUIET))).toBe(false);
  });

  it('does not start again after a reload the same Friday, but does the next Friday', () => {
    expect(started(stageAt(friday(19), '2026-10-16').stage.start(EMPTY_DIRECTOR, QUIET))).toBe(
      false,
    );
    expect(started(stageAt(friday(19), '2026-10-09').stage.start(EMPTY_DIRECTOR, QUIET))).toBe(
      true,
    );
  });

  it('reads a broken stored day as none', () => {
    expect(started(stageAt(friday(19), { day: 'x' }).stage.start(EMPTY_DIRECTOR, QUIET))).toBe(
      true,
    );
  });

  it('waits while a scene or a call plays, or the screen is halted', () => {
    const seat = DEFAULT_SEATS.kaname;
    const walk = walkSegment([seat, { col: seat.col + 1, row: seat.row }, seat], 0);
    const busy = sendHome(EMPTY_DIRECTOR, 'kaname', walk);
    const { stage } = stageAt(friday(19));
    expect(stage.start(busy, QUIET)).toBe(busy);
    expect(started(stage.start(EMPTY_DIRECTOR, { ...QUIET, calling: true }))).toBe(false);
    expect(started(stage.start(EMPTY_DIRECTOR, { ...QUIET, halted: true }))).toBe(false);
    expect(started(stage.start(EMPTY_DIRECTOR, QUIET))).toBe(true);
  });

  it('waits for two free hands without using the evening up', () => {
    const { stage } = stageAt(friday(19));
    const one = { ...QUIET, moods: { minori: 'idle', hibiki: 'desk-work' } as const };
    expect(started(stage.start(EMPTY_DIRECTOR, one))).toBe(false);
    expect(started(stage.start(EMPTY_DIRECTOR, QUIET))).toBe(true);
  });

  it('releases members of the toast it started, and nothing before one', () => {
    const { stage } = stageAt(friday(19));
    expect(stage.release(EMPTY_DIRECTOR, ['minori'], 0)).toBe(EMPTY_DIRECTOR);
    const director = stage.start(EMPTY_DIRECTOR, QUIET);
    const released = stage.release(director, ['minori', 'hibiki'], 100);
    expect(released.busyUntil.minori).toBeLessThan(director.busyUntil.minori ?? 0);
    expect(isAnimating(released, 100_000)).toBe(false);
  });
});
