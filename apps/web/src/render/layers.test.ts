import { describe, expect, it } from 'vitest';
import { MEMBERS, type MemberId } from '../guild.config';
import { ANIMATED_DECOR, STILL_DECOR } from './animatedDecor';
import { EMPTY_DIRECTOR, frameAt } from './director';
import {
  BACK_ANIMATED_DECOR,
  BACK_OBJECTS,
  BACK_STILL_DECOR,
  drawSteps,
  FRONT_LAYERS,
  stageSteps,
  type FrontLayer,
} from './layers';
import { contains, MAP_OBJECTS, PLACES } from './map';
import { TILE_SIZE } from './metrics';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';

const byName = (a: string, b: string) => a.localeCompare(b);
const frontObjects = FRONT_LAYERS.flatMap((l) => l.objects);
const layerOf = (pos: { col: number; row: number }): FrontLayer | undefined =>
  FRONT_LAYERS.find((l) => l.objects.some((o) => contains(o, pos)));

describe('layers: what is in front of the members', () => {
  it('puts the desks and the counter in front, everything else behind', () => {
    expect(frontObjects.map((o) => o.tile).toSorted(byName)).toEqual(
      ['counter-left', 'counter-mid', 'counter-right', 'desk', 'desk', 'desk', 'desk'].toSorted(
        byName,
      ),
    );
    expect([...BACK_OBJECTS, ...frontObjects]).toHaveLength(MAP_OBJECTS.length);
    expect(BACK_OBJECTS.some((o) => frontObjects.includes(o))).toBe(false);
  });

  it('draws the throne behind the king, and its arms and seat again in front', () => {
    const throne = MAP_OBJECTS.find((o) => o.tile === 'throne');
    expect(throne).toBeDefined();
    if (throne === undefined) return;
    expect(BACK_OBJECTS).toContain(throne);
    const parts = FRONT_LAYERS.flatMap((l) => l.parts);
    expect(parts.map((p) => p.object)).toEqual([throne]);
    const x = throne.col * TILE_SIZE;
    const y = throne.row * TILE_SIZE;
    for (const clip of parts[0]?.clips ?? []) {
      expect(clip.left).toBeGreaterThanOrEqual(x);
      expect(clip.right).toBeLessThanOrEqual(x + throne.w * TILE_SIZE);
      // Only the lower half: the back of the throne stays behind the king's head.
      expect(clip.top).toBeGreaterThanOrEqual(y + (throne.h * TILE_SIZE) / 2);
      expect(clip.bottom).toBe(y + throne.h * TILE_SIZE);
    }
  });

  it('keeps the things on a desk or the counter in its layer, still or moving', () => {
    const frontStill = FRONT_LAYERS.flatMap((l) => l.still);
    const frontAnimated = FRONT_LAYERS.flatMap((l) => l.animated);
    expect([...BACK_STILL_DECOR, ...frontStill]).toHaveLength(STILL_DECOR.length);
    expect([...BACK_ANIMATED_DECOR, ...frontAnimated]).toHaveLength(ANIMATED_DECOR.length);
    for (const layer of FRONT_LAYERS) {
      for (const item of [...layer.still, ...layer.animated.map((a) => a.placement)]) {
        expect(layer.objects.some((o) => contains(o, item))).toBe(true);
      }
    }
    // The candle, the abacus and the coins on みのり's desk, the megaphone on ひびき's, the globe
    // and the lamp on ひらめ's, the papers on ささえ's and the hourglass on かなめ's counter move in
    // front of them.
    expect(frontAnimated.map((a) => a.placement.name).toSorted(byName)).toEqual(
      [
        'abacus',
        'candlestick',
        'coin-pile',
        'file-stack',
        'globe',
        'hourglass',
        'lantern',
        'megaphone',
      ].toSorted(byName),
    );
    expect(frontStill.map((i) => i.name)).toEqual(expect.arrayContaining(['jar', 'flower-vase']));
  });

  it('orders the layers back to front by the bottom of their furniture', () => {
    const depths = FRONT_LAYERS.map((l) => l.depth);
    expect(depths).toEqual([...new Set(depths)].toSorted((a, b) => a - b));
    for (const layer of FRONT_LAYERS) {
      for (const o of layer.objects) expect((o.row + o.h) * TILE_SIZE).toBe(layer.depth);
    }
  });
});

