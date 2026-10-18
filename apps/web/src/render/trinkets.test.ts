import { describe, expect, it } from 'vitest';
import { DECOR } from '../../../../assets/decor/decor';
import { decorPose, type AmbientMoods } from './ambient';
import { FLOOR_PATCH_DECOR, DECOR_PLACEMENTS } from './decor';
import { BACK_OBJECTS } from './layers';
import { AMBIENT, CONFETTI, TILE_SIZE, TRINKETS } from './metrics';
import {
  activeSince,
  decorCuesOf,
  GLINT_POINTS,
  GLOBE_BODY,
  glintAt,
  hashStep,
  MEGAPHONE_MOUTH,
  NO_CUES,
  notesAt,
  patchAt,
  PET_AWAKE_DECOR,
  petAwakeAt,
  petPoseAt,
  SAND_STREAM,
  sandGrainAt,
  spinBandAt,
  triggerOf,
  waveAt,
  type DecorCues,
} from './trinkets';

const PICTURE = TILE_SIZE;
const byName = (a: string, b: string) => a.localeCompare(b);
/** Everybody at their seat (trinkets.seat.test.ts covers members away). */
const AT_SEAT = (['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'] as const).map(
  (id) => ({ id, atSeat: true, withPet: false }),
);

describe('decorCuesOf', () => {
  it('counts a department member at desk work as working, not かなめ or the king', () => {
    const moods: AmbientMoods = {
      kaname: 'desk-work',
      minori: 'desk-work',
      hibiki: 'idle',
      hirame: 'desk-work',
      yukihiro: 'idle',
    };
    const cues = decorCuesOf(moods, [], 0, AT_SEAT);
    expect([...cues.working].toSorted(byName)).toEqual(['hirame', 'minori']);
    expect(cues.awaitingPresident).toBe(false);
    expect(cues.clearedAt).toEqual({});
  });

  it('knows the king waits while he fidgets', () => {
    expect(decorCuesOf({ yukihiro: 'fidget' }, [], 0, AT_SEAT).awaitingPresident).toBe(true);
    expect(decorCuesOf({}, [], 0, AT_SEAT).awaitingPresident).toBe(false);
  });

  it('keeps the latest confetti start for each member', () => {
    const cues = decorCuesOf(
      {},
      [
        { actor: 'sasae', start: 500 },
        { actor: 'sasae', start: 200 },
        { actor: 'minori', start: 100 },
      ],
      600,
      AT_SEAT,
    );
    expect(cues.clearedAt).toEqual({ sasae: 500, minori: 100 });
  });

  it('counts only the confetti flying now, not one still to come or one over', () => {
    const bursts = [
      { actor: 'hirame', start: 1_000 },
      { actor: 'hirame', start: 5_000 },
      { actor: 'sasae', start: 1_000 - CONFETTI.durationMs },
    ] as const;
    expect(decorCuesOf({}, bursts, 1_500, AT_SEAT).clearedAt).toEqual({ hirame: 1_000 });
    expect(decorCuesOf({}, bursts, 999, AT_SEAT).clearedAt).toEqual({
      sasae: 1_000 - CONFETTI.durationMs,
    });
    expect(decorCuesOf({}, bursts, 1_000, AT_SEAT).clearedAt).toEqual({ hirame: 1_000 });
    expect(decorCuesOf({}, bursts, 1_000 + CONFETTI.durationMs, AT_SEAT).clearedAt).toEqual({});
    expect(decorCuesOf({}, bursts, 5_000, AT_SEAT).clearedAt).toEqual({ hirame: 5_000 });
  });

  it('keeps a banner fluttering while a later confetti is still to come', () => {
    const bursts = [
      { actor: 'hirame', start: 1_000 },
      { actor: 'sasae', start: 2_000 },
    ] as const;
    const cues = decorCuesOf({}, bursts, 1_500, AT_SEAT);
    expect(activeSince({ kind: 'cleared', members: ['hirame', 'sasae'] }, cues)).toBe(1_000);
  });
});

