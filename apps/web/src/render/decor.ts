import { SELECTED_LAYOUT } from './layouts';
import { isFloorPatch, type DecorPlacement, type GuildLayout } from './layouts/types';

/**
 * The small things that make the office busy (assets/decor/decor.ts): on the walls, on the desks
 * and the counter, and on the floor. Where they sit is part of each layout (render/layouts, Issue
 * #18); each department's corner has its own things, the rest is shared.
 * Floor things block the way (members walk around them); things on desks, the counter and the
 * walls sit on cells nobody walks on anyway. A light patch is a flat floor patch, drawn every
 * frame as it drifts with the sun (daylight.ts). This file imports nothing of render but the
 * layouts: map.isWalkable reads the placements.
 */

export { isFloorPatch, type DecorPlacement };

export const DECOR_PLACEMENTS: readonly DecorPlacement[] = SELECTED_LAYOUT.decor;

/** The floor patches of `layout`. */
export function floorPatchDecorFor(layout: GuildLayout): readonly DecorPlacement[] {
  return layout.decor.filter(isFloorPatch);
}

/** Drawn every frame over the cached ground, before the members (they drift with the sun). */
export const FLOOR_PATCH_DECOR: readonly DecorPlacement[] = floorPatchDecorFor(SELECTED_LAYOUT);
