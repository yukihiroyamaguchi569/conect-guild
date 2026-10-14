import {
  flat,
  MAP_COLS,
  MAP_ROWS,
  place,
  rect,
  solid,
  type DecorPlacement,
  type GroundFill,
  type GuildLayout,
  type MapObject,
} from './types';

/**
 * Four departments: the office of 2026-10-12, laid out like assets/concept/rpg-company-ui.png
 * within what the HTML windows leave free. The throne at the back centre, かなめ's counter in the
 * middle, a desk in each wing and the door at the bottom right. Moved here unchanged from map.ts,
 * decor.ts, guild.config.ts, idleSpots.ts and trinkets.ts (Issue #18; layout4.golden.test.ts).
 */

/**
 * Ground layer, painted in order (later fills win). The back wall is two tiles high; a carpet in
 * each department's corner, a red rug from the throne down to かなめ and in front of her counter.
 */
const GROUND_FILLS: readonly GroundFill[] = [
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
  // The doorway in the right wall; the door itself is drawn over it (MAP_OBJECTS).
  { tile: 'floor', ...rect(30, 14, 2, 3) },
];

/**
 * Furniture, sized to the pieces of assets/tiles/tiles.ts: the throne at the back centre, かなめ's
 * counter (left + middles + right) in front of it, a department in each corner and the door at the
 * bottom right. The upper departments sit between the quest board and the party window; the lower
 * ones just above the message window. Every member sits on the chair right behind their desk (the
 * chair's lower cell is the seat), so the desk is in front of them. Chairs are not solid, so
 * members walk on them; the door is only decoration (nobody leaves the room). Windows and the door
 * have see-through parts, so they go over the wall and floor, not instead.
 */
const MAP_OBJECTS: readonly MapObject[] = [
  flat('window', rect(10, 1, 2, 2)),
  flat('window', rect(21, 1, 2, 2)),
  solid('board', rect(12, 1, 3, 2)),
  solid('throne', rect(15, 2, 3, 3)),
  solid('counter-left', rect(13, 8, 1, 2)),
  solid('counter-mid', rect(14, 8, 5, 2)),
  solid('counter-right', rect(19, 8, 1, 2)),
  flat('door', rect(30, 14, 2, 3)),
  // 経理 (upper left): the member on the chair right behind the desk, facing it
  flat('chair', rect(12, 3, 1, 2)),
  solid('desk', rect(10, 5, 4, 2)),
  // 広報 (upper right)
  flat('chair', rect(20, 3, 1, 2)),
  solid('desk', rect(19, 5, 4, 2)),
  solid('plant', rect(22, 7, 1, 1)),
  // 企画 (lower left): behind the desk too, clear of the quest board above
  solid('shelf', rect(1, 10, 2, 3)),
  flat('chair', rect(11, 9, 1, 2)),
  solid('desk', rect(9, 11, 4, 2)),
  // 総務 (lower right), mirroring 企画 around the counter
  flat('chair', rect(21, 9, 1, 2)),
  solid('desk', rect(20, 11, 4, 2)),
  // the bottom-left corner, left of the message window
  solid('crate', rect(2, 14, 1, 1)),
];

/**
 * The small things (render/decor.ts): each department's corner has its own (経理: abacus, ledgers,
 * coins, safe; 広報: posters, megaphone, flyers, easel; 企画: map table, blueprints, globe, model;
 * 総務: files, key board, toolbox); the rest is shared.
 */
const DECOR_PLACEMENTS: readonly DecorPlacement[] = [
  // Back wall around the throne (the corners are under the HTML windows)
  place('sconce', 15, 1),
  place('sconce', 17, 1),
  place('banner', 18, 1),
  place('poster-cat', 19, 1),
  place('poster-stripes', 19, 2),
  place('plant-hanging', 20, 1),
  // Side walls below the windows
  place('sconce', 0, 11),
  place('banner', 0, 14),
  place('key-board', 31, 12),
  place('lantern', 31, 13),
  // 経理 (upper left)
  place('safe', 10, 3),
  place('candlestick', 10, 5),
  place('abacus', 11, 5),
  place('ledger-stack', 12, 5),
  place('coin-pile', 13, 5),
  place('plant-small', 14, 3),
  // 広報 (upper right)
  place('easel', 22, 3),
  place('megaphone', 19, 5),
  place('open-book', 20, 5),
  place('flyers', 21, 5),
  place('mugs', 22, 5),
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
  // 企画 (lower left)
  place('map-table', 3, 11),
  place('stool', 6, 12),
  place('globe', 9, 11),
  place('model', 10, 11),
  place('blueprint-rolls', 11, 11),
  place('lantern', 12, 11),
  // 総務 (lower right)
  place('inkwell', 20, 11),
  place('file-stack', 21, 11),
  place('hourglass', 22, 11),
  place('toolbox', 23, 11),
  place('file-cabinet', 26, 11),
  place('crate-stack', 28, 11),
  place('barrel', 30, 11),
  // Light on the floor of the bottom corridor
  place('light-patch', 14, 13),
  place('light-patch', 24, 13),
  // Corners beside the message window
  place('barrel-pair', 1, 14),
  place('sacks', 2, 15),
  place('barrel-small', 2, 16),
  place('barrel-small', 29, 14),
  place('plant-large', 29, 15),
];

export const LAYOUT4: GuildLayout = {
  departmentCount: 4,
  groundFills: GROUND_FILLS,
  objects: MAP_OBJECTS,
  decor: DECOR_PLACEMENTS,
  // Each department chats with the one across the counter on the same row.
  desks: [
    // 経理 (upper left)
    { seat: { col: 12, row: 4 }, side: 'upper', things: ['abacus', 'coin-pile'], chatWith: 1 },
    // 広報 (upper right)
    { seat: { col: 20, row: 4 }, side: 'upper', things: ['megaphone'], chatWith: 0 },
    // 企画 (lower left)
    { seat: { col: 11, row: 10 }, side: 'lower', things: ['globe'], chatWith: 3 },
    // 総務 (lower right)
    { seat: { col: 21, row: 10 }, side: 'lower', things: ['file-stack'], chatWith: 2 },
  ],
  commanderSeat: { col: 16, row: 7 },
  // The throne is three tiles wide and high (cols 15-17, rows 2-4): the king sits in its middle.
  kingSeat: { col: 16, row: 3 },
  places: {
    counterFront: { col: 16, row: 10 },
    // Left of the throne's front row, next to the king. As near to her counter as the right side,
    // where the pet sleeps.
    throneSide: { col: 14, row: 4 },
  },
  // In the doorway.
  offstage: { col: 30, row: 15 },
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
