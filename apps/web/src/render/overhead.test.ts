import { describe, expect, it } from 'vitest';
import type { IdleMark } from './idle';
import type { LevelTag } from './levelTags';
import { BUBBLE_RISE, DETAIL_SCALE, HOLD, LINES, OVERHEAD_OFFSET } from './metrics';
import { carry, raise } from './motion';
import { raisedItemPoint } from './toss';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';
import { TALLEST_WINDOW_EXTENTS } from './map';
import {
  bubbleBox,
  bubbleOf,
  overheadLift,
  overheadOf,
  overheadSide,
  tagBox,
  voiceOf,
  wordsBox,
  wordsOf,
  type Overhead,
  type OverheadSources,
} from './overhead';

const MARK: IdleMark = { kind: 'bubble', glyph: '♪' };

const ALL: OverheadSources = {
  speeches: { minori: 'はっ！' },
  lines: { minori: 'おまかせを' },
  remarks: { minori: 'ごしょうにんを' },
  bubbles: { minori: 'awaiting-president' },
  murmurs: { minori: 'ぱちぱち…' },
};

type Source = 'speeches' | 'lines' | 'remarks' | 'bubbles' | 'murmurs';

function drop(...keys: Source[]): OverheadSources {
  return { ...ALL, ...Object.fromEntries(keys.map((key) => [key, {}])) };
}

const seated = { id: 'minori', inScene: false, mark: MARK } as const;

describe('overheadOf: one thing over a head, the first that is there', () => {
  it.each<[string, OverheadSources, Overhead | null]>([
    ['the words of the king’s call first', ALL, { kind: 'speech', words: 'はっ！' }],
    ['then a line of a scene', drop('speeches'), { kind: 'line', words: 'おまかせを' }],
    [
      'then a line on starting to wait',
      drop('speeches', 'lines'),
      { kind: 'line', words: 'ごしょうにんを' },
    ],
    [
      'then the waiting bubble',
      drop('speeches', 'lines', 'remarks'),
      { kind: 'bubble', bubble: 'awaiting-president' },
    ],
    [
      'then a murmur',
      drop('speeches', 'lines', 'remarks', 'bubbles'),
      { kind: 'murmur', words: 'ぱちぱち…' },
    ],
    [
      'then the sign of an idle spell',
      drop('speeches', 'lines', 'remarks', 'bubbles', 'murmurs'),
      { kind: 'mark', mark: MARK },
    ],
  ])('%s', (_name, sources, expected) => {
    expect(overheadOf(seated, sources)).toEqual(expected);
  });

  it('shows nothing when there is nothing', () => {
    expect(
      overheadOf(
        { ...seated, mark: null },
        drop('speeches', 'lines', 'remarks', 'bubbles', 'murmurs'),
      ),
    ).toBeNull();
  });

  it('shows a line of a scene while the member is in it (the waiting bubble hides there)', () => {
    const inScene = { id: 'minori', inScene: true, mark: null } as const;
    expect(overheadOf(inScene, drop('speeches'))).toEqual({ kind: 'line', words: 'おまかせを' });
    expect(overheadOf(inScene, drop('speeches', 'lines'))).toBeNull();
  });

  it('hides a line on starting to wait in a scene, as the waiting bubble (it is the seat’s)', () => {
    const inScene = { id: 'minori', inScene: true, mark: MARK } as const;
    expect(overheadOf(inScene, drop('speeches', 'lines', 'bubbles'))).toEqual({
      kind: 'mark',
      mark: MARK,
    });
  });

  it('looks only at the member’s own entries', () => {
    const others: OverheadSources = {
      speeches: { yukihiro: '！' },
      lines: { kaname: 'それっ！' },
      remarks: { sasae: 'おねがいね' },
      bubbles: { hibiki: 'awaiting-permission' },
      murmurs: { hirame: 'メモメモ' },
    };
    expect(overheadOf({ ...seated, mark: null }, others)).toBeNull();
  });
});

describe('overheadOf: murmurs (murmurs.ts)', () => {
  it('hides a murmur in a scene: it is said out of scenes only', () => {
    const inScene = { id: 'minori', inScene: true, mark: null } as const;
    expect(overheadOf(inScene, drop('speeches', 'lines', 'remarks', 'bubbles'))).toBeNull();
  });
});

const FEET = { x: 0, y: 500 };

describe('overheadLift', () => {
  it('lifts what is over the head only while an item is held up over it', () => {
    for (const words of [null, 'はい、どうぞ']) {
      expect(overheadLift({ point: FEET, held: raise('scroll') }, words, [])).toBe(
        LINES.raisedLiftPx,
      );
      expect(overheadLift({ point: FEET, held: raise('chest') }, words, [])).toBe(
        LINES.raisedLiftPx,
      );
      expect(overheadLift({ point: FEET, held: carry('chest') }, words, [])).toBe(0);
      expect(overheadLift({ point: FEET, held: null }, words, [])).toBe(0);
    }
  });
});

