import { describe, expect, it } from 'vitest';
import { TRINKETS } from './metrics';
import { BARK, barkBox, PET_RECT, petLineBox, petLineClear } from './petting';
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

  it('says the sleep word of a talking slot while the layout’s pet sleeps', () => {
    // The first moment the selected layout's pet (its own phase) talks, within 100 slots.
    let t = START;
    while (petLineAt(t, NO_CUES) === null && t < START + 100 * SLOT) t += 100;
    const word = petLineAt(t, NO_CUES);
    expect(word).not.toBeNull();
    expect(word).toBe(sleepWordAt(t));
    expect(SLEEP_WORDS).toContain(word);
    expect(petLineAt(t, { ...NO_CUES, halted: true })).toBeNull();
  });
});

describe('the sleep talk’s bubble', () => {
  const [long] = SLEEP_WORDS;

  it('is wider than 「わん」 and kept clear of the members’ bubbles', () => {
    if (PET_RECT === null) throw new Error('no pet');
    const bark = barkBox(PET_RECT);
    const line = petLineBox(PET_RECT, long);
    expect(line.right).toBeGreaterThan(bark.right);
    expect(petLineClear(PET_RECT, long, [])).toBe(true);
    // A member's bubble just right of 「わん」 meets the longer 「くぅん…」 only.
    const over = { left: bark.right, right: bark.right + 40, top: bark.top, bottom: bark.bottom };
    expect(petLineClear(PET_RECT, BARK, [over])).toBe(true);
    expect(petLineClear(PET_RECT, long, [over])).toBe(false);
    // One that only touches its right edge does not hide it.
    const beside = { left: line.right, right: line.right + 40, top: line.top, bottom: line.bottom };
    expect(petLineClear(PET_RECT, long, [beside])).toBe(true);
  });
});
