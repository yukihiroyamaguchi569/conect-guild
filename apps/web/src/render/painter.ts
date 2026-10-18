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
import { drawAnimatedDecor, drawPetBark } from './drawDecor';
import { drawLightPatches, drawShade, drawWindowSun, type ShadeScratch } from './drawDaylight';
import { drawGuestBodies, drawGuestOverheads } from './drawGuests';
import { drawVisitorBody, drawVisitorWords } from './drawVisitor';
import { drawLevelTags } from './drawLevelTags';
import { drawReward } from './drawReward';
import { drawLevelUpBanners } from './drawLevelUp';
import type { GuestArt } from './guestArt';
import type { GuestFrame } from './guests';
import { BACK_ANIMATED_DECOR, FRONT_LAYERS } from './layers';
import { levelTags, type Levels } from './levelTags';
import type { Box } from './overhead';
import type { SpokenLines } from './lines';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import {
  NO_PLACES,
  overheadsOf,
  placedBox,
  rememberPlaces,
  type OverheadStage,
  type PlaceMemory,
  type Placed,
} from './overheadPlace';
import { PET_RECT } from './petting';
import { DEFAULT_SEATS } from './scenes';
import { decorPoint } from './decorPoint';
import { SELECTED_LAYOUT } from './layouts';
import { ornamentPlacement } from './ornament';
import { rewardOnDesk, rewardShownAt, type PlacedReward, type StageReward } from './rewardDesk';
import type { Speeches } from './summons';
import type { DecorCues } from './trinkets';
import type { VisitorView } from './visitors';

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
  /** The visitors' pictures (Issue #195), in the order of VISITOR_KINDS. */
  readonly visitorArt: GuestArt;
  /** Where the words over each head were in the frame painted last (overheadPlace.ts). */
  readonly placer: Placer;
}

interface Moment {
  readonly now: number;
  readonly hour: number;
  /** The local month, 1 to 12: its ornament stands on the floor (ornament.ts, Issue #192). */
  readonly month: number;
  /** Epoch ms of the browser's clock: the reward of the day is gone at its end (Issue #194). */
  readonly wall: number;
  readonly frame: StageFrame;
  /** The king's reward of the day and whose desk it is on (Issue #194). */
  readonly reward: StageReward | null;
  readonly bubbles: Bubbles;
  readonly speeches: Speeches;
  readonly remarks: SpokenLines;
  readonly murmurs: SpokenLines;
  readonly cues: DecorCues;
  readonly levels: Levels;
  readonly guests: GuestFrame;
  readonly visitor: VisitorView | null;
}

/**
 * One frame: the cached background with the sun in the windows and the light patches, the moving
 * things and the month's ornament, the members between the cached front layers (desks, the counter, the throne's arms),
 * the shade of the time of day with the lamps' light, and the bubbles (the pet's 「わん」 too) and
 * confetti on top.
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
  drawOrnament(ctx, art, moment.month);
  drawActors(ctx, moment, art, painter.front);
  drawGuestBodies(ctx, moment.guests, {
    guests: painter.guestArt,
    sprites: art.sprites,
    decor: art.decor,
  });
  drawVisitorBody(ctx, painter.visitorArt, moment.visitor);
  drawShade(ctx, painter.scratch, light, lampLights(moment.now));
  drawReward(ctx, art.decor, rewardPlaced(rewardShownAt(moment.reward, moment.wall)), moment.now);
  const tags = levelTags(moment.levels, DEFAULT_SEATS);
  drawLevelTags(ctx, tags);
  drawGuestOverheads(ctx, moment.guests);
  drawVisitorWords(ctx, moment.visitor, tags);
  const placed = painter.placer.place({ ...moment, tags });
  if (moment.cues.petted && PET_RECT !== null) drawPetBark(ctx, PET_RECT, bubbleBoxes(placed));
  drawOverhead(ctx, { placed, confetti: moment.frame.confetti });
  drawLevelUpBanners(ctx, { placed, confetti: moment.frame.confetti });
}

/**
 * The month's ornament at its spot, every frame: the next month's stands there as soon as the
 * month changes, the page left open or not.
 */
function drawOrnament(ctx: CanvasRenderingContext2D, art: GuildArt, month: number): void {
  const placement = ornamentPlacement(SELECTED_LAYOUT.ornamentSpot, month);
  const { x, y } = decorPoint(placement);
  art.decor.drawDecor(ctx, placement.name, x, y);
}

/** The reward of the day on its member's desk in the selected layout (Issue #194). */
function rewardPlaced(reward: StageReward | null): PlacedReward | null {
  if (reward === null) return null;
  return rewardOnDesk(SELECTED_LAYOUT, DEFAULT_SEATS[reward.member], reward.kind);
}

/** Everything drawn for the bubbles of `placed` (not the 「Z」, which has none). */
function bubbleBoxes(placed: readonly Placed[]): Box[] {
  return placed.flatMap((one) => (one.bubble === null ? [] : [placedBox(one)]));
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
  visitorArt: GuestArt,
): Painter {
  const { background, front } = cachedScenery(art);
  const image = cachedLayer(() => undefined);
  const scratch = { ctx: context2d(image), image };
  return { ctx, scratch, background, front, art, guestArt, visitorArt, placer: createPlacer() };
}
