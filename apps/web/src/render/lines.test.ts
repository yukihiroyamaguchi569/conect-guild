import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import { linesOf, type LineScene, type SpokenLine } from './lineBook';
import {
  createLinePicker,
  linesAt,
  pickLine,
  remember,
  showMs,
  speakInTurn,
  seenLines,
  type LinePicker,
  type PickLine,
  type Turn,
  type Utterance,
} from './lines';
import { LINES } from './metrics';

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

describe('pickLine', () => {
  const options = ['a', 'b', 'c', 'd'] as const;

  it('chooses evenly by the random number, first to last', () => {
    expect(pickLine(options, [], () => 0)).toBe('a');
    expect(pickLine(options, [], () => 0.25)).toBe('b');
    expect(pickLine(options, [], () => 0.74)).toBe('c');
    expect(pickLine(options, [], () => 0.9999)).toBe('d');
  });

  it('never goes past the last option, even for a random number of 1', () => {
    expect(pickLine(options, [], () => 1)).toBe('d');
  });

  it('avoids the last LINES.recentLines lines said', () => {
    expect(LINES.recentLines).toBe(2);
    expect(pickLine(options, ['c', 'a'], () => 0)).toBe('b');
    expect(pickLine(options, ['c', 'a'], () => 0.9999)).toBe('d');
    // Only the last two count: 'd' said three lines ago may come again.
    expect(pickLine(options, ['d', 'c', 'a'], () => 0.9999)).toBe('d');
  });

  it('leaves one line to say when there are fewer: two options avoid only the last', () => {
    expect(pickLine(['x', 'y'], ['y', 'x'], () => 0)).toBe('y');
    expect(pickLine(['x', 'y'], ['x', 'y'], () => 0.9999)).toBe('x');
  });

  it('says the only option every time', () => {
    expect(pickLine(['x'], ['x', 'x'], () => 0.5)).toBe('x');
  });

  it('says nothing without options', () => {
    expect(pickLine([], [], () => 0.5)).toBeNull();
  });

  it('ignores remembered lines that are not among the options', () => {
    expect(pickLine(['x', 'y', 'z'], ['q', 'r'], () => 0)).toBe('x');
  });
});

describe('remember', () => {
  it('keeps the last LINES.recentLines lines, oldest first', () => {
    expect(remember([], 'a')).toEqual(['a']);
    expect(remember(['a'], 'b')).toEqual(['a', 'b']);
    expect(remember(['a', 'b'], 'c')).toEqual(['b', 'c']);
  });

  it('does not change the list it was given', () => {
    const recent = ['a', 'b'] as const;
    remember(recent, 'c');
    expect(recent).toEqual(['a', 'b']);
  });
});

let clock = 0;

/** Picks for `actor` at `scene` and shows the line at once for 1 s, as frames would. */
function sayNow(picker: LinePicker, actor: MemberId, scene: LineScene): SpokenLine | null {
  const line = picker.pick(actor, scene, []);
  if (line !== null) {
    clock += 2_000;
    const said = { actor, line, start: clock, end: clock + 1_000 };
    picker.saw([said], clock);
    picker.saw([], said.end);
  }
  return line;
}

