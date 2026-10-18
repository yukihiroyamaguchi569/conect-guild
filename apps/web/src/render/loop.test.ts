import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AMBIENT } from './metrics';
import { EMPTY_DIRECTOR, scheduleEvent } from './director';
import { calendarOf, isPaused, isShown, scenesShown } from './loop';
import { createScheduler, nextDraw } from './scheduler';
import { DEFAULT_SEATS } from './scenes';

describe('nextDraw', () => {
  it('draws every frame while a scene plays', () => {
    expect(nextDraw({ hidden: false, animating: true, ambient: true })).toBe('frame');
    expect(nextDraw({ hidden: false, animating: true, ambient: false })).toBe('frame');
  });

  it('waits for the next ambient move between scenes', () => {
    expect(nextDraw({ hidden: false, animating: false, ambient: true })).toBe('ambient');
  });

  it('sleeps when nothing moves', () => {
    expect(nextDraw({ hidden: false, animating: false, ambient: false })).toBe('sleep');
  });

  it('sleeps while the page is hidden, even during a scene', () => {
    expect(nextDraw({ hidden: true, animating: true, ambient: true })).toBe('sleep');
    expect(nextDraw({ hidden: true, animating: false, ambient: true })).toBe('sleep');
  });
});

describe('isPaused', () => {
  it('pauses while the page is hidden', () => {
    expect(isPaused(true, 800)).toBe(true);
  });

  it('pauses while the canvas has no width (hidden on narrow screens)', () => {
    expect(isPaused(false, 0)).toBe(true);
  });

  it('runs on a shown page with a visible canvas', () => {
    expect(isPaused(false, 800)).toBe(false);
  });
});

function useFakeFrames(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 16));
    vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
}

/** A scheduler whose draw keeps asking for the next ambient move, like the loop between scenes. */
function ambientLoop(paused: () => boolean) {
  const counter = { draws: 0 };
  const schedule = createScheduler(() => {
    counter.draws += 1;
    schedule.later();
  }, paused);
  return { schedule, counter };
}

describe('createScheduler: drawing', () => {
  useFakeFrames();

  it('redraws about every AMBIENT.frameMs between scenes', () => {
    const { schedule, counter } = ambientLoop(() => false);
    schedule.now();
    vi.advanceTimersByTime(1_000);
    const perSecond = 1_000 / (AMBIENT.frameMs + 16);
    expect(counter.draws).toBeGreaterThanOrEqual(Math.floor(perSecond));
    expect(counter.draws).toBeLessThanOrEqual(Math.ceil(perSecond) + 1);
  });

  it('draws once for several requests in the same frame', () => {
    const draw = vi.fn();
    const schedule = createScheduler(draw, () => false);
    schedule.now();
    schedule.now();
    schedule.later();
    vi.advanceTimersByTime(1_000);
    expect(draw).toHaveBeenCalledTimes(1);
  });
});

describe('createScheduler: pausing and stopping', () => {
  useFakeFrames();

  it('stops drawing while paused and starts again on refresh', () => {
    let paused = false;
    const { schedule, counter } = ambientLoop(() => paused);
    schedule.now();
    vi.advanceTimersByTime(500);
    paused = true;
    schedule.refresh();
    const before = counter.draws;
    vi.advanceTimersByTime(2_000);
    expect(counter.draws).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
    schedule.now();
    schedule.later();
    vi.advanceTimersByTime(500);
    expect(counter.draws).toBe(before);
    paused = false;
    schedule.refresh();
    vi.advanceTimersByTime(500);
    expect(counter.draws).toBeGreaterThan(before);
  });

  it('does nothing after stop, leaving no timer behind', () => {
    const { schedule, counter } = ambientLoop(() => false);
    schedule.now();
    vi.advanceTimersByTime(300);
    schedule.stop();
    const before = counter.draws;
    expect(vi.getTimerCount()).toBe(0);
    schedule.now();
    schedule.later();
    schedule.refresh();
    vi.advanceTimersByTime(2_000);
    expect(counter.draws).toBe(before);
  });
});

describe('scenes while the canvas is out of sight', () => {
  const scene = scheduleEvent(
    EMPTY_DIRECTOR,
    { id: 'issue-opened#1', kind: 'issue-opened', number: 1, department: '企画' },
    0,
    { seats: DEFAULT_SEATS, random: () => 0.5 },
  );

  it('counts a canvas with no width as out of sight', () => {
    expect(isShown(0)).toBe(false);
    expect(isShown(320)).toBe(true);
  });

  it('drops the scenes while the canvas has no width, so they never play late', () => {
    expect(scenesShown(scene, 0)).toBe(EMPTY_DIRECTOR);
    expect(scenesShown(scene, 320)).toBe(scene);
  });
});

describe('calendarOf (Issue #192)', () => {
  it('reads the month of the ornament from the injected wall clock', () => {
    const wall = new Date(2026, 10, 1, 0, 0, 5).getTime();
    const calendar = calendarOf({ localHour: () => 23.5, wallNow: () => wall });
    expect(calendar()).toEqual({ hour: 23.5, month: 11, wall });
  });

  it('reads it again on every frame, so an open page turns to the next month', () => {
    let now = new Date(2026, 11, 31, 23, 59, 59).getTime();
    const calendar = calendarOf({ localHour: () => 0, wallNow: () => now });
    expect(calendar().month).toBe(12);
    now += 1000;
    expect(calendar().month).toBe(1);
  });
});
