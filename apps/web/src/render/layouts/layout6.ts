import { SALES_DESK, WORKSHOP_BOARD_MAX_CQW } from './largeRoom';
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
  underPartyWindow: SALES_DESK.underPartyWindow,
  // Eight packed rows: the column ends 24.5 px above layout4's (297.9 px against 322.4 px in the
  // demo at 1024 px, Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 316, tallestBottom: 349, dense: true },
  // As in layout4: the upper desks are 5 tiles from かなめ, the lower ones 5.8, the outer ones more.
  toss: { maxTiles: 5.5 },
});
