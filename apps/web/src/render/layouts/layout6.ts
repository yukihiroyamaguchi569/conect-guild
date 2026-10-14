import {
  CORNER_DESK_DECOR,
  CORNER_DESK_OBJECTS,
  CORNER_SEAT,
  DOOR_GUEST_SPOTS,
  LOWER_DESK_DECOR,
  LOWER_DESK_OBJECTS,
  UPPER_DESK_DECOR,
  UPPER_DESK_OBJECTS,
  UPPER_DESKS,
} from './largeRoom';
import {
  lowerDesks,
  SMALL_ROOM_DECOR,
  SMALL_ROOM_GROUND,
  SMALL_ROOM_OBJECTS,
  SMALL_ROOM_SEATS,
} from './smallRoom';
import { flat, place, rect, solid, type GuildLayout } from './types';

/**
 * Six departments (Issue #18): the five desks of layout5 and a sixth on the rug in front of the
 * counter, its member right below かなめ. Visitors to the counter stand left of that desk's chair.
 */
export const LAYOUT6: GuildLayout = {
  departmentCount: 6,
  groundFills: SMALL_ROOM_GROUND,
  objects: [
    ...SMALL_ROOM_OBJECTS,
    ...UPPER_DESK_OBJECTS,
    ...LOWER_DESK_OBJECTS,
    ...CORNER_DESK_OBJECTS,
    flat('chair', rect(16, 10, 1, 2)),
    solid('desk', rect(15, 12, 4, 2)),
  ],
  decor: [
    ...SMALL_ROOM_DECOR,
    ...UPPER_DESK_DECOR,
    ...LOWER_DESK_DECOR,
    ...CORNER_DESK_DECOR,
    // The middle desk
    place('scroll-pile', 15, 12),
    place('ledger-stack', 17, 12),
    place('candlestick', 18, 12),
  ],
  desks: [
    ...UPPER_DESKS,
    ...lowerDesks(2),
    { seat: CORNER_SEAT, side: 'lower', things: [], chatWith: 5 },
    { seat: { col: 16, row: 11 }, side: 'lower', things: [], chatWith: 4 },
  ],
  ...SMALL_ROOM_SEATS,
  places: { ...SMALL_ROOM_SEATS.places, counterFront: { col: 14, row: 10 } },
  guestSpots: DOOR_GUEST_SPOTS,
  // Eight packed rows: the column ends 24.5 px above layout4's (297.9 px against 322.4 px in the
  // demo at 1024 px, Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 316, tallestBottom: 349, dense: true },
  // As in layout4: the upper desks are 5 tiles from かなめ, the lower ones 5.8, the middle one 4.
  toss: { maxTiles: 5.5 },
};
