import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import type { IdleActivity } from './idle';
import { PLAY_SPOTS, type PlayKind } from './idleSpots';
import type { LineScene } from './lineBook';
import { LINES } from './metrics';
import { walkSegment } from './motion';
import {
  chooseSpeaker,
  kingQuestCountOf,
  murmurCandidates,
  murmurGap,
  murmurSceneOf,
  playScene,
  type MurmurCandidate,
  type MurmurMember,
  type MurmurParty,
} from './murmurs';

/** Who may murmur, at what, and who is chosen (murmurs.ts); the timing is in murmurs.test.ts. */

/** A small repeatable generator (mulberry32) for long runs. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Counts the numbers drawn from `value`. */
function counting(value: number): { random: () => number; draws: () => number } {
  let draws = 0;
  return {
    random: () => {
      draws += 1;
      return value;
    },
    draws: () => draws,
  };
}

const NOON = 12;
const WALL = 1_000_000;

const PARTY: MurmurParty = {
  bubbles: {},
  idleSince: {},
  activities: {},
  wall: WALL,
  hour: NOON,
  kingQuests: 0,
};

const seat = (id: MemberId): MurmurMember => ({ id, inScene: false, atSeat: true });

/** An outing of `id` to their `kind` spot: out from `start`, staying 10 s, then back. */
function outing(id: MemberId, kind: PlayKind, start: number): IdleActivity {
  const spot = PLAY_SPOTS[id].find((s) => s.kind === kind);
  if (spot === undefined) throw new Error(`${id} has no ${kind} spot`);
  const out = walkSegment(spot.path, start);
  return { kind: 'play', outing: { spot, out, back: walkSegment(spot.path, out.end + 10_000) } };
}

describe('playScene', () => {
  it.each<[PlayKind, LineScene]>([
    ['tea', 'tea'],
    ['pet', 'pet'],
    ['chat', 'chat'],
  ])('%s: the lines of the spot at any hour', (kind, scene) => {
    for (const hour of [0, 6, 12, 18]) expect(playScene(kind, hour)).toBe(scene);
  });

  it.each<[number, LineScene]>([
    [4.99, 'windowNight'],
    [5, 'windowMorning'],
    [8.99, 'windowMorning'],
    [9, 'windowDay'],
    [16.49, 'windowDay'],
    [16.5, 'windowEvening'],
    [18.99, 'windowEvening'],
    [19, 'windowNight'],
    [23.5, 'windowNight'],
  ])('the window at %f h: %s', (hour, scene) => {
    expect(playScene('window', hour)).toBe(scene);
  });
});

describe('murmurSceneOf', () => {
  it('desk work for a member with work at the seat, idle talk for one with nothing to do', () => {
    expect(murmurSceneOf(seat('minori'), PARTY)).toBe('work');
    expect(murmurSceneOf(seat('minori'), { ...PARTY, idleSince: { minori: 0 } })).toBe('idle');
    expect(murmurSceneOf(seat('kaname'), { ...PARTY, idleSince: { kaname: 0 } })).toBe('idle');
  });

  it('says nothing in a scene, with a waiting bubble, or away from the seat on no outing', () => {
    expect(murmurSceneOf({ ...seat('hibiki'), inScene: true }, PARTY)).toBeNull();
    const waiting = { ...PARTY, bubbles: { hibiki: 'awaiting-permission' as const } };
    expect(murmurSceneOf(seat('hibiki'), waiting)).toBeNull();
    expect(murmurSceneOf({ ...seat('hibiki'), atSeat: false }, PARTY)).toBeNull();
  });

  it('lets the king murmur only with nothing to approve (his 承認まち bubble is up otherwise)', () => {
    expect(murmurSceneOf(seat('yukihiro'), PARTY)).toBeNull();
    expect(murmurSceneOf(seat('yukihiro'), { ...PARTY, idleSince: { yukihiro: 0 } })).toBe('idle');
  });

  it('dozing and sleeping members (the king too) doze and talk in their sleep', () => {
    const party: MurmurParty = {
      ...PARTY,
      idleSince: { sasae: 0, yukihiro: 0 },
      activities: { sasae: { kind: 'doze' }, yukihiro: { kind: 'sleep' } },
    };
    expect(murmurSceneOf(seat('sasae'), party)).toBe('doze');
    expect(murmurSceneOf(seat('yukihiro'), party)).toBe('sleepTalk');
  });

  it('a member out playing murmurs only while staying at the spot, not on the way', () => {
    const play = outing('hirame', 'tea', WALL);
    if (play.kind !== 'play') throw new Error('not an outing');
    const { out, back } = play.outing;
    const at = (wall: number) =>
      murmurSceneOf(
        { id: 'hirame', inScene: false, atSeat: false },
        { ...PARTY, idleSince: { hirame: 0 }, activities: { hirame: play }, wall },
      );
    expect(at(out.start)).toBeNull();
    expect(at(out.end - 1)).toBeNull();
    expect(at(out.end)).toBe('tea');
    expect(at(back.start - 1)).toBe('tea');
    expect(at(back.start)).toBeNull();
  });

  it('under the window, by the hour', () => {
    const play = outing('minori', 'window', 0);
    if (play.kind !== 'play') throw new Error('not an outing');
    const party = (hour: number): MurmurParty => ({
      ...PARTY,
      idleSince: { minori: 0 },
      activities: { minori: play },
      wall: play.outing.out.end,
      hour,
    });
    expect(murmurSceneOf(seat('minori'), party(7))).toBe('windowMorning');
    expect(murmurSceneOf(seat('minori'), party(22))).toBe('windowNight');
  });
});

