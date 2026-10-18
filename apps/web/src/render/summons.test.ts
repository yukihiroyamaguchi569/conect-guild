import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import {
  EMPTY_DIRECTOR,
  frameAt,
  scheduleEvent,
  type MemberPose,
  type StageFrame,
} from './director';
import { SUMMONS } from './metrics';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';
import { seatedPoint } from './seating';
import {
  addSummons,
  endedSummons,
  faceThrone,
  holdsAt,
  isSummoning,
  newCallStart,
  NO_HOLDS,
  pruneSummons,
  replyStart,
  speechesAt,
  summonsEnd,
  withSummons,
  type Summons,
} from './summons';

const CALL_END = SUMMONS.callMs;
const REPLY = SUMMONS.callMs + SUMMONS.murmurMs;
const END = REPLY + SUMMONS.replyMs;

const CTX = { seats: DEFAULT_SEATS, holds: NO_HOLDS };

const order = (members: readonly MemberId[], start = 0): Summons => ({ start, members });

const seatPoint = (id: MemberId) => seatedPoint(tileToPoint(DEFAULT_SEATS[id]));

function member(frame: StageFrame, id: MemberId): MemberPose {
  const found = frame.members.find((m) => m.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
}

/** Everybody at their seat, the king and みのり asleep (the sleeping frame 7 and a "Z"). */
function sleepyFrame(): StageFrame {
  const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
  const asleep = (m: MemberPose): MemberPose => ({
    ...m,
    pose: { point: m.pose.point, frame: 7, flip: m.pose.flip, held: null },
    mark: { kind: 'z', rise: 0.5 },
  });
  return {
    ...frame,
    members: frame.members.map((m) => (m.id === 'yukihiro' || m.id === 'minori' ? asleep(m) : m)),
  };
}

describe('summons timing', () => {
  it('lasts the call, the murmur and the reply', () => {
    expect(replyStart(order(['kaname'], 100))).toBe(100 + REPLY);
    expect(summonsEnd(order(['kaname'], 100))).toBe(100 + END);
  });

  it('starts an order now, or right after the one still playing', () => {
    const one = addSummons([], ['kaname'], 50);
    expect(one).toEqual([order(['kaname'], 50)]);
    const two = addSummons(one, ['minori'], 60);
    expect(two[1]).toEqual(order(['minori'], 50 + END));
    // Once the first is over, the next one starts at once.
    expect(addSummons(one, ['minori'], 50 + END + 1)[1]).toEqual(order(['minori'], 50 + END + 1));
  });

  it('adds nothing for no members', () => {
    expect(addSummons([], [], 0)).toEqual([]);
  });

  it('is playing until its end, and pruned at its end', () => {
    const list = [order(['kaname'])];
    expect(isSummoning(list, END - 1)).toBe(true);
    expect(isSummoning(list, END)).toBe(false);
    expect(pruneSummons(list, END - 1)).toEqual(list);
    expect(pruneSummons(list, END)).toEqual([]);
  });

  it('counts an order still to come as playing', () => {
    expect(isSummoning([order(['kaname'], 1_000)], 0)).toBe(true);
  });
});

describe('call starts and ends', () => {
  it('reports each call of a row once, when it starts, not when it is added', () => {
    const list = addSummons(addSummons([], ['kaname'], 0), ['sasae'], 0);
    expect(newCallStart(list, 0, null)).toBe(0);
    expect(newCallStart(list, 10, 0)).toBeNull();
    // The second call waits for the first: nothing new until its start.
    expect(newCallStart(list, END - 1, 0)).toBeNull();
    expect(newCallStart(list, END, 0)).toBe(END);
    expect(newCallStart(list, END + 1, END)).toBeNull();
  });

  it('reports nothing before a call or between calls', () => {
    expect(newCallStart([order(['kaname'], 100)], 99, null)).toBeNull();
    expect(newCallStart([], 0, null)).toBeNull();
  });

  it('lists the calls over by now, as pruneSummons drops them', () => {
    const list = addSummons(addSummons([], ['kaname'], 0), ['sasae'], 0);
    expect(endedSummons(list, END - 1)).toEqual([]);
    expect(endedSummons(list, END)).toEqual([order(['kaname'])]);
    expect(pruneSummons(list, END)).toEqual([order(['sasae'], END)]);
  });
});

describe('speechesAt', () => {
  const list = [order(['kaname', 'hibiki'])];

  it('has the king say "！", then "ゴニョゴニョ", then the members answer "はっ！"', () => {
    expect(speechesAt(list, 0)).toEqual({ yukihiro: '！' });
    expect(speechesAt(list, CALL_END - 1)).toEqual({ yukihiro: '！' });
    expect(speechesAt(list, CALL_END)).toEqual({ yukihiro: 'ゴニョゴニョ' });
    expect(speechesAt(list, REPLY - 1)).toEqual({ yukihiro: 'ゴニョゴニョ' });
    expect(speechesAt(list, REPLY)).toEqual({ kaname: 'はっ！', hibiki: 'はっ！' });
    expect(speechesAt(list, END - 1)).toEqual({ kaname: 'はっ！', hibiki: 'はっ！' });
  });

  it('says nothing before an order starts or after it ends', () => {
    expect(speechesAt([order(['kaname'], 10)], 9)).toEqual({});
    expect(speechesAt(list, END)).toEqual({});
    expect(speechesAt([], 0)).toEqual({});
  });

  it('plays queued orders one after the other', () => {
    const queued = addSummons(addSummons([], ['kaname'], 0), ['sasae'], 0);
    expect(speechesAt(queued, END - 1)).toEqual({ kaname: 'はっ！' });
    expect(speechesAt(queued, END)).toEqual({ yukihiro: '！' });
    expect(speechesAt(queued, END + REPLY)).toEqual({ sasae: 'はっ！' });
  });
});

describe('faceThrone', () => {
  const throne = DEFAULT_SEATS.yukihiro;

  it('turns those left of the throne to the right and those right of it to the left', () => {
    expect(faceThrone(DEFAULT_SEATS.minori, throne)).toEqual({ frame: 1, flip: false });
    expect(faceThrone(DEFAULT_SEATS.hirame, throne)).toEqual({ frame: 1, flip: false });
    expect(faceThrone(DEFAULT_SEATS.hibiki, throne)).toEqual({ frame: 1, flip: true });
    expect(faceThrone(DEFAULT_SEATS.sasae, throne)).toEqual({ frame: 1, flip: true });
  });

  it('keeps one right below the throne facing front (no frame faces back)', () => {
    expect(faceThrone(DEFAULT_SEATS.kaname, throne)).toEqual({ frame: 0, flip: false });
  });
});

describe('withSummons: the king', () => {
  it('wakes the king and lifts him while he calls, then sits him still while he murmurs', () => {
    const frame = sleepyFrame();
    const list = [order(['hibiki'])];
    const calling = member(withSummons(frame, list, 0, CTX), 'yukihiro');
    // Woken where he is drawn: nothing jumps when the call starts or ends.
    const at = seatPoint('yukihiro');
    expect(calling.pose).toEqual({
      point: { x: at.x, y: at.y - SUMMONS.kingRisePx },
      frame: 0,
      flip: false,
      held: null,
    });
    expect(calling.mark).toBeNull();
    const murmuring = member(withSummons(frame, list, CALL_END, CTX), 'yukihiro');
    expect(murmuring.pose.point).toEqual(at);
    expect(murmuring.mark).toBeNull();
  });

  it('leaves the members alone while the king speaks, and the frame as it was outside an order', () => {
    const frame = sleepyFrame();
    const list = [order(['minori'])];
    expect(member(withSummons(frame, list, CALL_END, CTX), 'minori')).toEqual(
      member(frame, 'minori'),
    );
    expect(withSummons(frame, list, END, CTX)).toBe(frame);
    expect(withSummons(frame, [], 0, CTX)).toBe(frame);
  });
});

describe('withSummons: the answer', () => {
  it('turns members at their seat to the throne, awake, holding nothing', () => {
    const frame = sleepyFrame();
    const next = withSummons(frame, [order(['minori', 'hibiki'])], REPLY, CTX);
    const minori = member(next, 'minori');
    expect(minori.pose).toEqual({ point: seatPoint('minori'), frame: 1, flip: false, held: null });
    expect(minori.mark).toBeNull();
    expect(minori.hand).toBeNull();
    expect(member(next, 'hibiki').pose).toMatchObject({ frame: 1, flip: true });
    // Those not called are left as they were; the king stays awake, sitting, to the end.
    expect(member(next, 'sasae')).toEqual(member(frame, 'sasae'));
    expect(member(next, 'yukihiro').pose).toMatchObject({ point: seatPoint('yukihiro'), frame: 0 });
    expect(member(next, 'yukihiro').mark).toBeNull();
  });

  it('keeps an ambient offset where it is while turning (no jump)', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const shifted: StageFrame = {
      ...frame,
      members: frame.members.map((m) =>
        m.id === 'sasae'
          ? { ...m, pose: { ...m.pose, point: { x: m.pose.point.x + 2, y: m.pose.point.y - 2 } } }
          : m,
      ),
    };
    const next = withSummons(shifted, [order(['sasae'])], REPLY, CTX);
    expect(member(next, 'sasae').pose.point).toEqual(member(shifted, 'sasae').pose.point);
  });

  it('has かなめ hop facing front, then stand still', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const list = [order(['kaname'])];
    const at = seatPoint('kaname');
    const hop = member(withSummons(frame, list, REPLY, CTX), 'kaname');
    expect(hop.pose).toEqual({
      point: { x: at.x, y: at.y - SUMMONS.hopPx },
      frame: 0,
      flip: false,
      held: null,
    });
    const after = member(withSummons(frame, list, REPLY + SUMMONS.hopMs, CTX), 'kaname');
    expect(after.pose.point).toEqual(at);
  });
});

