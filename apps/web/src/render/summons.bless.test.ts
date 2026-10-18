import { describe, expect, it, vi } from 'vitest';
import type { MemberId } from '../guild.config';
import { BLESSINGS } from './blessing';
import { createCalls } from './calls';
import { createBless, type CastParty } from './cast';
import {
  EMPTY_DIRECTOR,
  frameAt,
  scheduleEvent,
  type MemberPose,
  type StageFrame,
} from './director';
import { linesOf } from './lineBook';
import { SUMMONS } from './metrics';
import { DEFAULT_SEATS } from './scenes';
import {
  addBlessing,
  addSummons,
  holdsAt,
  isSummoning,
  newCallStart,
  NO_HOLDS,
  speechesAt,
  summonsEnd,
  withSummons,
  type Summons,
} from './summons';

/** The king's words for a click on the stage (Issue #187), as one of his calls without a sound. */

const WORDS = BLESSINGS[0];
const WALL = 1_700_000_000_000;
const CALL_END = summonsEnd({ start: 0, members: [] });

function member(frame: StageFrame, id: MemberId): MemberPose {
  const found = frame.members.find((m) => m.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
}

/** Everybody at their seat, the king asleep (the sleeping frame 7 and a "Z"). */
function sleepyFrame(): StageFrame {
  const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
  return {
    ...frame,
    members: frame.members.map((m) =>
      m.id === 'yukihiro'
        ? {
            ...m,
            pose: { point: m.pose.point, frame: 7, flip: false, held: null },
            mark: { kind: 'z', rise: 0.5 },
          }
        : m,
    ),
  };
}

describe('the words for a click as a call', () => {
  const list: readonly Summons[] = addBlessing([], WORDS, 100);

  it('lasts blessMs from the click, nobody called', () => {
    expect(list).toEqual([{ start: 100, members: [], words: WORDS }]);
    expect(summonsEnd(list[0] ?? { start: 0, members: [] })).toBe(100 + SUMMONS.blessMs);
    expect(isSummoning(list, 100 + SUMMONS.blessMs - 1)).toBe(true);
    expect(isSummoning(list, 100 + SUMMONS.blessMs)).toBe(false);
  });

  it('is said by the king alone, from the click to its end', () => {
    expect(speechesAt(list, 99)).toEqual({});
    expect(speechesAt(list, 100)).toEqual({ yukihiro: WORDS });
    expect(speechesAt(list, 100 + SUMMONS.blessMs - 1)).toEqual({ yukihiro: WORDS });
    expect(speechesAt(list, 100 + SUMMONS.blessMs)).toEqual({});
  });

  it('never starts over a call: after it, as calls do', () => {
    const calling = addSummons([], ['minori'], 0);
    const after = addBlessing(calling, WORDS, 10);
    expect(after[1]?.start).toBe(CALL_END);
    // A call that comes while he speaks waits for his words to end.
    const queued = addSummons(list, ['minori'], 150);
    expect(queued[1]?.start).toBe(100 + SUMMONS.blessMs);
  });

  it('is no call start: no sound rings for it', () => {
    expect(newCallStart(list, 100, null)).toBeNull();
    const call = addSummons(list, ['minori'], 100);
    expect(newCallStart(call, 100 + SUMMONS.blessMs, null)).toBe(100 + SUMMONS.blessMs);
  });

  it('wakes a sleeping king where he sits, without rising, the "Z" gone', () => {
    const frame = sleepyFrame();
    const asleep = member(frame, 'yukihiro');
    const holds = holdsAt(NO_HOLDS, frame, list, 100);
    const king = member(withSummons(frame, list, 100, { seats: DEFAULT_SEATS, holds }), 'yukihiro');
    expect(king.pose).toEqual({ point: asleep.pose.point, frame: 0, flip: false, held: null });
    expect(king.mark).toBeNull();
    expect(holds.points.yukihiro).toEqual(asleep.pose.point);
  });

  it('turns nobody else', () => {
    const frame = sleepyFrame();
    const holds = holdsAt(NO_HOLDS, frame, list, 100);
    const applied = withSummons(frame, list, 100, { seats: DEFAULT_SEATS, holds });
    for (const m of applied.members)
      if (m.id !== 'yukihiro') expect(m).toEqual(member(frame, m.id));
  });
});

describe('createCalls: the words for a click', () => {
  function setup() {
    const onActive = vi.fn<(ids: readonly MemberId[], at: number) => void>();
    const onCallStart = vi.fn<() => void>();
    const calls = createCalls({ wallNow: () => WALL, onActive, onCallStart });
    return { calls, onActive, onCallStart, frame: frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS) };
  }

  it('plays them with no sound, then reports the king awake (his doze starts over)', () => {
    const { calls, onActive, onCallStart, frame } = setup();
    expect(calls.bless(WORDS, 0)).not.toBeNull();
    expect(calls.isCalling(0)).toBe(true);
    expect(calls.view(() => frame, 0).speeches).toEqual({ yukihiro: WORDS });
    expect(onCallStart).not.toHaveBeenCalled();
    expect(onActive).not.toHaveBeenCalled();
    calls.view(() => frame, SUMMONS.blessMs);
    expect(onActive).toHaveBeenCalledWith(['yukihiro'], WALL);
    expect(calls.isCalling(SUMMONS.blessMs)).toBe(false);
  });

  it('takes none while halted or unseen (a null time)', () => {
    const { calls } = setup();
    expect(calls.bless(WORDS, null)).toBeNull();
    calls.setHalted(true);
    expect(calls.bless(WORDS, 0)).toBeNull();
    expect(calls.isCalling(0)).toBe(false);
  });

  it('drops the words said when the screen halts', () => {
    const { calls, frame } = setup();
    calls.bless(WORDS, 0);
    calls.setHalted(true);
    expect(calls.isCalling(1)).toBe(false);
    expect(calls.view(() => frame, 1).speeches).toEqual({});
  });
});

