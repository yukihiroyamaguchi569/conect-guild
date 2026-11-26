import { describe, expect, it } from 'vitest';
import { CONFETTI, TRINKETS } from './metrics';
import {
  decorCuesOf,
  NO_CUES,
  PET_AWAKE_DECOR,
  petLookAt,
  petPoseAt,
  wagDecorAt,
} from './trinkets';

/** Issue #311: the pet is up and hops while a quest's confetti flies; petting comes first. */

/** A quest cleared at START, far from zero like a real epoch time. */
const START = 7_000_000;

/** The cues at `now` with one burst of confetti over かなめ from START. */
function cuesAt(now: number, petted = false, petCompany = false) {
  const cues = decorCuesOf({}, [{ actor: 'kaname', start: START }], now, []);
  return { ...cues, petted, petCompany };
}

const look = (now: number, petted = false, petCompany = false) =>
  petLookAt('sleeping-poodle', 0, now, cuesAt(now, petted, petCompany));

describe('the pet hops while the confetti flies', () => {
  it('is up and leaves the floor while it flies', () => {
    const dys = new Set<number>();
    for (let t = START; t < START + CONFETTI.durationMs; t += 10) {
      const pose = look(t);
      expect(pose.name).toBe(PET_AWAKE_DECOR);
      dys.add(pose.dy);
    }
    expect(Math.min(...dys)).toBe(-TRINKETS.hopPx);
    expect(dys.has(0)).toBe(true);
  });

  it('starts from the floor and stays within the hop height', () => {
    expect(look(START).dy).toBe(0);
    expect(look(START + TRINKETS.hopMs / 2).dy).toBe(-TRINKETS.hopPx);
    for (let t = START; t < START + CONFETTI.durationMs; t += 7) {
      const { dy } = look(t);
      expect(dy).toBeLessThanOrEqual(0);
      expect(dy).toBeGreaterThanOrEqual(-TRINKETS.hopPx);
    }
  });

  it('is as before once the confetti is over, and before it starts', () => {
    for (const t of [START - 1, START + CONFETTI.durationMs, START + CONFETTI.durationMs + 500]) {
      expect(look(t)).toEqual(petPoseAt('sleeping-poodle', 0, t, false));
    }
    expect(petLookAt('sleeping-poodle', 0, START, NO_CUES)).toEqual(
      petPoseAt('sleeping-poodle', 0, START, false),
    );
  });

  it('wags rather than hops while it is petted', () => {
    const t = START + TRINKETS.hopMs / 2;
    expect(look(t, true)).toEqual({ name: wagDecorAt(t), dy: 0 });
  });

  it('hops even with company', () => {
    const t = START + TRINKETS.hopMs / 2;
    expect(look(t, false, true)).toEqual({ name: PET_AWAKE_DECOR, dy: -TRINKETS.hopPx });
  });
});
