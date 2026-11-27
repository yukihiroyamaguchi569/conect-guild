import type { TilePos } from '../guild.config';
import { PET_DECOR, windowTilesIn } from './idleSpots';
import type { GuildLayout } from './layouts/types';
import { isWalkableIn } from './map';
import { TRINKETS } from './metrics';
import { poseOnSegment, staySegment, walkSegment, type Segment } from './motion';
import { findPath, tileToPoint, type TilePath } from './path';

/**
 * The pet's walk round the guild (Issue #319, docs/DESIGN.md 8): from its place by the throne
 * along the walkways to a stop under a window or beside a desk, a short stay there, and back the
 * same way. Worked out once from the layout, as the members' play spots are (idleSpots.ts). When
 * it walks is trinkets.petWalkAt's. Pure.
 */

/** One walk: there along `path` (its first tile is the pet's place), and back the same way. */
export interface PetRoute {
  readonly path: TilePath;
}

/** Where the pet is drawn `elapsed` ms into a walk, from its place; null once it is back. */
export interface PetStep {
  /** Added to where the pet's picture is drawn, logical px. */
  readonly dx: number;
  readonly dy: number;
  /** The second picture of a step (the legs the other way). */
  readonly second: boolean;
  /** Facing left (the right-facing picture mirrored). */
  readonly left: boolean;
}

const same = (a: TilePos, b: TilePos) => a.col === b.col && a.row === b.row;

/** Beside each desk's seat, left or right, the first walkable tile. */
function deskSidesIn(layout: GuildLayout): TilePos[] {
  return layout.desks.flatMap(({ seat }) => {
    const sides = [-1, 1].map((side) => ({ col: seat.col + side, row: seat.row }));
    const tile = sides.find((pos) => isWalkableIn(layout, pos));
    return tile === undefined ? [] : [tile];
  });
}

/**
 * The walks of the pet of `layout`: to under each window, then beside each desk, from the bottom
 * left tile of the pet's place (its feet), wherever there is a way. None without a pet.
 */
export function petRoutesIn(layout: GuildLayout): readonly PetRoute[] {
  const pet = layout.decor.find((item) => item.name === PET_DECOR);
  if (pet === undefined) return [];
  const home = { col: pet.col, row: pet.row + pet.h - 1 };
  const walkable = (pos: TilePos) => isWalkableIn(layout, pos);
  return [...windowTilesIn(layout), ...deskSidesIn(layout)].flatMap((stop) => {
    const path = same(stop, home) ? null : findPath(home, stop, walkable);
    return path === null || path.length < 2 ? [] : [{ path }];
  });
}

/** The walk there, the stay (TRINKETS.petWalkStayMs) and the walk back, from 0. */
function segmentsOf(route: PetRoute): readonly [Segment, Segment, Segment] {
  const there = walkSegment(route.path, 0);
  const stop = route.path.at(-1) ?? route.path[0];
  const stay = staySegment(stop, there.end, TRINKETS.petWalkStayMs);
  const back: TilePath = [stop, ...route.path.slice(0, -1).reverse()];
  return [there, stay, walkSegment(back, stay.end)];
}

/** How long the walk of `route` takes, ms. */
export function petWalkMs(route: PetRoute): number {
  return segmentsOf(route)[2].end;
}

/** The pet `elapsed` ms into the walk of `route`; null before it and once it is back. */
export function petStepAt(route: PetRoute, elapsed: number): PetStep | null {
  const [there, stay, back] = segmentsOf(route);
  if (elapsed < 0 || elapsed >= back.end) return null;
  const home = tileToPoint(route.path[0]);
  if (elapsed >= there.end && elapsed < stay.end) {
    // It stands at the stop, facing the way it came.
    const stop = tileToPoint(stay.path[0]);
    const left = poseOnSegment(there, there.end - 1).flip;
    return { dx: stop.x - home.x, dy: stop.y - home.y, second: false, left };
  }
  const pose = poseOnSegment(elapsed < there.end ? there : back, elapsed);
  return {
    dx: Math.round(pose.point.x - home.x),
    dy: Math.round(pose.point.y - home.y),
    second: pose.frame === 3,
    left: pose.flip,
  };
}
