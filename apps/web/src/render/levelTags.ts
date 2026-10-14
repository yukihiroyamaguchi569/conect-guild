import { memberIdSchema } from '@conect-guild/snapshot/settings';
import type { MemberId, TilePos } from '../guild.config';
import { TILE_SIZE } from './metrics';

/**
 * 「Lv N」 under each seat, small and faint, always on (Issue #19; the president asked for it to be
 * quiet). Each tag sits on the front of the member's desk (かなめ: her counter), below where the
 * desk hides the feet, so it never meets the bubbles over the heads. かなめ's sits in the middle of
 * the counter like the others; a visitor standing in front of it may hide it for a moment (the
 * president's call, 2026-10-12). Pure: drawLevelTags.ts draws.
 */

/** The level of each member who has one (the king has none). */
export type Levels = Readonly<Partial<Record<MemberId, number>>>;

export interface LevelTag {
  readonly text: string;
  /** Centre of the text, logical px. */
  readonly x: number;
  readonly y: number;
}

/** How far below the feet on the seat the tag is centred: on the desk's (or counter's) front. */
const TAG_BELOW_FEET = 46;

export function levelsOf(
  rows: readonly { readonly id: MemberId; readonly level: { readonly level: number | null } }[],
): Levels {
  const levels: Partial<Record<MemberId, number>> = {};
  for (const row of rows) if (row.level.level !== null) levels[row.id] = row.level.level;
  return levels;
}

/** One tag per member with a level, at their seat (not where they stand: it belongs to the desk). */
export function levelTags(levels: Levels, seats: Readonly<Record<MemberId, TilePos>>): LevelTag[] {
  return memberIdSchema.options.flatMap((id) => {
    const level = levels[id];
    if (level === undefined) return [];
    const seat = seats[id];
    return [
      {
        text: `Lv ${String(level)}`,
        x: seat.col * TILE_SIZE + TILE_SIZE / 2,
        y: (seat.row + 1) * TILE_SIZE + TAG_BELOW_FEET,
      },
    ];
  });
}
