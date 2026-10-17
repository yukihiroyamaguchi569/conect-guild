import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import { linesOf } from './lineBook';
import { createLinePicker, type PickLine } from './lines';
import { LINES } from './metrics';
import {
  murmurMoment,
  murmursAt,
  NO_MURMURS,
  seenMurmurs,
  stepMurmurs,
  type MurmurCandidate,
  type MurmurMember,
  type MurmurMoment,
  type MurmurParty,
  type Murmurs,
} from './murmurs';

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

const say: PickLine = (actor, scene) => linesOf(actor, scene)[0] ?? null;

function moment(t: number, extra: Partial<MurmurMoment> = {}): MurmurMoment {
  return {
    t,
    off: false,
    busy: false,
    candidates: () => [{ id: 'minori', scene: 'work' }],
    hushed: () => false,
    random: () => 0,
    pick: say,
    ...extra,
  };
}

/** Murmurs whose next is due at `next`. */
const due = (next: number): Murmurs => ({ ...NO_MURMURS, next });

describe('stepMurmurs: when', () => {
  it('plans the first murmur a gap after the first frame, and says nothing yet', () => {
    const first = stepMurmurs(NO_MURMURS, moment(1_000));
    expect(first).toEqual({ next: 41_000, said: null, last: null, busy: false });
  });

  it('says nothing a ms before the time, and a line from the time on', () => {
    expect(stepMurmurs(due(41_000), moment(40_999)).said).toBeNull();
    expect(stepMurmurs(due(41_000), moment(41_000)).said).toEqual({
      actor: 'minori',
      line: 'ぱちぱち…',
      start: 41_000,
      end: 41_000 + LINES.murmurMs,
    });
  });

  it('shows a murmur LINES.murmurMs, then plans the next a gap after its end', () => {
    expect(LINES.murmurMs).toBe(2_400);
    const said = stepMurmurs(due(0), moment(0));
    expect(said.next).toBe(2_400 + 40_000);
    expect(murmursAt(said, 2_399)).toEqual({ minori: 'ぱちぱち…' });
    expect(murmursAt(said, 2_400)).toEqual({});
    const over = stepMurmurs(said, moment(2_400));
    expect(over.said).toBeNull();
    const hibiki = () => [{ id: 'hibiki', scene: 'idle' } as const];
    expect(stepMurmurs(over, moment(42_399, { candidates: hibiki })).said).toBeNull();
    expect(stepMurmurs(over, moment(42_400, { candidates: hibiki })).said?.start).toBe(42_400);
  });

  it('asks who may murmur only when one is due', () => {
    let asked = 0;
    const candidates = () => {
      asked += 1;
      return [{ id: 'minori', scene: 'work' } as const];
    };
    stepMurmurs(due(5_000), moment(4_999, { candidates }));
    expect(asked).toBe(0);
    stepMurmurs(due(5_000), moment(5_000, { candidates }));
    expect(asked).toBe(1);
  });

  it('says nothing when nobody may, and tries again a gap later', () => {
    const none = stepMurmurs(due(5_000), moment(5_000, { candidates: () => [] }));
    expect(none).toEqual({ next: 45_000, said: null, last: null, busy: false });
  });

  it('says nothing when the one chosen has nothing to say, nor without a picker', () => {
    expect(stepMurmurs(due(0), moment(0, { pick: () => null })).said).toBeNull();
    expect(stepMurmurs(due(0), moment(0, { pick: undefined })).said).toBeNull();
  });
});

describe('stepMurmurs: one at a time, and not the same one twice', () => {
  it('nobody else murmurs while one shows', () => {
    const said = stepMurmurs(due(0), moment(0));
    const meanwhile = stepMurmurs(
      { ...said, next: 1_000 },
      moment(1_000, { candidates: () => [{ id: 'hibiki', scene: 'idle' }] }),
    );
    expect(meanwhile.said).toBe(said.said);
    expect(murmursAt(meanwhile, 1_000)).toEqual({ minori: 'ぱちぱち…' });
  });

  it('the next one is another member', () => {
    const both = () => [
      { id: 'minori', scene: 'work' } as const,
      { id: 'hibiki', scene: 'idle' } as const,
    ];
    const first = stepMurmurs(due(0), moment(0, { candidates: both }));
    const second = stepMurmurs(first, moment(first.next ?? 0, { candidates: both }));
    expect([first.said?.actor, second.said?.actor]).toEqual(['minori', 'hibiki']);
    expect(second.last).toBe('hibiki');
  });
});

