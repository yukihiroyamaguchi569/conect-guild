// Held item positions in props.png, in 40px tile units.
// w/h are how many tiles the piece covers; keep in sync with build_props.py.
export const PROPS_TILE_SIZE = 40;

export const PROPS = {
  scroll: { col: 0, row: 0, w: 1, h: 1 },
  chest: { col: 1, row: 0, w: 1, h: 1 },
  // Raised in a toast (Issue #193).
  tankard: { col: 2, row: 0, w: 1, h: 1 },
} as const;

export type PropName = keyof typeof PROPS;
