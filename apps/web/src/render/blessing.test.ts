import { describe, expect, it, vi } from 'vitest';
import type { GuildEvent } from '../domain/events';
import {
  BLESSINGS,
  blessingFor,
  blessMomentOf,
  kingInScene,
  mayBless,
  pickBlessing,
  type BlessingLine,
  type BlessMoment,
} from './blessing';
import { EMPTY_DIRECTOR, scheduleEvent } from './director';
import { LINE_BOOK, linesOf, SHARED_LINES } from './lineBook';
import { DEFAULT_SEATS, type SceneContext } from './scenes';

/** The king's words for a click (Issue #187). */

const FREE: BlessMoment = {
  halted: false,
  known: true,
  paused: false,
  kingAwaiting: false,
  calling: false,
  kingInScene: false,
};

const CONTEXT: SceneContext = {
  seats: DEFAULT_SEATS,
  random: () => 0.5,
  tossRandom: () => 0.99,
  pickLine: (actor, scene) => linesOf(actor, scene)[0] ?? null,
};

function event(kind: GuildEvent['kind'], department: GuildEvent['department']): GuildEvent {
  return { id: `${kind}#1`, kind, number: 1, department };
}

describe('BLESSINGS: fixed words, like the line book', () => {
  const ALLOWED = /^[ぁ-ゖァ-ヺー〜！？…、♪]+$/u;

  it('has 10 to 15 words, each once', () => {
    expect(BLESSINGS.length).toBeGreaterThanOrEqual(10);
    expect(BLESSINGS.length).toBeLessThanOrEqual(15);
    expect(new Set(BLESSINGS).size).toBe(BLESSINGS.length);
  });

  it.each(BLESSINGS)('「%s」 is kana and signs only, at most 7 characters', (words) => {
    expect(words).toMatch(ALLOWED);
    expect(Array.from(words).length).toBeLessThanOrEqual(7);
  });

  it('shares no word with the line book (a word tells where it came from)', () => {
    const book = new Set<string>([
      ...Object.values(SHARED_LINES).flat(),
      ...Object.values(LINE_BOOK).flatMap((lines) => Object.values(lines).flat()),
    ]);
    expect(BLESSINGS.filter((words) => book.has(words))).toEqual([]);
  });
});

describe('pickBlessing: never the word said last', () => {
  it('picks evenly by the number drawn', () => {
    expect(pickBlessing(null, () => 0)).toBe(BLESSINGS[0]);
    expect(pickBlessing(null, () => 0.999_999)).toBe(BLESSINGS.at(-1));
  });

  it('skips the last word, whatever the number drawn', () => {
    for (const last of BLESSINGS) {
      for (const draw of [0, 0.25, 0.5, 0.75, 0.999_999, 1]) {
        expect(pickBlessing(last, () => draw)).not.toBe(last);
      }
    }
  });

  it('can still say every other word after one', () => {
    const last = BLESSINGS[0];
    const n = BLESSINGS.length - 1;
    const said = new Set(Array.from({ length: n }, (_, i) => pickBlessing(last, () => i / n)));
    expect(said).toEqual(new Set(BLESSINGS.filter((words) => words !== last)));
  });

  it('draws one number', () => {
    const random = vi.fn(() => 0.3);
    pickBlessing(null, random);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('never repeats in a long run of clicks', () => {
    let last: BlessingLine | null = null;
    let seed = 1;
    const random = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return seed / 2_147_483_647;
    };
    for (let i = 0; i < 500; i += 1) {
      const next = pickBlessing(last, random);
      expect(next).not.toBe(last);
      last = next;
    }
  });
});

describe('mayBless: a click is dropped while something else plays', () => {
  it('lets the king speak on a free stage', () => {
    expect(mayBless(FREE)).toBe(true);
  });

  it.each<keyof BlessMoment>(['halted', 'paused', 'kingAwaiting', 'calling', 'kingInScene'])(
    'drops it while %s',
    (key) => {
      expect(mayBless({ ...FREE, [key]: true })).toBe(false);
    },
  );

  it('drops it before the first snapshot', () => {
    expect(mayBless({ ...FREE, known: false })).toBe(false);
  });
});

describe('blessingFor', () => {
  it('gives a word other than the last on a free stage', () => {
    const words = blessingFor(FREE, BLESSINGS[0], () => 0);
    expect(words).toBe(BLESSINGS[1]);
  });

  it('gives nothing and draws no number when the click is dropped', () => {
    const random = vi.fn(() => 0);
    expect(blessingFor({ ...FREE, calling: true }, null, random)).toBeNull();
    expect(blessingFor({ ...FREE, halted: true }, null, random)).toBeNull();
    expect(random).not.toHaveBeenCalled();
  });
});

describe('kingInScene', () => {
  it('is false on an empty stage', () => {
    expect(kingInScene(EMPTY_DIRECTOR, 0)).toBe(false);
  });

  it('is true while the king has a word to come in a clear, until it is over', () => {
    const director = scheduleEvent(EMPTY_DIRECTOR, event('issue-closed', '経理'), 0, CONTEXT);
    const said = director.lines.find((line) => line.actor === 'yukihiro');
    if (said === undefined) throw new Error('no word for the king');
    // Before his word starts (the department speaks first) the king is already booked.
    expect(kingInScene(director, 0)).toBe(true);
    expect(kingInScene(director, said.end - 1)).toBe(true);
    expect(kingInScene(director, said.end)).toBe(false);
  });

  it('is true while he takes the scroll of his own quest (his track)', () => {
    const opened = scheduleEvent(EMPTY_DIRECTOR, event('king-quest-opened', null), 0, CONTEXT);
    const until = opened.busyUntil.yukihiro;
    if (until === undefined) throw new Error('the king has no part');
    expect(kingInScene(opened, until - 1)).toBe(true);
  });

  it('is false while a scene plays without him (a scroll to a department)', () => {
    const director = scheduleEvent(EMPTY_DIRECTOR, event('issue-opened', '経理'), 0, CONTEXT);
    expect(director.tracks.length).toBeGreaterThan(0);
    expect(kingInScene(director, 0)).toBe(false);
  });
});

describe('blessMomentOf', () => {
  const party = { halted: false, known: true, idleSince: { yukihiro: 0 } };

  it('reads the stage as the loop holds it', () => {
    const stage = { party, director: EMPTY_DIRECTOR, calling: false, paused: false };
    expect(blessMomentOf(stage, 0)).toEqual(FREE);
  });

  it('sees the king awaiting approval when he is not restful (no idle time)', () => {
    const stage = { party: { ...party, idleSince: {} }, director: EMPTY_DIRECTOR };
    const moment = blessMomentOf({ ...stage, calling: false, paused: false }, 0);
    expect(moment.kingAwaiting).toBe(true);
    expect(mayBless(moment)).toBe(false);
  });

  it('passes on the halt, the first snapshot, the pause and the call', () => {
    const moment = blessMomentOf(
      {
        party: { ...party, halted: true, known: false },
        director: EMPTY_DIRECTOR,
        calling: true,
        paused: true,
      },
      0,
    );
    expect(moment).toEqual({ ...FREE, halted: true, known: false, calling: true, paused: true });
  });
});