describe('layers: drawing order with the members', () => {
  const steps = drawSteps(frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS).members, FRONT_LAYERS);
  const indexOfMember = (id: MemberId) =>
    steps.findIndex((s) => s.kind === 'member' && s.member.id === id);
  const indexOfLayer = (layer: FrontLayer | undefined) =>
    steps.findIndex((s) => s.kind === 'layer' && s.layer === layer);

  it.each(['minori', 'hibiki', 'hirame', 'sasae'] as const)(
    'draws the desk after %s, so it hides the lower body',
    (id) => {
      const seat = MEMBERS[id].seat;
      const desk = layerOf({ col: seat.col, row: seat.row + 1 });
      expect(desk).toBeDefined();
      expect(indexOfLayer(desk)).toBeGreaterThan(indexOfMember(id));
    },
  );

  it('draws the counter after かなめ and the throne’s arms after the king', () => {
    const counter = layerOf({ col: 16, row: 8 });
    expect(indexOfLayer(counter)).toBeGreaterThan(indexOfMember('kaname'));
    const throne = FRONT_LAYERS.find((l) => l.parts.length > 0);
    expect(indexOfLayer(throne)).toBeGreaterThan(indexOfMember('yukihiro'));
  });

  it('draws a visitor at the counter front over the counter', () => {
    const visitor = { id: 'visitor', depth: tileToPoint(PLACES.counterFront).y };
    const order = drawSteps([visitor], FRONT_LAYERS);
    const counter = layerOf({ col: 16, row: 8 });
    const at = (s: (typeof order)[number]) => (s.kind === 'layer' ? s.layer : s.member);
    expect(order.map(at).indexOf(visitor)).toBeGreaterThan(
      order.map(at).indexOf(counter ?? visitor),
    );
  });

  it('includes every member and layer exactly once', () => {
    expect(steps.filter((s) => s.kind === 'member')).toHaveLength(6);
    expect(steps.filter((s) => s.kind === 'layer')).toHaveLength(FRONT_LAYERS.length);
  });
});

describe('drawSteps', () => {
  const layer = (depth: number) => ({ depth, name: `L${String(depth)}` });
  const member = (depth: number) => ({ depth, name: `m${String(depth)}` });
  const names = (
    steps: ReturnType<
      typeof drawSteps<{ depth: number; name: string }, { depth: number; name: string }>
    >,
  ) => steps.map((s) => (s.kind === 'layer' ? s.layer.name : s.member.name));

  it('puts a layer before members at or below its depth, after those above it', () => {
    const steps = drawSteps([member(100), member(200), member(300)], [layer(200), layer(250)]);
    expect(names(steps)).toEqual(['m100', 'L200', 'm200', 'L250', 'm300']);
  });

  it('draws the layers left over after the last member, and all of them with nobody', () => {
    expect(names(drawSteps([member(10)], [layer(20), layer(30)]))).toEqual(['m10', 'L20', 'L30']);
    expect(names(drawSteps([], [layer(20), layer(30)]))).toEqual(['L20', 'L30']);
    expect(names(drawSteps([], []))).toEqual([]);
  });

  it('orders members and layers given out of order, keeping ties as given', () => {
    const steps = drawSteps(
      [member(300), member(100), { depth: 100, name: 'n100' }],
      [layer(250), layer(50)],
    );
    expect(names(steps)).toEqual(['L50', 'm100', 'n100', 'L250', 'm300']);
  });
});

describe('stageSteps', () => {
  it('draws what everyone holds after all the furniture, back to front', () => {
    const steps = stageSteps(frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS).members, FRONT_LAYERS);
    const lastLayer = steps.map((s) => s.kind).lastIndexOf('layer');
    const held = steps.flatMap((s, i) => (s.kind === 'held' ? [i] : []));
    expect(held).toHaveLength(6);
    expect(Math.min(...held)).toBeGreaterThan(lastLayer);
    const heldDepths = steps.flatMap((s) => (s.kind === 'held' ? [s.member.depth] : []));
    expect(heldDepths).toEqual(heldDepths.toSorted((a, b) => a - b));
  });
});