describe('createLinePicker', () => {
  it('picks the same lines from the same random sequence', () => {
    const a = createLinePicker(seeded(7));
    const b = createLinePicker(seeded(7));
    const said = (picker: LinePicker) =>
      Array.from({ length: 12 }, () => [
        sayNow(picker, 'hibiki', 'clear'),
        sayNow(picker, 'kaname', 'toss'),
      ]);
    expect(said(a)).toEqual(said(b));
  });

  it('never says a line again while it is among the last ones seen of that member and moment', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const picker = createLinePicker(seeded(seed));
      const said = Array.from({ length: 60 }, () => sayNow(picker, 'kaname', 'handOver'));
      for (let i = 1; i < said.length; i += 1) {
        const window = said.slice(Math.max(0, i - LINES.recentLines), i);
        expect(window).not.toContain(said[i]);
      }
    }
  });

  it('says every line of a moment over time', () => {
    const picker = createLinePicker(seeded(11));
    const said = new Set(Array.from({ length: 40 }, () => sayNow(picker, 'hirame', 'takeScroll')));
    expect(said).toEqual(new Set(linesOf('hirame', 'takeScroll')));
  });

  it('remembers each member and moment apart', () => {
    // Always the first fresh line: the memory of one moment never steers another.
    const picker = createLinePicker(() => 0);
    expect(sayNow(picker, 'minori', 'clear')).toBe(linesOf('minori', 'clear')[0]);
    expect(sayNow(picker, 'minori', 'takeScroll')).toBe(linesOf('minori', 'takeScroll')[0]);
    expect(sayNow(picker, 'hibiki', 'clear')).toBe(linesOf('hibiki', 'clear')[0]);
    expect(sayNow(picker, 'minori', 'clear')).toBe(linesOf('minori', 'clear')[1]);
  });

  it('remembers the shared lines for everyone: one member does not say what another just did', () => {
    const picker = createLinePicker(() => 0);
    const [first, second, third] = linesOf('minori', 'tea');
    expect(sayNow(picker, 'minori', 'tea')).toBe(first);
    expect(sayNow(picker, 'hibiki', 'tea')).toBe(second);
    expect(sayNow(picker, 'kaname', 'tea')).toBe(third);
  });

  it('remembers the king’s own sleep talk apart from the shared one', () => {
    const picker = createLinePicker(() => 0);
    expect(sayNow(picker, 'sasae', 'sleepTalk')).toBe(linesOf('sasae', 'sleepTalk')[0]);
    expect(sayNow(picker, 'yukihiro', 'sleepTalk')).toBe(linesOf('yukihiro', 'sleepTalk')[0]);
    expect(sayNow(picker, 'minori', 'sleepTalk')).toBe(linesOf('minori', 'sleepTalk')[1]);
  });

  it('says nothing (and draws no number) at a moment the member has no lines for', () => {
    let draws = 0;
    const picker = createLinePicker(() => {
      draws += 1;
      return 0;
    });
    expect(picker.pick('yukihiro', 'handOver', [])).toBeNull();
    expect(draws).toBe(0);
  });
});

describe('createLinePicker: only what is seen counts', () => {
  const [first = 'かんりょう！', second] = linesOf('minori', 'clear');
  const shown = (start: number): Utterance => ({
    actor: 'minori',
    line: first,
    start,
    end: start + 1_000,
  });

  it('does not remember a line picked but never seen (dropped when halted, hidden all along)', () => {
    const picker = createLinePicker(() => 0);
    expect(picker.pick('minori', 'clear', [])).toBe(first);
    // Never shown: the next pick may say it after all.
    expect(picker.pick('minori', 'clear', [])).toBe(first);
  });

  it('avoids the lines still to show (pending) even before they are seen', () => {
    const picker = createLinePicker(() => 0);
    expect(picker.pick('minori', 'clear', [first])).toBe(second);
  });

  it('says nothing rather than a line every option of which is still to show', () => {
    const picker = createLinePicker(() => 0);
    expect(picker.pick('minori', 'clear', linesOf('minori', 'clear'))).toBeNull();
  });

  it('remembers a line once however many frames show it', () => {
    const picker = createLinePicker(() => 0);
    for (let t = 0; t < 1_000; t += 50) picker.saw([shown(0)], t);
    picker.saw([], 1_000);
    expect(picker.pick('minori', 'clear', [])).toBe(second);
    // One line only: with two remembered the first fresh one would be the third.
    picker.saw([{ ...shown(5_000), line: second ?? first }], 5_000);
    expect(picker.pick('minori', 'clear', [])).toBe(linesOf('minori', 'clear')[2]);
  });

  it('remembers a line once when the king’s call hides it a while and it shows again', () => {
    const third = linesOf('minori', 'clear')[2] ?? first;
    // Always the last fresh line.
    const picker = createLinePicker(() => 0.9999);
    picker.saw([{ ...shown(0), line: third }], 0);
    picker.saw([shown(5_000)], 5_000);
    picker.saw([], 5_300);
    picker.saw([shown(5_000)], 5_600);
    // Remembered: third, first. Counted twice, first would push third out and allow it again.
    expect(picker.pick('minori', 'clear', [])).toBe(second);
  });

  it('remembers the same line again when another utterance says it later', () => {
    const picker = createLinePicker(() => 0);
    picker.saw([shown(0)], 0);
    picker.saw([shown(5_000)], 5_000);
    // Remembered twice: only it is avoided, so the first fresh line is the second.
    expect(picker.pick('minori', 'clear', [])).toBe(second);
  });

  it('ignores a line the member has no moment for', () => {
    const picker = createLinePicker(() => 0);
    picker.saw([{ actor: 'yukihiro', line: 'それっ！', start: 0, end: 1_000 }], 0);
    expect(picker.pick('yukihiro', 'seeClear', [])).toBe(linesOf('yukihiro', 'seeClear')[0]);
  });
});

