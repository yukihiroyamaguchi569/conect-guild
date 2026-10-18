import type { DecorName } from '../../../../assets/decor/decor';
import type { Random } from './confetti';
import { decorPoint } from './decorPoint';
import type { GuildLayout, TileName, TileRect } from './layouts/types';
import { overlaps, windowExtentsFor, type PxRect } from './map';
import { TILE_SIZE } from './metrics';
import { ornamentOf } from './ornament';

/**
 * The things of the room that can be examined (Issue #190, docs/DESIGN.md 8): a press on one tells
 * in the message window what was found in it, RPG style, and now and then (RARE_CHANCE) something
 * was. A press on a thing is a line for the window (PressLines); other things to press later (the
 * moon's ornament) tell theirs the same way. Fixed lines only, never an outside string. Pure: the
 * layout and the random source are passed in.
 */

export type ThingKind = 'barrel' | 'crate' | 'shelf' | 'jar' | 'safe' | 'sacks' | 'cabinet';
/** A thing of the room to press: one of the kinds above, or the month's ornament (Issue #192). */
export type RoomThing = ThingKind | 'ornament';

/** What a press tells in the message window: one of `usual`, or one of `rare` now and then. */
export interface PressLines {
  readonly usual: readonly [string, ...string[]];
  readonly rare: readonly string[];
  /**
   * Never the line in the window just before (the reward, Issue #213: withoutLine); the things of
   * #190 and the ornament may tell the same line again.
   */
  readonly noRepeat?: boolean;
}

/** How often a press finds something, when the thing has rare lines. */
export const RARE_CHANCE = 0.05;

/** What each kind is called (its button says 「〇〇を しらべる」) and what examining it tells. */
export const THINGS: Readonly<Record<ThingKind, { readonly name: string } & PressLines>> = {
  barrel: {
    name: 'たる',
    usual: ['たるの なかを しらべた。なにも なかった。', 'たるを のぞきこんだ。からっぽだ。'],
    rare: ['たるの そこに やくそうを みつけた！'],
  },
  crate: {
    name: 'きばこ',
    usual: ['きばこを あけてみた。なにも なかった。', 'きばこを しらべた。ほこりが まいあがった。'],
    rare: ['きばこの なかに ちいさな メダルを みつけた！'],
  },
  shelf: {
    name: 'ほんだな',
    usual: [
      'ほんだなを しらべた。むずかしそうな ほんが ならんでいる。',
      'ほんだなを しらべた。なにも なかった。',
    ],
    rare: ['ほんの あいだに へそくりを みつけた！'],
  },
  jar: {
    name: 'つぼ',
    usual: ['つぼの なかを のぞいた。なにも なかった。', 'つぼを しらべた。からっぽだ。'],
    rare: ['つぼの なかに やくそうを みつけた！'],
  },
  safe: {
    name: 'きんこ',
    usual: ['きんこを しらべた。かぎが かかっている。', 'きんこを しらべた。びくとも しない。'],
    rare: ['きんこの すきまに 1ゴールドを みつけた！'],
  },
  sacks: {
    name: 'ふくろ',
    usual: [
      'ふくろを しらべた。こむぎこが はいっている。',
      'ふくろの なかを しらべた。なにも なかった。',
    ],
    rare: ['ふくろの そこに やくそうを みつけた！'],
  },
  cabinet: {
    name: 'しょるいだな',
    usual: [
      'しょるいだなを しらべた。しょるいが ぎっしりだ。',
      'しょるいだなを しらべた。なにも なかった。',
    ],
    rare: ['しょるいの あいだに ちいさな メダルを みつけた！'],
  },
};

/** The small things (layout.decor) that can be examined, and what kind each is. */
const DECOR_KINDS: Partial<Record<DecorName, ThingKind>> = {
  barrel: 'barrel',
  'barrel-pair': 'barrel',
  'barrel-small': 'barrel',
  'crate-stack': 'crate',
  jar: 'jar',
  safe: 'safe',
  sacks: 'sacks',
  'file-cabinet': 'cabinet',
};

/** The furniture (layout.objects) that can be examined. */
const TILE_KINDS: Partial<Record<TileName, ThingKind>> = { crate: 'crate', shelf: 'shelf' };