describe('stepMurmurs: put off by a scene, a call or a remark', () => {
  it('a busy frame keeps a due murmur back; the first quiet frame puts it LINES.murmurRestMs on', () => {
    expect(LINES.murmurRestMs).toBe(2_000);
    const busy = stepMurmurs(due(10_000), moment(10_000, { busy: true }));
    expect(busy).toEqual({ next: 10_000, said: null, last: null, busy: true });
    const still = stepMurmurs(busy, moment(11_000, { busy: true }));
    expect(still.said).toBeNull();
    const quiet = stepMurmurs(still, moment(11_140));
    expect(quiet).toEqual({ next: 13_140, said: null, last: null, busy: false });
    expect(stepMurmurs(quiet, moment(13_139)).said).toBeNull();
    expect(stepMurmurs(quiet, moment(13_140)).said?.start).toBe(13_140);
  });

  it('waits LINES.murmurRestMs from the first quiet frame, however long after the last busy one', () => {
    // Codex review: the rest was counted from the last busy frame, so a quiet frame long after it
    // could say a murmur at once.
    const busy = stepMurmurs(due(10_000), moment(10_000, { busy: true }));
    const quiet = stepMurmurs(busy, moment(11_900));
    expect(quiet.said).toBeNull();
    expect(quiet.next).toBe(13_900);
  });

  it('leaves a murmur due later where it is', () => {
    const busy = stepMurmurs(due(60_000), moment(10_000, { busy: true }));
    expect(stepMurmurs(busy, moment(10_140)).next).toBe(60_000);
  });

  it('puts nothing off when no frame was busy', () => {
    expect(stepMurmurs(due(10_000), moment(10_000)).said?.start).toBe(10_000);
  });

  it('drops the murmur showing when a scene starts', () => {
    const said = stepMurmurs(due(0), moment(0));
    const busy = stepMurmurs(said, moment(1_000, { busy: true }));
    expect(busy.said).toBeNull();
    expect(murmursAt(busy, 1_000)).toEqual({});
    // Still the one who spoke last.
    expect(busy.last).toBe('minori');
  });
});

describe('stepMurmurs: off', () => {
  it('forgets everything while off (before the first snapshot, halted)', () => {
    const said = stepMurmurs(due(0), moment(0));
    expect(stepMurmurs(said, moment(1_000, { off: true }))).toBe(NO_MURMURS);
    expect(murmursAt(stepMurmurs(said, moment(1_000, { off: true })), 1_000)).toEqual({});
  });

  it('draws nothing and asks nobody while off', () => {
    const { random, draws } = counting(0);
    let asked = 0;
    const candidates = () => {
      asked += 1;
      return [];
    };
    stepMurmurs(due(0), moment(0, { off: true, random, candidates }));
    expect([draws(), asked]).toEqual([0, 0]);
  });

  it('plans anew from the first frame after a halt', () => {
    const off = stepMurmurs(due(0), moment(0, { off: true }));
    expect(stepMurmurs(off, moment(500_000)).next).toBe(540_000);
  });
});

describe('murmurMoment', () => {
  const frame = {
    t: 5,
    hour: NOON,
    party: { bubbles: {}, idleSince: { hibiki: 0 }, kingQuests: 0, known: true, halted: false },
    members: [seat('hibiki')],
    busy: false,
  };
  const talk = { random: () => 0, pick: say };

  it('is off before the first snapshot and while halted', () => {
    const idle = () => ({ activities: {}, wall: WALL });
    expect(murmurMoment(frame, idle, talk).off).toBe(false);
    const unknown = { ...frame, party: { ...frame.party, known: false } };
    expect(murmurMoment(unknown, idle, talk).off).toBe(true);
    const halted = { ...frame, party: { ...frame.party, halted: true } };
    expect(murmurMoment(halted, idle, talk).off).toBe(true);
  });

  it('reads the long idle spells only when asked who may murmur', () => {
    let read = 0;
    const idle = () => {
      read += 1;
      return { activities: { hibiki: { kind: 'doze' } as const }, wall: WALL };
    };
    const built = murmurMoment(frame, idle, talk);
    expect(read).toBe(0);
    expect(built.candidates()).toEqual([{ id: 'hibiki', scene: 'doze' }]);
    expect(read).toBe(1);
  });
});

