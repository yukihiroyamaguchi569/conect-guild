import { describe, expect, it } from 'vitest';
import {
  dayPhaseOf,
  daylightAt,
  hourFromQuery,
  hourOf,
  isUnshaded,
  lampLights,
  type Daylight,
} from './daylight';
import { ANIMATED_DECOR } from './animatedDecor';
import { place } from './layouts/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import { AMBIENT, DAYLIGHT } from './metrics';

const brightness = (light: Daylight): number => light.shade.r + light.shade.g + light.shade.b;

describe('hourOf', () => {
  it('counts the local hours, minutes and seconds since midnight', () => {
    expect(hourOf(new Date(2026, 9, 12, 0, 0, 0))).toBe(0);
    expect(hourOf(new Date(2026, 9, 12, 21, 30, 0))).toBe(21.5);
    expect(hourOf(new Date(2026, 9, 12, 23, 59, 59))).toBeCloseTo(24 - 1 / 3600);
  });
});

describe('daylightAt', () => {
  it('leaves the room as it is by day, with the full sun', () => {
    for (const hour of [9, 12, 15.9, 16]) {
      const light = daylightAt(hour);
      expect(isUnshaded(light)).toBe(true);
      expect(light.darkness).toBe(0);
      expect(light.sun).toBe(1);
    }
  });

  it('shades the room dark blue at night, with no sun and the lamps at full', () => {
    for (const hour of [0, 2, 4.5, 19.5, 22, 23.99]) {
      const light = daylightAt(hour);
      expect(isUnshaded(light)).toBe(false);
      expect(light.darkness).toBe(1);
      expect(light.sun).toBe(0);
      expect(light.shade.b).toBeGreaterThan(light.shade.r);
      expect(light.shade.b).toBeGreaterThan(light.shade.g);
      expect(brightness(light)).toBeLessThan(3 * 128);
    }
  });

  it('warms the room in the evening (more red than blue), lighter than at night', () => {
    const evening = daylightAt(17.5);
    expect(evening.shade.r).toBeGreaterThan(evening.shade.b);
    expect(brightness(evening)).toBeGreaterThan(brightness(daylightAt(22)));
    expect(brightness(evening)).toBeLessThan(brightness(daylightAt(12)));
  });
});

