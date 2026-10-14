import { memberIdSchema } from '@conect-guild/snapshot/settings';
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  faceColors,
  HAIR_COLORS,
  INK_DARK,
  INK_LIGHT,
  inkFor,
  relativeLuminance,
} from './faceColor';

describe('HAIR_COLORS', () => {
  it('has a #rrggbb colour for every member id and nothing else', () => {
    expect(new Set(Object.keys(HAIR_COLORS))).toEqual(new Set(memberIdSchema.options));
    expect(Object.keys(HAIR_COLORS)).toHaveLength(memberIdSchema.options.length);
    for (const color of Object.values(HAIR_COLORS)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white, in either case', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10);
  });

  it('weights green the most and blue the least (WCAG 2.x)', () => {
    expect(relativeLuminance('#ff0000')).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance('#00ff00')).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance('#0000ff')).toBeCloseTo(0.0722, 4);
  });

  it('uses the linear part below the 0.03928 knee', () => {
    // 0x0a / 255 = 0.0392 is under the knee: divided by 12.92, not raised to 2.4.
    expect(relativeLuminance('#0a0a0a')).toBeCloseTo(10 / 255 / 12.92, 10);
  });

  it.each(['fff', '#fff', '#ggg000', '#1234567', 'red', ''])('rejects %j', (bad) => {
    expect(() => relativeLuminance(bad)).toThrow('not a #rrggbb colour');
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white, 1 for a colour on itself, and order-free', () => {
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 10);
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 10);
    expect(contrastRatio(0.3, 0.3)).toBe(1);
  });
});

describe('inkFor', () => {
  it('writes white on dark fills and black on light ones', () => {
    expect(inkFor('#000000')).toBe(INK_LIGHT);
    expect(inkFor('#ffffff')).toBe(INK_DARK);
  });

  it('switches at the grey where both contrasts are about equal (luminance ≈ 0.179)', () => {
    // #757575: white 4.61 : black 4.56 → white. #777777: white 4.48 : black 4.68 → black.
    expect(inkFor('#757575')).toBe(INK_LIGHT);
    expect(inkFor('#777777')).toBe(INK_DARK);
  });

  it('rejects a fill that is not #rrggbb', () => {
    expect(() => inkFor('#abc')).toThrow('not a #rrggbb colour');
  });
});

describe('faceColors', () => {
  it('fills each face with the hair and picks the readable letter (2026-10-15 table)', () => {
    const faces = Object.fromEntries(
      memberIdSchema.options.map((id) => [id, [faceColors(id).fill, faceColors(id).ink]]),
    );
    expect(faces).toEqual({
      kaname: ['#73447a', INK_LIGHT],
      minori: ['#c3adbe', INK_DARK],
      hibiki: ['#f3899a', INK_DARK],
      hirame: ['#3e64a3', INK_LIGHT],
      sasae: ['#5c7a52', INK_LIGHT],
      takumi: ['#794f3d', INK_LIGHT],
      musubi: ['#594f56', INK_LIGHT],
      yukihiro: ['#ebeae7', INK_DARK],
    });
  });

  // The letter is bold at about 18 px at most, under WCAG's large text (14 pt bold): normal text's AA.
  it('keeps every face at the WCAG AA contrast for normal text (4.5:1) or better', () => {
    for (const id of memberIdSchema.options) {
      const { fill, ink } = faceColors(id);
      expect(contrastRatio(relativeLuminance(fill), relativeLuminance(ink))).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});
