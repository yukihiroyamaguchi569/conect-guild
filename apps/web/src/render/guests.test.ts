import { describe, expect, it } from 'vitest';
import type { GuestView } from '../domain/guests';
import { bubbleShape, shapeExtent } from './bubbleShape';
import type { Random } from './confetti';
import {
  createSparkle,
  GUEST,
  guestFeet,
  guestFrame,
  guestLook,
  liveSparkles,
  markFeet,
  sparkleAt,
  stageGuestsOf,
  type StageGuest,
} from './guests';
import { createGuestArt } from './guestArt';
import { levelTags } from './levelTags';
import { tagBox as levelTagBox } from './overhead';
import { DEFAULT_SEATS } from './scenes';
import { createGuestStage } from './guestStage';
import { LAYOUTS } from './layouts';
import type { DecorPlacement } from './layouts/types';
import { overlaps, spriteRect, tallestWindowExtentsFor, type PxRect } from './map';
import { DETAIL_SCALE, IDLE, OVERHEAD_OFFSET, TILE_SIZE } from './metrics';

const fixed: Random = () => 0.5;

function guest(index: number, over: Partial<StageGuest> = {}): StageGuest {
  return { index, state: 'idle', idleSince: null, ...over };
}

/** The stage clock and the wall clock at `t` (the same unless told). */
function at(t: number, wall = t): { t: number; wall: number } {
  return { t, wall };
}

/** Asleep: idle since the start of the wall clock, 30 minutes on. */
const ASLEEP = { idleSince: 0 } as const;

describe('stageGuestsOf', () => {
  it('keeps the index and the state only: no name or counts are drawn (Issue #122)', () => {
    const views: GuestView[] = [
      {
        index: 0,
        name: 'たびびと',
        state: 'working',
        repo: { openIssues: 2, openPrs: 1, open: [] },
      },
      { index: 1, name: 'ぼうけんしゃ', state: 'idle', repo: null },
    ];
    expect(stageGuestsOf(views, [null, 1_000])).toEqual([
      { index: 0, state: 'working', idleSince: null },
      { index: 1, state: 'idle', idleSince: 1_000 },
    ]);
  });
});