describe('withSummons: the answer away from the seat', () => {
  it('answers on the spot without turning while in a scene (nobody is moved)', () => {
    const context = { seats: DEFAULT_SEATS, random: () => 0.5 };
    const event = {
      id: 'issue-opened#1',
      kind: 'issue-opened',
      number: 1,
      department: '経理',
    } as const;
    const director = scheduleEvent(EMPTY_DIRECTOR, event, 0, context);
    // かなめ is on her way to みのり's desk with the scroll.
    const t = 3_000;
    const frame = frameAt(director, t, DEFAULT_SEATS);
    const list = [order(['kaname'], t - REPLY)];
    expect(member(frame, 'kaname').inScene).toBe(true);
    expect(member(withSummons(frame, list, t, CTX), 'kaname')).toEqual(member(frame, 'kaname'));
    expect(speechesAt(list, t)).toEqual({ kaname: 'はっ！' });
  });

  it('answers on the spot without turning while away from the seat (out playing)', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const away: StageFrame = {
      ...frame,
      members: frame.members.map((m) =>
        m.id === 'hirame'
          ? { ...m, atSeat: false, pose: { ...m.pose, point: { x: 100, y: 300 } } }
          : m,
      ),
    };
    const next = withSummons(away, [order(['hirame'])], REPLY, CTX);
    expect(member(next, 'hirame')).toEqual(member(away, 'hirame'));
  });
});

