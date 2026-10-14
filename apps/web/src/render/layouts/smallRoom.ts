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
 * two upper desks, throne, counter, windows and door where they are, so the office feels the same
 * whatever the number of departments, and a tavern table for the guests in the lower-left corner
 * where layout4 has the 企画 desk. layout2.ts and layout3.ts add the lower right.
 */

/** The back wall, the side walls, the doorway, the upper carpets and the red rugs. */
export const SMALL_ROOM_GROUND: readonly GroundFill[] = [
  { tile: 'floor', ...rect(0, 0, MAP_COLS, MAP_ROWS) },
  { tile: 'floor-carpet', ...rect(10, 3, 4, 4) },
  { tile: 'floor-carpet', ...rect(19, 3, 4, 4) },
  { tile: 'rug-red', ...rect(15, 5, 3, 3) },
  { tile: 'rug-red', ...rect(13, 10, 7, 3) },
  // The tavern's carpet in the lower-left corner, where layout4 has the 企画 corner's.
  { tile: 'floor-carpet', ...rect(1, 11, 12, 3) },
  { tile: 'wall', ...rect(0, 1, MAP_COLS, 2) },
  { tile: 'wall', ...rect(0, 1, 1, MAP_ROWS - 1) },
  { tile: 'wall', ...rect(MAP_COLS - 1, 1, 1, MAP_ROWS - 1) },
  { tile: 'wall', ...rect(0, MAP_ROWS - 1, MAP_COLS, 1) },
  { tile: 'wall-top', ...rect(0, 0, MAP_COLS, 1) },
  { tile: 'floor', ...rect(30, 14, 2, 3) },
];

/** As in layout4: the windows, the quest board, the throne, the counter, the door, the upper desks. */
export const SMALL_ROOM_OBJECTS: readonly MapObject[] = [
  flat('window', rect(10, 1, 2, 2)),
  flat('window', rect(21, 1, 2, 2)),
  solid('board', rect(12, 1, 3, 2)),
  solid('throne', rect(15, 2, 3, 3)),
  solid('counter-left', rect(13, 8, 1, 2)),
  solid('counter-mid', rect(14, 8, 5, 2)),
  solid('counter-right', rect(19, 8, 1, 2)),
  flat('door', rect(30, 14, 2, 3)),
  // Upper left desk
  flat('chair', rect(12, 3, 1, 2)),
  solid('desk', rect(10, 5, 4, 2)),
  // Upper right desk
  flat('chair', rect(20, 3, 1, 2)),
  solid('desk', rect(19, 5, 4, 2)),
  solid('plant', rect(22, 7, 1, 1)),
];

/** The back and side walls, the upper desks' things, the counter and the hall, as in layout4. */
export const SMALL_ROOM_DECOR: readonly DecorPlacement[] = [
  place('sconce', 15, 1),
  place('sconce', 17, 1),
  place('banner', 18, 1),
  place('poster-cat', 19, 1),
  place('poster-stripes', 19, 2),
  place('plant-hanging', 20, 1),
  place('sconce', 0, 11),
  place('key-board', 31, 12),
  place('lantern', 31, 13),
  // Upper left desk
  place('safe', 10, 3),
  place('candlestick', 10, 5),
  place('abacus', 11, 5),
  place('ledger-stack', 12, 5),
  place('coin-pile', 13, 5),
  place('plant-small', 14, 3),
  // Upper right desk
  place('easel', 22, 3),
  place('megaphone', 19, 5),
  place('open-book', 20, 5),
  place('flyers', 21, 5),
  place('mugs', 22, 5),
  place('sleeping-poodle', 18, 3),
  // かなめ's counter (the hourglass turns while the king's approval is awaited) and the hall
  place('jar', 14, 8),
  place('hourglass', 17, 8),
  place('flower-vase', 18, 8),
  place('pillar-lamp', 11, 7),
  place('pillar-lamp', 21, 7),
  place('plant-tall', 10, 7),
  place('book-pile-tall', 10, 9),
  place('plant-large', 22, 8),
  place('light-patch', 14, 13),
  place('light-patch', 24, 13),
  // Beside the message window
  place('barrel-small', 29, 14),
  place('plant-large', 29, 15),
];

/**
 * The tavern in the lower-left corner (Issue #18): two round tables with their stools, barrels
 * against the wall, a bench and a lamp. The guests stand between the tables, facing each other.
 */
export const TAVERN_DECOR: readonly DecorPlacement[] = [
  place('barrel', 1, 11),
  place('barrel-pair', 1, 13),
  place('round-table', 3, 11),
  place('round-table', 8, 11),
  place('bench', 3, 13),
  place('pillar-lamp', 11, 11),
  place('barrel-small', 2, 15),
  place('sacks', 2, 16),
];

export const TAVERN_GUEST_SPOTS: readonly [TilePos, TilePos] = [
  { col: 5, row: 12 },
  { col: 7, row: 12 },
];

/** The upper desks: the left and right chat across the counter. */
export const UPPER_DESKS: readonly [Desk, Desk] = [
  { seat: { col: 12, row: 4 }, side: 'upper', things: ['abacus', 'coin-pile'], chatWith: 1 },
  { seat: { col: 20, row: 4 }, side: 'upper', things: ['megaphone'], chatWith: 0 },
];

/** Where かなめ, the king and the scenes' places are: as in layout4. */
export const SMALL_ROOM_SEATS = {
  commanderSeat: { col: 16, row: 7 },
  kingSeat: { col: 16, row: 3 },
  places: { counterFront: { col: 16, row: 10 }, throneSide: { col: 14, row: 4 } },
  offstage: { col: 30, row: 15 },
} as const;
