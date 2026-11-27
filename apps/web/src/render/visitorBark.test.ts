import { describe, expect, it } from 'vitest';
import { visitsOn } from '../domain/visitors';
import { LAYOUTS } from './layouts';
import { TRINKETS } from './metrics';
import { BARK, PET_RECT, petLineBox, petLineClear, TOAST_BARK, VISITOR_BARK } from './petting';
import { DEFAULT_SEATS } from './scenes';
import { petLineAt } from './sleepTalk';
import {
  barkFlippedIn,
  NO_CUES,
  PET_AWAKE_DECOR,
  PET_BARK_DECOR,
  petLookAt,
  spinPoseAt,
  visitorBarking,
  wagDecorAt,
} from './trinkets';
import { createVisitorStage } from './visitorStage';
import { comingInSince, cutTrip, planTrip } from './visitors';

/** Issue #317: a visitor comes in by the door, and the pet barks 「わんわん」 towards it. */

const IN = 50_000;
const BARK_MS = TRINKETS.visitorBarkMs;

function trip(start: number) {
  const planned = planTrip(
    { kind: 'postman', say: 0 },
    { id: 'minori', seat: DEFAULT_SEATS.minori },
    start,
  );
  if (planned === null) throw new Error('no way');
  return planned;
}

describe('comingInSince', () => {
  it('is when the visitor set off, until it turns back', () => {
    expect(comingInSince(null)).toBeNull();
    expect(comingInSince(trip(IN))).toBe(IN);
    expect(comingInSince(cutTrip(trip(IN), IN + 500))).toBeNull();
  });

  it('is read from the stage as of the frame drawn', () => {
    const day = { year: 2026, month: 10, day: 12 };
    const [first] = visitsOn(day);
    if (first === undefined) throw new Error('no visit');
    const wall = new Date(2026, 9, 12, 0, 0).getTime() + first.at * 60_000;
    const stage = createVisitorStage(() => wall);
    const quiet = { busy: false, free: [{ id: 'minori' as const, seat: DEFAULT_SEATS.minori }] };
    expect(stage.comingInSince()).toBeNull();
    stage.frameAt(IN, quiet);
    expect(stage.comingInSince()).toBe(IN);
    stage.setHalted(true, IN + 100);
    expect(stage.comingInSince()).toBeNull();
  });
});

describe('visitorBarking', () => {
  it('lasts TRINKETS.visitorBarkMs from when the visitor set off', () => {
    const cues = { visitorInAt: IN };
    expect(visitorBarking(IN - 1, cues)).toBe(false);
    expect(visitorBarking(IN, cues)).toBe(true);
    expect(visitorBarking(IN + BARK_MS - 1, cues)).toBe(true);
    expect(visitorBarking(IN + BARK_MS, cues)).toBe(false);
    expect(visitorBarking(IN, { visitorInAt: null })).toBe(false);
  });
});

describe('the barking pose', () => {
  const now = IN + 1_000;
  const barking = { ...NO_CUES, visitorInAt: IN };

  it('faces the door: no layout has it on the pet’s left, so it is never mirrored', () => {
    for (const layout of Object.values(LAYOUTS)) expect(barkFlippedIn(layout)).toBe(false);
    expect(petLookAt('sleeping-poodle', 0, now, barking)).toEqual({ name: PET_BARK_DECOR, dy: 0 });
  });

  it('mirrors it where the door is on the pet’s left', () => {
    const layout = LAYOUTS[4];
    if (layout === undefined) throw new Error('no layout');
    expect(barkFlippedIn({ ...layout, offstage: { col: 0, row: 15 } })).toBe(true);
  });

  it('comes after spinning and wagging, before hopping, the toast, the king and company', () => {
    const all = {
      ...barking,
      petCompany: true,
      kingBlessing: true,
      toasting: true,
      clearedAt: { kaname: IN },
    };
    const look = (cues: typeof all) => petLookAt('sleeping-poodle', 0, now, cues);
    expect(look({ ...all, petted: true, spinningSince: IN })).toEqual(spinPoseAt(now - IN));
    expect(look({ ...all, petted: true })).toEqual({ name: wagDecorAt(now), dy: 0 });
    expect(look(all).name).toBe(PET_BARK_DECOR);
    expect(look({ ...all, visitorInAt: now - BARK_MS }).name).toBe(PET_AWAKE_DECOR);
  });
});

describe('what the pet says', () => {
  const now = IN + 1_000;
  const barking = { ...NO_CUES, visitorInAt: IN };

  it('says 「わんわん」 while it barks at the visitor', () => {
    expect(petLineAt(now, barking)).toBe(VISITOR_BARK);
    expect(petLineAt(IN + BARK_MS, barking)).not.toBe(VISITOR_BARK);
  });

  it('says 「わん」 while petted, and 「わんわん」 over the toast’s 「わん！」', () => {
    expect(petLineAt(now, { ...barking, petted: true })).toBe(BARK);
    const toast = { ...barking, toasting: true, cheeredAt: now - 100 };
    expect(petLineAt(now, toast)).toBe(VISITOR_BARK);
    expect(petLineAt(now, { ...toast, visitorInAt: null })).toBe(TOAST_BARK);
  });

  it('still barks towards the door when a member’s bubble hides 「わんわん」', () => {
    if (PET_RECT === null) throw new Error('no pet');
    const line = petLineBox(PET_RECT, VISITOR_BARK);
    // A bubble over a member just past the end of 「わん」, as by the next desk (Issue #186 rule).
    const member = {
      left: line.right - 10,
      right: line.right + 40,
      top: line.top,
      bottom: line.bottom,
    };
    expect(petLineClear(PET_RECT, BARK, [member])).toBe(true);
    expect(petLineClear(PET_RECT, VISITOR_BARK, [member])).toBe(false);
    expect(petLookAt('sleeping-poodle', 0, now, barking)).toEqual({ name: PET_BARK_DECOR, dy: 0 });
  });

  it('says nothing to the visitor on a halted screen', () => {
    expect(petLineAt(now, { ...barking, halted: true })).toBeNull();
  });
});