/** What the button of `kind` calls it (「〇〇を しらべる」): the ornament by what it is for. */
export function thingName(kind: RoomThing): string {
  return kind === 'ornament' ? 'かざり' : THINGS[kind].name;
}

/** What a press on `kind` tells in `month` (1 to 12): the ornament says what it is, nothing rare. */
export function pressLinesOf(kind: RoomThing, month: number): PressLines {
  return kind === 'ornament' ? { usual: [ornamentOf(month).line], rare: [] } : THINGS[kind];
}

/** A thing of the room to examine, where it is drawn (logical px). */
export interface Thing {
  readonly kind: RoomThing;
  readonly rect: PxRect;
}

function tileRect(area: TileRect, at: { readonly x: number; readonly y: number }): PxRect {
  return {
    left: at.x,
    top: at.y,
    right: at.x + area.w * TILE_SIZE,
    bottom: at.y + area.h * TILE_SIZE,
  };
}

/**
 * The things of `layout` to examine (the month's ornament too), top row first and left to right
 * (the keyboard's order). A thing any window covers even in part is left out: a press there lands
 * on the window.
 */
export function thingsIn(layout: GuildLayout): readonly Thing[] {
  const fromDecor = layout.decor.flatMap((item) => {
    const kind = DECOR_KINDS[item.name];
    return kind === undefined ? [] : [{ kind, rect: tileRect(item, decorPoint(item)) }];
  });
  const fromObjects = layout.objects.flatMap((item) => {
    const kind = TILE_KINDS[item.tile];
    const at = { x: item.col * TILE_SIZE, y: item.row * TILE_SIZE };
    return kind === undefined ? [] : [{ kind, rect: tileRect(item, at) }];
  });
  // The whole spot, whichever month's picture fills it (render/ornament.ts).
  const spot = layout.ornamentSpot;
  const at = { x: spot.col * TILE_SIZE, y: spot.row * TILE_SIZE };
  const ornament: Thing = { kind: 'ornament', rect: tileRect(spot, at) };
  const windows = Object.values(windowExtentsFor(layout));
  return [...fromDecor, ...fromObjects, ornament]
    .filter((thing) => !windows.some((area) => overlaps(thing.rect, area)))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
}

/**
 * One line of `lines` from one number of `random`: below RARE_CHANCE one of the rare ones (when
 * there are any), else one of the usual ones, each evenly.
 */
export function pickLine(lines: PressLines, random: Random): string {
  const r = random();
  const hasRare = lines.rare.length > 0;
  if (hasRare && r < RARE_CHANCE) return lineAt(lines.rare, r / RARE_CHANCE, lines.usual[0]);
  const share = hasRare ? (r - RARE_CHANCE) / (1 - RARE_CHANCE) : r;
  return lineAt(lines.usual, share, lines.usual[0]);
}

/** The line `share` (0 to 1) of the way through `pool`; `fallback` for an empty pool. */
function lineAt(pool: readonly string[], share: number, fallback: string): string {
  const index = Math.min(Math.floor(share * pool.length), pool.length - 1);
  return pool[index] ?? fallback;
}

/**
 * `lines` (PressLines.noRepeat) without `previous`, the line in the window now, while another usual
 * line is left; `lines` as they are otherwise.
 */
export function withoutLine(lines: PressLines, previous: string | null): PressLines {
  if (lines.noRepeat !== true) return lines;
  const [first, ...rest] = lines.usual.filter((line) => line !== previous);
  return first === undefined ? lines : { ...lines, usual: [first, ...rest] };
}

/** The window when a thing is pressed. */
export interface ExamineMoment {
  /** The screen is halted (the window is not shown). */
  readonly halted: boolean;
  /** False before the first snapshot. */
  readonly known: boolean;
  /** An event's message is in the window: the press is dropped, the events come first. */
  readonly messageShown: boolean;
}

/**
 * What the window tells for a press on a thing that tells `lines` (pressLinesOf) at `moment`, or
 * null when the press is dropped (not kept for later). No number is drawn then.
 */
export function examineLineFor(
  moment: ExamineMoment,
  lines: PressLines,
  random: Random,
): string | null {
  if (moment.halted || !moment.known || moment.messageShown) return null;
  return pickLine(lines, random);
}