describe('withSummons: the depth order', () => {
  it('keeps the back-to-front order', () => {
    const frame = sleepyFrame();
    const next = withSummons(frame, [order(['kaname', 'sasae'])], REPLY, CTX);
    expect(next.members.map((m) => m.id)).toEqual(frame.members.map((m) => m.id));
  });
});

/** The frame with one member drawn `dy` px lower (a nod, a doze turning to sleep, a typing bob). */
function moved(frame: StageFrame, id: MemberId, dy: number): StageFrame {
  return {
    ...frame,
    members: frame.members.map((m) =>
      m.id === id
        ? { ...m, pose: { ...m.pose, point: { x: m.pose.point.x, y: m.pose.point.y + dy } } }
        : m,
    ),
  };
}

describe('holdsAt: nobody moves in a call', () => {
  it('holds the king where the call found him, to its end', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const list = [order(['minori'])];
    const holds = holdsAt(NO_HOLDS, frame, list, 0);
    // Later in the call his idle pose sinks (a doze turning to sleep): he stays where he was.
    const later = moved(frame, 'yukihiro', 4);
    const kept = holdsAt(holds, later, list, REPLY + 10);
    const king = member(
      withSummons(later, list, REPLY + 10, { seats: DEFAULT_SEATS, holds: kept }),
      'yukihiro',
    );
    expect(king.pose.point).toEqual(seatPoint('yukihiro'));
  });

  it('holds a member answering at the seat from the reply on', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const list = [order(['minori'])];
    let holds = holdsAt(NO_HOLDS, frame, list, 0);
    expect(holds.points.minori).toBeUndefined();
    holds = holdsAt(holds, frame, list, REPLY);
    expect(holds.points.minori).toEqual(seatPoint('minori'));
    const bobbed = moved(frame, 'minori', 2);
    holds = holdsAt(holds, bobbed, list, REPLY + 100);
    const minori = member(
      withSummons(bobbed, list, REPLY + 100, { seats: DEFAULT_SEATS, holds }),
      'minori',
    );
    expect(minori.pose.point).toEqual(seatPoint('minori'));
  });

  it('does not hold a member away from the seat (they go on where they are)', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const away: StageFrame = {
      ...frame,
      members: frame.members.map((m) => (m.id === 'hirame' ? { ...m, atSeat: false } : m)),
    };
    const holds = holdsAt(NO_HOLDS, away, [order(['hirame'])], REPLY);
    expect(holds.points.hirame).toBeUndefined();
  });

  it('keeps the king where he was for the next call of a row, and forgets after a gap', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const row = addSummons(addSummons([], ['kaname'], 0), ['sasae'], 0);
    const first = holdsAt(NO_HOLDS, frame, row, 0);
    const sunkFrame = moved(frame, 'yukihiro', 4);
    const second = holdsAt(first, sunkFrame, row, END);
    expect(second).toEqual({
      start: END,
      end: 2 * END,
      points: { yukihiro: seatPoint('yukihiro') },
      done: [],
    });
    expect(holdsAt(first, sunkFrame, row, 3 * END)).toEqual(NO_HOLDS);
    // A later call after a gap, while the holds of the first call are still around (no frame was
    // drawn in between): the king is held where the new call finds him.
    const later = [order(['sasae'], END + 1)];
    const afterGap = holdsAt(first, sunkFrame, later, END + 1);
    expect(afterGap.points.yukihiro).toEqual({
      ...seatPoint('yukihiro'),
      y: seatPoint('yukihiro').y + 4,
    });
  });
});

