import {
  GUEST_TABLE,
  RIGHT_OF_SASAE_GUEST_SPOT,
  UPPER_DESKS,
  UPPER_RIGHT_DESK,
  WORKSHOP_BOARD_MAX_CQW,
  WORKSHOP_DESK,
} from './largeRoom';
import {
  lowerDesks,
  roomWith,
  SMALL_ROOM_GROUND,
  SMALL_ROOM_SEATS,
  UPPER_LEFT_DESK,
} from './smallRoom';
import type { GuildLayout } from './types';

/**
 * Five departments (Issue #18): the four desks of layout4 and a fifth, the workshop desk, left of
 * the 企画 desk on the lower left carpet. Right of 総務, where layout4 has its files and crates, the
 * guest stands behind the tavern's round table (Issue #122).
 */
export const LAYOUT5: GuildLayout = {
  departmentCount: 5,
  groundFills: SMALL_ROOM_GROUND,
  ...roomWith({
    upperLeft: UPPER_LEFT_DESK,
    upperRight: UPPER_RIGHT_DESK,
    lowerLeftEnd: WORKSHOP_DESK,
    lowerRightEnd: { objects: [], decor: [GUEST_TABLE] },
    hourglassOnCounter: true,
  }),
  desks: [
    ...UPPER_DESKS,
    ...lowerDesks(2),
    { seat: WORKSHOP_DESK.seat, side: 'lower', things: [] },
  ],
  ...SMALL_ROOM_SEATS,
  guestSpots: [RIGHT_OF_SASAE_GUEST_SPOT],
  boardMaxCqw: WORKSHOP_BOARD_MAX_CQW,
  // The guest: only the party window's rare extra notes reach its head (the president, 2026-10-15).
  underPartyWindow: [RIGHT_OF_SASAE_GUEST_SPOT],
  // Seven packed rows: the column ends 49.2 px above layout4's (273.3 px against 322.4 px in the
  // demo at 1024 px, Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 291, tallestBottom: 324, dense: true },
  // As in layout4: the upper desks are 5 tiles from かなめ, the lower ones 5.8, the workshop 10.4.
  toss: { maxTiles: 5.5 },
};