describe('triggerOf', () => {
  it('ties each department’s thing to its member', () => {
    expect(triggerOf({ name: 'abacus', row: 5 })).toEqual({ kind: 'working', member: 'minori' });
    expect(triggerOf({ name: 'coin-pile', row: 5 })).toEqual({ kind: 'working', member: 'minori' });
    expect(triggerOf({ name: 'megaphone', row: 5 })).toEqual({ kind: 'working', member: 'hibiki' });
    expect(triggerOf({ name: 'globe', row: 11 })).toEqual({ kind: 'working', member: 'hirame' });
    expect(triggerOf({ name: 'file-stack', row: 11 })).toEqual({
      kind: 'working',
      member: 'sasae',
    });
  });

  it('leaves the key board by the door still: it is too far from ささえ to read as hers', () => {
    expect(triggerOf({ name: 'key-board', row: 12 })).toBeNull();
  });

  it('runs the hourglass for the king and flutters each banner for its side of the room', () => {
    expect(triggerOf({ name: 'hourglass', row: 11 })).toEqual({ kind: 'awaiting-president' });
    expect(triggerOf({ name: 'banner', row: 1 })).toEqual({
      kind: 'cleared',
      members: ['kaname', 'minori', 'hibiki'],
    });
    expect(triggerOf({ name: 'banner', row: 14 })).toEqual({
      kind: 'cleared',
      members: ['hirame', 'sasae'],
    });
  });

  it('has no trigger for things that always move or never do', () => {
    expect(triggerOf({ name: 'lantern', row: 13 })).toBeNull();
    expect(triggerOf({ name: 'sleeping-poodle', row: 3 })).toBeNull();
    expect(triggerOf({ name: 'jar', row: 8 })).toBeNull();
  });

  it('gives every department one moving thing at least, and both banners in the room a side', () => {
    const triggers = DECOR_PLACEMENTS.map(triggerOf);
    for (const member of ['minori', 'hibiki', 'hirame', 'sasae'] as const) {
      expect(triggers).toContainEqual({ kind: 'working', member });
    }
    const banners = DECOR_PLACEMENTS.filter((p) => p.name === 'banner').map(triggerOf);
    const sides = banners.flatMap((t) => (t?.kind === 'cleared' ? t.members : []));
    expect(sides.toSorted(byName)).toEqual(['hibiki', 'hirame', 'kaname', 'minori', 'sasae']);
  });
});

describe('activeSince', () => {
  const cues: DecorCues = {
    working: new Set(['hibiki']),
    awaitingPresident: true,
    clearedAt: { minori: 300, kaname: 900, sasae: 50 },
    petCompany: false,
    petted: false,
  };

  it('always moves a thing with no trigger', () => {
    expect(activeSince(null, NO_CUES)).toBe(0);
  });

  it('moves a department’s thing only while its member works', () => {
    expect(activeSince({ kind: 'working', member: 'hibiki' }, cues)).toBe(0);
    expect(activeSince({ kind: 'working', member: 'minori' }, cues)).toBeNull();
    expect(activeSince({ kind: 'working', member: 'hibiki' }, NO_CUES)).toBeNull();
  });

  it('runs the hourglass only while the king waits', () => {
    expect(activeSince({ kind: 'awaiting-president' }, cues)).toBe(0);
    expect(activeSince({ kind: 'awaiting-president' }, NO_CUES)).toBeNull();
  });

  it('flutters a banner from the latest confetti on its side, not the other side', () => {
    expect(activeSince({ kind: 'cleared', members: ['kaname', 'minori'] }, cues)).toBe(900);
    expect(activeSince({ kind: 'cleared', members: ['sasae'] }, cues)).toBe(50);
    expect(activeSince({ kind: 'cleared', members: ['hirame'] }, cues)).toBeNull();
  });
});

describe('hashStep', () => {
  it('is in [0, 1), fixed per step and spread out', () => {
    const values = Array.from({ length: 200 }, (_, step) => hashStep(step));
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(hashStep(42)).toBe(hashStep(42));
    expect(new Set(values).size).toBe(values.length);
    const low = values.filter((v) => v < 0.5).length;
    expect(low).toBeGreaterThan(70);
    expect(low).toBeLessThan(130);
  });
});

