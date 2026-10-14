import { describe, expect, it } from 'vitest';
import type { GuestView } from '../domain/guests';
import { bubbleShape, shapeExtent } from './bubbleShape';
import type { Random } from './confetti';
import {
  countText,
  createSparkle,
  GUEST,
  guestFeet,
  guestFrame,
  guestLook,
  guestTags,
  liveSparkles,
  markFeet,
  sparkleAt,
  stageGuestsOf,
  type GuestTag,
  type StageGuest,
} from './guests';
import { createGuestArt } from './guestArt';
import { levelTags } from './levelTags';
import { tagBox as levelTagBox } from './overhead';
import { DEFAULT_SEATS } from './scenes';
import { createGuestStage } from './guestStage';
import { LAYOUTS } from './layouts';
import type { GuildLayout } from './layouts/types';
import type { Point } from './path';
import { overlaps, spriteRect, tallestWindowExtentsFor, type PxRect } from './map';
import { DETAIL_SCALE, IDLE, OVERHEAD_OFFSET, TILE_SIZE } from './metrics';

const fixed: Random = () => 0.5;

function guest(index: number, over: Partial<StageGuest> = {}): StageGuest {
  return { index, name: `客${String(index)}`, state: 'idle', counts: null, ...over };
}

describe('stageGuestsOf', () => {
  it('keeps the name and the state, and the counts only of a repository read', () => {
    const views: GuestView[] = [
      {
        index: 0,
        name: 'たびびと',
        state: 'working',
        repo: { openIssues: 2, openPrs: 1, open: [] },
      },
      { index: 1, name: 'ぼうけんしゃ', state: 'idle', repo: null },
    ];
    expect(stageGuestsOf(views)).toEqual([
      { index: 0, name: 'たびびと', state: 'working', counts: { issues: 2, prs: 1 } },
      { index: 1, name: 'ぼうけんしゃ', state: 'idle', counts: null },
    ]);
  });
});

describe('guestLook', () => {
  it('shows the 「?」 while waiting for a permission, standing still', () => {
    for (const t of [0, 500, 1_300, 9_999]) {
      expect(guestLook(guest(0, { state: 'awaiting-permission' }), t, true)).toEqual({
        frame: 0,
        dy: 0,
        reading: false,
        mark: { kind: 'question' },
      });
    }
  });

  it('reads a scroll in the arms while working, bobbing a little', () => {
    const working = guest(0, { state: 'working' });
    expect(guestLook(working, 0, true)).toEqual({
      frame: 5,
      dy: 0,
      reading: true,
      mark: null,
    });
    expect(guestLook(working, GUEST.readMs / 2, true).dy).toBe(GUEST.readPx);
    // A sheet without the holding frames reads facing front.
    expect(guestLook(working, 0, false).frame).toBe(0);
  });

  it('dozes while resting or idle: a nod and a rising 「Z」', () => {
    for (const state of ['resting', 'idle'] as const) {
      const look = guestLook(guest(0, { state }), IDLE.nodMs / 2, true);
      expect(look.frame).toBe(0);
      expect(look.dy).toBe(IDLE.nodPx);
      expect(look.reading).toBe(false);
      expect(look.mark).toEqual({ kind: 'z', rise: IDLE.nodMs / 2 / IDLE.zRiseMs });
    }
  });

  it('moves the second guest behind the first, so they never nod as one', () => {
    const t = IDLE.nodMs / 2;
    expect(guestLook(guest(0), t, true).dy).toBe(IDLE.nodPx);
    expect(guestLook(guest(1), t, true).dy).toBe(0);
  });
});

