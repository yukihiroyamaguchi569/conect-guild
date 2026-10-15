import { WORKSHOP_BOARD_MAX_CQW } from './largeRoom';
import { buildLayout } from './slots';
import type { GuildLayout } from './types';

/**
 * Six departments (Issue #18): the five desks of layout5 and a sixth, the sales desk, right of the
 * 総務 desk on the lower right carpet, where layout4 has its files and crates. The rug in front of
 * the counter stays clear.
 */
export const LAYOUT6: GuildLayout = buildLayout(6, {
  // As before Issue #123: the hourglass on かなめ's counter, scrolls on the 総務 desk.
  hourglassOnCounter: true,
  boardMaxCqw: WORKSHOP_BOARD_MAX_CQW,
  // Eight tightly packed rows, with the fetch status on the tab (Issues #121, #132): the column
  // ends at 232.3 px in the demo at 1024 px (Chrome, 2026-10-15), above the bubble over the sales
  // desk (240 px). No note reaches it, so both are the same.
  partyWindow: { bottom: 236, tallestBottom: 236, dense: true, tight: true },
  // As in layout4: the upper desks are 5 tiles from かなめ, the lower ones 5.8, the outer ones more.
  toss: { maxTiles: 5.5 },
});
