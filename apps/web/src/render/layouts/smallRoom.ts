import {
  flat,
  MAP_COLS,
  MAP_ROWS,
  place,
  rect,
  solid,
  type DecorPlacement,
  type Desk,
  type GroundFill,
  type MapObject,
  type TilePos,
} from './types';

/**
 * The room every office is built in (Issue #18): layout4's walls, carpets, throne, counter,
 * windows, door and lower desks where they are, so the office feels the same whatever the number
 * of departments, and the pieces of the corners that change with it (Issue #123): the upper left
 * desk or a library, the tavern, the map corner and the files of the lower right. largeRoom.ts
 * holds the upper right desk and the desks of the lower ends.
 */

/** The back wall, the side walls, the doorway, the carpets and the red rugs, as in layout4. */
export const SMALL_ROOM_GROUND: readonly GroundFill[] = [
  { tile: 'floor', ...rect(0, 0, MAP_COLS, MAP_ROWS) },
  { tile: 'floor-carpet', ...rect(10, 3, 4, 4) },
  { tile: 'floor-carpet', ...rect(19, 3, 4, 4) },
  { tile: 'floor-carpet', ...rect(1, 11, 12, 3) },
  { tile: 'floor-carpet', ...rect(20, 11, 10, 3) },
  { tile: 'rug-red', ...rect(15, 5, 3, 3) },
  { tile: 'rug-red', ...rect(13, 10, 7, 3) },
  { tile: 'wall', ...rect(0, 1, MAP_COLS, 2) },
  { tile: 'wall', ...rect(0, 1, 1, MAP_ROWS - 1) },
  { tile: 'wall', ...rect(MAP_COLS - 1, 1, 1, MAP_ROWS - 1) },
  { tile: 'wall', ...rect(0, MAP_ROWS - 1, MAP_COLS, 1) },
  { tile: 'wall-top', ...rect(0, 0, MAP_COLS, 1) },
  { tile: 'floor', ...rect(30, 14, 2, 3) },
];

/** What stands in a corner of the room: furniture and small things. */
export interface DeskCorner {
  readonly objects: readonly MapObject[];
  readonly decor: readonly DecorPlacement[];
}

/** The corners that change with the number of departments (Issue #123). */
export interface RoomCorners {
  readonly upperLeft: DeskCorner;
  readonly upperRight: DeskCorner;
  readonly lowerLeftEnd: DeskCorner;
  readonly lowerRightEnd: DeskCorner;
  /** Five and six departments: the hourglass on かなめ's counter, scrolls in its place on 総務's desk. */
  readonly hourglassOnCounter: boolean;
}

/** The windows, the quest board, the throne, the counter and the door, as in layout4. */
const ROOM_OBJECTS: readonly MapObject[] = [
  flat('window', rect(10, 1, 2, 2)),
  flat('window', rect(21, 1, 2, 2)),
  solid('board', rect(12, 1, 3, 2)),
  solid('throne', rect(15, 2, 3, 3)),
  solid('counter-left', rect(13, 8, 1, 2)),
  solid('counter-mid', rect(14, 8, 5, 2)),
  solid('counter-right', rect(19, 8, 1, 2)),
  flat('door', rect(30, 14, 2, 3)),
];

/** The back wall around the throne and the side walls below the windows. */
const WALL_DECOR: readonly DecorPlacement[] = [
  place('sconce', 15, 1),
  place('sconce', 17, 1),
  place('banner', 18, 1),
  place('poster-cat', 19, 1),
  place('poster-stripes', 19, 2),
  place('plant-hanging', 20, 1),
  place('sconce', 0, 11),
  // The lower desks' cleared quests flutter the left wall's banner (render/trinkets.ts)
  place('banner', 0, 14),
  place('key-board', 31, 12),
  place('lantern', 31, 13),
];

/** かなめ's counter and the hall. */
const HALL_DECOR: readonly DecorPlacement[] = [
  place('jar', 14, 8),
  place('flower-vase', 18, 8),
  place('pillar-lamp', 11, 7),
  place('pillar-lamp', 21, 7),
  place('plant-tall', 10, 7),
  place('book-pile-tall', 10, 9),
  place('plant-large', 22, 8),
  place('sacks', 22, 10),
];

/** Light on the floor of the bottom corridor and the corners beside the message window. */
const FLOOR_DECOR: readonly DecorPlacement[] = [
  place('barrel', 30, 11),
  place('light-patch', 14, 13),
  place('light-patch', 24, 13),
  place('barrel-pair', 1, 14),
  place('sacks', 2, 15),
  place('barrel-small', 2, 16),
  place('barrel-small', 29, 14),
  place('plant-large', 29, 15),
];

/** layout4's lower left (企画) desk, with its globe, model, blueprints and lantern. */
const LOWER_LEFT_DESK: DeskCorner = {
  objects: [flat('chair', rect(11, 9, 1, 2)), solid('desk', rect(9, 11, 4, 2))],
  decor: [
    place('globe', 9, 11),
    place('model', 10, 11),
    place('blueprint-rolls', 11, 11),
    place('lantern', 12, 11),
  ],
};

