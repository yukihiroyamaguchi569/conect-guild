import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DECOR, DECOR_TILE_SIZE } from '../../assets/decor/decor';
import { PROPS, PROPS_TILE_SIZE } from '../../assets/props/props';

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
/** The visitors (Issue #195): front, side and the two walking frames only. */
const VISITORS = ['merchant', 'postman', 'bard', 'fortune'] as const;
const VISITOR_FRAMES = 4;

/** Width and height from a PNG's IHDR chunk (bytes 16–23, big-endian). */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * The alpha of every pixel of an 8-bit RGBA, non-interlaced PNG (what the build scripts write),
 * row by row: the IDAT data inflated and its filters undone.
 */
function pngAlpha(path: string): { width: number; alpha: (x: number, y: number) => number } {
  const bytes = readFileSync(path);
  const { width, height } = pngSize(path);
  expect([bytes[24], bytes[25], bytes[28]]).toEqual([8, 6, 0]);
  const raw = inflateSync(idatOf(bytes));
  // One filter byte (0–4) and width * 4 bytes per row, nothing missing or left over.
  expect(raw).toHaveLength((width * 4 + 1) * height);
  const filters = Array.from({ length: height }, (_, y) => raw[y * (width * 4 + 1)] ?? -1);
  expect(filters.every((filter) => filter >= 0 && filter <= 4)).toBe(true);
  const pixels = unfiltered(raw, width * 4, height);
  return { width, alpha: (x, y) => pixels[y * width * 4 + x * 4 + 3] ?? 0 };
}

/** The IDAT chunks' data, joined. */
function idatOf(bytes: Buffer): Buffer {
  const idat: Buffer[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    if (bytes.toString('latin1', at + 4, at + 8) === 'IDAT') {
      idat.push(bytes.subarray(at + 8, at + 8 + length));
    }
    at += length + 12;
  }
  return Buffer.concat(idat);
}

/** The pixel bytes of `height` rows of `stride` bytes, each led by its filter byte in `raw`. */
function unfiltered(raw: Buffer, stride: number, height: number): Uint8Array {
  const pixels = new Uint8Array(stride * height);
  const at = (y: number, i: number): number =>
    y >= 0 && i >= 0 ? (pixels[y * stride + i] ?? 0) : 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let i = 0; i < stride; i++) {
      const added = unfilter(filter, at(y, i - 4), at(y - 1, i), at(y - 1, i - 4));
      pixels[y * stride + i] = (raw[y * (stride + 1) + 1 + i] ?? 0) + added;
    }
  }
  return pixels;
}

/** What a PNG filter added to a byte, from its left, upper and upper-left neighbours. */
function unfilter(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) {
    const p = left + up - upLeft;
    const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
    if (pa <= pb && pa <= pc) return left;
    return pb <= pc ? up : upLeft;
  }
  return 0;
}

/** True when the rectangle has at least one opaque pixel. */
function drawnIn(
  sheet: ReturnType<typeof pngAlpha>,
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) if (sheet.alpha(x, y) > 0) return true;
  }
  return false;
}

const asset = (path: string): string => join(import.meta.dirname, '../../assets', path);

describe('sprite sheets', () => {
  it.each(SPRITES)('%s has all eight frames in one row', (id) => {
    expect(pngSize(asset(`sprites/${id}.png`))).toEqual({ width: FRAMES * FRAME, height: FRAME });
  });

  it.each(VISITORS)('visitor %s has the four walking frames in one row', (id) => {
    const path = asset(`sprites/visitor-${id}.png`);
    expect(pngSize(path)).toEqual({ width: VISITOR_FRAMES * FRAME, height: FRAME });
    const sheet = pngAlpha(path);
    for (let frame = 0; frame < VISITOR_FRAMES; frame++) {
      expect(drawnIn(sheet, { x: frame * FRAME, y: 0, w: FRAME, h: FRAME })).toBe(true);
    }
  });
});

/** Where a piece is in its sheet, px. */
function pieceRect(
  piece: { col: number; row: number; w: number; h: number },
  tile: number,
): { x: number; y: number; w: number; h: number } {
  return { x: piece.col * tile, y: piece.row * tile, w: piece.w * tile, h: piece.h * tile };
}

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
  const sheet = pngAlpha(asset('decor/decor.png'));

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
    ] as const) {
      expect(drawnIn(sheet, pieceRect(DECOR[name], DECOR_TILE_SIZE))).toBe(true);
    }
  });
});

describe('held items sheet (props.png)', () => {
  const size = pngSize(asset('props/props.png'));

  it('is 3 x 1 tiles of 40 px with the scroll, the chest and the tankard (Issue #193)', () => {
    expect(size).toEqual({ width: 3 * PROPS_TILE_SIZE, height: PROPS_TILE_SIZE });
    expect(Object.keys(PROPS)).toEqual(['scroll', 'chest', 'tankard']);
    expect(piecesOutside(PROPS, PROPS_TILE_SIZE, size)).toEqual([]);
    const sheet = pngAlpha(asset('props/props.png'));
    expect(drawnIn(sheet, pieceRect(PROPS.tankard, PROPS_TILE_SIZE))).toBe(true);
  });
});
