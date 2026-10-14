import {
  FILES_CORNER,
  lowerDesks,
  MAP_CORNER,
  roomWith,
  SMALL_ROOM_GROUND,
  SMALL_ROOM_SEATS,
  TAVERN,
  TAVERN_GUEST_SPOTS,
  UPPER_LEFT_DESK,
} from './smallRoom';
import type { GuildLayout } from './types';

/**
 * Three departments (Issue #18): the two lower desks of layout4, its upper left (経理) desk with
 * its safe and things, and the tavern in the upper right.
 */
export const LAYOUT3: GuildLayout = {
  departmentCount: 3,
  groundFills: SMALL_ROOM_GROUND,
  ...roomWith({
    upperLeft: UPPER_LEFT_DESK,
    upperRight: TAVERN,
    lowerLeftEnd: MAP_CORNER,
    lowerRightEnd: FILES_CORNER,
    hourglassOnCounter: false,
  }),
  // Upper row first, then the lower row left to right. The upper desk has no one to chat with
  // (chats go both ways); the lower ones chat across the counter as in layout4.
  desks: [UPPER_LEFT_DESK.desk, ...lowerDesks(1)],
  ...SMALL_ROOM_SEATS,
  guestSpots: TAVERN_GUEST_SPOTS,
  // Five rows: one row (38.0 px) less than layout4 (284.5 px against 322.4 px in the demo at
  // 1024 px, Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 303, tallestBottom: 335 },
  // As in layout4: the upper desk is 5 tiles from かなめ, the lower ones 5.8.
  toss: { maxTiles: 5.5 },
};