describe('guestLook', () => {
  it('shows the 「?」 while waiting for a permission, standing still', () => {
    for (const t of [0, 500, 1_300, 9_999]) {
      expect(guestLook(guest(0, { state: 'awaiting-permission' }), at(t), true)).toEqual({
        frame: 0,
        flip: false,
        dy: 0,
        reading: false,
        mark: { kind: 'question' },
      });
    }
  });

  it('reads a scroll in the arms while working, bobbing a little', () => {
    const working = guest(0, { state: 'working' });
    expect(guestLook(working, at(0), true)).toEqual({
      frame: 5,
      flip: false,
      dy: 0,
      reading: true,
      mark: null,
    });
    expect(guestLook(working, at(GUEST.readMs / 2), true).dy).toBe(GUEST.readPx);
    // A sheet without the holding frames reads facing front.
    expect(guestLook(working, at(0), false).frame).toBe(0);
  });

  it('sleeps after 30 minutes resting or idle: the sleeping frame, still, and a rising 「Z」', () => {
    for (const state of ['resting', 'idle'] as const) {
      for (const t of [0, IDLE.zRiseMs / 4, IDLE.zRiseMs / 2]) {
        const look = guestLook(guest(0, { state, ...ASLEEP }), at(t, IDLE.sleepAfterMs), true);
        expect(look.frame).toBe(7);
        expect(look.dy).toBe(0);
        expect(look.reading).toBe(false);
        expect(look.mark).toEqual({ kind: 'z', rise: t / IDLE.zRiseMs });
      }
    }
  });

  it('moves the second guest behind the first, so they never move as one', () => {
    const t = GUEST.readMs / 2;
    const working = { state: 'working' } as const;
    expect(guestLook(guest(0, working), at(t), true).dy).toBe(GUEST.readPx);
    expect(guestLook(guest(1, working), at(t), true).dy).toBe(0);
    const z = (index: number) =>
      guestLook(guest(index, ASLEEP), at(IDLE.zRiseMs / 2, IDLE.sleepAfterMs), true).mark;
    expect(z(0)).not.toEqual(z(1));
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
    const idle = guestFrame({ guests, sparkles: [], spots }, at(0), () => true);
    expect(idle.poses.map((p) => p.feet)).toEqual(spots.map(guestFeet));
    expect(idle.animating).toBe(false);
    const sparkles = [createSparkle(1, 0, fixed)];
    const busy = guestFrame({ guests, sparkles, spots }, at(10), () => true);
    expect(busy.sparkles).toHaveLength(1);
    expect(busy.animating).toBe(true);
  });

  it('draws no sparkle for a guest who is not there', () => {
    const frame = guestFrame(
      { guests: [guest(0)], sparkles: [createSparkle(1, 0, fixed)], spots },
      at(10),
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
    const stage = createGuestStage(
      spots,
      () => true,
      fixed,
      () => 0,
    );
    stage.sparkle(0, 0);
    expect(stage.frameAt(10).sparkles).toEqual([]);
    stage.set([guest(0)]);
    stage.sparkle(0, 0);
    expect(stage.frameAt(10).sparkles).toHaveLength(1);
    stage.clearSparkles();
    expect(stage.frameAt(20).animating).toBe(false);
  });

  it('drops the sparkles while the screen is halted and starts none until it is back', () => {
    const stage = createGuestStage(
      spots,
      () => true,
      fixed,
      () => 0,
    );
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
    const stage = createGuestStage(
      spots,
      () => true,
      fixed,
      () => 0,
    );
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
 * Where the round table's picture is: x 6–57 and y 26–63 of its 64 px tiles (assets/decor/decor.png,
 * measured 2026-10-15), moved by its `dx` and `dy`.
 */
function drawnPx(table: DecorPlacement): PxRect {
  const tiles = tilePx(table);
  const dx = table.dx ?? 0;
  const dy = table.dy ?? 0;
  return {
    left: tiles.left + 6 + dx,
    right: tiles.left + 58 + dx,
    top: tiles.top + 26 + dy,
    bottom: tiles.bottom + dy,
  };
}

/**
 * The drawn figure of a guest on `spot`: assets/sprites/guest1.png and guest2.png fill x 8–70 and
 * y 6–79 of each 80 px frame (measured over all seven frames, 2026-10-15); mirrored (the yawn of a
 * doze, Issue #183) x 9–71, so up to x 72.
 */
function bodyRect(spot: { col: number; row: number }): PxRect {
  const frame = spriteRect(spot);
  return { left: frame.left + 8, right: frame.left + 72, top: frame.top + 6, bottom: frame.bottom };
}

/**
 * Every guest spot of every layout (5 departments have one, 6 none: the seven on stage, settings),
 * with its index and feet.
 */
const SPOTS = Object.entries(LAYOUTS).flatMap(([count, layout]) =>
  layout.guestSpots.map((spot, index) => ({ count, layout, spot, index, feet: guestFeet(spot) })),
);

describe.each(SPOTS)('guest $index of layout $count', ({ layout, spot, feet }) => {
  const { board, party, message } = tallestWindowExtentsFor(layout);

  it('keeps its marks clear of the windows', () => {
    // No exception: layout5's guest is clear of the party window since Issue #132.
    for (const area of [board, party, message]) {
      expect(overlaps(questionRect(feet), area)).toBe(false);
      expect(overlaps(zRect(feet), area)).toBe(false);
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
});

describe('the guest of five departments right of 総務 (Issue #122)', () => {
  it('keeps its picture, 「?」 and 「Z」 off the furniture', () => {
    const layout = LAYOUTS[5];
    const [spot] = layout?.guestSpots ?? [];
    if (layout === undefined || spot === undefined) throw new Error('no guest spot of five');
    const feet = guestFeet(spot);
    // Each piece's cells, and for a placed thing its tiles moved as drawn (its dx and dy).
    const furniture = [
      ...layout.objects.map((object) => ({ area: tilePx(object), label: object.tile })),
      ...layout.decor
        .filter((item) => item.solid)
        .flatMap((item) => {
          const cells = tilePx(item);
          const dx = item.dx ?? 0;
          const dy = item.dy ?? 0;
          const drawn = {
            left: cells.left + dx,
            right: cells.right + dx,
            top: cells.top + dy,
            bottom: cells.bottom + dy,
          };
          // The round table's tiles moved up reach its empty top: its picture is what counts.
          const picture = item.name === 'round-table' ? drawnPx(item) : drawn;
          return [cells, picture].map((area) => ({ area, label: item.name }));
        }),
    ];
    for (const { area, label } of furniture) {
      const at = `${label}@${String(area.left)},${String(area.top)}`;
      expect(overlaps(bodyRect(spot), area), at).toBe(false);
      expect(overlaps(questionRect(feet), area), at).toBe(false);
      expect(overlaps(zRect(feet), area), at).toBe(false);
    }
  });

  it('has the round table drawn centred right under its feet, not under its picture', () => {
    const layout = LAYOUTS[5];
    const [spot] = layout?.guestSpots ?? [];
    if (layout === undefined || spot === undefined) throw new Error('no guest spot of five');
    const tables = layout.decor.filter((item) => item.name === 'round-table');
    expect(tables).toHaveLength(1);
    for (const table of tables) {
      const drawn = drawnPx(table);
      expect(drawn.top).toBeGreaterThanOrEqual(bodyRect(spot).bottom);
      expect(drawn.top - guestFeet(spot).y).toBeLessThanOrEqual(2);
      // Centred under the feet (within a pixel).
      expect(Math.abs((drawn.left + drawn.right) / 2 - guestFeet(spot).x)).toBeLessThanOrEqual(1);
    }
  });
});

describe('createGuestArt', () => {
  const sheet: ImageBitmap = { width: 640, height: 80, close: () => undefined };
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