describe('overheadLift: clear of the level tags', () => {
  const seated = { point: FEET, held: null };
  const box = wordsBox(FEET, 6, 0);
  /** A tag centred on the bubble's right end, half way down the bubble. */
  const under: LevelTag = { text: 'Lv 9', x: box.right - 4, y: box.bottom - 4 };

  it('measures the words as drawBubble draws them: the box, the tail and the shadow', () => {
    // 6 characters of 8 px, 3 px of padding and a 1 px border each side, 2 px right of the feet
    // (the tail leans back to the feet' x); 14 px high over the point over the head, the tail 4
    // rows under it, the shadow 1 px right and down.
    const top = FEET.y - OVERHEAD_OFFSET - BUBBLE_RISE * DETAIL_SCALE;
    expect(BUBBLE_RISE).toBe(14);
    expect(box).toEqual({
      left: FEET.x,
      right: (2 + 6 * 8 + 8 + 1) * DETAIL_SCALE,
      top,
      bottom: top + (14 + 4 + 1) * DETAIL_SCALE,
    });
  });

  it('lifts words that would meet a tag until they are tagGapPx over it', () => {
    const lift = overheadLift(seated, 'はい、どうぞ', [under]);
    expect(lift).toBe(box.bottom - tagBox(under).top + LINES.tagGapPx);
    const lifted = wordsBox(FEET, 6, lift);
    expect(tagBox(under).top - lifted.bottom).toBe(LINES.tagGapPx);
  });

  it('lifts over the tag from where a raised item put the words', () => {
    const raised = { point: FEET, held: raise('chest') };
    const high = wordsBox(FEET, 6, LINES.raisedLiftPx);
    const tag: LevelTag = { text: 'Lv 9', x: high.right - 4, y: high.bottom - 4 };
    expect(overheadLift(raised, 'はい、どうぞ', [tag])).toBe(
      LINES.raisedLiftPx + high.bottom - tagBox(tag).top + LINES.tagGapPx,
    );
  });

  it('leaves words that end before the tag where they are (the width counts)', () => {
    expect(overheadLift(seated, 'はい', [under])).toBe(0);
  });

  it('leaves a tag just under the bubble alone (edges that touch do not meet)', () => {
    const below: LevelTag = { text: 'Lv 9', x: box.left + 20, y: box.bottom + 7 };
    expect(tagBox(below).top).toBe(box.bottom);
    expect(overheadLift(seated, 'はい、どうぞ', [below])).toBe(0);
  });

  it('never lifts a sign with no words for a tag', () => {
    expect(overheadLift(seated, null, [under])).toBe(0);
  });

  it('goes on over a tag it meets only once lifted over the first', () => {
    // Clear of the bubble where it is (its bottom 1 px over the top), met once it goes up.
    const above: LevelTag = { ...under, y: box.top - 8 };
    expect(tagBox(above).bottom).toBeLessThan(box.top);
    const lift = overheadLift(seated, 'はい、どうぞ', [under, above]);
    const lifted = wordsBox(FEET, 6, lift);
    expect(tagBox(above).top - lifted.bottom).toBe(LINES.tagGapPx);
    expect(lift).toBeGreaterThan(overheadLift(seated, 'はい、どうぞ', [under]));
  });

  it('goes over the highest of two tags it meets', () => {
    const higher: LevelTag = { ...under, x: box.left + 20, y: box.top + 2 };
    expect(overheadLift(seated, 'はい、どうぞ', [under, higher])).toBe(
      box.bottom - tagBox(higher).top + LINES.tagGapPx,
    );
  });
});

