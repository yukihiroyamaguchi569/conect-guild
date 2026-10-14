import type { GuildArt } from './art';
import { isUnshaded, type Daylight, type LampLight, type Rgb } from './daylight';
import { FLOOR_PATCH_DECOR } from './decor';
import { decorPoint } from './decorPoint';
import { SELECTED_LAYOUT } from './layouts';
import type { GuildLayout, MapObject } from './layouts/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import { DAYLIGHT } from './metrics';
import { patchAt } from './trinkets';

/**
 * Canvas side effects of day and night (daylight.ts decides the light). The HTML windows are over
 * the canvas, so they are never shaded. Logical px.
 */

/** The window tiles of `layout`, lit by the sun. */
function windowObjectsFor(layout: GuildLayout): readonly MapObject[] {
  return layout.objects.filter((object) => object.tile === 'window');
}

const WINDOWS = windowObjectsFor(SELECTED_LAYOUT);

const rgb = ({ r, g, b }: Rgb): string =>
  `rgb(${String(Math.round(r))}, ${String(Math.round(g))}, ${String(Math.round(b))})`;

/** The sun in the window tiles: their picture again with added light, by day only. */
export function drawWindowSun(ctx: CanvasRenderingContext2D, art: GuildArt, light: Daylight): void {
  if (light.sun <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = DAYLIGHT.windowSunAlpha * light.sun;
  for (const window of WINDOWS) art.tiles.drawTile(ctx, window.tile, window);
  ctx.restore();
}

/** The light patches on the floor, drifting with the sun and fading with it. */
export function drawLightPatches(
  ctx: CanvasRenderingContext2D,
  art: GuildArt,
  time: { readonly hour: number; readonly now: number },
  light: Daylight,
): void {
  const { dx, alpha } = patchAt(time.hour, light.sun, time.now);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const item of FLOOR_PATCH_DECOR) {
    const at = decorPoint(item);
    art.decor.drawDecor(ctx, item.name, at.x + dx, at.y);
  }
  ctx.restore();
}

/** What the shade needs of a 2D context (a fake one in the tests). */
export type ShadeContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'fillRect'
  | 'drawImage'
  | 'createRadialGradient'
  | 'globalCompositeOperation'
  | 'fillStyle'
>;

/** The logical-size canvas the shade is made on, and its picture. */
export interface ShadeScratch {
  readonly ctx: ShadeContext;
  readonly image: CanvasImageSource;
}

function radial(ctx: ShadeContext, lamp: LampLight, inner: string, outer: string): CanvasGradient {
  const gradient = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, lamp.r);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  return gradient;
}

/**
 * The shade over the room (multiplied), with the lamps' surroundings cut out of it, then a warm
 * light added around them as it gets dark. `scratch` is a logical-size canvas for the shade.
 */
export function drawShade(
  ctx: ShadeContext,
  scratch: ShadeScratch,
  light: Daylight,
  lamps: readonly LampLight[],
): void {
  if (isUnshaded(light)) return;
  const shade = scratch.ctx;
  shade.globalCompositeOperation = 'source-over';
  shade.fillStyle = rgb(light.shade);
  shade.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  shade.globalCompositeOperation = 'destination-out';
  for (const lamp of lamps) {
    shade.fillStyle = radial(shade, lamp, 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 0)');
    shade.fillRect(lamp.x - lamp.r, lamp.y - lamp.r, 2 * lamp.r, 2 * lamp.r);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(scratch.image, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  const warm = `rgba(255, 170, 80, ${String(DAYLIGHT.glowAlpha * light.darkness)})`;
  for (const lamp of lamps) {
    ctx.fillStyle = radial(ctx, lamp, warm, 'rgba(255, 170, 80, 0)');
    ctx.fillRect(lamp.x - lamp.r, lamp.y - lamp.r, 2 * lamp.r, 2 * lamp.r);
  }
  ctx.restore();
}
