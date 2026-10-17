import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import { linesOf } from './lineBook';
import type { PickLine } from './lines';
import { LINES } from './metrics';
import {
  murmurMoment,
  murmursAt,
  NO_MURMURS,
  seenMurmurs,
  stepMurmurs,
  type MurmurFrame,
  type Murmurs,
} from './murmurs';
import type { IdleSince } from './idle';

/** Issue #165: the king's murmur stops as soon as one of his quests awaits his approval. */

const WALL = 1_000_000;
const say: PickLine = (actor, scene) => linesOf(actor, scene)[0] ?? null;
const talk = { random: () => 0, pick: say };
const idle = () => ({ activities: {}, wall: WALL });
const seat = (id: MemberId) => ({ id, inScene: false, atSeat: true });
const none = { speeches: {} };

/** A frame at `t` with only `speaker` on stage and the idle times `idleSince`. */
function frameOf(t: number, speaker: MemberId, idleSince: IdleSince): MurmurFrame {
  return {
    t,
    hour: 12,
    party: { bubbles: {}, idleSince, kingQuests: 1, known: true, halted: false },
    members: [seat(speaker)],
    busy: false,
  };
}

/** Steps the murmurs at frame `frame` and what is seen and drawn over the heads then. */
function step(murmurs: Murmurs, frame: MurmurFrame) {
  const next = stepMurmurs(murmurs, murmurMoment(frame, idle, talk));
  return { next, seen: seenMurmurs(next, frame, none), drawn: murmursAt(next, frame.t) };
}

const KING_RESTING: IdleSince = { yukihiro: 0 };
const KING_AWAITING: IdleSince = {};

/** The king starts a 「よいしょ」 (kingWork) at stage time 0. */
function kingSaying(): Murmurs {
  const said = step({ ...NO_MURMURS, next: 0 }, frameOf(0, 'yukihiro', KING_RESTING)).next;
  expect(said.said).toEqual({ actor: 'yukihiro', line: 'よいしょ', start: 0, end: LINES.murmurMs });
  return said;
}

describe('stepMurmurs: the king awaiting approval stops his murmur (Issue #165)', () => {
  it('draws no murmur from the first frame after the fetch that makes him wait', () => {
    const cut = step(kingSaying(), frameOf(1, 'yukihiro', KING_AWAITING));
    expect(cut.next.said).toBeNull();
    expect(cut.seen).toEqual([]);
    expect(cut.drawn).toEqual({});
  });

  it('keeps the next murmur planned from the end of the one cut, and the king as the last', () => {
    const said = kingSaying();
    const cut = step(said, frameOf(1_000, 'yukihiro', KING_AWAITING)).next;
    expect(cut).toEqual({ ...said, said: null, busy: false });
    expect(cut.next).toBe(LINES.murmurMs + LINES.murmurGapMinMs);
  });

  it('does not bring the murmur back once he is resting again before it would have ended', () => {
    const cut = step(kingSaying(), frameOf(1_000, 'yukihiro', KING_AWAITING)).next;
    const back = step(cut, frameOf(1_500, 'yukihiro', KING_RESTING));
    expect(back.next.said).toBeNull();
    expect(back.drawn).toEqual({});
  });

  it('shows his murmur to the end, as before, while he is not awaiting approval', () => {
    let murmurs = kingSaying();
    for (const t of [1, 1_000, LINES.murmurMs - 1]) {
      const shown = step(murmurs, frameOf(t, 'yukihiro', KING_RESTING));
      expect(shown.drawn).toEqual({ yukihiro: 'よいしょ' });
      expect(shown.seen).toHaveLength(1);
      murmurs = shown.next;
    }
    const over = step(murmurs, frameOf(LINES.murmurMs, 'yukihiro', KING_RESTING));
    expect(over.drawn).toEqual({});
  });

  it('does not stop the murmur of another member while the king awaits approval', () => {
    const said = step({ ...NO_MURMURS, next: 0 }, frameOf(0, 'hibiki', { hibiki: 0 })).next;
    expect(said.said?.actor).toBe('hibiki');
    const later = step(said, frameOf(1_000, 'hibiki', { hibiki: 0 }));
    expect(later.next.said).toBe(said.said);
    expect(Object.keys(later.drawn)).toEqual(['hibiki']);
  });
});

describe('murmurMoment: hushed', () => {
  it('hushes the king only while he is not restful, and nobody else', () => {
    const awaiting = murmurMoment(frameOf(0, 'yukihiro', { hibiki: 0 }), idle, talk);
    expect(awaiting.hushed('yukihiro')).toBe(true);
    expect(awaiting.hushed('hibiki')).toBe(false);
    expect(awaiting.hushed('minori')).toBe(false);
    const resting = murmurMoment(frameOf(0, 'yukihiro', KING_RESTING), idle, talk);
    expect(resting.hushed('yukihiro')).toBe(false);
  });
});
