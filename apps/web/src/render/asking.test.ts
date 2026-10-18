import { describe, expect, it, vi } from 'vitest';
import type { MemberId } from '../guild.config';
import { askSceneOf, createAsking, type AskMoment, type AskParty } from './asking';
import { EMPTY_DIRECTOR, type Director, type MemberPose } from './director';
import { plannedOuting, type IdleActivity, type Outing } from './idle';
import { linesOf } from './lineBook';
import { createLinePicker, type Utterance } from './lines';
import { LINES } from './metrics';
import { NO_REMARKS, type Remarks } from './remarks';

/** A member clicked (Issue #191): what they answer, and when the click is dropped. */

const FREE: AskMoment = {
  halted: false,
  known: true,
  paused: false,
  calling: false,
  inScene: false,
  atSeat: true,
  speaking: false,
  waiting: false,
  restful: false,
  activity: undefined,
  wall: 0,
};

/** An outing of `id` to some spot, its salt found by search. */
function outingOf(id: MemberId): Outing {
  for (let salt = 0; salt < 100_000; salt += 1) {
    const outing = plannedOuting(id, salt, 7_000_000);
    if (outing !== null) return outing;
  }
  throw new Error(`no outing for ${id}`);
}

const OUTING = outingOf('hibiki');
const PLAY: IdleActivity = { kind: 'play', outing: OUTING };

describe('askSceneOf', () => {
  it('answers by what the member does at the seat', () => {
    expect(askSceneOf(FREE)).toBe('askWork');
    expect(askSceneOf({ ...FREE, restful: true })).toBe('askIdle');
    expect(askSceneOf({ ...FREE, waiting: true })).toBe('askWait');
    expect(askSceneOf({ ...FREE, restful: true, activity: { kind: 'doze' } })).toBe('askDoze');
    expect(askSceneOf({ ...FREE, restful: true, activity: { kind: 'sleep' } })).toBe('askSleep');
  });

  it('answers at a play spot only while staying there, not on the way', () => {
    const away = { ...FREE, restful: true, atSeat: false, activity: PLAY };
    expect(askSceneOf({ ...away, wall: OUTING.out.end })).toBe('askPlay');
    expect(askSceneOf({ ...away, wall: OUTING.back.start - 1 })).toBe('askPlay');
    expect(askSceneOf({ ...away, wall: OUTING.out.end - 1 })).toBeNull();
    expect(askSceneOf({ ...away, wall: OUTING.back.start })).toBeNull();
  });

  it('lets the click go for a member away from the seat with no spell (walking)', () => {
    expect(askSceneOf({ ...FREE, atSeat: false })).toBeNull();
  });

  it.each([
    ['halted', { halted: true }],
    ['before the first snapshot', { known: false }],
    ['while drawing would not be seen', { paused: true }],
    ['while a call plays', { calling: true }],
    ['in a scene or walking home', { inScene: true }],
    ['while they say something else', { speaking: true }],
  ])('drops the click %s', (_when, change) => {
    expect(askSceneOf({ ...FREE, ...change })).toBeNull();
    expect(
      askSceneOf({ ...FREE, restful: true, activity: { kind: 'sleep' }, ...change }),
    ).toBeNull();
  });
});

const PARTY: AskParty = { halted: false, known: true, bubbles: {}, idleSince: {} };

function setup(options: { activities?: Partial<Record<MemberId, IdleActivity>> } = {}) {
  const picker = createLinePicker(() => 0);
  const saw = vi.fn((lines: readonly Utterance[], t: number) => {
    picker.saw(lines, t);
  });
  const calling = { value: false };
  const asking = createAsking(
    {
      poses: () => ({}),
      activities: () => ({ wall: 0, activities: options.activities ?? {} }),
    },
    { isCalling: () => calling.value },
    { pick: picker.pick, saw },
  );
  const ask = (
    id: MemberId,
    t: number,
    more: { party?: AskParty; director?: Director; remarks?: Remarks; paused?: boolean } = {},
  ) =>
    asking.ask(
      id,
      { director: more.director ?? EMPTY_DIRECTOR, party: more.party ?? PARTY },
      { t, paused: more.paused ?? false, remarks: more.remarks ?? NO_REMARKS },
    );
  /** Draws a frame at `t` with `ids` on stage. */
  const draw = (
    t: number,
    ids: readonly MemberId[],
    covered: (id: MemberId) => boolean = () => false,
    inScene: readonly MemberId[] = [],
  ) => {
    asking.drew(
      t,
      ids.map((id) => poseOf(id, inScene.includes(id))),
      covered,
    );
  };
  return { asking, ask, saw, calling, draw };
}

/** A member drawn at the same place, in a scene or not. */
function poseOf(id: MemberId, inScene: boolean): MemberPose {
  return {
    id,
    pose: { point: { x: 10, y: 20 }, frame: 0, flip: false, held: null },
    depth: 0,
    hand: null,
    inScene,
    mark: null,
    atSeat: true,
    withPet: false,
  };
}

