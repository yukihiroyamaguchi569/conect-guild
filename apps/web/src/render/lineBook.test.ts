import { describe, expect, it } from 'vitest';
import { memberIdSchema } from '@conect-guild/snapshot/settings';
import type { MemberId } from '../guild.config';
import {
  hasOwnLines,
  LINE_BOOK,
  linesOf,
  sceneOfLine,
  SHARED_LINES,
  type LineScene,
  type SpokenLine,
} from './lineBook';

const MEMBERS: readonly MemberId[] = memberIdSchema.options;
const SCENES: readonly LineScene[] = [
  'handOver',
  'toss',
  'takeScroll',
  'deliverChest',
  'takeChest',
  'clear',
  'seeClear',
  'awaitPresident',
  'awaitKaname',
  'awaitPermission',
  'work',
  'idle',
  'doze',
  'sleepTalk',
  'tea',
  'pet',
  'chat',
  'windowMorning',
  'windowDay',
  'windowEvening',
  'windowNight',
];

/** Every (member, moment, lines) in the book. */
const ENTRIES = MEMBERS.flatMap((id) =>
  SCENES.map((scene) => ({ id, scene, lines: linesOf(id, scene) })).filter(
    (entry) => entry.lines.length > 0,
  ),
);
const ALL_LINES = ENTRIES.flatMap((entry) => entry.lines);

/** Hiragana, katakana (with the long-vowel mark) and the few signs a bubble may carry. */
const ALLOWED = /^[ぁ-ゖァ-ヺー〜！？…、♪]+$/u;

describe('line book: every line', () => {
  it('has lines to check', () => {
    expect(ALL_LINES.length).toBeGreaterThan(50);
  });

  it.each(ALL_LINES)('「%s」 is 1 to 7 characters', (line) => {
    const length = Array.from(line).length;
    expect(length).toBeGreaterThanOrEqual(1);
    expect(length).toBeLessThanOrEqual(7);
  });

  it.each(ALL_LINES)('「%s」 uses only kana and the allowed signs', (line) => {
    expect(line).toMatch(ALLOWED);
  });

  it('rejects what the check must catch: kanji, digits, latin letters, "#", spaces', () => {
    for (const bad of ['承りました', 'いち1', 'OK！', '#12', 'は い', 'はい　！', 'ｱｲｳ']) {
      expect(bad).not.toMatch(ALLOWED);
    }
  });

  it('keeps out the lines the president struck as reading like company news', () => {
    expect(ALL_LINES).not.toContain('くろじです！');
    expect(ALL_LINES).not.toContain('バズった！');
  });
});

describe('line book: each moment', () => {
  it.each(ENTRIES)('$id at $scene has at least 3 lines, none twice', ({ lines }) => {
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('gives かなめ the reception and handover moments, the review and the permission', () => {
    expect(new Set(Object.keys(LINE_BOOK.kaname))).toEqual(
      new Set([
        'clear',
        'handOver',
        'takeChest',
        'takeScroll',
        'toss',
        'awaitKaname',
        'awaitPermission',
        'work',
        'idle',
      ]),
    );
  });

  it.each(['minori', 'hibiki', 'hirame', 'sasae', 'takumi', 'musubi'] as const)(
    'gives %s the moments of a department and its three waits',
    (id) => {
      expect(new Set(Object.keys(LINE_BOOK[id]))).toEqual(
        new Set([
          'clear',
          'deliverChest',
          'takeScroll',
          'awaitPresident',
          'awaitKaname',
          'awaitPermission',
          'work',
          'idle',
        ]),
      );
    },
  );

  it.each(MEMBERS)('gives %s no line at two moments (a line tells its moment)', (id) => {
    const own = ENTRIES.filter((entry) => entry.id === id).flatMap((entry) => entry.lines);
    expect(new Set(own).size).toBe(own.length);
    for (const entry of ENTRIES.filter((e) => e.id === id)) {
      for (const line of entry.lines) expect(sceneOfLine(id, line)).toBe(entry.scene);
    }
  });

  it('lets the king react only to a clear, and murmur on the throne and in his sleep', () => {
    expect(Object.keys(LINE_BOOK.yukihiro)).toEqual(['seeClear', 'idle', 'sleepTalk']);
  });

  it('has nothing for a member at a moment they never speak at', () => {
    expect(linesOf('yukihiro', 'handOver')).toEqual([]);
    expect(linesOf('minori', 'toss')).toEqual([]);
    expect(linesOf('kaname', 'seeClear')).toEqual([]);
    // かなめ never waits for the president's approval, and the king has no waiting bubble here.
    expect(linesOf('kaname', 'awaitPresident')).toEqual([]);
    expect(linesOf('yukihiro', 'awaitPermission')).toEqual([]);
  });
});

describe('line book: murmurs', () => {
  it('shares the play spots, dozing and sleeping, but the king talks in his sleep his own way', () => {
    expect(new Set(Object.keys(SHARED_LINES))).toEqual(
      new Set([
        'tea',
        'pet',
        'chat',
        'windowMorning',
        'windowDay',
        'windowEvening',
        'windowNight',
        'doze',
        'sleepTalk',
      ]),
    );
    expect(linesOf('minori', 'tea')).toEqual(SHARED_LINES.tea);
    expect(hasOwnLines('minori', 'tea')).toBe(false);
    expect(linesOf('yukihiro', 'sleepTalk')).toEqual(LINE_BOOK.yukihiro.sleepTalk);
    expect(hasOwnLines('yukihiro', 'sleepTalk')).toBe(true);
    expect(linesOf('sasae', 'sleepTalk')).toEqual(SHARED_LINES.sleepTalk);
    expect(hasOwnLines('kaname', 'work')).toBe(true);
  });

  it('keeps every member’s name out of every line, even as a word (ひらめく)', () => {
    for (const name of [
      'かなめ',
      'みのり',
      'ひびき',
      'ひらめ',
      'ささえ',
      'たくみ',
      'むすび',
      'ゆきひろ',
    ]) {
      expect(ALL_LINES.filter((line) => line.includes(name))).toEqual([]);
    }
  });
});

describe('line book: types', () => {
  /** A title read from a snapshot is a plain string. */
  function leak(title: string): SpokenLine[] {
    const fromBook: SpokenLine = 'みごとじゃ！';
    // @ts-expect-error an outside string is not a line of the book
    const leaked: SpokenLine = title;
    return [fromBook, leaked];
  }

  it('takes only the lines of the book as a spoken line (checked by the type check)', () => {
    expect(leak('Issue の題名')).toHaveLength(2);
  });
});