describe('guestTags', () => {
  const feet = { x: 100, y: 400 };
  /** A message window under the feet, its top at `top`. */
  const below = (top: number): PxRect => ({ left: 50, right: 900, top, bottom: top + 60 });

  it('puts the name under the feet, and nothing else without a repository', () => {
    expect(guestTags(guest(0), feet, below(500))).toEqual([
      {
        text: '客0',
        kind: 'name',
        align: 'center',
        x: 100,
        y: 400 + GUEST.nameBelowFeet,
      },
    ]);
  });

  it('puts the counts under the name when they fit above the message window', () => {
    const tags = guestTags(guest(0, { counts: { issues: 3, prs: 1 } }), feet, below(500));
    expect(tags.map((tag) => [tag.text, tag.align, tag.y])).toEqual([
      ['客0', 'center', 400 + GUEST.nameBelowFeet],
      ['Issue 3 / PR 1', 'center', 400 + GUEST.nameBelowFeet + GUEST.countBelowName],
    ]);
  });

  it('puts the counts on the name line when they would reach the window', () => {
    const countY = 400 + GUEST.nameBelowFeet + GUEST.countBelowName;
    const tags = guestTags(
      guest(0, { counts: { issues: 0, prs: 2 } }),
      feet,
      below(countY + GUEST.countBelowName / 2 - 1),
    );
    expect(tags).toEqual([
      {
        text: '客0',
        kind: 'name',
        align: 'right',
        x: 100 - GUEST.tagGap,
        y: 400 + GUEST.nameBelowFeet,
      },
      {
        text: 'Issue 0 / PR 2',
        kind: 'count',
        align: 'left',
        x: 100 + GUEST.tagGap,
        y: 400 + GUEST.nameBelowFeet,
      },
    ]);
  });

  it('writes the counts as Issue n / PR m', () => {
    expect(countText({ issues: 12, prs: 0 })).toBe('Issue 12 / PR 0');
  });
});

describe('sparkles', () => {
  it('flies fewer, slower and smaller squares than confetti, for a short while', () => {
    const sparkle = createSparkle(1, 1_000, fixed);
    expect(sparkle.particles).toHaveLength(GUEST.sparkleCount);
    const feet = { x: 200, y: 400 };
    expect(sparkleAt(sparkle, 999, feet)).toBeNull();
    expect(sparkleAt(sparkle, 1_000, feet)?.origin).toEqual({ x: 200, y: 400 - OVERHEAD_OFFSET });
    expect(sparkleAt(sparkle, 1_000 + GUEST.sparkleMs - 1, feet)).not.toBeNull();
    expect(sparkleAt(sparkle, 1_000 + GUEST.sparkleMs, feet)).toBeNull();
    expect(liveSparkles([sparkle], 1_000 + GUEST.sparkleMs)).toEqual([]);
  });
});

describe('guestFrame', () => {
  const spots = [
    { col: 4, row: 13 },
    { col: 7, row: 12 },
  ];

  it('stands each guest at its spot and animates only while a sparkle flies', () => {
    const guests = [guest(0), guest(1, { state: 'working' })];
    const idle = guestFrame({ guests, sparkles: [], spots }, 0, () => true);
    expect(idle.poses.map((p) => p.feet)).toEqual(spots.map(guestFeet));
    expect(idle.animating).toBe(false);
    const sparkles = [createSparkle(1, 0, fixed)];
    const busy = guestFrame({ guests, sparkles, spots }, 10, () => true);
    expect(busy.sparkles).toHaveLength(1);
    expect(busy.animating).toBe(true);
  });

  it('draws no sparkle for a guest who is not there', () => {
    const frame = guestFrame(
      { guests: [guest(0)], sparkles: [createSparkle(1, 0, fixed)], spots },
      10,
      () => true,
    );
    expect(frame.sparkles).toEqual([]);
  });
});

