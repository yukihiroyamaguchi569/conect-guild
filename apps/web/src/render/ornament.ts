import { DECOR, type DecorName } from '../../../../assets/decor/decor';
import type { DecorPlacement, TileRect } from './layouts/types';
import { TILE_SIZE } from './metrics';

/**
 * The month's ornament (Issue #192, docs/DESIGN.md 8): one thing of the season stands on the floor
 * of the room (GuildLayout.ornamentSpot) and tells what it is when pressed. Pure: the time is
 * passed in.
 */

interface Ornament {
  readonly name: DecorName;
  /** What the message window tells when it is pressed. */
  readonly line: string;
}

/** January to December (the lines the president saw, 2026-10-18). */
export const ORNAMENTS: readonly [Ornament, ...Ornament[]] = [
  { name: 'kadomatsu', line: 'かどまつ。としがみさまを むかえる めじるし。' },
  { name: 'setsubun', line: 'まめと おにの めん。おには そと、ふくは うち！' },
  { name: 'hina-dolls', line: 'ひなにんぎょう。おひなさまと おだいりさまが ならんで いる。' },
  { name: 'sakura-vase', line: 'さくらの えだ。ひらひらと はなびらが まいおちる。' },
  { name: 'kabuto', line: 'ごがつの かぶと。つよく おおきく なれますように。' },
  { name: 'hydrangea', line: 'てるてるぼうず。あしたは はれると いいな。' },
  { name: 'tanabata', line: 'たなばたの ささ。たんざくに ねがいが かいて ある。' },
  { name: 'watermelon', line: 'すいかと ふうりん。ちりんと すずしい おとが する。' },
  { name: 'tsukimi', line: 'つきみだんご。こよいは まんまるの つきが でる。' },
  { name: 'jack-o-lantern', line: 'かぼちゃの ランタン。なかで あかりが ゆれて いる。' },
  { name: 'autumn-leaves', line: 'もみじと やきいも。ほくほくで あまい においが する。' },
  { name: 'christmas-tree', line: 'クリスマスツリー。てっぺんの ほしが きらりと ひかる。' },
];

/** The month (1 to 12) of the local date at `now` (epoch ms). */
export function monthAt(now: number): number {
  return new Date(now).getMonth() + 1;
}

/** The ornament of `month` (1 to 12). */
export function ornamentOf(month: number): Ornament {
  return ORNAMENTS[month - 1] ?? ORNAMENTS[0];
}

/**
 * Where the ornament of `month` is drawn in `spot`: on the floor at the bottom of it, in the middle
 * (the pumpkin is one tile, the beans two tiles wide and one high, the others fill the spot).
 */
export function ornamentPlacement(spot: TileRect, month: number): DecorPlacement {
  const { name } = ornamentOf(month);
  const { w, h } = DECOR[name];
  return {
    name,
    col: spot.col,
    row: spot.row,
    w,
    h,
    solid: true,
    dx: ((spot.w - w) * TILE_SIZE) / 2,
    dy: (spot.h - h) * TILE_SIZE,
  };
}