describe('holdsAt: a scene cuts an answer short', () => {
  it('ends the answer of a member whose scene starts mid-reply: no hold, no word', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const list = [order(['minori'])];
    // Answering at the seat, bobbing at the desk.
    const bobbed = moved(frame, 'minori', 2);
    let holds = holdsAt(NO_HOLDS, bobbed, list, REPLY);
    expect(holds.points.minori).toBeDefined();
    // A handover takes her: the scene's pose is drawn as it is, the "はっ！" goes.
    const inScene: StageFrame = {
      ...frame,
      members: frame.members.map((m) => (m.id === 'minori' ? { ...m, inScene: true } : m)),
    };
    holds = holdsAt(holds, inScene, list, REPLY + 100);
    expect(holds.points.minori).toBeUndefined();
    expect(holds.done).toEqual(['minori']);
    const next = withSummons(inScene, list, REPLY + 100, { seats: DEFAULT_SEATS, holds });
    expect(member(next, 'minori')).toEqual(member(inScene, 'minori'));
    expect(speechesAt(list, REPLY + 100, holds.done)).toEqual({});
    // Back at the seat before the call ends: she does not take up the answer again.
    holds = holdsAt(holds, frame, list, REPLY + 200);
    expect(holds.points.minori).toBeUndefined();
    expect(
      member(withSummons(frame, list, REPLY + 200, { seats: DEFAULT_SEATS, holds }), 'minori'),
    ).toEqual(member(frame, 'minori'));
  });

  it('keeps answering on the spot a member who was in a scene before the reply', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const inScene: StageFrame = {
      ...frame,
      members: frame.members.map((m) => (m.id === 'minori' ? { ...m, inScene: true } : m)),
    };
    const list = [order(['minori'])];
    const holds = holdsAt(NO_HOLDS, inScene, list, REPLY);
    expect(holds.done).toEqual([]);
    expect(speechesAt(list, REPLY, holds.done)).toEqual({ minori: 'はっ！' });
  });
});
