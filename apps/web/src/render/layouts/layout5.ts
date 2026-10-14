import {
  CORNER_DESK_DECOR,
  CORNER_DESK_OBJECTS,
  CORNER_SEAT,
  DOOR_GUEST_SPOTS,
  LOWER_DESK_DECOR,
  LOWER_DESK_OBJECTS,
  lowerDesks,
} from './largeRoom';
import {
  SMALL_ROOM_DECOR,
  SMALL_ROOM_GROUND,
  SMALL_ROOM_OBJECTS,
  SMALL_ROOM_SEATS,
  UPPER_DESKS,
} from './smallRoom';
import { rect, type GuildLayout } from './types';

/**
 * Five departments (Issue #18): the four desks of layout4 and a fifth in the lower-left corner,
 * with a map table and a stool beside it. The rug in front of the counter stays clear.
 */
export const LAYOUT5: GuildLayout = {
  departmentCount: 5,
  groundFills: [...SMALL_ROOM_GROUND, { tile: 'floor-carpet', ...rect(20, 11, 10, 3) }],
  objects: [...SMALL_ROOM_OBJECTS, ...LOWER_DESK_OBJECTS, ...CORNER_DESK_OBJECTS],
  decor: [...SMALL_ROOM_DECOR, ...LOWER_DESK_DECOR, ...CORNER_DESK_DECOR],
  desks: [...UPPER_DESKS, ...lowerDesks(2, 3), { seat: CORNER_SEAT, side: 'lower', things: [] }],
  ...SMALL_ROOM_SEATS,
  guestSpots: DOOR_GUEST_SPOTS,
  // Seven packed rows: the column ends 49.2 px above layout4's (273.3 px against 322.4 px in the
  // demo at 1024 px, Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 291, tallestBottom: 324, dense: true },
  // As in layout4: the upper desks are 5 tiles from かなめ, the lower ones 5.8, the corner 15.2.
  toss: { maxTiles: 5.5 },
};