describe('createAsking', () => {
  it('has the member answer over the head for remarkMs, with a line of theirs', () => {
    const { asking, ask, saw, draw } = setup();
    expect(ask('minori', 100)).toBe(true);
    const line = asking.linesAt(100).minori;
    expect(linesOf('minori', 'askWork')).toContain(line);
    // Seen once drawn, not before.
    expect(saw).not.toHaveBeenCalled();
    draw(100, ['minori']);
    expect(saw).toHaveBeenCalledWith([expect.objectContaining({ actor: 'minori', line })], 100);
    expect(asking.isAnswering(100 + LINES.remarkMs - 1, 'minori')).toBe(true);
    expect(asking.isAnswering(100 + LINES.remarkMs - 1, null)).toBe(true);
    expect(asking.isAnswering(100, 'hibiki')).toBe(false);
    expect(asking.linesAt(100 + LINES.remarkMs)).toEqual({});
  });

  it('never says the same line twice in a row', () => {
    const { asking, ask, draw } = setup();
    let last: string | undefined;
    for (let i = 0; i < 6; i++) {
      const t = i * LINES.remarkMs;
      expect(ask('sasae', t)).toBe(true);
      draw(t, ['sasae']);
      const line = asking.linesAt(t).sasae;
      expect(line).not.toBe(last);
      last = line;
    }
  });

  it('answers each by what they do: idle, waiting, dozing, asleep', () => {
    const { asking, ask } = setup({ activities: { hirame: { kind: 'sleep' } } });
    const party: AskParty = {
      ...PARTY,
      idleSince: { kaname: 0, hirame: 0 },
      bubbles: { musubi: 'awaiting-permission' },
    };
    ask('kaname', 0, { party });
    ask('musubi', 0, { party });
    ask('hirame', 0, { party });
    const lines = asking.linesAt(0);
    expect(linesOf('kaname', 'askIdle')).toContain(lines.kaname);
    expect(linesOf('musubi', 'askWait')).toContain(lines.musubi);
    expect(linesOf('hirame', 'askSleep')).toContain(lines.hirame);
  });
});

describe('createAsking: dropped clicks', () => {
  it('drops a click while the member answers, says a remark or a call plays', () => {
    const { asking, ask, calling } = setup();
    ask('hibiki', 0);
    const first = asking.linesAt(0).hibiki;
    expect(ask('hibiki', 10)).toBe(false);
    expect(asking.linesAt(10).hibiki).toBe(first);
    const remark: Utterance = { actor: 'minori', line: 'みてください', start: 500, end: 2_500 };
    const remarks: Remarks = { previous: {}, said: [remark] };
    // A remark to come drops it too.
    expect(ask('minori', 0, { remarks })).toBe(false);
    expect(ask('minori', 2_500, { remarks })).toBe(true);
    calling.value = true;
    expect(ask('sasae', 3_000)).toBe(false);
  });

  it('drops a click while halted, before the first snapshot or unseen', () => {
    const { asking, ask, saw } = setup();
    expect(ask('kaname', 0, { party: { ...PARTY, halted: true } })).toBe(false);
    expect(ask('kaname', 0, { party: { ...PARTY, known: false } })).toBe(false);
    expect(ask('kaname', 0, { paused: true })).toBe(false);
    expect(asking.linesAt(0)).toEqual({});
    expect(saw).not.toHaveBeenCalled();
  });

  it('forgets the answers when cleared', () => {
    const { asking, ask } = setup();
    ask('takumi', 0);
    asking.clear();
    expect(asking.linesAt(1)).toEqual({});
    expect(asking.isAnswering(1, null)).toBe(false);
  });
});

describe('createAsking: drawn frames', () => {
  it('keeps where the members were drawn last', () => {
    const { asking, draw } = setup();
    expect(asking.feet()).toEqual([]);
    draw(0, ['kaname']);
    expect(asking.feet()).toEqual([{ id: 'kaname', point: { x: 10, y: 20 } }]);
  });

  it('counts an answer as said only when seen over the head', () => {
    const { ask, saw, draw, asking } = setup();
    ask('hibiki', 0);
    // Covered by the king's call, a line of a scene or a remark; in a scene; off stage.
    draw(1, ['hibiki'], (id) => id === 'hibiki');
    draw(2, ['hibiki'], () => false, ['hibiki']);
    draw(3, []);
    expect(saw.mock.calls.flatMap(([lines]) => lines)).toEqual([]);
    // Dropped before it was drawn (a halt): never seen.
    asking.clear();
    draw(4, ['hibiki']);
    expect(saw.mock.calls.flatMap(([lines]) => lines)).toEqual([]);
  });
});