describe('createGuestStage', () => {
  const spots = [
    { col: 4, row: 13 },
    { col: 7, row: 12 },
  ];

  it('sparkles only a guest that is there, and drops the sparkles when told', () => {
    const stage = createGuestStage(spots, () => true, fixed);
    stage.sparkle(0, 0);
    expect(stage.frameAt(10).sparkles).toEqual([]);
    stage.set([guest(0)]);
    stage.sparkle(0, 0);
    expect(stage.frameAt(10).sparkles).toHaveLength(1);
    stage.clearSparkles();
    expect(stage.frameAt(20).animating).toBe(false);
  });

  it('drops the sparkles while the screen is halted and starts none until it is back', () => {
    const stage = createGuestStage(spots, () => true, fixed);
    stage.set([guest(0)]);
    stage.sparkle(0, 0);
    stage.setHalted(true);
    expect(stage.frameAt(10).sparkles).toEqual([]);
    stage.sparkle(0, 20);
    expect(stage.frameAt(30).sparkles).toEqual([]);
    stage.setHalted(false);
    stage.sparkle(0, 40);
    expect(stage.frameAt(50).sparkles).toHaveLength(1);
  });

  it('forgets a sparkle once it is over', () => {
    const stage = createGuestStage(spots, () => true, fixed);
    stage.set([guest(0)]);
    stage.sparkle(0, 0);
    expect(stage.frameAt(GUEST.sparkleMs).sparkles).toEqual([]);
  });
});

/** The 「?」 beside the head, drawn from markFeet (drawBubble's frame: detail px). */
function questionRect(feet: { x: number; y: number }): PxRect {
  const at = markFeet(feet, { kind: 'question' });
  const e = shapeExtent(bubbleShape('glyph', 1, 'beside-right'));
  const top = at.y - OVERHEAD_OFFSET;
  return {
    left: at.x + e.left * DETAIL_SCALE,
    right: at.x + e.right * DETAIL_SCALE,
    top: top + e.top * DETAIL_SCALE,
    bottom: top + e.bottom * DETAIL_SCALE,
  };
}

/** The 「Z」 over its whole rise (draw.drawSleepZ: 8 px text at 6–8 detail px right). */
function zRect(feet: { x: number; y: number }): PxRect {
  const at = markFeet(feet, { kind: 'z', rise: 0 });
  const top = at.y - OVERHEAD_OFFSET;
  return {
    left: at.x + 2 * DETAIL_SCALE,
    right: at.x + 12 * DETAIL_SCALE,
    top: top - IDLE.zRisePx - 4 * DETAIL_SCALE,
    bottom: top + 4 * DETAIL_SCALE,
  };
}

/**
 * How wide a tag is drawn at most (drawGuests.ts: the name in bold 10 px, the counts in bold 9 px,
 * with a 1 px dark rim filled around it): a full-width character as wide as the font, any other 0.65 of it, and the
 * outline's 1 px on each side.
 */
const OUTLINE_PX = 1;
function tagBox(tag: GuestTag): PxRect {
  const font = tag.kind === 'name' ? 10 : 9;
  const natural = Array.from(tag.text).reduce(
    (sum, char) => sum + ((char.codePointAt(0) ?? 0) >= 0x2e80 ? font : font * 0.65),
    0,
  );
  const width = natural;
  const left = { center: tag.x - width / 2, left: tag.x, right: tag.x - width }[tag.align];
  return {
    left: left - OUTLINE_PX,
    right: left + width + OUTLINE_PX,
    top: tag.y - font / 2 - OUTLINE_PX,
    bottom: tag.y + font / 2 + OUTLINE_PX,
  };
}

/** A tile rectangle in logical px. */
function tilePx(area: { col: number; row: number; w: number; h: number }): PxRect {
  return {
    left: area.col * TILE_SIZE,
    top: area.row * TILE_SIZE,
    right: (area.col + area.w) * TILE_SIZE,
    bottom: (area.row + area.h) * TILE_SIZE,
  };
}

/**
 * The drawn figure of a guest on `spot`: assets/sprites/guest1.png and guest2.png fill x 8–70 and
 * y 6–79 of each 80 px frame (measured over all seven frames, 2026-10-15).
 */
function bodyRect(spot: { col: number; row: number }): PxRect {
  const frame = spriteRect(spot);
  return { left: frame.left + 8, right: frame.left + 71, top: frame.top + 6, bottom: frame.bottom };
}

