import { describe, expect, it, vi } from 'vitest';
import { DECOR } from '../../../../assets/decor/decor';
import { drawPlaceholderProp, type SpriteArt } from './art';
import {
  chooseProps,
  decorDraw,
  decorProps,
  PROP_DECOR,
  pickPropDrawing,
  propDraw,
  propPicture,
  propPlacement,
} from './decorArt';

describe('decorDraw', () => {
  it('cuts a one-cell thing from its 32 px cell', () => {
    expect(decorDraw('abacus')).toEqual({ sx: 5 * 32, sy: 6 * 32, w: 32, h: 32 });
  });

  it('cuts a larger thing at its full size', () => {
    expect(decorDraw('map-table')).toEqual({ sx: 0, sy: 4 * 32, w: 96, h: 64 });
  });
});

describe('held items', () => {
  it('uses the scroll pile, the chest and the mugs for the held items', () => {
    expect(PROP_DECOR).toEqual({ scroll: 'scroll-pile', chest: 'chest', tankard: 'mugs' });
    expect(DECOR['scroll-pile']).toBeDefined();
  });

  it('centres the picture on the given point', () => {
    expect(propPlacement('chest', { x: 100, y: 50 })).toEqual({ name: 'chest', x: 84, y: 34 });
    expect(propPlacement('scroll', { x: 0, y: 0 })).toEqual({
      name: 'scroll-pile',
      x: -16,
      y: -16,
    });
  });
});

describe('held items from props.png', () => {
  it('cuts the scroll and the chest from their 40 px cells, centred on the given point', () => {
    expect(propDraw('scroll', { x: 100, y: 50 })).toEqual({
      sx: 0,
      sy: 0,
      w: 40,
      h: 40,
      x: 80,
      y: 30,
    });
    expect(propDraw('chest', { x: 0, y: 0 })).toEqual({
      sx: 40,
      sy: 0,
      w: 40,
      h: 40,
      x: -20,
      y: -20,
    });
  });
});

describe('propPicture', () => {
  it('raises a scroll as the bundle of three from decor.png', () => {
    expect(propPicture('scroll', 'raise')).toBe('decor');
  });

  it('carries one scroll, and the chest either way, from props.png', () => {
    expect(propPicture('scroll', 'carry')).toBe('props');
    expect(propPicture('chest', 'carry')).toBe('props');
    expect(propPicture('chest', 'raise')).toBe('props');
  });
});

describe('chooseProps', () => {
  const fromDecor = decorProps({ drawDecor: vi.fn(), drawDecorScaled: vi.fn() });

  it('draws with props.png, and the raised scroll with the decor bundle', () => {
    const own: SpriteArt['drawProp'] = vi.fn();
    const decor: SpriteArt['drawProp'] = vi.fn();
    expect(pickPropDrawing(own, decor, 'scroll', 'carry')).toBe(own);
    expect(pickPropDrawing(own, decor, 'chest', 'carry')).toBe(own);
    expect(pickPropDrawing(own, decor, 'chest', 'raise')).toBe(own);
    expect(pickPropDrawing(own, decor, 'scroll', 'raise')).toBe(decor);
    // Both loaded: a drawing that picks per item, not either one as it is.
    const both = chooseProps(own, decor);
    expect([own, decor]).not.toContain(both);
  });

  it('uses props.png for everything when decor.png did not load', () => {
    const own: SpriteArt['drawProp'] = vi.fn();
    expect(chooseProps(own, null)).toBe(own);
  });

  it('falls back to the decor pictures when props.png did not load', () => {
    expect(chooseProps(null, fromDecor)).toBe(fromDecor);
  });

  it('falls back to the plain boxes when neither sheet loaded', () => {
    expect(chooseProps(null, null)).toBe(drawPlaceholderProp);
  });
});
