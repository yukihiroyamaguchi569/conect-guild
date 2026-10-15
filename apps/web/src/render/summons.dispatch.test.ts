import { describe, expect, it, vi } from 'vitest';
import type { MemberId } from '../guild.config';
import { createCalls } from './calls';
import { EMPTY_DIRECTOR, frameAt, type MemberPose, type StageFrame } from './director';
import { SUMMONS } from './metrics';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';
import { seatedPoint } from './seating';
import {
  addDispatch,
  addSummons,
  holdsAt,
  NO_HOLDS,
  replyStart,
  speechesAt,
  summonsEnd,
  withSummons,
  type Summons,
} from './summons';

/** かなめ hands work on to departments (Issue #155): she asks, they answer, the king is quiet. */

const ASK_END = SUMMONS.askMs;
const END = SUMMONS.askMs + SUMMONS.replyMs;
const KING_END = SUMMONS.callMs + SUMMONS.murmurMs + SUMMONS.replyMs;
const CTX = { seats: DEFAULT_SEATS, holds: NO_HOLDS };

const dispatch = (members: readonly MemberId[], start = 0): Summons => ({
  start,
  members,
  from: 'kaname',
});

function member(frame: StageFrame, id: MemberId): MemberPose {
  const found = frame.members.find((m) => m.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
}

const still = (): StageFrame => frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);

function changed(frame: StageFrame, id: MemberId, change: Partial<MemberPose>): StageFrame {
  return { ...frame, members: frame.members.map((m) => (m.id === id ? { ...m, ...change } : m)) };
}

describe('dispatch timing', () => {
  it('lasts かなめ’s ask and the answers: 3 s, shorter than the king’s call', () => {
    expect(replyStart(dispatch(['minori'], 100))).toBe(100 + ASK_END);
    expect(summonsEnd(dispatch(['minori'], 100))).toBe(100 + END);
    expect(END).toBe(3_000);
    expect(END).toBeLessThan(KING_END);
  });

  it('queues after the call playing, and a call after it, never talking over each other', () => {
    const one = addSummons([], ['kaname'], 0);
    const two = addDispatch(one, ['minori'], 10);
    expect(two[1]).toEqual(dispatch(['minori'], KING_END));
    const three = addSummons(two, ['sasae'], 20);
    expect(three[2]?.start).toBe(KING_END + END);
  });

  it('adds nothing for no members', () => {
    expect(addDispatch([], [], 0)).toEqual([]);
  });
});

describe('dispatch words', () => {
  const list = [dispatch(['minori', 'sasae'])];

  it('has かなめ say 「おねがい！」, then the departments answer 「はい！」; the king says nothing', () => {
    expect(speechesAt(list, 0)).toEqual({ kaname: 'おねがい！' });
    expect(speechesAt(list, ASK_END - 1)).toEqual({ kaname: 'おねがい！' });
    expect(speechesAt(list, ASK_END)).toEqual({ minori: 'はい！', sasae: 'はい！' });
    expect(speechesAt(list, END - 1)).toEqual({ minori: 'はい！', sasae: 'はい！' });
    expect(speechesAt(list, END)).toEqual({});
  });

  it('drops the words of those a scene took (done)', () => {
    expect(speechesAt(list, 0, ['kaname'])).toEqual({});
    expect(speechesAt(list, ASK_END, ['minori'])).toEqual({ sasae: 'はい！' });
  });
});

describe('withSummons: かなめ hands work on', () => {
  it('turns かなめ at her counter to the first department, and leaves the king as he is', () => {
    const frame = still();
    const next = withSummons(frame, [dispatch(['minori', 'hibiki'])], 0, CTX);
    // みのり sits left of the counter: かなめ turns left.
    expect(member(next, 'kaname').pose).toMatchObject({ frame: 1, flip: true, held: null });
    expect(member(next, 'kaname').pose.point).toEqual(member(frame, 'kaname').pose.point);
    expect(member(next, 'yukihiro')).toEqual(member(frame, 'yukihiro'));
    // The departments wait for her ask before they turn.
    expect(member(next, 'minori')).toEqual(member(frame, 'minori'));
  });

  it('turns each department called to かなめ while they answer, she still facing hers', () => {
    const frame = still();
    const next = withSummons(frame, [dispatch(['minori', 'hibiki'])], ASK_END, CTX);
    expect(member(next, 'minori').pose).toMatchObject({ frame: 1, flip: false, held: null });
    expect(member(next, 'hibiki').pose).toMatchObject({ frame: 1, flip: true, held: null });
    expect(member(next, 'kaname').pose).toMatchObject({ frame: 1, flip: true });
    expect(member(next, 'sasae')).toEqual(member(frame, 'sasae'));
    expect(member(next, 'yukihiro')).toEqual(member(frame, 'yukihiro'));
  });

  it('turns かなめ the other way to a department on the right', () => {
    const next = withSummons(still(), [dispatch(['hibiki'])], 0, CTX);
    expect(member(next, 'kaname').pose).toMatchObject({ frame: 1, flip: false });
  });

  it('nobody walks: everyone stays on their tile, at their seat point', () => {
    const frame = still();
    for (const t of [0, ASK_END, END - 1]) {
      const next = withSummons(frame, [dispatch(['minori', 'sasae'])], t, CTX);
      for (const m of next.members) {
        expect(m.depth).toBe(member(frame, m.id).depth);
        expect(m.pose.point).toEqual(member(frame, m.id).pose.point);
      }
    }
  });

  it('has かなめ speak where she is, without turning, in a scene or away from her counter', () => {
    const list = [dispatch(['minori'])];
    const inScene = changed(still(), 'kaname', { inScene: true });
    expect(member(withSummons(inScene, list, 0, CTX), 'kaname')).toEqual(member(inScene, 'kaname'));
    const away = changed(still(), 'kaname', { atSeat: false });
    expect(member(withSummons(away, list, 0, CTX), 'kaname')).toEqual(member(away, 'kaname'));
    expect(speechesAt(list, 0)).toEqual({ kaname: 'おねがい！' });
  });

  it('has a department away from the seat answer where it is, without turning', () => {
    const away = changed(still(), 'minori', { atSeat: false });
    const next = withSummons(away, [dispatch(['minori'])], ASK_END, CTX);
    expect(member(next, 'minori')).toEqual(member(away, 'minori'));
  });

  it('is applied the king’s way for a call of the king (no regression)', () => {
    const next = withSummons(still(), [{ start: 0, members: ['minori'] }], 0, CTX);
    expect(member(next, 'kaname')).toEqual(member(still(), 'kaname'));
  });
});

