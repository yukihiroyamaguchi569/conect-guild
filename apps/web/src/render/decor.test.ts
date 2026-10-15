import { describe, expect, it } from 'vitest';
import { DECOR, type DecorName } from '../../../../assets/decor/decor';
import { MEMBERS, type MemberId } from '../guild.config';
import { DECOR_MOTION } from './ambient';
import { ANIMATED_DECOR, STILL_DECOR } from './animatedDecor';
import { DECOR_PLACEMENTS, FLOOR_PATCH_DECOR } from './decor';
import { contains, groundAt, isInsideMap, MAP_OBJECTS, PLACES, type TileRect } from './map';
import { AMBIENT } from './metrics';

const cells = (area: TileRect) =>
  Array.from({ length: area.w * area.h }, (_, i) => ({
    col: area.col + (i % area.w),
    row: area.row + Math.floor(i / area.w),
  }));

const names = (rect: TileRect): DecorName[] =>
  DECOR_PLACEMENTS.filter((item) => cells(item).some((cell) => contains(rect, cell))).map(
    (item) => item.name,
  );

describe('decor layout', () => {
  it('sizes every thing as in the sheet and keeps it inside the map', () => {
    for (const item of DECOR_PLACEMENTS) {
      expect([item.w, item.h]).toEqual([DECOR[item.name].w, DECOR[item.name].h]);
      for (const cell of cells(item)) expect(isInsideMap(cell)).toBe(true);
    }
  });

  it('fills the room: dozens of things, all four lamp kinds and the pet', () => {
    expect(DECOR_PLACEMENTS.length).toBeGreaterThanOrEqual(40);
    const used = new Set(DECOR_PLACEMENTS.map((item) => item.name));
    for (const name of [
      'lantern',
      'sconce',
      'pillar-lamp',
      'candlestick',
      'sleeping-poodle',
    ] as const) {
      expect(used.has(name)).toBe(true);
    }
    // The pet is a toy poodle (the president is allergic to cats); the cat's picture stays unused.
    expect(used.has('sleeping-cat')).toBe(false);
    expect(DECOR_PLACEMENTS.filter((item) => item.name === 'sleeping-poodle')).toEqual([
      expect.objectContaining({ col: 18, row: 3 }),
    ]);
  });

  it.each([
    ['minori', { col: 9, row: 2, w: 6, h: 5 }, ['abacus', 'ledger-stack', 'coin-pile', 'safe']],
    [
      'hibiki',
      { col: 18, row: 1, w: 6, h: 6 },
      ['poster-cat', 'poster-stripes', 'megaphone', 'flyers', 'easel'],
    ],
    [
      'hirame',
      { col: 1, row: 10, w: 11, h: 4 },
      ['map-table', 'blueprint-rolls', 'globe', 'model'],
    ],
    [
      'sasae',
      { col: 21, row: 10, w: 11, h: 5 },
      ['file-cabinet', 'file-stack', 'key-board', 'toolbox'],
    ],
  ] as const)(
    'gives %s the department’s things in their corner',
    (id: MemberId, corner, wanted) => {
      expect(contains(corner, MEMBERS[id].seat)).toBe(true);
      const near = names(corner);
      for (const name of wanted) expect(near).toContain(name);
    },
  );
});