describe('glintAt', () => {
  const points = GLINT_POINTS.abacus ?? [];

  it('shows a glint on one of the given points, inside the picture, now and then', () => {
    let shown = 0;
    const steps = 200;
    for (let step = 0; step < steps; step += 1) {
      const glint = glintAt(points, 0, step * TRINKETS.sparkleStepMs + 100);
      if (glint === null) continue;
      shown += 1;
      expect(points).toContainEqual({ x: glint.x, y: glint.y });
      expect([3, 6]).toContain(glint.arm);
    }
    expect(shown / steps).toBeGreaterThan(TRINKETS.sparkleShare - 0.15);
    expect(shown / steps).toBeLessThan(TRINKETS.sparkleShare + 0.15);
  });

  it('shows nothing after the glint’s time in each step', () => {
    for (let step = 0; step < 50; step += 1) {
      const t = step * TRINKETS.sparkleStepMs + TRINKETS.sparkleShowMs;
      expect(glintAt(points, 0, t)).toBeNull();
    }
  });

  it('grows the glint in the middle of its time', () => {
    const step = Array.from({ length: 50 }, (_, s) => s).find(
      (s) => glintAt(points, 0, s * TRINKETS.sparkleStepMs) !== null,
    );
    expect(step).toBeDefined();
    const start = (step ?? 0) * TRINKETS.sparkleStepMs;
    expect(glintAt(points, 0, start)?.arm).toBe(3);
    expect(glintAt(points, 0, start + TRINKETS.sparkleShowMs / 2)?.arm).toBe(6);
  });

  it('shows nothing with no points', () => {
    for (let t = 0; t < 20_000; t += 70) expect(glintAt([], 0, t)).toBeNull();
  });

  it('keeps every glint point inside its picture', () => {
    for (const [name, list] of Object.entries(GLINT_POINTS)) {
      expect(name in DECOR).toBe(true);
      for (const p of list) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(PICTURE);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(PICTURE);
      }
    }
  });
});

describe('notesAt', () => {
  it('has up to two notes in the air, rising and drifting left from the bell', () => {
    for (let t = 0; t < 10_000; t += 70) {
      const notes = notesAt(0, t);
      expect(notes.length).toBeGreaterThanOrEqual(1);
      expect(notes.length).toBeLessThanOrEqual(2);
      for (const note of notes) {
        expect(note.y).toBeLessThanOrEqual(MEGAPHONE_MOUTH.y);
        expect(note.y).toBeGreaterThanOrEqual(MEGAPHONE_MOUTH.y - TRINKETS.noteRisePx);
        expect(note.x).toBeLessThanOrEqual(MEGAPHONE_MOUTH.x);
        expect(note.x).toBeGreaterThanOrEqual(MEGAPHONE_MOUTH.x - TRINKETS.noteDriftPx - 2);
      }
    }
  });

  it('moves a note up as it ages', () => {
    const [young] = notesAt(0, 10);
    const [old] = notesAt(0, TRINKETS.noteEveryMs - 10);
    expect(young?.y).toBe(MEGAPHONE_MOUTH.y);
    expect(old?.y).toBeLessThan(young?.y ?? 0);
  });

  it('sends "!" now and then among the notes', () => {
    const kinds = new Set<string>();
    for (let index = 0; index < 60; index += 1) {
      for (const note of notesAt(0, index * TRINKETS.noteEveryMs)) kinds.add(note.kind);
    }
    expect([...kinds].toSorted(byName)).toEqual(['bang', 'note']);
  });
});

