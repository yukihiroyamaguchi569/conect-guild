import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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

describe('sprite sheets', () => {
  it.each(SPRITES)('%s has all eight frames in one row', (id) => {
    const path = join(import.meta.dirname, `../../assets/sprites/${id}.png`);
    expect(pngSize(path)).toEqual({ width: FRAMES * FRAME, height: FRAME });
  });
});