describe('decor layout: room to walk', () => {
  it('never puts a floor thing on a seat or the counter front', () => {
    const keep = [...Object.values(MEMBERS).map((m) => m.seat), PLACES.counterFront];
    for (const item of DECOR_PLACEMENTS.filter((i) => i.solid)) {
      for (const pos of keep) expect(contains(item, pos)).toBe(false);
    }
  });

  it('does not stack floor things on each other or on solid furniture', () => {
    const floor = DECOR_PLACEMENTS.filter((item) => {
      const ground = groundAt(item);
      return item.solid && ground !== 'wall' && ground !== 'wall-top';
    });
    const taken = new Map<string, string>();
    for (const item of floor) {
      for (const cell of cells(item)) {
        const key = `${String(cell.col)},${String(cell.row)}`;
        const onFurniture = MAP_OBJECTS.some((o) => o.solid && contains(o, cell));
        // Things on desks and the counter sit on furniture on purpose; the floor ones must not.
        if (onFurniture) continue;
        expect(taken.get(key)).toBeUndefined();
        taken.set(key, item.name);
      }
    }
  });

  it('puts desk-top things only on desks or the counter', () => {
    const deskTop: readonly DecorName[] = [
      'abacus',
      'ledger-stack',
      'coin-pile',
      'megaphone',
      'flyers',
      'globe',
      'model',
      'blueprint-rolls',
      'file-stack',
      'inkwell',
      'toolbox',
    ];
    for (const item of DECOR_PLACEMENTS.filter((i) => deskTop.includes(i.name))) {
      const under = MAP_OBJECTS.find((o) => contains(o, item));
      expect(under?.tile === 'desk' || under?.tile.startsWith('counter-')).toBe(true);
    }
  });
});

describe('decor drawing lists', () => {
  it('splits every thing into exactly one of floor patches, still things and moving things', () => {
    const total = FLOOR_PATCH_DECOR.length + STILL_DECOR.length + ANIMATED_DECOR.length;
    expect(total).toBe(DECOR_PLACEMENTS.length);
    expect(FLOOR_PATCH_DECOR.every((item) => item.name === 'light-patch' && !item.solid)).toBe(
      true,
    );
    for (const item of STILL_DECOR) expect(DECOR_MOTION[item.name]).toBeUndefined();
  });

  it('moves the lamps and the pet always, the other moving things only on a trigger', () => {
    for (const { placement, motion, trigger } of ANIMATED_DECOR) {
      expect(motion).toBe(DECOR_MOTION[placement.name]);
      const always = motion === 'flame' || motion === 'breath';
      expect(trigger === null).toBe(always);
    }
  });

  it('gives each department its own moving things, and a banner to each side of the room', () => {
    const working = (name: string) =>
      ANIMATED_DECOR.filter((item) => item.placement.name === name).map((item) => item.trigger);
    expect(working('abacus')).toEqual([{ kind: 'working', member: 'minori' }]);
    expect(working('coin-pile')).toEqual([{ kind: 'working', member: 'minori' }]);
    expect(working('megaphone')).toEqual([{ kind: 'working', member: 'hibiki' }]);
    expect(working('globe')).toEqual([{ kind: 'working', member: 'hirame' }]);
    expect(working('file-stack')).toEqual([{ kind: 'working', member: 'sasae' }]);
    expect(working('key-board')).toEqual([]);
    expect(working('hourglass')).toEqual([{ kind: 'awaiting-president' }]);
    expect(working('banner')).toEqual([
      { kind: 'cleared', members: ['kaname', 'minori', 'hibiki'] },
      { kind: 'cleared', members: ['hirame', 'sasae'] },
    ]);
  });

  it('runs the sand of the hourglass on かなめ’s counter, left of the vase (Issue #133)', () => {
    const hourglass = ANIMATED_DECOR.filter((item) => item.placement.name === 'hourglass');
    expect(
      hourglass.map(({ placement, motion }) => [placement.col, placement.row, motion]),
    ).toEqual([[17, 8, 'sand']]);
    expect(names({ col: 22, row: 11, w: 1, h: 1 })).not.toContain('hourglass');
  });

  it('draws lower still things last, so they overlap the ones behind them', () => {
    const bottoms = STILL_DECOR.map((item) => item.row + item.h);
    expect(bottoms).toEqual(bottoms.toSorted((a, b) => a - b));
  });

  it('shifts each moving thing’s phase against the others', () => {
    const phases = ANIMATED_DECOR.map((item) => item.phaseMs);
    expect(new Set(phases).size).toBe(phases.length);
    expect(phases[1]).toBe(AMBIENT.decorPhaseStepMs);
  });
});
