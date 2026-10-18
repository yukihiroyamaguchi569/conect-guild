import { describe, expect, it } from 'vitest';
import { placeholderArt } from './art';
import { createCast, stageAt, type CastParty } from './cast';
import { EMPTY_DIRECTOR } from './director';
import { linesOf } from './lineBook';
import { createLinePicker, type Utterance } from './lines';
import { LINES } from './metrics';

/** A member clicked (Issue #191) as the render loop's cast keeps it. */

const PARTY: CastParty = {
  bubbles: {},
  known: true,
  halted: false,
  idleSince: {},
  moods: {},
  kingQuests: 0,
};
const LIVE = { t: 0, paused: false } as const;

function newCast() {
  const picker = createLinePicker(() => 0);
  const talk = {
    random: () => 0.5,
    pick: picker.pick,
    saw: (lines: readonly Utterance[], t: number) => {
      picker.saw(lines, t);
    },
  };
  return createCast(placeholderArt, () => 0.5, { wallNow: () => 0 }, talk);
}

function stage(cast: ReturnType<typeof newCast>, t: number, party: CastParty = PARTY) {
  return stageAt(cast, EMPTY_DIRECTOR, { t, hour: 12, party });
}

describe('the cast and a member clicked', () => {
  it('shows the answer over the head where the remarks go, and keeps the stage drawing', () => {
    const cast = newCast();
    expect(cast.ask('minori', EMPTY_DIRECTOR, PARTY, LIVE)).toBe(true);
    const shown = stage(cast, 1);
    expect(linesOf('minori', 'askWork')).toContain(shown.remarks.minori);
    expect(shown.animating).toBe(true);
    expect(stage(cast, LINES.remarkMs).remarks.minori).toBeUndefined();
  });

  it('notes where the members were drawn, for the next click', () => {
    const cast = newCast();
    stage(cast, 0);
    const ids = cast.asking.feet().map((member) => member.id);
    expect(ids).toContain('kaname');
    expect(ids).toContain('minori');
  });

  it('drops the answers on a halted party and when the canvas goes out of sight', () => {
    const cast = newCast();
    cast.ask('hibiki', EMPTY_DIRECTOR, PARTY, LIVE);
    cast.receive(EMPTY_DIRECTOR, { ...PARTY, halted: true }, { t: 10, quiet: false });
    expect(stage(cast, 20).remarks.hibiki).toBeUndefined();
    cast.ask('sasae', EMPTY_DIRECTOR, PARTY, { t: 30, paused: false });
    cast.silence();
    expect(stage(cast, 40).remarks.sasae).toBeUndefined();
  });

  it('drops a click on a halted party', () => {
    const cast = newCast();
    expect(cast.ask('hibiki', EMPTY_DIRECTOR, { ...PARTY, halted: true }, LIVE)).toBe(false);
    expect(stage(cast, 1).remarks).toEqual({});
  });
});
