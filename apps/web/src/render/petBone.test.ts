import { describe, expect, it } from 'vitest';
import { TRINKETS } from './metrics';
import { sleepTalkAt, sleepWordAt } from './sleepTalk';
import {
  boneDecorAt,
  NO_CUES,
  PET_AWAKE_DECOR,
  PET_BARK_DECOR,
  PET_BONE_DECOR,
  petAwakeAt,
  petLookAt,
  petPoseAt,
  spinPoseAt,
  wagDecorAt,
} from './trinkets';

/** Issue #318: now and then, for a while, the pet chews a bone instead of sleeping. */

const { boneSlotMs, boneMs, boneFrameMs } = TRINKETS;
const [A, B] = PET_BONE_DECOR;
const ASLEEP = 'sleeping-poodle';

/** The start of the first slot where the pet chews, and of the first where it does not. */
function slots(): { chewing: number; quiet: number } {
  let chewing: number | null = null;
  let quiet: number | null = null;
  for (let slot = 0; (chewing === null || quiet === null) && slot < 1_000; slot += 1) {
    const start = slot * boneSlotMs;
    if (boneDecorAt(start) === null) quiet ??= start;
    else chewing ??= start;
  }
  if (chewing === null || quiet === null) throw new Error('no slots');
  return { chewing, quiet };
}

const { chewing: CHEW, quiet: QUIET } = slots();

/** A phase that has the pet sit up on its own at `now` (petAwakeAt). */
const sittingPhase = (now: number) =>
  (TRINKETS.petIntervalMs - (now % TRINKETS.petIntervalMs)) % TRINKETS.petIntervalMs;

describe('boneDecorAt', () => {
  it('chews for TRINKETS.boneMs from the start of a picked slot', () => {
    expect(boneDecorAt(CHEW - 1)).toBeNull();
    expect(boneDecorAt(CHEW)).toBe(A);
    expect(boneDecorAt(CHEW + boneMs - 1)).not.toBeNull();
    expect(boneDecorAt(CHEW + boneMs)).toBeNull();
    expect(boneDecorAt(QUIET)).toBeNull();
  });

  it('changes picture every TRINKETS.boneFrameMs', () => {
    expect(boneDecorAt(CHEW + boneFrameMs - 1)).toBe(A);
    expect(boneDecorAt(CHEW + boneFrameMs)).toBe(B);
    expect(boneDecorAt(CHEW + 2 * boneFrameMs)).toBe(A);
  });

  it('chews in about TRINKETS.boneShare of the slots, the same every time', () => {
    const picked = Array.from({ length: 400 }, (_, slot) => boneDecorAt(slot * boneSlotMs));
    const share = picked.filter((name) => name !== null).length / picked.length;
    expect(share).toBeGreaterThan(TRINKETS.boneShare - 0.1);
    expect(share).toBeLessThan(TRINKETS.boneShare + 0.1);
    expect(Array.from({ length: 400 }, (_, slot) => boneDecorAt(slot * boneSlotMs))).toEqual(
      picked,
    );
  });
});

describe('the pet with its bone', () => {
  const now = CHEW + 1_000;

  it('chews instead of sleeping or sitting up on its own, not with company', () => {
    expect(petPoseAt(ASLEEP, 0, now, false)).toEqual({ name: boneDecorAt(now), dy: 0 });
    const phase = sittingPhase(now);
    expect(petAwakeAt(phase, now)).toBe(true);
    expect(petPoseAt(ASLEEP, phase, now, false).name).toBe(boneDecorAt(now));
    const quiet = QUIET + 1_000;
    expect(petPoseAt(ASLEEP, sittingPhase(quiet), quiet, false).name).toBe(PET_AWAKE_DECOR);
    expect(petPoseAt(ASLEEP, 0, now, true)).toEqual({ name: PET_AWAKE_DECOR, dy: 0 });
  });

  it('comes after the king, the toast, a hop, a bark at a visitor, wagging and spinning', () => {
    const look = (cues: Partial<typeof NO_CUES>) =>
      petLookAt(ASLEEP, 0, now, { ...NO_CUES, ...cues }).name;
    expect(look({})).toBe(boneDecorAt(now));
    expect(look({ kingBlessing: true })).toBe(PET_AWAKE_DECOR);
    expect(look({ toasting: true })).toBe(PET_AWAKE_DECOR);
    expect(look({ clearedAt: { kaname: now } })).toBe(PET_AWAKE_DECOR);
    expect(look({ visitorInAt: now })).toBe(PET_BARK_DECOR);
    expect(look({ petted: true })).toBe(wagDecorAt(now));
    expect(petLookAt(ASLEEP, 0, now, { ...NO_CUES, spinningSince: now })).toEqual(spinPoseAt(0));
  });

  it('says nothing in its sleep while it chews', () => {
    // A time when the pet chews and would talk in its sleep otherwise: every second of 1,000 slots.
    const steps = Array.from({ length: boneSlotMs }, (_, i) => i * 1_000);
    const t = steps.find((at) => boneDecorAt(at) !== null && sleepWordAt(at) !== null);
    if (t === undefined) throw new Error('never both');
    expect(sleepTalkAt(ASLEEP, 0, t, NO_CUES)).toBeNull();
  });
});