/** The tags of a guest at `feet` in `layout`, with a six-character name as the fictional guests have. */
function ordinaryTags(layout: GuildLayout, index: number, feet: Point): GuestTag[] {
  return guestTags(
    guest(index, { name: 'ぼうけんしゃ', counts: { issues: 99, prs: 99 } }),
    feet,
    tallestWindowExtentsFor(layout).message,
  );
}

/**
 * Every guest spot of every layout (5 departments have one, 6 none: the seven on stage, settings),
 * with its index and feet.
 */
const SPOTS = Object.entries(LAYOUTS).flatMap(([count, layout]) =>
  layout.guestSpots.map((spot, index) => ({ count, layout, spot, index, feet: guestFeet(spot) })),
);

describe.each(SPOTS)('guest $index of layout $count', ({ layout, spot, index, feet }) => {
  const { board, party, message } = tallestWindowExtentsFor(layout);

  it('keeps its marks clear of the windows', () => {
    for (const area of [board, party, message]) {
      expect(overlaps(questionRect(feet), area)).toBe(false);
      expect(overlaps(zRect(feet), area)).toBe(false);
    }
  });

  it('keeps its tags clear of the board and the party window', () => {
    // The longest name the settings accept (12 characters) and four-digit counts.
    const tags = guestTags(
      guest(index, { name: 'じゅうにもじのおきゃくさ', counts: { issues: 9999, prs: 9999 } }),
      feet,
      message,
    );
    for (const tag of tags) {
      for (const area of [board, party]) expect(overlaps(tagBox(tag), area), tag.text).toBe(false);
    }
  });

  it('keeps its tags off the red rug and the desks', () => {
    const rugs = layout.groundFills.filter((fill) => fill.tile === 'rug-red').map(tilePx);
    const desks = layout.objects.filter((object) => object.tile === 'desk').map(tilePx);
    for (const tag of ordinaryTags(layout, index, feet)) {
      for (const area of [...rugs, ...desks]) {
        expect(overlaps(tagBox(tag), area), tag.text).toBe(false);
      }
    }
  });

  it('keeps itself and its 「?」 off the 「Lv N」 of every desk', () => {
    const mark = questionRect(feet);
    for (const desk of layout.desks) {
      const [tag] = levelTags({ minori: 99 }, { ...DEFAULT_SEATS, minori: desk.seat });
      if (tag === undefined) throw new Error('no tag');
      expect(overlaps(bodyRect(spot), levelTagBox(tag))).toBe(false);
      expect(overlaps(mark, levelTagBox(tag))).toBe(false);
    }
  });

  it('keeps its tags off the other guest', () => {
    const others = layout.guestSpots.filter((_, i) => i !== index).map(bodyRect);
    for (const tag of ordinaryTags(layout, index, feet)) {
      for (const other of others) expect(overlaps(tagBox(tag), other), tag.text).toBe(false);
    }
  });

  it('keeps its tags above the message window', () => {
    const tags = guestTags(
      guest(index, { name: '十二文字のながいおきゃくさん', counts: { issues: 100, prs: 100 } }),
      feet,
      message,
    );
    for (const tag of tags) expect(tag.y + 5).toBeLessThanOrEqual(message.top);
  });
});

describe('createGuestArt', () => {
  const sheet: ImageBitmap = { width: 560, height: 80, close: () => undefined };
  const short: ImageBitmap = { width: 320, height: 80, close: () => undefined };

  it('reads with the arms in front only from a sheet that has the holding frames', () => {
    const art = createGuestArt([sheet, short]);
    expect(art.hasHoldFrames(0)).toBe(true);
    expect(art.hasHoldFrames(1)).toBe(false);
  });

  it('keeps the other guest’s picture when one could not be loaded', () => {
    const art = createGuestArt([null, sheet]);
    expect(art.hasHoldFrames(0)).toBe(false);
    expect(art.hasHoldFrames(1)).toBe(true);
    expect(art.hasHoldFrames(2)).toBe(false);
  });
});
