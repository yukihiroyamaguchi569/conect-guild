import { describe, expect, it } from 'vitest';
import { createKeyValueStore, createMemoryStorage } from '../adapters/storage';
import { IDLE } from '../render/metrics';
import {
  createGuestLastActiveTracker,
  GUEST_LAST_ACTIVE_STORAGE_KEY,
  guestIdleSinceOf,
  guestNeedsWrite,
  observeGuests,
  type GuestStateRow,
} from './guestLastActive';

const MIN = 60_000;
const rows = (...states: GuestStateRow['state'][]): GuestStateRow[] =>
  states.map((state, index) => ({ index, state }));

describe('observeGuests', () => {
  it('starts counting now for a guest seen idle for the first time (no time known)', () => {
    expect(observeGuests([], rows('idle', 'resting'), 5 * MIN)).toEqual([5 * MIN, 5 * MIN]);
  });

  it('keeps the time of a guest still idle, and moves it to now while there is work', () => {
    const last = [1 * MIN, 2 * MIN];
    expect(observeGuests(last, rows('idle', 'working'), 9 * MIN)).toEqual([1 * MIN, 9 * MIN]);
    expect(observeGuests(last, rows('awaiting-permission', 'resting'), 9 * MIN)).toEqual([
      9 * MIN,
      2 * MIN,
    ]);
  });

  it('counts a time in the future (the clock moved back) as now', () => {
    expect(observeGuests([20 * MIN], rows('idle'), 3 * MIN)).toEqual([3 * MIN]);
  });

  it('fills a gap before a later guest with null', () => {
    expect(observeGuests([], [{ index: 1, state: 'idle' }], MIN)).toEqual([null, MIN]);
  });
});

describe('guestIdleSinceOf', () => {
  it('gives the time of the idle guests only', () => {
    expect(guestIdleSinceOf([MIN, 2 * MIN], rows('resting', 'working'))).toEqual([MIN, null]);
    expect(guestIdleSinceOf([], rows('idle'))).toEqual([null]);
  });
});

describe('guestNeedsWrite', () => {
  it('writes when a guest is added or a time moved on by the step', () => {
    expect(guestNeedsWrite([], [MIN])).toBe(true);
    expect(guestNeedsWrite([MIN], [MIN + IDLE.persistStepMs - 1])).toBe(false);
    expect(guestNeedsWrite([MIN], [MIN + IDLE.persistStepMs])).toBe(true);
    expect(guestNeedsWrite([MIN], [MIN, null])).toBe(false);
  });
});

describe('createGuestLastActiveTracker', () => {
  function storeWith(raw: string | null) {
    const storage = createMemoryStorage();
    if (raw !== null) storage.setItem(GUEST_LAST_ACTIVE_STORAGE_KEY, raw);
    return { storage, store: createKeyValueStore(() => storage) };
  }

  it('reads the stored times back, so a reload does not wake the guests up', () => {
    const { store } = storeWith(JSON.stringify([MIN, null]));
    const tracker = createGuestLastActiveTracker(store);
    expect(tracker.observe(rows('idle', 'idle'), 40 * MIN)).toEqual([MIN, 40 * MIN]);
  });

  it('keeps only the numbers and times, and writes them through', () => {
    const { storage, store } = storeWith(null);
    const tracker = createGuestLastActiveTracker(store);
    tracker.observe(rows('working', 'idle'), 7 * MIN);
    expect(storage.getItem(GUEST_LAST_ACTIVE_STORAGE_KEY)).toBe(JSON.stringify([7 * MIN, 7 * MIN]));
  });

  it('restarts the clock when work comes and counts from the last moment of work', () => {
    const { store } = storeWith(JSON.stringify([0]));
    const tracker = createGuestLastActiveTracker(store);
    expect(tracker.observe(rows('idle'), 35 * MIN)).toEqual([0]);
    expect(tracker.observe(rows('working'), 36 * MIN)).toEqual([null]);
    expect(tracker.observe(rows('idle'), 37 * MIN)).toEqual([36 * MIN]);
  });

  it.each([
    ['not JSON', '{'],
    ['not a list', JSON.stringify({ 0: MIN })],
    ['a negative time', JSON.stringify([-1])],
    ['a fraction', JSON.stringify([1.5])],
    ['a name', JSON.stringify(['たびびと'])],
    ['too many guests', JSON.stringify([MIN, MIN, MIN])],
  ])('starts afresh from a broken value (%s), counting from now', (_, raw) => {
    const { storage, store } = storeWith(raw);
    const tracker = createGuestLastActiveTracker(store);
    expect(tracker.observe(rows('idle'), 50 * MIN)).toEqual([50 * MIN]);
    expect(storage.getItem(GUEST_LAST_ACTIVE_STORAGE_KEY)).toBe(JSON.stringify([50 * MIN]));
  });

  it('goes on in memory when the storage cannot be used', () => {
    const tracker = createGuestLastActiveTracker(
      createKeyValueStore(() => {
        throw new Error('blocked');
      }),
    );
    expect(tracker.observe(rows('idle'), MIN)).toEqual([MIN]);
    expect(tracker.observe(rows('idle'), 2 * MIN)).toEqual([MIN]);
  });
});
