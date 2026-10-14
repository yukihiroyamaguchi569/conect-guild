import { DEPARTMENT_MEMBERS } from '../guild.config';
import { DECOR_MOTION, type DecorMotion } from './ambient';
import { isFloorPatch, type DecorPlacement } from './decor';
import { SELECTED_LAYOUT } from './layouts';
import type { GuildLayout } from './layouts/types';
import { AMBIENT } from './metrics';
import { triggerIn, triggerTableFor, type DecorTrigger, type TriggerTable } from './trinkets';

/**
 * The decor of a layout split by whether it moves (DECOR_MOTION in ambient.ts). Kept apart from
 * decor.ts, whose placements map.ts reads, so the map does not depend on the motion modules.
 */

/** The still things of `layout`, drawn once after the furniture, lower ones last. */
export function stillDecorFor(layout: GuildLayout): readonly DecorPlacement[] {
  return layout.decor
    .filter((item) => !isFloorPatch(item) && DECOR_MOTION[item.name] === undefined)
    .toSorted((a, b) => a.row + a.h - (b.row + b.h));
}

/** Drawn once after the furniture, lower ones last so they overlap the ones behind them. */
export const STILL_DECOR: readonly DecorPlacement[] = stillDecorFor(SELECTED_LAYOUT);

export interface AnimatedDecor {
  readonly placement: DecorPlacement;
  readonly motion: DecorMotion;
  /** Shifts this one's flicker or breath against the others. */
  readonly phaseMs: number;
  /** When it moves (trinkets.ts); null when it always does (the lamps and the pet). */
  readonly trigger: DecorTrigger | null;
}

/** The moving things of `layout`, with their triggers from `triggers`. */
export function animatedDecorFor(
  layout: GuildLayout,
  triggers: TriggerTable,
): readonly AnimatedDecor[] {
  return layout.decor
    .flatMap((placement) => {
      const motion = DECOR_MOTION[placement.name];
      return motion === undefined ? [] : [{ placement, motion }];
    })
    .map(({ placement, motion }, index) => ({
      placement,
      motion,
      phaseMs: index * AMBIENT.decorPhaseStepMs,
      trigger: triggerIn(triggers, placement),
    }));
}

/** Drawn every frame (the lamps, the pet and the things that move at times), under the members. */
export const ANIMATED_DECOR: readonly AnimatedDecor[] = animatedDecorFor(
  SELECTED_LAYOUT,
  triggerTableFor(SELECTED_LAYOUT, DEPARTMENT_MEMBERS),
);
