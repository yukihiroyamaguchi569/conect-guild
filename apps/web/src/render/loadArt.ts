import hibikiUrl from '../../../../assets/sprites/hibiki.png';
import hirameUrl from '../../../../assets/sprites/hirame.png';
import kanameUrl from '../../../../assets/sprites/kaname.png';
import minoriUrl from '../../../../assets/sprites/minori.png';
import musubiUrl from '../../../../assets/sprites/musubi.png';
import sasaeUrl from '../../../../assets/sprites/sasae.png';
import takumiUrl from '../../../../assets/sprites/takumi.png';
import yukihiroUrl from '../../../../assets/sprites/yukihiro.png';
import decorUrl from '../../../../assets/decor/decor.png';
import propsUrl from '../../../../assets/props/props.png';
import tilesetUrl from '../../../../assets/tiles/tileset.png';
import type { MemberId } from '../guild.config';
import {
  drawPlaceholderProp,
  placeholderArt,
  type DecorArt,
  type GuildArt,
  type SpriteArt,
  type TileArt,
} from './art';
import { chooseProps, createDecorArt, decorProps, sheetProps } from './decorArt';
import { createSpriteArt } from './spriteArt';
import { createTileArt } from './tileArt';

/**
 * Loads the pictures (bundled by Vite from assets/, never from another origin) and builds the art.
 * When a picture cannot be loaded, its part (tiles, members or the small things) falls back to the
 * placeholder boxes, so the stage still shows. Held items use their own pictures (props.png), then
 * the small things' pictures, then the placeholder boxes.
 */

const SPRITE_URLS: Readonly<Record<MemberId, string>> = {
  kaname: kanameUrl,
  minori: minoriUrl,
  hibiki: hibikiUrl,
  hirame: hirameUrl,
  sasae: sasaeUrl,
  takumi: takumiUrl,
  musubi: musubiUrl,
  yukihiro: yukihiroUrl,
};

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

async function loadTiles(): Promise<TileArt> {
  try {
    return createTileArt(await loadImage(tilesetUrl));
  } catch {
    return placeholderArt.tiles;
  }
}

async function loadSprites(): Promise<SpriteArt> {
  const load = (id: MemberId) => loadImage(SPRITE_URLS[id]);
  try {
    const [kaname, minori, hibiki, hirame, sasae, takumi, musubi, yukihiro] = await Promise.all([
      load('kaname'),
      load('minori'),
      load('hibiki'),
      load('hirame'),
      load('sasae'),
      load('takumi'),
      load('musubi'),
      load('yukihiro'),
    ]);
    const sheets = { kaname, minori, hibiki, hirame, sasae, takumi, musubi, yukihiro };
    return createSpriteArt(sheets, drawPlaceholderProp);
  } catch {
    return placeholderArt.sprites;
  }
}

async function loadDecor(): Promise<DecorArt | null> {
  try {
    return createDecorArt(await loadImage(decorUrl));
  } catch {
    return null;
  }
}

async function loadProps(): Promise<SpriteArt['drawProp'] | null> {
  try {
    return sheetProps(await loadImage(propsUrl));
  } catch {
    return null;
  }
}

export async function loadArt(): Promise<GuildArt> {
  const [tiles, sprites, decor, props] = await Promise.all([
    loadTiles(),
    loadSprites(),
    loadDecor(),
    loadProps(),
  ]);
  return {
    tiles,
    sprites: {
      ...sprites,
      drawProp: chooseProps(props, decor === null ? null : decorProps(decor)),
    },
    decor: decor ?? placeholderArt.decor,
  };
}