describe('spinBandAt', () => {
  it('crosses the globe’s body from left to right once per turn', () => {
    let previous = spinBandAt(0, 0);
    expect(previous).toBe(GLOBE_BODY.left);
    for (let t = 20; t < TRINKETS.spinMs; t += 20) {
      const left = spinBandAt(0, t);
      expect(left).toBeGreaterThanOrEqual(previous);
      expect(left + TRINKETS.spinBandPx).toBeLessThanOrEqual(GLOBE_BODY.right);
      previous = left;
    }
    expect(previous).toBe(GLOBE_BODY.right - TRINKETS.spinBandPx);
    expect(spinBandAt(0, TRINKETS.spinMs)).toBe(GLOBE_BODY.left);
    expect(spinBandAt(TRINKETS.spinMs / 2, 0)).toBe(spinBandAt(0, TRINKETS.spinMs / 2));
  });
});

describe('sandGrainAt', () => {
  it('drops the grain down the stream, then starts again at the top', () => {
    const length = SAND_STREAM.bottom - SAND_STREAM.top;
    expect(sandGrainAt(0, 0)).toBe(0);
    expect(sandGrainAt(0, TRINKETS.sandMs - 1)).toBe(length - 1);
    expect(sandGrainAt(0, TRINKETS.sandMs)).toBe(0);
    for (let t = 0; t < 3 * TRINKETS.sandMs; t += 30) {
      expect(sandGrainAt(0, t)).toBeGreaterThanOrEqual(0);
      expect(sandGrainAt(0, t)).toBeLessThan(length);
    }
  });
});

describe('waveAt', () => {
  it('keeps the rod still and moves the hem most', () => {
    for (let t = 0; t < CONFETTI.durationMs; t += 40) expect(waveAt(0, t)).toBe(0);
    const hem = Array.from({ length: 30 }, (_, i) => Math.abs(waveAt(1, i * 40)));
    expect(Math.max(...hem)).toBe(TRINKETS.wavePx);
  });

  it('dies out with the confetti and does nothing outside it', () => {
    expect(waveAt(1, -1)).toBe(0);
    expect(waveAt(1, CONFETTI.durationMs)).toBe(0);
    const late = CONFETTI.durationMs - 100;
    for (let t = late; t < CONFETTI.durationMs; t += 10) {
      expect(Math.abs(waveAt(1, t))).toBeLessThanOrEqual(1);
    }
  });
});

describe('petAwakeAt', () => {
  it('wakes up for 1.68 s once every 21 s (docs/DESIGN.md 8)', () => {
    expect(TRINKETS.petIntervalMs).toBe(21_000);
    expect(TRINKETS.petSitMs).toBe(1_680);
  });

  it('sits up at the start of each cycle, then sleeps for the rest of it', () => {
    expect(petAwakeAt(0, 0)).toBe(true);
    expect(petAwakeAt(0, TRINKETS.petSitMs - 1)).toBe(true);
    expect(petAwakeAt(0, TRINKETS.petSitMs)).toBe(false);
    expect(petAwakeAt(0, TRINKETS.petIntervalMs - 1)).toBe(false);
    expect(petAwakeAt(0, TRINKETS.petIntervalMs)).toBe(true);
  });

  it('shifts the cycle by the phase', () => {
    expect(petAwakeAt(TRINKETS.petSitMs, 0)).toBe(false);
    expect(petAwakeAt(TRINKETS.petIntervalMs - 1, 1)).toBe(true);
  });

  it('sleeps most of the time', () => {
    let awake = 0;
    for (let t = 0; t < TRINKETS.petIntervalMs; t += 10) {
      if (petAwakeAt(0, t)) awake += 1;
    }
    expect(awake / (TRINKETS.petIntervalMs / 10)).toBeLessThan(0.15);
  });
});

