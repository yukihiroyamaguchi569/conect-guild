import {
  LOWER_ROW,
  lowerDesks,
  SMALL_ROOM_DECOR,
  SMALL_ROOM_GROUND,
  SMALL_ROOM_OBJECTS,
  SMALL_ROOM_SEATS,
  TAVERN_DECOR,
  TAVERN_GUEST_SPOTS,
} from './smallRoom';
import { place, rect, solid, type GuildLayout } from './types';

/**
 * Two departments (Issue #18): the two lower desks of layout4, the tavern in the upper right and a
 * library in the upper left, where layout4 has the 経理 desk.
 */
export const LAYOUT2: GuildLayout = {
  departmentCount: 2,
  groundFills: SMALL_ROOM_GROUND,
  objects: [
    ...SMALL_ROOM_OBJECTS,
    ...LOWER_ROW.objects,
    // The library: two bookcases against the back wall, under the left window and the board
    solid('shelf', rect(10, 3, 2, 3)),
    solid('shelf', rect(12, 3, 2, 3)),
  ],
  decor: [
    ...SMALL_ROOM_DECOR,
    ...LOWER_ROW.decor,
    ...TAVERN_DECOR,
    // A reading bench in front of the bookcases, books and scrolls, the cat asleep on the carpet
    place('bench', 10, 6),
    place('book-pile', 12, 6),
    place('sleeping-cat', 13, 6),
  ],
  desks: lowerDesks(0),
  ...SMALL_ROOM_SEATS,
  guestSpots: TAVERN_GUEST_SPOTS,
  // Four rows: the party window keeps its minimum height (GuildScreen.vue .stage__party, 21.1cqw),
  // so the column ends 49.2 px above layout4's (273.3 px against 322.4 px in the demo at 1024 px,
  // Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 291, tallestBottom: 324 },
  // As in layout4: the lower desks are 5.8 tiles from かなめ, so she walks every scroll over.
  toss: { maxTiles: 5.5 },
};