describe('holdsAt: かなめ hands work on', () => {
  const list = [dispatch(['minori'])];

  it('holds かなめ from her ask, the department from its answer, never the king', () => {
    const frame = still();
    const asking = holdsAt(NO_HOLDS, frame, list, 0);
    expect(Object.keys(asking.points)).toEqual(['kaname']);
    const answering = holdsAt(asking, frame, list, ASK_END);
    expect(Object.keys(answering.points)).toEqual(expect.arrayContaining(['kaname', 'minori']));
    expect(Object.keys(answering.points)).toHaveLength(2);
    expect(answering.points.yukihiro).toBeUndefined();
  });

  it('ends かなめ’s ask when a scene takes her: no hold, no word, her pose left to the scene', () => {
    const frame = still();
    let holds = holdsAt(NO_HOLDS, frame, list, 0);
    const inScene = changed(frame, 'kaname', { inScene: true });
    holds = holdsAt(holds, inScene, list, 100);
    expect(holds.done).toEqual(['kaname']);
    expect(speechesAt(list, 100, holds.done)).toEqual({});
    const next = withSummons(inScene, list, 100, { seats: DEFAULT_SEATS, holds });
    expect(member(next, 'kaname')).toEqual(member(inScene, 'kaname'));
  });

  it('does not carry the king’s hold of a call into かなめ’s right after it', () => {
    const row = addDispatch(addSummons([], ['sasae'], 0), ['minori'], 0);
    const frame = still();
    const king = holdsAt(NO_HOLDS, frame, row, 0);
    expect(king.points.yukihiro).toBeDefined();
    const next = holdsAt(king, frame, row, KING_END);
    expect(next.points.yukihiro).toBeUndefined();
  });

  it('keeps かなめ at her counter seat point while she asks', () => {
    const at = seatedPoint(tileToPoint(DEFAULT_SEATS.kaname));
    const holds = holdsAt(NO_HOLDS, still(), list, 0);
    expect(holds.points.kaname).toEqual(at);
  });
});

describe('calls: かなめ hands work on', () => {
  const frame = still();

  it('rings like a call, and does not wake the king when it ends', () => {
    const onActive = vi.fn();
    const onCallStart = vi.fn();
    const calls = createCalls({ onActive, onCallStart, wallNow: () => 0 });
    expect(calls.dispatch(['minori'], 0)).toEqual(dispatch(['minori']));
    expect(calls.view(() => frame, 0).speeches).toEqual({ kaname: 'おねがい！' });
    expect(onCallStart).toHaveBeenCalledTimes(1);
    expect(calls.view(() => frame, END).calling).toBe(false);
    expect(onActive).not.toHaveBeenCalled();
  });

  it('wakes the king once his call is over, even with かなめ’s still to come', () => {
    const onActive = vi.fn();
    const calls = createCalls({ onActive, wallNow: () => 7 });
    calls.add(['sasae'], 0);
    calls.dispatch(['minori'], 0);
    calls.view(() => frame, KING_END);
    expect(onActive).toHaveBeenCalledWith(['yukihiro'], 7);
    expect(calls.view(() => frame, KING_END).speeches).toEqual({ kaname: 'おねがい！' });
  });

  it('takes none while halted, for a null time or for no members', () => {
    const calls = createCalls({});
    expect(calls.dispatch(['minori'], null)).toBeNull();
    expect(calls.dispatch([], 0)).toBeNull();
    calls.setHalted(true);
    expect(calls.dispatch(['minori'], 0)).toBeNull();
  });
});