describe('petPoseAt', () => {
  it('draws the awake poodle sitting still while it is up', () => {
    for (let t = 0; t < TRINKETS.petSitMs; t += 10) {
      expect(petPoseAt('sleeping-poodle', 0, t, false)).toEqual({ name: PET_AWAKE_DECOR, dy: 0 });
    }
  });

  it('draws the sleeping picture breathing (1 px) while it sleeps', () => {
    const rises = new Set<number>();
    for (let t: number = TRINKETS.petSitMs; t < TRINKETS.petIntervalMs; t += 10) {
      const pose = petPoseAt('sleeping-poodle', 0, t, false);
      expect(pose).toEqual({ name: 'sleeping-poodle', dy: decorPose('breath', 0, t).dy });
      rises.add(pose.dy);
    }
    expect([...rises].toSorted((a, b) => a - b)).toEqual([-AMBIENT.breathPx, 0]);
  });

  it('uses the same phase for waking and for breathing', () => {
    const phase = 3_770;
    const up = TRINKETS.petIntervalMs - phase;
    expect(petPoseAt('sleeping-poodle', phase, up - 1, false)).toEqual({
      name: 'sleeping-poodle',
      dy: decorPose('breath', phase, up - 1).dy,
    });
    expect(petPoseAt('sleeping-poodle', phase, up, false)).toEqual({
      name: PET_AWAKE_DECOR,
      dy: 0,
    });
    const down = up + TRINKETS.petSitMs;
    expect(petPoseAt('sleeping-poodle', phase, down - 1, false).name).toBe(PET_AWAKE_DECOR);
    expect(petPoseAt('sleeping-poodle', phase, down, false)).toEqual({
      name: 'sleeping-poodle',
      dy: decorPose('breath', phase, down).dy,
    });
    // The breath has its own phase too: shifting it changes the rise at the same moment.
    const rises = new Set<number>();
    for (let t = down; t < down + AMBIENT.breathMs; t += 10) {
      rises.add(
        petPoseAt('sleeping-poodle', phase, t, false).dy -
          petPoseAt('sleeping-poodle', 0, t, false).dy,
      );
    }
    expect(rises.size).toBeGreaterThan(1);
  });

  it('wakes into a picture that is on the sheet', () => {
    expect(PET_AWAKE_DECOR).toBe('awake-poodle');
    expect(DECOR[PET_AWAKE_DECOR]).toBeDefined();
  });
});

describe('patchAt', () => {
  it('moves the patches from left in the morning to right in the evening', () => {
    expect(patchAt(6, 1, 0).dx).toBe(-TRINKETS.patchDriftPx);
    expect(patchAt(12, 1, 0).dx).toBe(0);
    expect(patchAt(18, 1, 0).dx).toBe(TRINKETS.patchDriftPx);
    expect(patchAt(2, 1, 0).dx).toBe(-TRINKETS.patchDriftPx);
    expect(patchAt(23, 1, 0).dx).toBe(TRINKETS.patchDriftPx);
  });

  it('sways a little over time', () => {
    const quarter = TRINKETS.patchSwayMs / 4;
    expect(patchAt(12, 1, quarter).dx).toBe(TRINKETS.patchSwayPx);
    expect(patchAt(12, 1, 3 * quarter).dx).toBe(-TRINKETS.patchSwayPx);
  });

  it('fades with the sun and keeps the alpha in [0, 1]', () => {
    expect(patchAt(12, 1, 0).alpha).toBe(1);
    expect(patchAt(22, 0, 0).alpha).toBe(0);
    expect(patchAt(12, 1.5, 0).alpha).toBe(1);
    expect(patchAt(12, -0.5, 0).alpha).toBe(0);
  });

  it('never slides a patch onto furniture or the things in the room', () => {
    const reach = TRINKETS.patchDriftPx + TRINKETS.patchSwayPx;
    const others = [...BACK_OBJECTS, ...DECOR_PLACEMENTS.filter((d) => d.name !== 'light-patch')];
    for (const patch of FLOOR_PATCH_DECOR) {
      const left = patch.col * TILE_SIZE - reach;
      const right = (patch.col + patch.w) * TILE_SIZE + reach;
      const top = patch.row * TILE_SIZE;
      const bottom = (patch.row + patch.h) * TILE_SIZE;
      for (const o of others) {
        const overlaps =
          left < (o.col + o.w) * TILE_SIZE &&
          o.col * TILE_SIZE < right &&
          top < (o.row + o.h) * TILE_SIZE &&
          o.row * TILE_SIZE < bottom;
        expect(overlaps).toBe(false);
      }
    }
  });
});