describe('createBless: a click on the king', () => {
  const PARTY: CastParty = {
    bubbles: {},
    known: true,
    halted: false,
    idleSince: { yukihiro: 0 },
    moods: {},
    kingQuests: 0,
  };
  const FREE = { t: 0, paused: false };

  function setup(random = () => 0) {
    const calls = createCalls({ wallNow: () => WALL });
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const said = (t: number) => calls.view(() => frame, t).speeches.yukihiro;
    return { calls, said, bless: createBless(calls, random) };
  }

  it('says a word now', () => {
    const { bless, said } = setup();
    expect(bless(EMPTY_DIRECTOR, PARTY, FREE)).toBe(true);
    expect(said(0)).toBe(BLESSINGS[0]);
  });

  it('never says the same word twice in a row, even with the same number drawn', () => {
    const { bless, said } = setup(() => 0);
    const words: (string | undefined)[] = [];
    for (let i = 0; i < 6; i += 1) {
      const t = i * SUMMONS.blessMs;
      expect(bless(EMPTY_DIRECTOR, PARTY, { t, paused: false })).toBe(true);
      words.push(said(t));
    }
    for (let i = 1; i < words.length; i += 1) expect(words[i]).not.toBe(words[i - 1]);
  });

  it('drops a click while his words show, and the next after them is another word', () => {
    const { bless, said } = setup(() => 0);
    bless(EMPTY_DIRECTOR, PARTY, FREE);
    expect(bless(EMPTY_DIRECTOR, PARTY, { t: SUMMONS.blessMs - 1, paused: false })).toBe(false);
    expect(said(SUMMONS.blessMs - 1)).toBe(BLESSINGS[0]);
    expect(bless(EMPTY_DIRECTOR, PARTY, { t: SUMMONS.blessMs, paused: false })).toBe(true);
    expect(said(SUMMONS.blessMs)).toBe(BLESSINGS[1]);
  });

  it('drops a click during a call of the king, and does not queue it', () => {
    const { bless, calls, said } = setup();
    calls.add(['minori'], 0);
    expect(bless(EMPTY_DIRECTOR, PARTY, { t: 10, paused: false })).toBe(false);
    const end = summonsEnd({ start: 0, members: ['minori'] });
    expect(said(end)).toBeUndefined();
    expect(calls.isCalling(end)).toBe(false);
  });

  it('drops a click during かなめ handing work on', () => {
    const { bless, calls } = setup();
    calls.dispatch(['minori'], 0);
    expect(bless(EMPTY_DIRECTOR, PARTY, { t: 10, paused: false })).toBe(false);
  });

  it('drops a click while the king has a part in a scene (a clear: his word to come)', () => {
    const { bless } = setup();
    const context = {
      seats: DEFAULT_SEATS,
      random: () => 0.5,
      tossRandom: () => 0.99,
      pickLine: (actor: MemberId, scene: Parameters<typeof linesOf>[1]) =>
        linesOf(actor, scene)[0] ?? null,
    };
    const clear = { id: 'c#1', kind: 'issue-closed', number: 1, department: '経理' } as const;
    const director = scheduleEvent(EMPTY_DIRECTOR, clear, 0, context);
    expect(bless(director, PARTY, FREE)).toBe(false);
  });

  it('lets him speak while a scene plays without him', () => {
    const { bless } = setup();
    const context = {
      seats: DEFAULT_SEATS,
      random: () => 0.5,
      tossRandom: () => 0.99,
      pickLine: () => null,
    };
    const opened = { id: 'o#1', kind: 'issue-opened', number: 1, department: '経理' } as const;
    const director = scheduleEvent(EMPTY_DIRECTOR, opened, 0, context);
    expect(bless(director, PARTY, FREE)).toBe(true);
  });

  it.each([
    ['halted', { ...PARTY, halted: true }, FREE],
    ['before the first snapshot', { ...PARTY, known: false }, FREE],
    ['while he awaits approval', { ...PARTY, idleSince: {} }, FREE],
    ['while unseen (hidden page, narrow screen)', PARTY, { t: 0, paused: true }],
  ] as const)('drops a click %s, drawing no number', (_, party, at) => {
    const random = vi.fn(() => 0);
    const { bless, calls } = setup(random);
    if (party.halted) calls.setHalted(true);
    expect(bless(EMPTY_DIRECTOR, party, at)).toBe(false);
    expect(calls.isCalling(0)).toBe(false);
    expect(random).not.toHaveBeenCalled();
  });

  it('keeps the last word only once said: a dropped click does not count', () => {
    const { bless, said } = setup(() => 0);
    expect(bless(EMPTY_DIRECTOR, { ...PARTY, halted: true }, FREE)).toBe(false);
    expect(bless(EMPTY_DIRECTOR, PARTY, FREE)).toBe(true);
    expect(said(0)).toBe(BLESSINGS[0]);
  });
});
