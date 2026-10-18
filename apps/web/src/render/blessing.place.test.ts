import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import { BLESSINGS } from './blessing';
import { EMPTY_DIRECTOR, frameAt } from './director';
import { levelTags, type LevelTag } from './levelTags';
import { linesOf, type LineScene, type SpokenLine } from './lineBook';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TALLEST_WINDOW_EXTENTS } from './map';
import type { Box } from './overhead';
import { placeOverheads, placedBox } from './overheadPlace';
import { DEFAULT_SEATS } from './scenes';

/**
 * The king's words for a click (Issue #187) over the throne: clear of the 「Lv N」 tags, the HTML
 * windows, the edges of the canvas and みのり's bubble down left of him, as his other words are
 * (lines.tags.test.ts).
 */

function tagBox(tag: LevelTag): Box {
  return { left: tag.x - 16, right: tag.x + 16, top: tag.y - 7, bottom: tag.y + 7 };
}

function meet(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

const LEVEL_TAGS = levelTags(
  { kaname: 99, minori: 99, hibiki: 99, hirame: 99, sasae: 99 },
  DEFAULT_SEATS,
);
const TAGS = LEVEL_TAGS.map(tagBox);
const WINDOWS = Object.values(TALLEST_WINDOW_EXTENTS);
const MEMBERS = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS).members;
const EMPTY = { speeches: {}, lines: {}, remarks: {}, bubbles: {}, murmurs: {} };

function boxOver(id: MemberId, sources: Parameters<typeof placeOverheads>[1]): Box {
  const placed = placeOverheads(MEMBERS, sources, LEVEL_TAGS).find((p) => p.id === id);
  if (placed === undefined) throw new Error(`nothing over ${id}`);
  return placedBox(placed);
}

/** みのり's longest line at `scene`: she may say one while the king speaks. */
function longest(scene: LineScene): SpokenLine | undefined {
  return linesOf('minori', scene).toSorted(
    (a, b) => Array.from(b).length - Array.from(a).length,
  )[0];
}

describe('the king’s words for a click on the throne', () => {
  it.each(BLESSINGS)('「%s」 meets no tag, no window, no edge and no bubble of みのり', (words) => {
    const box = boxOver('yukihiro', { ...EMPTY, speeches: { yukihiro: words } });
    expect(TAGS.filter((tag) => meet(box, tag))).toEqual([]);
    expect(WINDOWS.filter((area) => meet(box, area))).toEqual([]);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(LOGICAL_WIDTH);
    expect(box.bottom).toBeLessThanOrEqual(LOGICAL_HEIGHT);
    for (const scene of ['clear', 'awaitPresident', 'awaitKaname', 'awaitPermission'] as const) {
      const line = longest(scene);
      if (line === undefined) continue;
      const other = boxOver('minori', { ...EMPTY, lines: { minori: line } });
      expect({ scene, meet: meet(box, other) }).toEqual({ scene, meet: false });
    }
  });
});
