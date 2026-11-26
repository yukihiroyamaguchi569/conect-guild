import { describe, expect, it } from 'vitest';
import { TRINKETS } from './metrics';
import { BARK } from './petting';
import { petLineAt, SLEEP_WORDS, sleepTalkAt, sleepWordAt } from './sleepTalk';
import { hashStep, NO_CUES, petAwakeAt } from './trinkets';

/** Issue #313: the pet talks in its sleep now and then, on fixed time slots. */

const SLOT = TRINKETS.sleepTalkSlotMs;

/** The first slot from `from` the pet talks in (`talking`) or keeps quiet in (not). */
function firstSlot(from: number, talking: boolean): number {
  let slot = from;
  while (hashStep(slot) < TRINKETS.sleepTalkShare !== talking) slot += 1;
  return slot;
}

/** Slots whose talk is not cut by the pet sitting up on its own (phase 0). */
function asleepThrough(slot: number): boolean {
  for (let t = slot * SLOT; t < slot * SLOT + TRINKETS.sleepTalkMs; t += 50) {
    if (petAwakeAt(0, t)) return false;
  }
  return true;
}

const TALKING = (() => {
  let slot = firstSlot(1_000, true);
  while (!asleepThrough(slot)) slot = firstSlot(slot + 1, true);
  return slot;
})();
const START = TALKING * SLOT;
const QUIET = firstSlot(1_000, false);

describe('sleepWordAt', () => {
  it('talks from the start of a talking slot for sleepTalkMs only', () => {
    expect(sleepWordAt(START - 1)).toBeNull();
    expect(sleepWordAt(START)).not.toBeNull();
    expect(sleepWordAt(START + TRINKETS.sleepTalkMs - 1)).not.toBeNull();
    expect(sleepWordAt(START + TRINKETS.sleepTalkMs)).toBeNull();
  });

  it('keeps quiet through a quiet slot', () => {
    for (let t = QUIET * SLOT; t < (QUIET + 1) * SLOT; t += 100) expect(sleepWordAt(t)).toBeNull();
  });

  it('says one fixed word through a slot, and both words over many slots', () => {
    const word = sleepWordAt(START);
    for (let t = START; t < START + TRINKETS.sleepTalkMs; t += 100)
      expect(sleepWordAt(t)).toBe(word);
    const said = new Set<string | null>();
    for (let slot = 0; slot < 200; slot += 1) said.add(sleepWordAt(slot * SLOT));
    expect(said).toEqual(new Set([...SLEEP_WORDS, null]));
  });

  it('talks in about sleepTalkShare of the slots', () => {
    let talks = 0;
    for (let slot = 0; slot < 1_000; slot += 1) if (sleepWordAt(slot * SLOT) !== null) talks += 1;
    expect(Math.abs(talks / 1_000 - TRINKETS.sleepTalkShare)).toBeLessThan(0.08);
  });
});

describe('sleepTalkAt', () => {
  const at = (cues: Partial<typeof NO_CUES>, now = START) =>
    sleepTalkAt('sleeping-poodle', 0, now, { ...NO_CUES, ...cues });

  it('talks while the pet sleeps', () => {
    expect(at({})).toBe(sleepWordAt(START));
  });

  it('keeps quiet while it is up, hops, has company, or on a halted screen', () => {
    expect(at({ petted: true })).toBeNull();
    expect(at({ clearedAt: { kaname: START - 100 } })).toBeNull();
    expect(at({ petCompany: true })).toBeNull();
    expect(at({ halted: true })).toBeNull();
  });

  it('keeps quiet while it sits up on its own', () => {
    // A moment it would talk, were it not sitting up then.
    let t = 0;
    while (sleepWordAt(t) === null || !petAwakeAt(0, t)) t += 100;
    expect(sleepTalkAt('sleeping-poodle', 0, t, NO_CUES)).toBeNull();
  });
});

describe('petLineAt', () => {
  it('says 「わん」 while petted, else its sleep talk', () => {
    expect(petLineAt(QUIET * SLOT, { ...NO_CUES, petted: true })).toBe(BARK);
    expect(petLineAt(QUIET * SLOT, NO_CUES)).toBeNull();
  });
});
