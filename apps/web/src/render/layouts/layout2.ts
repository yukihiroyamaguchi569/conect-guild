import {
  SMALL_ROOM_DECOR,
  SMALL_ROOM_GROUND,
  SMALL_ROOM_OBJECTS,
  SMALL_ROOM_SEATS,
  TAVERN_DECOR,
  TAVERN_GUEST_SPOTS,
  UPPER_DESKS,
} from './smallRoom';
import { place, rect, solid, type GuildLayout } from './types';

/**
 * Two departments (Issue #18): the two upper desks of layout4, the tavern in the lower-left corner
 * and a library in the lower right where layout4 has the 総務 desk.
 */
export const LAYOUT2: GuildLayout = {
  departmentCount: 2,
  groundFills: [...SMALL_ROOM_GROUND, { tile: 'floor-carpet', ...rect(20, 11, 10, 3) }],
  objects: [
    ...SMALL_ROOM_OBJECTS,
    solid('shelf', rect(24, 10, 2, 3)),
    solid('shelf', rect(26, 10, 2, 3)),
  ],
  decor: [
    ...SMALL_ROOM_DECOR,
    ...TAVERN_DECOR,
    // The library: bookcases, a bench with the cat asleep on it, a chest and the coat rack
    place('bench', 21, 12),
    place('sleeping-cat', 21, 12),
    place('book-pile', 22, 12),
    place('scroll-pile', 23, 12),
    place('chest', 28, 12),
    place('coat-rack', 30, 11),
  ],
  desks: UPPER_DESKS,
  ...SMALL_ROOM_SEATS,
  guestSpots: TAVERN_GUEST_SPOTS,
  // Four rows: the party window keeps its minimum height (GuildScreen.vue .stage__party, 21.1cqw),
  // so the column ends 49.2 px above layout4's (273.3 px against 322.4 px in the demo at 1024 px,
  // Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 291, tallestBottom: 324 },
  // As in layout4: the upper desks are 5 tiles from かなめ.
  toss: { maxTiles: 5.5 },
};
