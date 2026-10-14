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
 * What the offices of two and three departments share (Issue #18): the room of layout4 with its
 * two lower desks, throne, counter, windows and door where they are, so the office feels the same
 * whatever the number of departments, and a tavern for the guests in the upper right where layout4
 * has the 広報 desk. layout2.ts and layout3.ts add the upper left (a library, or layout4's 経理
 * desk).
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

/** As in layout4: the windows, the quest board, the throne, the counter, the door, the lower desks. */
export const SMALL_ROOM_OBJECTS: readonly MapObject[] = [
  flat('window', rect(10, 1, 2, 2)),
  flat('window', rect(21, 1, 2, 2)),
  solid('board', rect(12, 1, 3, 2)),
  solid('throne', rect(15, 2, 3, 3)),
  solid('counter-left', rect(13, 8, 1, 2)),
  solid('counter-mid', rect(14, 8, 5, 2)),
  solid('counter-right', rect(19, 8, 1, 2)),
  flat('door', rect(30, 14, 2, 3)),
  solid('plant', rect(22, 7, 1, 1)),
  // Lower left desk (layout4's 企画)
  solid('shelf', rect(1, 10, 2, 3)),
  flat('chair', rect(11, 9, 1, 2)),
  solid('desk', rect(9, 11, 4, 2)),
  // Lower right desk (layout4's 総務)
  flat('chair', rect(21, 9, 1, 2)),
  solid('desk', rect(20, 11, 4, 2)),
  solid('crate', rect(2, 14, 1, 1)),
];

/** The walls, the counter and the hall, the lower desks' things and corners, as in layout4. */
export const SMALL_ROOM_DECOR: readonly DecorPlacement[] = [
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
  place('plant-small', 14, 3),
  place('sleeping-poodle', 18, 3),
  // かなめ's counter and the hall
  place('jar', 14, 8),
  place('flower-vase', 18, 8),
  place('pillar-lamp', 11, 7),
  place('pillar-lamp', 21, 7),
  place('plant-tall', 10, 7),
  place('book-pile-tall', 10, 9),
  place('plant-large', 22, 8),
  place('sacks', 22, 10),
  // Lower left desk
  place('map-table', 3, 11),
  place('stool', 6, 12),
  place('globe', 9, 11),
  place('model', 10, 11),
  place('blueprint-rolls', 11, 11),
  place('lantern', 12, 11),
  // Lower right desk (the hourglass turns while the king's approval is awaited)
  place('inkwell', 20, 11),
  place('file-stack', 21, 11),
  place('hourglass', 22, 11),
  place('toolbox', 23, 11),
  place('file-cabinet', 26, 11),
  place('crate-stack', 28, 11),
  place('barrel', 30, 11),
  place('light-patch', 14, 13),
  place('light-patch', 24, 13),
  // Corners beside the message window
  place('barrel-pair', 1, 14),
  place('sacks', 2, 15),
  place('barrel-small', 2, 16),
  place('barrel-small', 29, 14),
  place('plant-large', 29, 15),
];

/**
 * The tavern in the upper right (Issue #18), where layout4 has the 広報 desk: a round table with
 * the guests on either side of it, and barrels and mugs against the right edge. The tiles beside
 * the pet and under the right window stay free for the members' play spots (render/idleSpots.ts);
 * the window's light falls on them.
 */
export const TAVERN_DECOR: readonly DecorPlacement[] = [
  place('light-patch', 20, 3),
  place('round-table', 19, 5),
  place('barrel', 22, 3),
  place('mugs', 22, 5),
  place('barrel-small', 22, 6),
];

/** Left and right of the round table, facing each other across it. */
export const TAVERN_GUEST_SPOTS: readonly [TilePos, TilePos] = [
  { col: 18, row: 6 },
  { col: 21, row: 6 },
];

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
