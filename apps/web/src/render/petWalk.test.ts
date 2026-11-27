import { describe, expect, it } from 'vitest';
import { memberClickables, pressablesWith, pressedAt } from './clickables';
import { windowTilesIn } from './idleSpots';
import { LAYOUTS, SELECTED_LAYOUT } from './layouts';
import { isWalkableIn } from './map';
import { TRINKETS } from './metrics';
import { MS_PER_TILE } from './motion';
import { PET_RECT, type PetAt } from './petting';
import { petRoutesIn, petStepAt, petWalkMs } from './petWalk';
import { petAt, sleepTalkAt } from './sleepTalk';
import {
  NO_CUES,
  PET_AWAKE_DECOR,
  PET_WALK_DECOR,
  boneDecorAt,
  petPoseAt,
  petWalkAt,
} from './trinkets';

/** Issue #319: now and then the pet walks round the guild and comes back. */

const ROUTES = petRoutesIn(SELECTED_LAYOUT);
const [WALK_A, WALK_B] = PET_WALK_DECOR;
const { petWalkSlotMs } = TRINKETS;

/** The start of the first slot the pet walks in. */
function firstWalk(): number {
  for (let slot = 0; slot < 1_000; slot += 1) {
    if (petWalkAt(slot * petWalkSlotMs) !== null) return slot * petWalkSlotMs;
  }
  throw new Error('never walks');
}
const WALK = firstWalk();
const ROUTE = ROUTES[(WALK / petWalkSlotMs) % ROUTES.length];
if (ROUTE === undefined) throw new Error('no route');
const WALK_MS = petWalkMs(ROUTE);

describe('petRoutesIn', () => {
  it('goes from the pet’s place along the walkways, in every layout', () => {
    for (const layout of Object.values(LAYOUTS)) {
      const routes = petRoutesIn(layout);
      expect(routes.length).toBeGreaterThan(0);
      for (const { path } of routes) {
        expect(path.slice(1).every((tile) => isWalkableIn(layout, tile))).toBe(true);
        // Short enough to be back well within its slot.
        expect(petWalkMs({ path })).toBeLessThan(petWalkSlotMs / 4);
      }
    }
  });

  it('stops under the windows first, then beside the desks', () => {
    const windows = windowTilesIn(SELECTED_LAYOUT);
    expect(ROUTES.slice(0, windows.length).map(({ path }) => path.at(-1))).toEqual(windows);
    expect(ROUTES.length).toBeGreaterThan(windows.length);
  });
});

describe('petStepAt', () => {
  const tiles = ROUTE.path.length - 1;

  it('walks there, stays, walks back, then is home', () => {
    expect(petStepAt(ROUTE, -1)).toBeNull();
    expect(petStepAt(ROUTE, 0)).toMatchObject({ dx: 0, dy: 0 });
    const stop = petStepAt(ROUTE, tiles * MS_PER_TILE);
    expect(stop?.second).toBe(false);
    expect(petStepAt(ROUTE, tiles * MS_PER_TILE + TRINKETS.petWalkStayMs - 1)).toEqual(stop);
    expect(petStepAt(ROUTE, WALK_MS - 1)).not.toBeNull();
    expect(petStepAt(ROUTE, WALK_MS)).toBeNull();
    expect(WALK_MS).toBe(2 * tiles * MS_PER_TILE + TRINKETS.petWalkStayMs);
  });

  it('faces the way it walks: the stop is to the left of the pet, so it goes left and comes back right', () => {
    const half = Math.floor(tiles / 2) * MS_PER_TILE;
    const there = petStepAt(ROUTE, (tiles - 0.5) * MS_PER_TILE);
    const back = petStepAt(ROUTE, WALK_MS - half);
    expect(there?.dx).toBeLessThan(0);
    expect(there?.left).toBe(true);
    expect(back?.left).toBe(false);
  });
});

describe('petWalkAt', () => {
  it('walks from the start of a picked slot, in turn the two walking pictures, mirrored to the left', () => {
    const names = new Set<string>();
    for (let t = WALK; t < WALK + WALK_MS; t += 40) names.add(petWalkAt(t)?.name ?? 'none');
    expect(names).toEqual(new Set([WALK_A, WALK_B]));
    expect(petWalkAt(WALK + WALK_MS)).toBeNull();
    expect(petWalkAt(WALK - 1)).toBeNull();
    const left = petWalkAt(WALK + (ROUTE.path.length - 1.5) * MS_PER_TILE);
    expect(left?.flipped).toBe(true);
  });

  it('does not walk right after the page opens', () => {
    expect(WALK).toBeGreaterThanOrEqual(petWalkSlotMs);
  });
});

describe('the walk among the pet’s other poses', () => {
  const now = WALK + (ROUTE.path.length - 1.5) * MS_PER_TILE;

  it('comes after company (back in its place) and before the bone and sitting up', () => {
    expect(petPoseAt('sleeping-poodle', 0, now, false)).toEqual(petWalkAt(now));
    expect(petPoseAt('sleeping-poodle', 0, now, true)).toEqual({ name: PET_AWAKE_DECOR, dy: 0 });
    // Wherever the bone and the walk meet, the walk is drawn.
    let met = 0;
    for (let t = 0; t < 40 * petWalkSlotMs; t += 10_000) {
      const walk = petWalkAt(t);
      if (walk !== null && boneDecorAt(t) !== null) {
        expect(petPoseAt('sleeping-poodle', 0, t, false)).toEqual(walk);
        met += 1;
      }
    }
    expect(met).toBeGreaterThan(0);
  });

  it('says nothing in its sleep while it walks', () => {
    expect(sleepTalkAt('sleeping-poodle', 0, now, NO_CUES)).toBeNull();
  });

  it('is pressed where it is drawn, and marked away from its place', () => {
    const walk = petWalkAt(now);
    if (PET_RECT === null || walk === null) throw new Error('no pet');
    const at = petAt(now, NO_CUES);
    expect(at?.rect.left).toBe(PET_RECT.left + (walk.dx ?? 0));
    expect(at?.rect.top).toBe(PET_RECT.top + walk.dy);
    expect(at?.away).toBe(true);
    expect(walk.dx).not.toBe(0);
    expect(petAt(now, { ...NO_CUES, petCompany: true })).toEqual({ rect: PET_RECT, away: false });
  });
});

describe('pressablesWith', () => {
  const rect = { left: 100, top: 100, right: 132, bottom: 132 };
  const member = memberClickables([{ id: 'minori', point: { x: 116, y: 140 } }]);
  const ids = (pet: PetAt) => pressablesWith(pet, member).map((item) => item.id);

  it('puts the pet in its place in front of the members, as before', () => {
    expect(ids({ rect, away: false }).indexOf('dog')).toBeLessThan(
      ids({ rect, away: false }).indexOf('member'),
    );
    expect(pressedAt({ x: 116, y: 116 }, pressablesWith({ rect, away: false }, member))?.id).toBe(
      'dog',
    );
  });

  it('puts the pet away from its place behind the members: a press on a member never pets it', () => {
    const away = pressablesWith({ rect, away: true }, member);
    expect(pressedAt({ x: 116, y: 116 }, away)?.id).toBe('member');
    expect(ids({ rect, away: true }).indexOf('dog')).toBeGreaterThan(
      ids({ rect, away: true }).indexOf('member'),
    );
  });
});
