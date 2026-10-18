import { describe, expect, it, vi } from 'vitest';
import {
  examineLineFor,
  pickLine,
  RARE_CHANCE,
  THINGS,
  thingsIn,
  type ExamineMoment,
} from './examine';
import { LAYOUTS } from './layouts';
import { overlaps, windowExtentsFor } from './map';
import { TILE_SIZE } from './metrics';

/** Examining the room's things (Issue #190). */

/** "kind@col,row" of each thing of the layout of `count` departments, in order. */
function placesOf(count: number): string[] {
  const layout = LAYOUTS[count];
  if (layout === undefined) throw new Error(`no layout of ${String(count)}`);
  return thingsIn(layout).map(
    (thing) =>
      `${thing.kind}@${String(thing.rect.left / TILE_SIZE)},${String(thing.rect.top / TILE_SIZE)}`,
  );
}

const SHARED = [
  'jar@14,8',
  'sacks@22,10',
  'barrel@30,11',
  'barrel@1,14',
  'crate@2,14',
  'barrel@29,14',
  'sacks@2,15',
  'barrel@2,16',
];

describe('thingsIn', () => {
  it('finds the library shelves in two departments, the safe of 経理 from three on', () => {
    expect(placesOf(2)).toEqual([
      'shelf@10,3',
      'shelf@12,3',
      ...SHARED.slice(0, 2),
      'cabinet@26,11',
      'crate@28,11',
      ...SHARED.slice(2),
    ]);
    for (const count of [3, 4]) {
      expect(placesOf(count)).toEqual([
        'safe@10,3',
        ...SHARED.slice(0, 2),
        'cabinet@26,11',
        'crate@28,11',
        ...SHARED.slice(2),
      ]);
    }
  });

  it('finds the workshop barrel and no files corner from five departments on', () => {
    for (const count of [5, 6]) {
      expect(placesOf(count)).toEqual([
        'safe@10,3',
        ...SHARED.slice(0, 2),
        'barrel@1,11',
        ...SHARED.slice(2),
      ]);
    }
  });

  it.each(Object.values(LAYOUTS))(
    'leaves out what a window covers ($departmentCount departments)',
    (layout) => {
      const windows = Object.values(windowExtentsFor(layout));
      // The map corner's bookcase of layout4 is under the quest board at its tallest.
      expect(placesOf(layout.departmentCount)).not.toContain('shelf@1,10');
      for (const thing of thingsIn(layout)) {
        expect(windows.some((area) => overlaps(thing.rect, area))).toBe(false);
      }
    },
  );

  it.each(Object.values(LAYOUTS))(
    'covers each thing where it is drawn ($departmentCount departments)',
    (layout) => {
      for (const { rect } of thingsIn(layout)) {
        expect(rect.right - rect.left).toBeGreaterThanOrEqual(TILE_SIZE);
        expect(rect.bottom - rect.top).toBeGreaterThanOrEqual(TILE_SIZE);
      }
    },
  );

  it('finds nothing in a layout with no such things', () => {
    const layout = LAYOUTS[4];
    if (layout === undefined) throw new Error('no layout4');
    expect(thingsIn({ ...layout, decor: [], objects: [] })).toEqual([]);
  });
});

describe('THINGS', () => {
  it.each(Object.entries(THINGS))('has two to four fixed lines for %s', (_kind, thing) => {
    const { name, usual, rare } = thing;
    const lines = [...usual, ...rare];
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(4);
    expect(rare.length).toBeGreaterThan(0);
    for (const line of usual) expect(line).toContain(name);
    for (const line of lines) expect(line).toMatch(/^[\u3040-\u30ff\u3000 、。！…0-9]+$/u);
  });
});

describe('pickLine', () => {
  const lines = { usual: ['u1', 'u2'], rare: ['r1', 'r2'] } as const;

  it('finds something below RARE_CHANCE, evenly among the rare lines', () => {
    expect(pickLine(lines, () => 0)).toBe('r1');
    expect(pickLine(lines, () => RARE_CHANCE / 2 - 0.0001)).toBe('r1');
    expect(pickLine(lines, () => RARE_CHANCE / 2)).toBe('r2');
    expect(pickLine(lines, () => RARE_CHANCE - 0.0001)).toBe('r2');
  });

  it('tells a usual line from RARE_CHANCE on, evenly among them', () => {
    expect(pickLine(lines, () => RARE_CHANCE)).toBe('u1');
    expect(pickLine(lines, () => 0.52)).toBe('u1');
    expect(pickLine(lines, () => 0.53)).toBe('u2');
    expect(pickLine(lines, () => 0.9999)).toBe('u2');
  });

  it('never finds anything when there are no rare lines', () => {
    const plain = { usual: ['u1', 'u2'], rare: [] } as const;
    expect(pickLine(plain, () => 0)).toBe('u1');
    expect(pickLine(plain, () => 0.49)).toBe('u1');
    expect(pickLine(plain, () => 0.5)).toBe('u2');
  });

  it('finds something about one press in twenty', () => {
    let found = 0;
    for (let i = 0; i < 1000; i++) {
      if (pickLine(lines, () => i / 1000).startsWith('r')) found++;
    }
    expect(found).toBe(50);
  });
});

describe('examineLineFor', () => {
  const free: ExamineMoment = { halted: false, known: true, messageShown: false };

  it('tells a line of the thing pressed', () => {
    expect(examineLineFor(free, 'barrel', () => 0.9)).toBe(THINGS.barrel.usual[1]);
    expect(examineLineFor(free, 'safe', () => 0)).toBe(THINGS.safe.rare[0]);
  });

  it.each([
    ['halted', { ...free, halted: true }],
    ['before the first snapshot', { ...free, known: false }],
    ["while an event's message is in the window", { ...free, messageShown: true }],
  ])('drops the press %s, drawing no number', (_when, moment) => {
    const random = vi.fn(() => 0.5);
    expect(examineLineFor(moment, 'jar', random)).toBeNull();
    expect(random).not.toHaveBeenCalled();
  });
});