/** layout4's lower right (総務) desk; the hourglass turns while the king's approval is awaited. */
function lowerRightDesk(hourglassOnCounter: boolean): DeskCorner {
  return {
    objects: [flat('chair', rect(21, 9, 1, 2)), solid('desk', rect(20, 11, 4, 2))],
    decor: [
      place('inkwell', 20, 11),
      place('file-stack', 21, 11),
      place(hourglassOnCounter ? 'scroll-pile' : 'hourglass', 22, 11),
      place('toolbox', 23, 11),
    ],
  };
}

/**
 * The whole room with `corners` in it, in layout4's order (layout4.golden.test.ts records it):
 * the furniture and the small things of each corner go where layout4 lists its own.
 */
export function roomWith(corners: RoomCorners): DeskCorner {
  const lowerRight = lowerRightDesk(corners.hourglassOnCounter);
  return {
    objects: [
      ...ROOM_OBJECTS,
      ...corners.upperLeft.objects,
      ...corners.upperRight.objects,
      solid('plant', rect(22, 7, 1, 1)),
      ...corners.lowerLeftEnd.objects,
      ...LOWER_LEFT_DESK.objects,
      ...lowerRight.objects,
      ...corners.lowerRightEnd.objects,
      // The bottom-left corner, left of the message window
      solid('crate', rect(2, 14, 1, 1)),
    ],
    decor: [
      ...WALL_DECOR,
      ...corners.upperLeft.decor,
      place('plant-small', 14, 3),
      ...corners.upperRight.decor,
      place('sleeping-poodle', 18, 3),
      ...HALL_DECOR,
      ...(corners.hourglassOnCounter ? [place('hourglass', 17, 8)] : []),
      ...corners.lowerLeftEnd.decor,
      ...LOWER_LEFT_DESK.decor,
      ...lowerRight.decor,
      ...corners.lowerRightEnd.decor,
      ...FLOOR_DECOR,
    ],
  };
}

/** layout4's upper left (経理) desk, with its safe, abacus, ledgers and coins. */
export const UPPER_LEFT_DESK: DeskCorner & { readonly desk: Desk } = {
  objects: [flat('chair', rect(12, 3, 1, 2)), solid('desk', rect(10, 5, 4, 2))],
  decor: [
    place('safe', 10, 3),
    place('candlestick', 10, 5),
    place('abacus', 11, 5),
    place('ledger-stack', 12, 5),
    place('coin-pile', 13, 5),
  ],
  desk: { seat: { col: 12, row: 4 }, side: 'upper', things: ['abacus', 'coin-pile'] },
};

/**
 * The library where the upper left desk would be: two bookcases against the back wall, under the
 * left window and the board, a reading bench in front of them, books, and the cat asleep on the
 * carpet.
 */
export const LIBRARY: DeskCorner = {
  objects: [solid('shelf', rect(10, 3, 2, 3)), solid('shelf', rect(12, 3, 2, 3))],
  decor: [place('bench', 10, 6), place('book-pile', 12, 6), place('sleeping-cat', 13, 6)],
};

/**
 * The tavern in the upper right (Issue #18), where layout4 has the 広報 desk: a round table on the
 * blue carpet and mugs in the corner under the window. The tiles beside the pet and under the
 * right window stay free for the members' play spots (render/idleSpots.ts).
 */
export const TAVERN: DeskCorner = {
  objects: [],
  decor: [place('round-table', 19, 5), place('mugs', 22, 3)],
};

/**
 * The guests on the tavern's carpet, one behind the other and clear of the red rug: one at the
 * back under the window, one in front right of the round table. Neither stands in front of the
 * table.
 */
export const TAVERN_GUEST_SPOTS: readonly [TilePos, TilePos] = [
  { col: 20, row: 3 },
  { col: 21, row: 6 },
];

/** layout4's lower left corner, left of the 企画 desk: a bookcase, the map table and its stool. */
export const MAP_CORNER: DeskCorner = {
  objects: [solid('shelf', rect(1, 10, 2, 3))],
  decor: [place('map-table', 3, 11), place('stool', 6, 12)],
};

/** layout4's lower right corner, right of the 総務 desk: the files and the crates. */
export const FILES_CORNER: DeskCorner = {
  objects: [],
  decor: [place('file-cabinet', 26, 11), place('crate-stack', 28, 11)],
};

/**
 * The lower desks, at layout4's 企画 and 総務, when the left one is `desks[first]`: the left and
 * right chat across the counter.
 */
export function lowerDesks(first: number): readonly [Desk, Desk] {
  return [
    { seat: { col: 11, row: 10 }, side: 'lower', things: ['globe'], chatWith: first + 1 },
    { seat: { col: 21, row: 10 }, side: 'lower', things: ['file-stack'], chatWith: first },
  ];
}

/** Where かなめ, the king and the scenes' places are: as in layout4. */
export const SMALL_ROOM_SEATS = {
  commanderSeat: { col: 16, row: 7 },
  kingSeat: { col: 16, row: 3 },
  places: { counterFront: { col: 16, row: 10 }, throneSide: { col: 14, row: 4 } },
  offstage: { col: 30, row: 15 },
} as const;
