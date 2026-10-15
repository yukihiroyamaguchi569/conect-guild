import type { CornerDesk, DeskCorner } from './smallRoom';
import { flat, place, rect, solid, type DecorPlacement, type TilePos } from './types';

/**
 * The desks of the offices of four departments and more in the room of smallRoom.ts (Issue #18):
 * layout4's upper right desk, the desks of the lower ends beside the lower desks (the workshop and
 * the sales desk), and the round table of the guest of five departments.
 */

/** layout4's upper right (広報) desk, with its easel, megaphone, book, flyers and mugs. */
export const UPPER_RIGHT_DESK: CornerDesk = {
  objects: [flat('chair', rect(20, 3, 1, 2)), solid('desk', rect(19, 5, 4, 2))],
  decor: [
    place('easel', 22, 3),
    place('megaphone', 19, 5),
    place('open-book', 20, 5),
    place('flyers', 21, 5),
    place('mugs', 22, 5),
  ],
  desk: { seat: { col: 20, row: 4 }, side: 'upper', things: ['megaphone'] },
};

/**
 * The tavern's round table (with its stools, as in layout2 and layout3) in front of layout5's
 * guest (Issue #122). Its picture fills x 6–57 and the lower 38 px of its 2 x 2 tiles
 * (assets/decor/decor.png), so it is drawn half a tile left and 24 px higher than its tiles: its
 * middle is then under the guest's feet and its top 2 px under them, and the guest (drawn after
 * the furniture) never covers it. Its cells stay right of the alley (col 24). It takes the place
 * of layout4's files and crates; layout6 has the sales desk there instead.
 */
export const GUEST_TABLE: DecorPlacement = {
  ...place('round-table', 27, 12),
  dx: -16,
  dy: -24,
};

/** The guest of five departments behind its round table, where layout4 has its files. */
export const GUEST_TABLE_CORNER: DeskCorner = { objects: [], decor: [GUEST_TABLE] };

/**
 * The quest board's max-height (cqw) with the workshop desk: the board then ends above the bubble
 * over its seat (logical 234.5 px against 240 px) and scrolls sooner (31cqw elsewhere).
 */
export const WORKSHOP_BOARD_MAX_CQW = 22;

/**
 * The workshop desk (たくみ, 開発) on the lower left carpet, left of the 企画 desk and like it:
 * the member on the chair behind it, tools and scrolls on it, a barrel in the corner.
 */
export const WORKSHOP_DESK: CornerDesk = {
  objects: [flat('chair', rect(6, 9, 1, 2)), solid('desk', rect(4, 11, 4, 2))],
  decor: [
    place('candlestick', 4, 11),
    place('toolbox', 5, 11),
    place('scroll-pile', 6, 11),
    place('book-pile', 7, 11),
    place('barrel', 1, 11),
  ],
  desk: { seat: { col: 6, row: 10 }, side: 'lower', things: [] },
};

/**
 * The sales desk (むすび, 営業) on the lower right carpet, right of the 総務 desk and mirroring
 * it: letters, a ledger and mugs for the visitors.
 */
export const SALES_DESK: CornerDesk = {
  objects: [flat('chair', rect(26, 9, 1, 2)), solid('desk', rect(25, 11, 4, 2))],
  decor: [
    place('open-book', 25, 11),
    place('ledger-stack', 26, 11),
    place('flyers', 27, 11),
    place('mugs', 28, 11),
  ],
  desk: { seat: { col: 26, row: 10 }, side: 'lower', things: [] },
};

/**
 * The one guest of five departments (seven on stage with かなめ, Issue #122): on the lower right
 * carpet right of the 総務 desk, three columns past the alley beside it (col 24; the president
 * chose it, 2026-10-15), one row in front of the 総務 seat with the round table (GUEST_TABLE)
 * before it. The party window at its usual height ends
 * above the frame; only its rare extra notes (tallestBottom) cover the top of the head: the one
 * tile the party window may cover (underPartyWindow; six departments' sales desk was one until
 * Issue #121). Six departments leave no room for a guest.
 */
export const RIGHT_OF_SASAE_GUEST_SPOT: TilePos = { col: 27, row: 11 };
