import { describe, expect, it } from 'vitest';
import { placeholderArt } from './art';
import { createCast, stageAt, type CastParty } from './cast';
import { EMPTY_DIRECTOR } from './director';
import { TRINKETS } from './metrics';

/** The pet clicked (Issue #186) as the render loop's cast keeps it: up, and put to sleep by a halt. */

const PARTY: CastParty = {
  bubbles: {},
  known: true,
  halted: false,
  idleSince: {},
  moods: {},
  kingQuests: 0,
};
const HALTED: CastParty = { ...PARTY, halted: true };
const LIVE = { halted: false, paused: false } as const;

function newCast() {
  const talk = { random: () => 0.5, pick: undefined, saw: () => undefined };
  return createCast(placeholderArt, () => 0.5, { wallNow: () => 0 }, talk);
}

/** Whether the stage at `t` shows the pet up from a click (DecorCues.petted). */
function petted(cast: ReturnType<typeof newCast>, t: number, party: CastParty = PARTY): boolean {
  return stageAt(cast, EMPTY_DIRECTOR, { t, hour: 12, party }).cues.petted;
}

describe('the cast and the pet clicked', () => {
  it('shows the pet up on the stage for pettedMs from the press', () => {
    const cast = newCast();
    expect(petted(cast, 0)).toBe(false);
    cast.petting.press(LIVE, 0);
    expect(petted(cast, 1)).toBe(true);
    expect(petted(cast, TRINKETS.pettedMs - 1)).toBe(true);
    expect(petted(cast, TRINKETS.pettedMs)).toBe(false);
  });

  it('puts it to sleep on a halted party: it does not wake again once the halt is over', () => {
    const cast = newCast();
    cast.petting.press(LIVE, 0);
    cast.receive(EMPTY_DIRECTOR, HALTED, { t: 100, quiet: false });
    expect(petted(cast, 200, HALTED)).toBe(false);
    cast.receive(EMPTY_DIRECTOR, PARTY, { t: 300, quiet: false });
    expect(petted(cast, 400)).toBe(false);
  });

  it('keeps it up through a party that is not halted', () => {
    const cast = newCast();
    cast.petting.press(LIVE, 0);
    cast.receive(EMPTY_DIRECTOR, PARTY, { t: 100, quiet: false });
    expect(petted(cast, 200)).toBe(true);
  });
});
