import {
  flat,
  place,
  rect,
  solid,
  type DecorPlacement,
  type Desk,
  type MapObject,
  type TilePos,
} from './types';

/**
 * What the offices of five and six departments add to the room of smallRoom.ts (Issue #18): the
 * two lower desks where layout4 has them (企画 and 総務), a desk in the lower-left corner beside
 * the message window, and the guests at the door. Every seat stays between the quest board and
 * the party window (cols 11–21), but the corner one (CORNER_DESK_OBJECTS).
 */

/** The lower desks of layout4, the files and crates beside the right one. */
export const LOWER_DESK_OBJECTS: readonly MapObject[] = [
  flat('chair', rect(11, 9, 1, 2)),
  solid('desk', rect(9, 11, 4, 2)),
  flat('chair', rect(21, 9, 1, 2)),
  solid('desk', rect(20, 11, 4, 2)),
];

export const LOWER_DESK_DECOR: readonly DecorPlacement[] = [
  // The left wall's banner flutters for the lower desks (render/trinkets.ts)
  place('banner', 0, 14),
  // Lower left desk
  place('globe', 9, 11),
  place('model', 10, 11),
  place('blueprint-rolls', 11, 11),
  place('lantern', 12, 11),
  // Lower right desk (the hourglass stands on the counter, as in smallRoom.ts)
  place('inkwell', 20, 11),
  place('file-stack', 21, 11),
  place('scroll-pile', 22, 11),
  place('toolbox', 23, 11),
  place('sacks', 22, 10),
  place('file-cabinet', 26, 11),
  place('crate-stack', 28, 11),
  place('barrel', 30, 11),
];

/** The lower desks chat across the rug, as in layout4. */
export function lowerDesks(left: number, right: number): readonly [Desk, Desk] {
  return [
    { seat: { col: 11, row: 10 }, side: 'lower', things: ['globe'], chatWith: right },
    { seat: { col: 21, row: 10 }, side: 'lower', things: ['file-stack'], chatWith: left },
  ];
}

/**
 * The corner desk: the member sits low enough (row 13) that the bubble over the head clears the
 * quest board, and far enough left (col 2) that the 「Lv N」 on the desk's front is beside the
 * message window, not under it. The desk's front goes under the window.
 */
export const CORNER_DESK_OBJECTS: readonly MapObject[] = [
  flat('chair', rect(2, 12, 1, 2)),
  solid('desk', rect(1, 14, 4, 2)),
];

export const CORNER_DESK_DECOR: readonly DecorPlacement[] = [
  place('candlestick', 1, 14),
  place('open-book', 3, 14),
  place('book-pile', 4, 14),
  // Beside the chair, and a map table on the carpet
  place('barrel', 1, 11),
  place('map-table', 4, 11),
  place('stool', 7, 12),
];

export const CORNER_SEAT: TilePos = { col: 2, row: 13 };

/**
 * The guests wait by the door, beside the right end of the message window: one just inside, in
 * front of the crates, and one in the doorway.
 */
export const DOOR_GUEST_SPOTS: readonly [TilePos, TilePos] = [
  { col: 28, row: 13 },
  { col: 30, row: 14 },
];
