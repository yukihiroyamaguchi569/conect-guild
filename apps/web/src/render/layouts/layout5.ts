import { WORKSHOP_BOARD_MAX_CQW } from './largeRoom';
import { buildLayout } from './slots';
import type { GuildLayout } from './types';

/**
 * Five departments (Issue #18): the four desks of layout4 and a fifth, the workshop desk, left of
 * the 企画 desk on the lower left carpet. Right of 総務, where layout4 has its files and crates, the
 * guest stands behind the tavern's round table (Issue #122).
 */
export const LAYOUT5: GuildLayout = buildLayout(5, {
  // As before Issue #123: the hourglass on かなめ's counter, scrolls on the 総務 desk.
  hourglassOnCounter: true,
  boardMaxCqw: WORKSHOP_BOARD_MAX_CQW,
  // Seven packed rows, with the fetch status on the tab (Issue #132): the column ends at 240.2 px
  // in the demo at 1024 px (Chrome, 2026-10-15), above the guest's head (304 px), which therefore
  // needs no exception any more. No note reaches it, so both are the same.
  partyWindow: { bottom: 244, tallestBottom: 244, dense: true },
  // As in layout4: the upper desks are 5 tiles from かなめ, the lower ones 5.8, the workshop 10.4.
  toss: { maxTiles: 5.5 },
});
