import { describe, expect, it } from 'vitest';
import { decorPoint } from './decorPoint';
import { LAYOUT5 } from './layouts/layout5';
import { place } from './layouts/types';

describe('decorPoint', () => {
  it('puts a picture at its cell', () => {
    expect(decorPoint(place('barrel', 3, 4))).toEqual({ x: 96, y: 128 });
  });

  it('moves the round table of five departments half a tile left and 24 px up (Issue #122)', () => {
    const table = LAYOUT5.decor.find((item) => item.name === 'round-table');
    if (table === undefined) throw new Error('no round table');
    expect(decorPoint(table)).toEqual({ x: 25 * 32 - 16, y: 12 * 32 - 24 });
  });
});
