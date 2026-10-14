import { UPPER_DESKS, UPPER_RIGHT_DESK } from './largeRoom';
import {
  FILES_CORNER,
  lowerDesks,
  MAP_CORNER,
  roomWith,
  SMALL_ROOM_GROUND,
  SMALL_ROOM_SEATS,
  UPPER_LEFT_DESK,
} from './smallRoom';
import type { GuildLayout } from './types';

/**
 * Four departments: the office of 2026-10-12, laid out like assets/concept/rpg-company-ui.png
 * within what the HTML windows leave free. The throne at the back centre, かなめ's counter in the
 * middle, a desk in each wing and the door at the bottom right. Built from the room's pieces
 * (Issue #123) as it was by hand before (layout4.golden.test.ts).
 */
export const LAYOUT4: GuildLayout = {
  departmentCount: 4,
  groundFills: SMALL_ROOM_GROUND,
  ...roomWith({
    upperLeft: UPPER_LEFT_DESK,
    upperRight: UPPER_RIGHT_DESK,
    lowerLeftEnd: MAP_CORNER,
    lowerRightEnd: FILES_CORNER,
    hourglassOnCounter: false,
  }),
  // Each department chats with the one across the counter on the same row.
  desks: [...UPPER_DESKS, ...lowerDesks(2)],
  ...SMALL_ROOM_SEATS,
  // In front of the map table and beside its stool, in the lower-left corner (Issue #108).
  guestSpots: [
    { col: 4, row: 13 },
    { col: 7, row: 12 },
  ],
  // Measured 324 px, 340 px with a failure line, 372.5 px with every rare note (Chrome,
  // 2026-10-12).
  partyWindow: { bottom: 340, tallestBottom: 373 },
  // 経理 and 広報 behind the counter are 5 tiles from かなめ; 企画 and 総務 in front of it 5.8.
  toss: { maxTiles: 5.5 },
};
