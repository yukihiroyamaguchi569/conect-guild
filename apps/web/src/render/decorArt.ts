import { DECOR, DECOR_TILE_SIZE, type DecorName } from '../../../../assets/decor/decor';
import { PROPS, PROPS_TILE_SIZE } from '../../../../assets/props/props';
import { drawPlaceholderProp, type DecorArt, type SpriteArt } from './art';
import type { Hold, Prop } from './motion';
import type { Point } from './path';

/** The small things: pieces of assets/decor/decor.png (positions in decor.ts). */

export interface DecorDraw {
  readonly sx: number;
  readonly sy: number;
  readonly w: number;
  readonly h: number;
}

/** Where a piece is in the sheet and how big it is, px. Pure. */
export function decorDraw(name: DecorName): DecorDraw {
  const piece = DECOR[name];
  return {
    sx: piece.col * DECOR_TILE_SIZE,
    sy: piece.row * DECOR_TILE_SIZE,
    w: piece.w * DECOR_TILE_SIZE,
    h: piece.h * DECOR_TILE_SIZE,
  };
}

export function createDecorArt(sheet: CanvasImageSource): DecorArt {
  return {
    drawDecor(ctx, name, x, y) {
      const d = decorDraw(name);
      ctx.drawImage(sheet, d.sx, d.sy, d.w, d.h, Math.round(x), Math.round(y), d.w, d.h);
    },
    drawDecorScaled(ctx, name, { x, y, scale }) {
      const d = decorDraw(name);
      const [w, h] = [d.w * scale, d.h * scale];
      ctx.drawImage(sheet, d.sx, d.sy, d.w, d.h, Math.round(x), Math.round(y), w, h);
    },
  };
}

/** The stand-in picture for each held item, used when props.png cannot be loaded. */
export const PROP_DECOR: Readonly<Record<Prop, DecorName>> = {
  scroll: 'scroll-pile',
  chest: 'chest',
  tankard: 'mugs',
};

/** Which picture a held item uses and its top-left, centred on `at`. Pure. */
export function propPlacement(prop: Prop, at: Point): { name: DecorName; x: number; y: number } {
  const name = PROP_DECOR[prop];
  const { w, h } = decorDraw(name);
  return { name, x: at.x - w / 2, y: at.y - h / 2 };
}

/** Held items drawn with the decor pictures. */
export function decorProps(decor: DecorArt): SpriteArt['drawProp'] {
  return (ctx, prop, at) => {
    const { name, x, y } = propPlacement(prop, at);
    decor.drawDecor(ctx, name, x, y);
  };
}

/** Where a held item's own picture is in props.png and its top-left, centred on `at`. Pure. */
export function propDraw(prop: Prop, at: Point): DecorDraw & { x: number; y: number } {
  const piece = PROPS[prop];
  const w = piece.w * PROPS_TILE_SIZE;
  const h = piece.h * PROPS_TILE_SIZE;
  return {
    sx: piece.col * PROPS_TILE_SIZE,
    sy: piece.row * PROPS_TILE_SIZE,
    w,
    h,
    x: at.x - w / 2,
    y: at.y - h / 2,
  };
}

/** Held items drawn with their own pictures (assets/props/props.png, positions in props.ts). */
export function sheetProps(sheet: CanvasImageSource): SpriteArt['drawProp'] {
  return (ctx, prop, at) => {
    const d = propDraw(prop, at);
    ctx.drawImage(sheet, d.sx, d.sy, d.w, d.h, Math.round(d.x), Math.round(d.y), d.w, d.h);
  };
}

/** Which sheet a held item's picture comes from. */
export type PropPicture = 'props' | 'decor';

/**
 * A raised scroll is the bundle of three from decor.png (one scroll alone looks lost over the
 * head); a carried scroll and the chest, carried or raised, are their own pictures in props.png.
 * Pure.
 */
export function propPicture(prop: Prop, hold: Hold): PropPicture {
  return prop === 'scroll' && hold === 'raise' ? 'decor' : 'props';
}

/**
 * The held items' drawing: their own pictures (the decor bundle for a raised scroll), else the
 * small things' pictures, else boxes.
 */
export function chooseProps(
  props: SpriteArt['drawProp'] | null,
  decorFallback: SpriteArt['drawProp'] | null,
): SpriteArt['drawProp'] {
  if (props === null) return decorFallback ?? drawPlaceholderProp;
  if (decorFallback === null) return props;
  return (ctx, prop, at, hold) => {
    pickPropDrawing(props, decorFallback, prop, hold)(ctx, prop, at, hold);
  };
}

/** The drawing for one held item when both sheets loaded (propPicture). Pure. */
export function pickPropDrawing(
  props: SpriteArt['drawProp'],
  decor: SpriteArt['drawProp'],
  prop: Prop,
  hold: Hold,
): SpriteArt['drawProp'] {
  return propPicture(prop, hold) === 'decor' ? decor : props;
}