describe('seenMurmurs: only a murmur seen counts as said', () => {
  const said = stepMurmurs(due(1_000), moment(1_000));
  const frame = (t: number, extra: Partial<MurmurParty> = {}, inScene = false) => ({
    t,
    party: { ...PARTY, ...extra },
    members: [{ ...seat('minori'), inScene }],
  });
  const none = { speeches: {} };

  it('sees the murmur while it shows over the head, and not before or after', () => {
    expect(seenMurmurs(said, frame(999), none)).toEqual([]);
    expect(seenMurmurs(said, frame(1_000), none)).toEqual([said.said]);
    expect(seenMurmurs(said, frame(1_000 + LINES.murmurMs - 1), none)).toEqual([said.said]);
    expect(seenMurmurs(said, frame(1_000 + LINES.murmurMs), none)).toEqual([]);
    expect(seenMurmurs(NO_MURMURS, frame(1_000), none)).toEqual([]);
  });

  it('does not see it under what is over it: a scene, the king’s call, a waiting bubble', () => {
    expect(seenMurmurs(said, frame(1_500, {}, true), none)).toEqual([]);
    expect(seenMurmurs(said, frame(1_500), { speeches: { minori: 'はっ！' } })).toEqual([]);
    const waiting = frame(1_500, { bubbles: { minori: 'awaiting-permission' } });
    expect(seenMurmurs(said, waiting, none)).toEqual([]);
    // Someone else's bubble hides nothing of hers.
    expect(
      seenMurmurs(said, frame(1_500, { bubbles: { hibiki: 'awaiting-permission' } }), none),
    ).toEqual([said.said]);
  });

  it('a murmur nobody saw may be said again next time', () => {
    const picker = createLinePicker(() => 0);
    const first = picker.pick('minori', 'work', []);
    // Hidden all along by a waiting bubble: never seen.
    picker.saw([], 1_000);
    expect(picker.pick('minori', 'work', [])).toBe(first);
    if (first === null) throw new Error('no line');
    picker.saw([{ actor: 'minori', line: first, start: 2_000, end: 4_400 }], 2_000);
    expect(picker.pick('minori', 'work', [])).not.toBe(first);
  });
});

describe('stepMurmurs: a long run', () => {
  const MEMBERS: readonly MemberId[] = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae'];
  const everyone = () => MEMBERS.map((id): MurmurCandidate => ({ id, scene: 'work' }));

  it.each([1, 2, 3])(
    'seed %i: gaps of 40 to 90 s, one at a time, never the same member or line twice in a row',
    (seed) => {
      const random = seeded(seed);
      const picker = createLinePicker(random);
      let murmurs = NO_MURMURS;
      const said: { actor: MemberId; line: string; start: number }[] = [];
      for (let t = 0; t < 3 * 3_600_000; t += 140) {
        murmurs = stepMurmurs(
          murmurs,
          moment(t, { candidates: everyone, random, pick: picker.pick }),
        );
        const now = murmurs.said;
        picker.saw(now === null ? [] : [now], t);
        if (now !== null && now.start === t) said.push(now);
        expect(Object.keys(murmursAt(murmurs, t)).length).toBeLessThanOrEqual(1);
      }
      expect(said.length).toBeGreaterThan(100);
      for (let i = 1; i < said.length; i += 1) {
        const [before, after] = [said[i - 1], said[i]];
        if (before === undefined || after === undefined) continue;
        const gap = after.start - (before.start + LINES.murmurMs);
        expect(gap).toBeGreaterThanOrEqual(40_000);
        // The frames come every 140 ms: a murmur is said on the first one at or after its time.
        expect(gap).toBeLessThan(90_000 + 140);
        expect(after.actor).not.toBe(before.actor);
      }
      for (const id of MEMBERS) {
        const lines = said.filter((s) => s.actor === id).map((s) => s.line);
        for (let i = 1; i < lines.length; i += 1) expect(lines[i]).not.toBe(lines[i - 1]);
      }
    },
  );
});
