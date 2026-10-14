import {
  DOOR_GUEST_SPOTS,
  LOWER_DESK_DECOR,
  LOWER_DESK_OBJECTS,
  SALES_DESK,
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
 * Six departments (Issue #18): the five desks of layout5 and a sixth, the sales desk, right of the
 * 総務 desk on the lower right carpet, where layout4 has its files and crates. The rug in front of
 * the counter stays clear.
 */
export const LAYOUT6: GuildLayout = {
  departmentCount: 6,
  groundFills: SMALL_ROOM_GROUND,
  objects: [
    ...SMALL_ROOM_OBJECTS,
    ...UPPER_DESK_OBJECTS,
    ...LOWER_DESK_OBJECTS,
    ...WORKSHOP_DESK.objects,
    ...SALES_DESK.objects,
  ],
  decor: [
    ...SMALL_ROOM_DECOR,
    ...UPPER_DESK_DECOR,
    ...LOWER_DESK_DECOR,
    ...WORKSHOP_DESK.decor,
    ...SALES_DESK.decor,
  ],
  desks: [
    ...UPPER_DESKS,
    ...lowerDesks(2),
    { seat: WORKSHOP_DESK.seat, side: 'lower', things: [], chatWith: 5 },
    { seat: SALES_DESK.seat, side: 'lower', things: [], chatWith: 4 },
  ],
  ...SMALL_ROOM_SEATS,
  guestSpots: DOOR_GUEST_SPOTS,
  boardMaxCqw: WORKSHOP_BOARD_MAX_CQW,
  underPartyWindow: SALES_DESK.underPartyWindow,
  // Eight packed rows: the column ends 24.5 px above layout4's (297.9 px against 322.4 px in the
  // demo at 1024 px, Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 316, tallestBottom: 349, dense: true },
  // As in layout4: the upper desks are 5 tiles from かなめ, the lower ones 5.8, the outer ones more.
  toss: { maxTiles: 5.5 },
};
