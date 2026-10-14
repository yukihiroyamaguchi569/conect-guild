import {
  lowerDesks,
  SMALL_ROOM_DECOR,
  SMALL_ROOM_GROUND,
  SMALL_ROOM_OBJECTS,
  SMALL_ROOM_SEATS,
  TAVERN_DECOR,
  TAVERN_GUEST_SPOTS,
} from './smallRoom';
import { flat, place, rect, solid, type GuildLayout } from './types';

/**
 * Three departments (Issue #18): the two lower desks of layout4, its upper left (経理) desk with
 * its safe and things, and the tavern in the upper right.
 */
export const LAYOUT3: GuildLayout = {
  departmentCount: 3,
  groundFills: SMALL_ROOM_GROUND,
  objects: [
    ...SMALL_ROOM_OBJECTS,
    // Upper left desk, as in layout4
    flat('chair', rect(12, 3, 1, 2)),
    solid('desk', rect(10, 5, 4, 2)),
  ],
  decor: [
    ...SMALL_ROOM_DECOR,
    ...TAVERN_DECOR,
    place('safe', 10, 3),
    place('candlestick', 10, 5),
    place('abacus', 11, 5),
    place('ledger-stack', 12, 5),
    place('coin-pile', 13, 5),
  ],
  // Upper row first, then the lower row left to right. The upper desk has no one to chat with
  // (chats go both ways); the lower ones chat across the counter as in layout4.
  desks: [
    { seat: { col: 12, row: 4 }, side: 'upper', things: ['abacus', 'coin-pile'] },
    ...lowerDesks(1),
  ],
  ...SMALL_ROOM_SEATS,
  guestSpots: TAVERN_GUEST_SPOTS,
  // Five rows: one row (38.0 px) less than layout4 (284.5 px against 322.4 px in the demo at
  // 1024 px, Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 303, tallestBottom: 335 },
  // As in layout4: the upper desk is 5 tiles from かなめ, the lower ones 5.8.
  toss: { maxTiles: 5.5 },
};
