import {
  SMALL_ROOM_DECOR,
  SMALL_ROOM_GROUND,
  SMALL_ROOM_OBJECTS,
  SMALL_ROOM_SEATS,
  TAVERN_DECOR,
  TAVERN_GUEST_SPOTS,
  UPPER_DESKS,
} from './smallRoom';
import { flat, place, rect, solid, type GuildLayout } from './types';

/**
 * Three departments (Issue #18): the two upper desks of layout4, the tavern in the lower-left
 * corner and the third desk in the lower right, where layout4 has the 総務 desk.
 */
export const LAYOUT3: GuildLayout = {
  departmentCount: 3,
  groundFills: [...SMALL_ROOM_GROUND, { tile: 'floor-carpet', ...rect(20, 11, 10, 3) }],
  objects: [
    ...SMALL_ROOM_OBJECTS,
    flat('chair', rect(21, 9, 1, 2)),
    solid('desk', rect(20, 11, 4, 2)),
  ],
  decor: [
    ...SMALL_ROOM_DECOR,
    ...TAVERN_DECOR,
    // The lower desk's cleared quests flutter the left wall's banner (render/trinkets.ts)
    place('banner', 0, 14),
    // The third desk, with a map table beside it
    place('globe', 20, 11),
    place('model', 21, 11),
    place('blueprint-rolls', 22, 11),
    place('inkwell', 23, 11),
    place('map-table', 25, 11),
    place('crate-stack', 28, 11),
    place('barrel', 30, 11),
  ],
  desks: [...UPPER_DESKS, { seat: { col: 21, row: 10 }, side: 'lower', things: ['globe'] }],
  ...SMALL_ROOM_SEATS,
  guestSpots: TAVERN_GUEST_SPOTS,
  // Five rows: one row (38.0 px) less than layout4 (284.5 px against 322.4 px in the demo at
  // 1024 px, Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 303, tallestBottom: 335 },
  // As in layout4: the upper desks are 5 tiles from かなめ, the lower one 5.8.
  toss: { maxTiles: 5.5 },
};
