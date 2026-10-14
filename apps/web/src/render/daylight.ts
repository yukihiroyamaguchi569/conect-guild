import type { DecorName } from '../../../../assets/decor/decor';
import { decorPose } from './ambient';
import { ANIMATED_DECOR, type AnimatedDecor } from './animatedDecor';
import { decorPoint } from './decorPoint';
import { AMBIENT, DAYLIGHT } from './metrics';
import type { Point } from './path';

/**
 * Day and night from the local time of day: the room is shaded by a colour (multiplied over it;
 * white leaves it as it is), darkest and bluest at night, when only the lamps light their
 * surroundings. Pure: the hour is passed in (the loop reads the injected clock), and it changes
 * continuously, so the room darkens slowly with the real time.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Daylight {
  /** Multiplied over the room; white changes nothing. */
  readonly shade: Rgb;
  /** 0 by day to 1 at night: how much the lamps light up around them. */
  readonly darkness: number;
  /** 0 at night to 1 by day: the sun in the windows and on the floor. */
  readonly sun: number;
}

export type DayPhase = 'morning' | 'day' | 'evening' | 'night';

interface Keyframe extends Daylight {
  /** Hour of the day, 0 to 24. */
  readonly hour: number;
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const NIGHT: Daylight = { shade: { r: 58, g: 70, b: 130 }, darkness: 1, sun: 0 };
const DAY: Daylight = { shade: WHITE, darkness: 0, sun: 1 };

/** The light through the day, in order; between two keyframes it changes linearly. */
const KEYFRAMES: readonly Keyframe[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.5, ...NIGHT },
  { hour: 6, shade: { r: 170, g: 150, b: 190 }, darkness: 0.6, sun: 0.3 },
  { hour: 7.5, shade: { r: 240, g: 236, b: 250 }, darkness: 0.1, sun: 0.8 },
  { hour: 9, ...DAY },
  { hour: 16, ...DAY },
  { hour: 17.5, shade: { r: 255, g: 196, b: 140 }, darkness: 0.3, sun: 0.7 },
  { hour: 18.5, shade: { r: 150, g: 110, b: 140 }, darkness: 0.7, sun: 0.2 },
  { hour: 19.5, ...NIGHT },
  { hour: 24, ...NIGHT },
];
const NIGHT_START: Keyframe = { hour: 0, ...NIGHT };
const NIGHT_END: Keyframe = { hour: 24, ...NIGHT };

/** Hours since local midnight, with the minutes and seconds as a fraction. */
export function hourOf(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/** `hour` brought into [0, 24). */
function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: mix(a.r, b.r, t), g: mix(a.g, b.g, t), b: mix(a.b, b.b, t) };
}

export function daylightAt(hour: number): Daylight {
  const h = wrapHour(hour);
  // The first keyframe is at 0 and the last at 24, so `h` always falls between two of them.
  const nextIndex = KEYFRAMES.findIndex((frame) => frame.hour > h);
  const after = KEYFRAMES[nextIndex] ?? NIGHT_END;
  const before = KEYFRAMES[nextIndex - 1] ?? NIGHT_START;
  const t = (h - before.hour) / (after.hour - before.hour);
  return {
    shade: mixRgb(before.shade, after.shade, t),
    darkness: mix(before.darkness, after.darkness, t),
    sun: mix(before.sun, after.sun, t),
  };
}

/** The name of the part of the day (the report and the tests use it; the light is continuous). */
export function dayPhaseOf(hour: number): DayPhase {
  const h = wrapHour(hour);
  if (h >= 5 && h < 9) return 'morning';
  if (h >= 9 && h < 16.5) return 'day';
  if (h >= 16.5 && h < 19) return 'evening';
  return 'night';
}

/** True when the shade changes nothing (full day): the loop skips the overlay. */
export function isUnshaded(light: Daylight): boolean {
  return light.shade.r >= 255 && light.shade.g >= 255 && light.shade.b >= 255;
}

export interface LampLight extends Point {
  /** Radius of the light, logical px. */
  readonly r: number;
}

/** Where the flame is in each lamp's picture, px from its top-left (measured on decor.png). */
const FLAMES: Readonly<Partial<Record<DecorName, Point & { readonly small: boolean }>>> = {
  lantern: { x: 18, y: 21, small: false },
  'pillar-lamp': { x: 16, y: 19, small: false },
  sconce: { x: 17, y: 12, small: true },
  candlestick: { x: 15, y: 11, small: true },
};

/**
 * The light around every lamp of `items` at `now`: its radius grows a little with the flame's
 * flicker. The light is on the flame where the picture is drawn (decorPoint: its dx and dy).
 */
export function lampLights(
  now: number,
  items: readonly AnimatedDecor[] = ANIMATED_DECOR,
): LampLight[] {
  return items.flatMap(({ placement, motion, phaseMs }) => {
    const flame = FLAMES[placement.name];
    if (motion !== 'flame' || flame === undefined) return [];
    const base = flame.small ? DAYLIGHT.smallLampRadiusPx : DAYLIGHT.lampRadiusPx;
    const flicker = decorPose('flame', phaseMs, now).glow / AMBIENT.flameGlow;
    const at = decorPoint(placement);
    return [
      {
        x: at.x + flame.x,
        y: at.y + flame.y,
        r: base * (1 + DAYLIGHT.lampFlickerShare * flicker),
      },
    ];
  });
}

/**
 * For checking the look by hand (dev only): `?hour=21.5` in the page's query fixes the time of
 * day. Null when absent or not a number in [0, 24).
 */
export function hourFromQuery(search: string): number | null {
  const value = new URLSearchParams(search).get('hour');
  if (value === null || value.trim() === '') return null;
  const hour = Number(value);
  return Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : null;
}
