import { describe, expect, it } from 'vitest';
import { KING_LEVEL, type PartyLevel } from '../app/partyLevel';
import type { MemberId } from '../guild.config';
import { levelsOf, levelTags, type LevelTag } from './levelTags';
import { MAP_OBJECTS, overlaps, spriteRect, TALLEST_WINDOW_EXTENTS, type PxRect } from './map';
import { OVERHEAD_TOP, TILE_SIZE } from './metrics';
import { bubbleBox, type BubbleOf } from './overhead';
import { DEFAULT_SEATS } from './scenes';

const ALL: Readonly<Record<Exclude<MemberId, 'yukihiro'>, number>> = {
  kaname: 4,
  minori: 3,
  hibiki: 2,
  hirame: 2,
  sasae: 99,
};

function level(value: number): PartyLevel {
  return { level: value, label: `Lv ${String(value)}`, progress: 0, detail: '' };
}

/** Generous box of a tag: 「Lv 99」 in bold 10px is about 26 px wide. */
function tagRect(tag: LevelTag): PxRect {
  return { left: tag.x - 16, right: tag.x + 16, top: tag.y - 7, bottom: tag.y + 7 };
}

function inside(tag: LevelTag, area: { col: number; row: number; w: number; h: number }): boolean {
  const rect = tagRect(tag);
  return (
    rect.left >= area.col * TILE_SIZE &&
    rect.right <= (area.col + area.w) * TILE_SIZE &&
    rect.top >= area.row * TILE_SIZE &&
    rect.bottom <= (area.row + area.h) * TILE_SIZE
  );
}

describe('levelsOf', () => {
  it('takes each member with a level and leaves the king out', () => {
    const rows: { id: MemberId; level: PartyLevel }[] = [
      { id: 'kaname', level: level(4) },
      { id: 'minori', level: level(1) },
      { id: 'yukihiro', level: KING_LEVEL },
    ];
    expect(levelsOf(rows)).toEqual({ kaname: 4, minori: 1 });
  });

  it('is empty before the first snapshot', () => {
    expect(levelsOf([])).toEqual({});
  });
});

describe('levelTags', () => {
  const tags = levelTags(ALL, DEFAULT_SEATS);

  it('draws 「Lv N」 for each member with a level, and none for the king', () => {
    expect(tags.map((tag) => tag.text)).toEqual(['Lv 4', 'Lv 3', 'Lv 2', 'Lv 2', 'Lv 99']);
    expect(levelTags({}, DEFAULT_SEATS)).toEqual([]);
  });

  it('puts each tag on the front of the desk (かなめ: the counter) in front of the seat', () => {
    for (const tag of tags) {
      const desk = MAP_OBJECTS.find(
        (object) =>
          (object.tile === 'desk' || object.tile.startsWith('counter')) && inside(tag, object),
      );
      expect(desk, tag.text).toBeDefined();
    }
  });

  it('stays below the heads, clear of every bubble and of the windows', () => {
    // A seated member from the feet up to the top of a bubble over the head.
    const seated = Object.values(DEFAULT_SEATS).map((seat) => {
      const sprite = spriteRect(seat);
      return { ...sprite, top: sprite.bottom - OVERHEAD_TOP };
    });
    for (const tag of tags) {
      for (const head of seated) expect(overlaps(tagRect(tag), head), tag.text).toBe(false);
      for (const window of Object.values(TALLEST_WINDOW_EXTENTS))
        expect(overlaps(tagRect(tag), window), tag.text).toBe(false);
    }
  });

  it('stays clear of the king’s summons and the replies (Issue #28) said at the seats', () => {
    // overhead.bubbleBox: the box, the tail and a shout's spikes, on either side of the head.
    const feetOn = (seat: { col: number; row: number }) => ({
      x: seat.col * TILE_SIZE + TILE_SIZE / 2,
      y: (seat.row + 1) * TILE_SIZE,
    });
    const said: readonly BubbleOf[] = [
      { voice: 'shout', chars: 1 },
      { voice: 'whisper', chars: 6 },
      { voice: 'say', chars: 3 },
    ];
    const boxes = Object.values(DEFAULT_SEATS).flatMap((seat) =>
      said.flatMap((bubble) =>
        (['right', 'left'] as const).map((side) => bubbleBox(feetOn(seat), bubble, side, 0)),
      ),
    );
    for (const tag of tags)
      for (const box of boxes) expect(overlaps(tagRect(tag), box), tag.text).toBe(false);
  });

  it('centres each tag on its seat, かなめ’s on the middle of the counter', () => {
    for (const [index, id] of (
      ['kaname', 'minori', 'hibiki', 'hirame', 'sasae'] as const
    ).entries())
      expect(tags[index]?.x, id).toBe(DEFAULT_SEATS[id].col * TILE_SIZE + TILE_SIZE / 2);
    const counter = MAP_OBJECTS.filter((object) => object.tile.startsWith('counter'));
    const left = Math.min(...counter.map((object) => object.col));
    const right = Math.max(...counter.map((object) => object.col + object.w));
    expect(tags[0]?.x).toBe(((left + right) / 2) * TILE_SIZE);
  });

  it('follows the seats it is given', () => {
    const [tag] = levelTags({ minori: 5 }, { ...DEFAULT_SEATS, minori: { col: 0, row: 0 } });
    expect(tag).toEqual({ text: 'Lv 5', x: TILE_SIZE / 2, y: TILE_SIZE + 46 });
  });
});