describe('createLinePicker: when nothing is left to say', () => {
  it('says nothing (and draws no number) when the lines seen lately and those to show use up all', () => {
    let draws = 0;
    const picker = createLinePicker(() => {
      draws += 1;
      return 0;
    });
    const [a = 'かんりょう！', b = a, c = a] = linesOf('minori', 'clear');
    picker.saw([{ actor: 'minori', line: a, start: 0, end: 1_000 }], 0);
    picker.saw([{ actor: 'minori', line: b, start: 5_000, end: 6_000 }], 5_000);
    expect(picker.pick('minori', 'clear', [c])).toBeNull();
    expect(draws).toBe(0);
  });
});

describe('pickLine with pending lines', () => {
  it('says nothing (and draws no number) when the recent and pending leave nothing', () => {
    let draws = 0;
    const random = () => {
      draws += 1;
      return 0;
    };
    // Seen lately: x and y; about to show: z. None is said again.
    expect(pickLine(['x', 'y', 'z'], ['x', 'y'], random, ['z'])).toBeNull();
    expect(draws).toBe(0);
  });

  it('says the one left when the recent and pending leave exactly one', () => {
    expect(pickLine(['w', 'x', 'y', 'z'], ['x', 'y'], () => 0.9999, ['z'])).toBe('w');
  });

  it('says nothing (and draws no number) when every option is pending', () => {
    let draws = 0;
    const random = () => {
      draws += 1;
      return 0;
    };
    expect(pickLine(['x', 'y'], [], random, ['x', 'y'])).toBeNull();
    expect(draws).toBe(0);
  });
});

describe('seenLines', () => {
  const lines: Utterance[] = [
    { actor: 'minori', line: 'かんりょう！', start: 0, end: 1_000 },
    { actor: 'kaname', line: 'それっ！', start: 500, end: 1_500 },
  ];

  it('gives the lines showing now, but none where the king’s call has the head', () => {
    expect(seenLines(lines, 600, { minori: 'はっ！' })).toEqual([lines[1]]);
    expect(seenLines(lines, 600, {})).toEqual(lines);
    expect(seenLines(lines, 1_000, {})).toEqual([lines[1]]);
    expect(seenLines(lines, 1_500, {})).toEqual([]);
    expect(seenLines(lines, -1, {})).toEqual([]);
  });
});

const say =
  (line: SpokenLine): PickLine =>
  () =>
    line;

describe('speakInTurn', () => {
  const giveAndTake: Turn[] = [
    { actor: 'kaname', scene: 'handOver', at: 1_000 },
    { actor: 'minori', scene: 'takeScroll', at: 3_100 },
  ];

  it('says nothing without a picker (the message queue only times scenes)', () => {
    expect(speakInTurn(giveAndTake, [], undefined)).toEqual([]);
  });

  it('shows each line from its time for as long as its moment says', () => {
    const lines = speakInTurn(giveAndTake, [], say('はい、どうぞ'));
    expect(lines).toEqual([
      { actor: 'kaname', line: 'はい、どうぞ', start: 1_000, end: 1_000 + LINES.giveMs },
      { actor: 'minori', line: 'はい、どうぞ', start: 3_100, end: 3_100 + LINES.takeMs },
    ]);
  });

  it('lets the next speaker wait until the line before is over', () => {
    const turns: Turn[] = [
      { actor: 'kaname', scene: 'toss', at: 0 },
      { actor: 'hibiki', scene: 'takeScroll', at: 900 },
    ];
    const [toss, take] = speakInTurn(turns, [], say('それっ！'));
    expect(toss?.end).toBe(LINES.tossMs);
    expect(take?.start).toBe(LINES.tossMs);
  });

  it('starts right as the one before ends: the two never show together', () => {
    const turns: Turn[] = [
      { actor: 'kaname', scene: 'handOver', at: 0 },
      { actor: 'sasae', scene: 'takeScroll', at: LINES.giveMs },
    ];
    const [a, b] = speakInTurn(turns, [], say('はーい'));
    expect(b?.start).toBe(a?.end);
  });
});

