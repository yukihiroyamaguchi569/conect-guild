import { ANIMATED_DECOR, STILL_DECOR, type AnimatedDecor } from './animatedDecor';
import type { DecorPlacement } from './decor';
import { SELECTED_LAYOUT } from './layouts';
import type { GuildLayout } from './layouts/types';
import { contains, type MapObject, type PxRect, type TileName } from './map';
import { TILE_SIZE } from './metrics';

/**
 * Which furniture is behind the members and which in front of them. Desks and the counter (with
 * the things on them) and the throne's arms and seat are drawn after the members whose feet are
 * behind them, so a seated member's lower body is hidden (seating.ts sinks them into the seat).
 * Everything else is the background, always behind. Pure data; the loop caches each layer once.
 */

/** Pieces drawn whole in front of whoever is behind them. */
const FRONT_TILES: ReadonlySet<TileName> = new Set<TileName>([
  'desk',
  'counter-left',
  'counter-mid',
  'counter-right',
]);

/**
 * The parts of the throne in front of the king, px from its top-left (measured on the tile art,
 * 96 x 96): both arms from the armrests down, and the front of the seat cushion and the base.
 */
const THRONE_FRONT: readonly PxRect[] = [
  { left: 0, top: 48, right: 26, bottom: 96 },
  { left: 70, top: 48, right: 96, bottom: 96 },
  { left: 26, top: 62, right: 70, bottom: 96 },
];

/** Part of a piece drawn again over the members, clipped to `clips` (logical px). */
export interface FrontPart {
  readonly object: MapObject;
  readonly clips: readonly PxRect[];
}

export interface FrontLayer {
  /**
   * The bottom of its furniture, logical px. Members whose feet (on their tile, before sinking)
   * are above it are drawn first, so it covers them; the others are drawn over it.
   */
  readonly depth: number;
  /** Drawn whole. */
  readonly objects: readonly MapObject[];
  readonly parts: readonly FrontPart[];
  /** The things on its furniture, in the same layer. */
  readonly still: readonly DecorPlacement[];
  readonly animated: readonly AnimatedDecor[];
}

const isFront = (object: MapObject): boolean => FRONT_TILES.has(object.tile);
const bottomOf = (object: MapObject): number => (object.row + object.h) * TILE_SIZE;

function throneParts(object: MapObject): FrontPart[] {
  if (object.tile !== 'throne') return [];
  const x = object.col * TILE_SIZE;
  const y = object.row * TILE_SIZE;
  const clips = THRONE_FRONT.map((r) => ({
    left: x + r.left,
    top: y + r.top,
    right: x + r.right,
    bottom: y + r.bottom,
  }));
  return [{ object, clips }];
}

/** The things of a layout, still and moving, that the layers share out. */
export interface LayerDecor {
  readonly still: readonly DecorPlacement[];
  readonly animated: readonly AnimatedDecor[];
}

/** The furniture of a layout drawn behind and in front of the members. */
export interface Layers {
  /** Back to front. */
  readonly front: readonly FrontLayer[];
  /** The background: furniture and things not in a front layer (the throne is there whole). */
  readonly backObjects: readonly MapObject[];
  readonly backStill: readonly DecorPlacement[];
  readonly backAnimated: readonly AnimatedDecor[];
}

/** The layers of `layout` with its things (animatedDecor.ts). */
export function layersFor(layout: GuildLayout, decor: LayerDecor): Layers {
  /** The front piece a small thing stands on, if any (its top-left cell is on the piece). */
  const standsOn = (item: DecorPlacement): MapObject | undefined =>
    layout.objects.find((object) => isFront(object) && contains(object, item));
  const objects = layout.objects.filter(isFront);
  const parts = layout.objects.flatMap(throneParts);
  const depths = [...new Set([...objects, ...parts.map((p) => p.object)].map(bottomOf))].toSorted(
    (a, b) => a - b,
  );
  const front = depths.map((depth) => {
    const here = objects.filter((o) => bottomOf(o) === depth);
    const on = (item: DecorPlacement) => {
      const base = standsOn(item);
      return base !== undefined && here.includes(base);
    };
    return {
      depth,
      objects: here,
      parts: parts.filter((p) => bottomOf(p.object) === depth),
      still: decor.still.filter(on),
      animated: decor.animated.filter((a) => on(a.placement)),
    };
  });
  return {
    front,
    backObjects: layout.objects.filter((o) => !isFront(o)),
    backStill: decor.still.filter((item) => standsOn(item) === undefined),
    backAnimated: decor.animated.filter((item) => standsOn(item.placement) === undefined),
  };
}

const SELECTED_LAYERS = layersFor(SELECTED_LAYOUT, {
  still: STILL_DECOR,
  animated: ANIMATED_DECOR,
});

/** Back to front. */
export const FRONT_LAYERS: readonly FrontLayer[] = SELECTED_LAYERS.front;

/** The background: furniture and things not in a front layer (the throne is there whole). */
export const BACK_OBJECTS: readonly MapObject[] = SELECTED_LAYERS.backObjects;
export const BACK_STILL_DECOR: readonly DecorPlacement[] = SELECTED_LAYERS.backStill;
export const BACK_ANIMATED_DECOR: readonly AnimatedDecor[] = SELECTED_LAYERS.backAnimated;

export type DrawStep<T, L> =
  | { readonly kind: 'member'; readonly member: T }
  | { readonly kind: 'layer'; readonly layer: L }
  | { readonly kind: 'held'; readonly member: T };

interface Deep {
  readonly depth: number;
}

/**
 * Members and front layers in one drawing order, back to front by depth: a layer goes before every
 * member at or below its depth, so it covers only the ones behind it. Members of the same depth
 * keep their order.
 */
export function drawSteps<T extends Deep, L extends Deep>(
  members: readonly T[],
  layers: readonly L[],
): DrawStep<T, L>[] {
  const steps: DrawStep<T, L>[] = [];
  const pending = layers.toSorted((a, b) => a.depth - b.depth);
  const ordered = members.toSorted((a, b) => a.depth - b.depth);
  for (const member of ordered) {
    for (let layer = pending[0]; layer !== undefined && layer.depth <= member.depth;) {
      steps.push({ kind: 'layer', layer });
      pending.shift();
      layer = pending[0];
    }
    steps.push({ kind: 'member', member });
  }
  for (const layer of pending) steps.push({ kind: 'layer', layer });
  return steps;
}

/**
 * drawSteps, then what each member holds over everything: a member sunk into a seat holds the item
 * just over the desk or the counter in front, which would otherwise hide it.
 */
export function stageSteps<T extends Deep, L extends Deep>(
  members: readonly T[],
  layers: readonly L[],
): DrawStep<T, L>[] {
  const held = members
    .toSorted((a, b) => a.depth - b.depth)
    .map((member): DrawStep<T, L> => ({ kind: 'held', member }));
  return [...drawSteps(members, layers), ...held];
}
