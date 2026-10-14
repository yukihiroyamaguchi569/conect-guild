import type { MemberId } from '../guild.config';

/**
 * The round face icon of the party window (Issue #120) is filled with the member's hair colour.
 * One mid-tone per sprite (assets/sprites/<id>.png, the front and right-facing frames, top 30 rows):
 * the pixels of the hair's hue sorted by luminance, the middle 20 % averaged, so neither the
 * shadows nor the highlights decide it. Measured 2026-10-15. Redraw a sprite, measure again.
 */
export const HAIR_COLORS: Readonly<Record<MemberId, string>> = {
  kaname: '#73447a',
  minori: '#c3adbe',
  hibiki: '#f3899a',
  hirame: '#3e64a3',
  sasae: '#5c7a52',
  yukihiro: '#ebeae7',
};

export const INK_LIGHT = '#ffffff';
export const INK_DARK = '#000000';

export interface FaceColors {
  readonly fill: string;
  /** The letter's colour: white or black, whichever reads better on `fill`. */
  readonly ink: typeof INK_LIGHT | typeof INK_DARK;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** WCAG 2.x relative luminance of `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) throw new Error(`not a #rrggbb colour: ${hex}`);
  const channel = (start: number): number => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio of two luminances, 1 to 21. */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** White or black text on `fill`: the one with the higher WCAG contrast (white on a tie). */
export function inkFor(fill: string): FaceColors['ink'] {
  const luminance = relativeLuminance(fill);
  return contrastRatio(luminance, 1) >= contrastRatio(luminance, 0) ? INK_LIGHT : INK_DARK;
}

export function faceColors(id: MemberId): FaceColors {
  const fill = HAIR_COLORS[id];
  return { fill, ink: inkFor(fill) };
}