describe('speakInTurn: a member who still speaks', () => {
  const giveAndTake: Turn[] = [
    { actor: 'kaname', scene: 'handOver', at: 1_000 },
    { actor: 'minori', scene: 'takeScroll', at: 3_100 },
  ];

  it('drops a turn whose member still says a line of another scene, and does not pick for it', () => {
    const said: Utterance[] = [{ actor: 'minori', line: 'かんりょう！', start: 2_000, end: 3_200 }];
    const asked: string[] = [];
    const pick: PickLine = (actor) => {
      asked.push(actor);
      return 'はい、どうぞ';
    };
    const lines = speakInTurn(giveAndTake, said, pick);
    expect(lines.map((l) => l.actor)).toEqual(['kaname']);
    expect(asked).toEqual(['kaname']);
  });

  it('keeps a turn that starts right as the other line ends (end is exclusive)', () => {
    const said: Utterance[] = [{ actor: 'minori', line: 'かんりょう！', start: 1_000, end: 3_100 }];
    const lines = speakInTurn(giveAndTake, said, say('はい、どうぞ'));
    expect(lines.map((l) => l.actor)).toEqual(['kaname', 'minori']);
  });

  it('keeps a turn whose other member is the one still speaking', () => {
    const said: Utterance[] = [{ actor: 'hibiki', line: 'やったー！', start: 0, end: 9_000 }];
    expect(speakInTurn(giveAndTake, said, say('はーい'))).toHaveLength(2);
  });

  it('skips a turn nobody picks a line for; the next keeps its own time', () => {
    const pick: PickLine = (actor) => (actor === 'kaname' ? null : 'おまかせを');
    const turns: Turn[] = [
      { actor: 'kaname', scene: 'toss', at: 0 },
      { actor: 'minori', scene: 'takeScroll', at: 900 },
    ];
    expect(speakInTurn(turns, [], pick)).toEqual([
      { actor: 'minori', line: 'おまかせを', start: 900, end: 900 + LINES.takeMs },
    ]);
  });
});

describe('showMs', () => {
  it('keeps every line on screen 1.2 to 2.0 s', () => {
    const scenes = [
      'handOver',
      'toss',
      'takeScroll',
      'deliverChest',
      'takeChest',
      'clear',
      'seeClear',
      'kingTakeScroll',
      'kingClear',
      'seeKingClear',
    ] as const;
    for (const scene of scenes) {
      expect(showMs(scene)).toBeGreaterThanOrEqual(1_200);
      expect(showMs(scene)).toBeLessThanOrEqual(2_000);
    }
  });
});

describe('linesAt', () => {
  const lines: Utterance[] = [
    { actor: 'kaname', line: 'それっ！', start: 100, end: 200 },
    { actor: 'hibiki', line: 'まかせて！', start: 200, end: 300 },
  ];

  it('shows a line from its start up to (not at) its end', () => {
    expect(linesAt(lines, 99)).toEqual({});
    expect(linesAt(lines, 100)).toEqual({ kaname: 'それっ！' });
    expect(linesAt(lines, 199)).toEqual({ kaname: 'それっ！' });
    expect(linesAt(lines, 200)).toEqual({ hibiki: 'まかせて！' });
    expect(linesAt(lines, 300)).toEqual({});
  });
});