describe('daylightAt through the day', () => {
  it('brightens through the morning and darkens through the evening, without jumps', () => {
    let previous = daylightAt(4.5);
    for (let hour = 4.5; hour <= 9; hour += 0.05) {
      const light = daylightAt(hour);
      expect(brightness(light)).toBeGreaterThanOrEqual(brightness(previous) - 1e-9);
      expect(Math.abs(brightness(light) - brightness(previous))).toBeLessThan(20);
      previous = light;
    }
    previous = daylightAt(16);
    for (let hour = 16; hour <= 19.5; hour += 0.05) {
      const light = daylightAt(hour);
      expect(light.darkness).toBeGreaterThanOrEqual(previous.darkness - 1e-9);
      expect(Math.abs(brightness(light) - brightness(previous))).toBeLessThan(25);
      previous = light;
    }
  });

  it('is the same over midnight and wraps hours outside [0, 24)', () => {
    expect(daylightAt(23.999_999)).toEqual(daylightAt(0));
    expect(daylightAt(24)).toEqual(daylightAt(0));
    expect(daylightAt(-2)).toEqual(daylightAt(22));
    expect(daylightAt(36)).toEqual(daylightAt(12));
  });

  it('keeps every value in range at any minute', () => {
    for (let hour = 0; hour < 24; hour += 1 / 60) {
      const light = daylightAt(hour);
      for (const channel of [light.shade.r, light.shade.g, light.shade.b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
      expect(light.darkness).toBeGreaterThanOrEqual(0);
      expect(light.darkness).toBeLessThanOrEqual(1);
      expect(light.sun).toBeGreaterThanOrEqual(0);
      expect(light.sun).toBeLessThanOrEqual(1);
    }
  });
});

describe('dayPhaseOf', () => {
  it('names four parts of the day', () => {
    expect(dayPhaseOf(4.99)).toBe('night');
    expect(dayPhaseOf(5)).toBe('morning');
    expect(dayPhaseOf(8.99)).toBe('morning');
    expect(dayPhaseOf(9)).toBe('day');
    expect(dayPhaseOf(16.49)).toBe('day');
    expect(dayPhaseOf(16.5)).toBe('evening');
    expect(dayPhaseOf(18.99)).toBe('evening');
    expect(dayPhaseOf(19)).toBe('night');
    expect(dayPhaseOf(0)).toBe('night');
    expect(dayPhaseOf(-12)).toBe('day');
  });
});

describe('lampLights', () => {
  const flames = ANIMATED_DECOR.filter((item) => item.motion === 'flame');

  it('moves the light with a lamp drawn off its cell (dx, dy: decorPoint, Issue #122)', () => {
    const lamp = {
      placement: place('lantern', 3, 4),
      motion: 'flame',
      phaseMs: 0,
      trigger: null,
    } as const;
    const moved = { ...lamp, placement: { ...lamp.placement, dx: -16, dy: -24 } };
    const [at] = lampLights(0, [lamp]);
    const [off] = lampLights(0, [moved]);
    expect(off?.x).toBe((at?.x ?? 0) - 16);
    expect(off?.y).toBe((at?.y ?? 0) - 24);
  });

  it('lights every lamp and candle, inside the room', () => {
    const lights = lampLights(0);
    expect(lights).toHaveLength(flames.length);
    expect(lights.length).toBeGreaterThanOrEqual(8);
    for (const light of lights) {
      expect(light.x).toBeGreaterThan(0);
      expect(light.x).toBeLessThan(LOGICAL_WIDTH);
      expect(light.y).toBeGreaterThan(0);
      expect(light.y).toBeLessThan(LOGICAL_HEIGHT);
    }
  });

  it('puts the light on the flame, inside the lamp’s picture', () => {
    lampLights(0).forEach((light, index) => {
      const placement = flames[index]?.placement;
      expect(placement).toBeDefined();
      if (placement === undefined) return;
      expect(light.x).toBeGreaterThanOrEqual(placement.col * 32);
      expect(light.x).toBeLessThan((placement.col + placement.w) * 32);
      expect(light.y).toBeGreaterThanOrEqual(placement.row * 32);
      expect(light.y).toBeLessThan((placement.row + placement.h) * 32);
    });
  });

  it('flickers the radius with the flame, never below the base or past the share', () => {
    const radii = new Set<number>();
    for (let t = 0; t < 30 * AMBIENT.flameStepMs; t += AMBIENT.flameStepMs) {
      for (const light of lampLights(t)) {
        expect(light.r).toBeGreaterThanOrEqual(DAYLIGHT.smallLampRadiusPx);
        expect(light.r).toBeLessThan(DAYLIGHT.lampRadiusPx * (1 + DAYLIGHT.lampFlickerShare));
        radii.add(light.r);
      }
    }
    expect(radii.size).toBeGreaterThan(10);
  });

  it('lights larger around lanterns and pillar lamps than around candles and sconces', () => {
    const lights = lampLights(0);
    flames.forEach((item, index) => {
      const r = lights[index]?.r ?? 0;
      const small = item.placement.name === 'sconce' || item.placement.name === 'candlestick';
      expect(r).toBeGreaterThanOrEqual(small ? DAYLIGHT.smallLampRadiusPx : DAYLIGHT.lampRadiusPx);
      if (small) {
        expect(r).toBeLessThan(DAYLIGHT.smallLampRadiusPx * (1 + DAYLIGHT.lampFlickerShare));
      }
    });
  });
});

describe('hourFromQuery', () => {
  it('reads ?hour= as a fixed hour of the day', () => {
    expect(hourFromQuery('?hour=21.5')).toBe(21.5);
    expect(hourFromQuery('?x=1&hour=0')).toBe(0);
    expect(hourFromQuery('hour=7')).toBe(7);
  });

  it('ignores a missing, empty, non-numeric or out-of-range hour', () => {
    for (const search of ['', '?', '?hour=', '?hour=%20', '?hour=noon', '?hour=24', '?hour=-1']) {
      expect(hourFromQuery(search)).toBeNull();
    }
    expect(hourFromQuery('?hour=Infinity')).toBeNull();
  });
});