describe('voiceOf and bubbleOf (Issue #77)', () => {
  it('shouts the king’s 「！」 and whispers 「ゴニョゴニョ」; other words of the call are said', () => {
    expect(voiceOf({ kind: 'speech', words: '！' })).toBe('shout');
    expect(voiceOf({ kind: 'speech', words: 'ゴニョゴニョ' })).toBe('whisper');
    expect(voiceOf({ kind: 'speech', words: 'はっ！' })).toBe('say');
  });

  it('says a line, whispers a murmur and draws the waiting bubble and idle signs as glyphs', () => {
    expect(voiceOf({ kind: 'line', words: 'おまかせを' })).toBe('say');
    expect(voiceOf({ kind: 'murmur', words: 'ぱちぱち…' })).toBe('whisper');
    expect(voiceOf({ kind: 'bubble', bubble: 'awaiting-permission' })).toBe('glyph');
    expect(voiceOf({ kind: 'mark', mark: MARK })).toBe('glyph');
  });

  it('gives the 「Z」 of a sleeper no bubble', () => {
    const z: Overhead = { kind: 'mark', mark: { kind: 'z', rise: 0.5 } };
    expect(voiceOf(z)).toBeNull();
    expect(bubbleOf(z)).toBeNull();
  });

  it('counts the characters of the words; a glyph is one', () => {
    expect(bubbleOf({ kind: 'line', words: 'おまかせを' })).toEqual({ voice: 'say', chars: 5 });
    expect(bubbleOf({ kind: 'bubble', bubble: 'awaiting-kaname' })).toEqual({
      voice: 'glyph',
      chars: 1,
    });
  });
});

describe('wordsOf', () => {
  it('gives the words of the summons, a line and a murmur, and nothing for a bubble or a sign', () => {
    expect(wordsOf({ kind: 'speech', words: 'はっ！' })).toBe('はっ！');
    expect(wordsOf({ kind: 'line', words: 'おまかせを' })).toBe('おまかせを');
    expect(wordsOf({ kind: 'murmur', words: 'ぱちぱち…' })).toBe('ぱちぱち…');
    expect(wordsOf({ kind: 'bubble', bubble: 'awaiting-kaname' })).toBeNull();
    expect(wordsOf({ kind: 'mark', mark: MARK })).toBeNull();
  });
});

describe('overheadLift: clear of the raised item', () => {
  it.each(['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'] as const)(
    '%s: the lifted bubble and its tail end above the top of a raised scroll or chest',
    (id) => {
      const feet = { x: 0, y: 500 };
      for (const prop of ['scroll', 'chest'] as const) {
        for (const holdFrames of [true, false]) {
          const item = raisedItemPoint(id, feet, prop, holdFrames);
          const itemTop = item.y - HOLD.raisedItemHalfPx;
          const lift = overheadLift({ point: feet, held: raise(prop) }, null, []);
          const glyph = bubbleBox(feet, { voice: 'glyph', chars: 1 }, 'right', lift);
          expect(glyph.bottom).toBeLessThanOrEqual(itemTop);
          const words = wordsBox(feet, 7, lift);
          expect(words.bottom).toBeLessThanOrEqual(itemTop);
        }
      }
    },
  );
});

describe('overheadSide: words keep clear of the HTML windows', () => {
  const sasae = { point: tileToPoint(DEFAULT_SEATS.sasae), held: null };
  const party = TALLEST_WINDOW_EXTENTS.party;

  it('puts words on the right as long as they stay left of the party column', () => {
    expect(overheadSide(sasae, 'はっ！')).toBe('right');
    expect(wordsBox(sasae.point, 3, 0, 'right').right).toBeLessThanOrEqual(party.left);
  });

  it('puts words on the left when on the right they would go under the party column', () => {
    expect(wordsBox(sasae.point, 4, 0, 'right').right).toBeGreaterThan(party.left);
    expect(overheadSide(sasae, 'おまたせ')).toBe('left');
    expect(overheadSide(sasae, 'いいかしら？')).toBe('left');
  });

  it('mirrors the bubble on the left: as wide, the tail leaning back to the feet', () => {
    const right = wordsBox(sasae.point, 6, 0, 'right');
    const left = wordsBox(sasae.point, 6, 0, 'left');
    // The tail's tip ends at the feet's x on either side (and its shadow 1 detail px right of it).
    expect(right.left).toBe(sasae.point.x);
    expect(left.right).toBe(sasae.point.x + DETAIL_SCALE);
    expect(left.right - left.left).toBe(right.right - right.left);
    expect({ top: left.top, bottom: left.bottom }).toEqual({
      top: right.top,
      bottom: right.bottom,
    });
  });

  it('keeps the waiting bubble and the signs (no words) on the right', () => {
    expect(overheadSide(sasae, null)).toBe('right');
  });

  it('keeps words on the right for a seat far from the windows, whatever their length', () => {
    const hirame = { point: tileToPoint(DEFAULT_SEATS.hirame), held: null };
    expect(overheadSide(hirame, 'おうさま、ぜひ')).toBe('right');
  });

  it('lifts the words on the side they are drawn on', () => {
    const tag = {
      x: sasae.point.x - 60,
      y: wordsBox(sasae.point, 6, 0, 'left').bottom,
      text: 'Lv 9',
    };
    expect(overheadLift(sasae, 'いいかしら？', [tag])).toBeGreaterThan(0);
    expect(overheadLift(sasae, 'はっ！', [tag])).toBe(0);
  });
});
