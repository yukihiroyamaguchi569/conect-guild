import type { GuildArt } from './art';
import type { Bubbles } from './bubbles';
import { daylightAt, lampLights } from './daylight';
import type { StageFrame } from './director';
import {
  drawActors,
  drawFrontLayer,
  drawOverhead,
  drawStatic,
  type CachedFrontLayer,
} from './draw';
import { drawAnimatedDecor } from './drawDecor';
import { drawLightPatches, drawShade, drawWindowSun, type ShadeScratch } from './drawDaylight';
import { drawGuestBodies, drawGuestOverheads } from './drawGuests';
import { drawLevelTags } from './drawLevelTags';
import { drawLevelUpBanners } from './drawLevelUp';
import type { GuestArt } from './guestArt';
import type { GuestFrame } from './guests';
import { BACK_ANIMATED_DECOR, FRONT_LAYERS } from './layers';
import { levelTags, type Levels } from './levelTags';
import type { SpokenLines } from './lines';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import {
  NO_PLACES,
  overheadsOf,
  rememberPlaces,
  type OverheadStage,
  type PlaceMemory,
  type Placed,
} from './overheadPlace';
import { DEFAULT_SEATS } from './scenes';
import type { Speeches } from './summons';
import type { DecorCues } from './trinkets';

/**
 * Painting one frame of the render loop (loop.ts): the scenery cached once, then each frame the
 * daylight, the moving things, the members and the guests (Issue #108), the shade and what is over
 * the heads. Split from loop.ts (Issue #124); the loop decides when, this file what is drawn.
 */

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2D canvas is not available');
  return ctx;
}

function cachedLayer(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  layer.width = LOGICAL_WIDTH;
  layer.height = LOGICAL_HEIGHT;
  draw(context2d(layer));
  return layer;
}

/** Everything that never moves, drawn once: the background and each front layer. */
function cachedScenery(art: GuildArt): {
  background: HTMLCanvasElement;
  front: CachedFrontLayer[];
} {
  const background = cachedLayer((ctx) => {
    drawStatic(ctx, art);
  });
  const front = FRONT_LAYERS.map((layer) => ({
    depth: layer.depth,
    layer,
    image: cachedLayer((ctx) => {
      drawFrontLayer(ctx, art, layer);
    }),
  }));
  return { background, front };
}

export interface Painter {
  readonly ctx: CanvasRenderingContext2D;
  /** A logical-size canvas for the shade of the night. */
  readonly scratch: ShadeScratch;
  readonly background: HTMLCanvasElement;
  readonly front: readonly CachedFrontLayer[];
  readonly art: GuildArt;
  readonly guestArt: GuestArt;
  /** Where the words over each head were in the frame painted last (overheadPlace.ts). */
  readonly placer: Placer;
}

interface Moment {
  readonly now: number;
  readonly hour: number;
  readonly frame: StageFrame;
  readonly bubbles: Bubbles;
  readonly speeches: Speeches;
  readonly remarks: SpokenLines;
  readonly murmurs: SpokenLines;
  readonly cues: DecorCues;
  readonly levels: Levels;
  readonly guests: GuestFrame;
}

/**
 * One frame: the cached background with the sun in the windows and the light patches, the moving
 * things, the members between the cached front layers (desks, the counter, the throne's arms),
 * the shade of the time of day with the lamps' light, and the bubbles and confetti on top.
 */
export function paint(painter: Painter, scale: number, moment: Moment): void {
  const { ctx, art } = painter;
  const light = daylightAt(moment.hour);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(painter.background, 0, 0);
  drawWindowSun(ctx, art, light);
  drawLightPatches(ctx, art, moment, light);
  drawAnimatedDecor(ctx, art, moment, BACK_ANIMATED_DECOR);
  drawActors(ctx, moment, art, painter.front);
  drawGuestBodies(ctx, moment.guests, {
    guests: painter.guestArt,
    sprites: art.sprites,
    decor: art.decor,
  });
  drawShade(ctx, painter.scratch, light, lampLights(moment.now));
  const tags = levelTags(moment.levels, DEFAULT_SEATS);
  drawLevelTags(ctx, tags);
  drawGuestOverheads(ctx, moment.guests);
  const placed = painter.placer.place({ ...moment, tags });
  drawOverhead(ctx, { placed, confetti: moment.frame.confetti });
  drawLevelUpBanners(ctx, { placed, confetti: moment.frame.confetti });
}

/** Places what is over the heads, keeping each line's spot from the frame painted before. */
interface Placer {
  place(stage: OverheadStage): Placed[];
}

function createPlacer(): Placer {
  let places: PlaceMemory = NO_PLACES;
  return {
    place(stage) {
      const placed = overheadsOf(stage, places);
      places = rememberPlaces(placed);
      return placed;
    },
  };
}

/** The canvas, the scenery drawn once and an empty canvas for the shade. */
export function createPainter(
  ctx: CanvasRenderingContext2D,
  art: GuildArt,
  guestArt: GuestArt,
): Painter {
  const { background, front } = cachedScenery(art);
  const image = cachedLayer(() => undefined);
  const scratch = { ctx: context2d(image), image };
  return { ctx, scratch, background, front, art, guestArt, placer: createPlacer() };
}