describe('murmurSceneOf: the king’s work (Issue #151)', () => {
  it('lets the king murmur of his work with quests open, of their pile from 3 (Issue #151)', () => {
    const awake = { ...PARTY, idleSince: { yukihiro: 0 } };
    expect(LINES.kingPiledQuests).toBe(3);
    const sceneWith = (kingQuests: number) =>
      murmurSceneOf(seat('yukihiro'), { ...awake, kingQuests });
    expect([0, 1, 2, 3, 9].map(sceneWith)).toEqual([
      'idle',
      'kingWork',
      'kingWork',
      'kingWorkPiled',
      'kingWorkPiled',
    ]);
    // Not with something to approve, nor in a scene; the members' talk does not follow his quests.
    expect(murmurSceneOf(seat('yukihiro'), { ...PARTY, kingQuests: 2 })).toBeNull();
    expect(
      murmurSceneOf({ ...seat('yukihiro'), inScene: true }, { ...awake, kingQuests: 2 }),
    ).toBeNull();
    expect(
      murmurSceneOf(seat('minori'), { ...PARTY, idleSince: { minori: 0 }, kingQuests: 2 }),
    ).toBe('idle');
  });

  it('reads the king’s open quests from the party rows, 0 without his row', () => {
    expect(
      kingQuestCountOf([
        { id: 'minori', quests: 0 },
        { id: 'yukihiro', quests: 4 },
      ]),
    ).toBe(4);
    expect(kingQuestCountOf([{ id: 'minori', quests: 0 }])).toBe(0);
  });
});

describe('murmurCandidates', () => {
  it('keeps those who may murmur, in order, with what they would say', () => {
    const members = (['kaname', 'minori', 'hibiki', 'yukihiro'] as const).map(seat);
    const party: MurmurParty = {
      ...PARTY,
      bubbles: { minori: 'awaiting-kaname' },
      idleSince: { hibiki: 0 },
    };
    expect(murmurCandidates(members, party)).toEqual([
      { id: 'kaname', scene: 'work' },
      { id: 'hibiki', scene: 'idle' },
    ]);
  });
});

describe('chooseSpeaker', () => {
  const awake: MurmurCandidate = { id: 'hibiki', scene: 'idle' };
  const asleep: MurmurCandidate = { id: 'sasae', scene: 'sleepTalk' };
  const working: MurmurCandidate = { id: 'minori', scene: 'work' };

  it('chooses evenly among those awake', () => {
    const all = [working, awake];
    expect(chooseSpeaker(all, null, () => 0)).toBe(working);
    expect(chooseSpeaker(all, null, () => 0.49)).toBe(working);
    expect(chooseSpeaker(all, null, () => 0.5)).toBe(awake);
    expect(chooseSpeaker(all, null, () => 0.9999)).toBe(awake);
  });

  it('weighs a sleeper LINES.sleepTalkWeight against 1 for anyone awake', () => {
    const all = [asleep, awake];
    // 1.3 in all: under 0.3 is the sleeper's.
    expect(chooseSpeaker(all, null, () => 0.29 / 1.3)).toBe(asleep);
    expect(chooseSpeaker(all, null, () => 0.31 / 1.3)).toBe(awake);
  });

  it('a sleeper comes about 0.3 times as often as one awake over a long run', () => {
    const random = seeded(3);
    let sleeps = 0;
    for (let i = 0; i < 13_000; i += 1) {
      if (chooseSpeaker([asleep, awake], null, random) === asleep) sleeps += 1;
    }
    expect(sleeps / 13_000).toBeCloseTo(0.3 / 1.3, 1);
  });

  it('never the one who murmured last', () => {
    for (const value of [0, 0.5, 0.9999]) {
      expect(chooseSpeaker([working, awake], 'minori', () => value)).toBe(awake);
    }
  });

  it('nobody, and no number drawn, when nobody else may', () => {
    const { random, draws } = counting(0);
    expect(chooseSpeaker([working], 'minori', random)).toBeNull();
    expect(chooseSpeaker([], null, random)).toBeNull();
    expect(draws()).toBe(0);
  });

  it('never past the last one, even for a random number of 1', () => {
    expect(chooseSpeaker([working, awake], null, () => 1)).toBe(awake);
  });
});

describe('murmurGap', () => {
  it('waits LINES.murmurGapMinMs to LINES.murmurGapMaxMs', () => {
    expect([LINES.murmurGapMinMs, LINES.murmurGapMaxMs]).toEqual([40_000, 90_000]);
    expect(murmurGap(() => 0)).toBe(40_000);
    expect(murmurGap(() => 0.5)).toBe(65_000);
    expect(murmurGap(() => 0.99999)).toBe(90_000);
    expect(murmurGap(() => 1)).toBe(90_000);
  });
});
