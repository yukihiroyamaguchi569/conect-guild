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
  type StageGuest,
} from './guests';
import { createGuestArt } from './guestArt';
import { createGuestStage } from './guestStage';
import { LAYOUTS } from './layouts';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  overlaps,
  tallestWindowExtentsFor,
  type PxRect,
} from './map';
import { DETAIL_SCALE, IDLE, OVERHEAD_OFFSET } from './metrics';

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
        maxWidth: null,
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
        maxWidth: null,
      },
      {
        text: 'Issue 0 / PR 2',
        kind: 'count',
        align: 'left',
        x: 100 + GUEST.tagGap,
        y: 400 + GUEST.nameBelowFeet,
        maxWidth: null,
      },
    ]);
  });

  it('writes the counts as Issue n / PR m', () => {
    expect(countText({ issues: 12, prs: 0 })).toBe('Issue 12 / PR 0');
  });
});

describe('guestTags beside the message window', () => {
  it('keeps both lines in the span beside the window for a guest standing next to it', () => {
    const window = { left: 100, right: 900, top: 380, bottom: 560 };
    const right = guestTags(
      guest(0, { counts: { issues: 1, prs: 1 } }),
      { x: 960, y: 400 },
      window,
    );
    const span = {
      x: (900 + GUEST.tagGap + LOGICAL_WIDTH - GUEST.tagGap) / 2,
      maxWidth: LOGICAL_WIDTH - 900 - 2 * GUEST.tagGap,
    };
    expect(right.map(({ align, x, maxWidth }) => ({ align, x, maxWidth }))).toEqual([
      { align: 'center', ...span },
      { align: 'center', ...span },
    ]);
    const left = guestTags(guest(0), { x: 60, y: 400 }, window);
    expect(left).toMatchObject([{ x: 50, maxWidth: 100 - 2 * GUEST.tagGap }]);
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

describe.each(Object.entries(LAYOUTS))('the guests of layout %s', (_count, layout) => {
  const windows = Object.values(tallestWindowExtentsFor(layout));
  const message = tallestWindowExtentsFor(layout).message;

  it.each([0, 1])('keep the marks of guest %i clear of the windows', (index) => {
    const feet = guestFeet(layout.guestSpots[index] ?? { col: 0, row: 0 });
    for (const area of windows) {
      expect(overlaps(questionRect(feet), area)).toBe(false);
      expect(overlaps(zRect(feet), area)).toBe(false);
    }
  });

  it.each([0, 1])('keep the tags of guest %i above the message window', (index) => {
    const feet = guestFeet(layout.guestSpots[index] ?? { col: 0, row: 0 });
    const tags = guestTags(
      guest(index, { name: '十二文字のながいおきゃくさん', counts: { issues: 100, prs: 100 } }),
      feet,
      message,
    );
    for (const tag of tags) {
      // Over the window: above its top. Beside it: within the span between it and the canvas edge.
      if (tag.maxWidth === null) {
        expect(tag.y + 5).toBeLessThanOrEqual(message.top);
      } else {
        const [left, right] = [tag.x - tag.maxWidth / 2, tag.x + tag.maxWidth / 2];
        const clear = left >= message.right || right <= message.left;
        expect(clear && left >= 0 && right <= LOGICAL_WIDTH).toBe(true);
        expect(tag.y + 5).toBeLessThanOrEqual(LOGICAL_HEIGHT);
      }
    }
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
