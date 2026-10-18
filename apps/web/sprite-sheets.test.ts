import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DECOR, DECOR_TILE_SIZE } from '../../assets/decor/decor';

/** The 80 x 80 frames of every sheet the stage draws (Issue #179: frame 7 is asleep). */
const SPRITES = [
  'kaname',
  'minori',
  'hibiki',
  'hirame',
  'sasae',
  'takumi',
  'musubi',
  'yukihiro',
  'guest1',
  'guest2',
] as const;
const FRAME = 80;
const FRAMES = 8;

/** Width and height from a PNG's IHDR chunk (bytes 16–23, big-endian). */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const asset = (path: string): string => join(import.meta.dirname, '../../assets', path);

describe('sprite sheets', () => {
  it.each(SPRITES)('%s has all eight frames in one row', (id) => {
    expect(pngSize(asset(`sprites/${id}.png`))).toEqual({ width: FRAMES * FRAME, height: FRAME });
  });
});

/** Every piece of a sheet lies inside the picture, so drawing it never reads past the edge. */
function piecesOutside(
  pieces: Readonly<Record<string, { col: number; row: number; w: number; h: number }>>,
  tile: number,
  size: { width: number; height: number },
): string[] {
  return Object.entries(pieces)
    .filter(([, p]) => (p.col + p.w) * tile > size.width || (p.row + p.h) * tile > size.height)
    .map(([name]) => name);
}

describe('small things sheet (decor.png)', () => {
  const size = pngSize(asset('decor/decor.png'));

  it('is 8 x 16 tiles of 32 px and holds every piece', () => {
    expect(size).toEqual({ width: 8 * DECOR_TILE_SIZE, height: 16 * DECOR_TILE_SIZE });
    expect(Object.keys(DECOR)).toHaveLength(68);
    expect(piecesOutside(DECOR, DECOR_TILE_SIZE, size)).toEqual([]);
  });

  it('has the twelve month decorations and the three rewards (Issues #192, #194)', () => {
    for (const name of [
      'kadomatsu',
      'setsubun',
      'hina-dolls',
      'sakura-vase',
      'kabuto',
      'hydrangea',
      'tanabata',
      'watermelon',
      'tsukimi',
      'jack-o-lantern',
      'autumn-leaves',
      'christmas-tree',
      'onigiri',
      'dango',
      'medal',
    ]) {
      expect(DECOR).toHaveProperty([name]);
    }
  });
});
