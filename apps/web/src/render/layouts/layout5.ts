import {
  LOWER_DESK_DECOR,
  LOWER_DESK_OBJECTS,
  LOWER_RIGHT_STORAGE,
  RIGHT_OF_SASAE_GUEST_SPOT,
  UPPER_DESK_DECOR,
  UPPER_DESK_OBJECTS,
  UPPER_DESKS,
  WORKSHOP_BOARD_MAX_CQW,
  WORKSHOP_DESK,
} from './largeRoom';
import {
  lowerDesks,
  SMALL_ROOM_DECOR,
  SMALL_ROOM_GROUND,
  SMALL_ROOM_OBJECTS,
  SMALL_ROOM_SEATS,
} from './smallRoom';
import type { GuildLayout } from './types';

/**
 * Five departments (Issue #18): the four desks of layout4 and a fifth, the workshop desk, left of
 * the 企画 desk on the lower left carpet. The files of layout4 move to the
 * right end of the lower right carpet, its crates go: the guest stands right of 総務 (Issue #122).
 */
export const LAYOUT5: GuildLayout = {
  departmentCount: 5,
  groundFills: SMALL_ROOM_GROUND,
  objects: [
    ...SMALL_ROOM_OBJECTS,
    ...UPPER_DESK_OBJECTS,
    ...LOWER_DESK_OBJECTS,
    ...WORKSHOP_DESK.objects,
  ],
  decor: [
    ...SMALL_ROOM_DECOR,
    ...UPPER_DESK_DECOR,
    ...LOWER_DESK_DECOR,
    ...LOWER_RIGHT_STORAGE,
    ...WORKSHOP_DESK.decor,
  ],
  desks: [
    ...UPPER_DESKS,
    ...lowerDesks(2),
    { seat: WORKSHOP_DESK.seat, side: 'lower', things: [] },
  ],
  ...SMALL_ROOM_SEATS,
  guestSpots: [RIGHT_OF_SASAE_GUEST_SPOT],
  boardMaxCqw: WORKSHOP_BOARD_MAX_CQW,
  // Seven packed rows: the column ends 49.2 px above layout4's (273.3 px against 322.4 px in the
  // demo at 1024 px, Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 291, tallestBottom: 324, dense: true },
  // As in layout4: the upper desks are 5 tiles from かなめ, the lower ones 5.8, the workshop 10.4.
  toss: { maxTiles: 5.5 },
};
