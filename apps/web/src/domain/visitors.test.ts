import { describe, expect, it } from 'vitest';
import {
  dayKey,
  dueVisit,
  seededRandom,
  VISIT_HOURS,
  VISITOR_KINDS,
  visitsOn,
  type LocalDay,
  type PlannedVisit,
} from './visitors';

const DAY: LocalDay = { year: 2026, month: 10, day: 12 };

/** Every day of 2026, to check the rules hold whatever the seed. */
const YEAR: LocalDay[] = Array.from({ length: 365 }, (_, i) => {
  const at = new Date(2026, 0, 1 + i);
  return { year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate() };
});

const always = (value: number) => () => () => value;

describe('seededRandom', () => {
  it('draws the same numbers from the same seed, in [0, 1)', () => {
    const a = seededRandom(20_261_012);
    const b = seededRandom(20_261_012);
    const drawn = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(drawn);
    expect(drawn.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(new Set(drawn).size).toBeGreaterThan(990);
  });

  it('draws other numbers from another seed', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });
});

describe('dayKey', () => {
  it('pads the month and the day', () => {
    expect(dayKey({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
    expect(dayKey(DAY)).toBe('2026-10-12');
  });
});

describe('visitsOn', () => {
  it('is the same all day long: the day is the seed', () => {
    expect(visitsOn(DAY)).toEqual(visitsOn({ ...DAY }));
    const seeds: number[] = [];
    visitsOn(DAY, (seed) => {
      seeds.push(seed);
      return seededRandom(seed);
    });
    expect(seeds).toEqual([20_261_012]);
  });

  it('differs from one day to the next', () => {
    expect(visitsOn({ ...DAY, day: 13 })).not.toEqual(visitsOn(DAY));
  });

  it('brings three or four a day, between 9 and 21 o’clock, half an hour apart, in order', () => {
    const counts = new Set<number>();
    for (const day of YEAR) {
      const visits = visitsOn(day);
      counts.add(visits.length);
      for (const [i, visit] of visits.entries()) {
        expect(visit.at).toBeGreaterThanOrEqual(VISIT_HOURS.from * 60);
        expect(visit.at).toBeLessThan(VISIT_HOURS.to * 60 - 30);
        const next = visits[i + 1];
        if (next !== undefined) expect(next.at - visit.at).toBeGreaterThanOrEqual(30);
      }
    }
    expect([...counts].toSorted((a, b) => a - b)).toEqual([3, 4]);
  });

  it('never brings the same kind twice in a row, and brings every kind over the days', () => {
    const kinds = new Set<string>();
    for (const day of YEAR) {
      const visits = visitsOn(day);
      for (const [i, visit] of visits.entries()) {
        kinds.add(visit.kind);
        expect(visit.kind).not.toBe(visits[i + 1]?.kind);
        expect(visit.pick).toBeGreaterThanOrEqual(0);
        expect(visit.pick).toBeLessThan(1);
        expect(visit.say).toBeGreaterThanOrEqual(0);
        expect(visit.say).toBeLessThan(1);
      }
    }
    expect(VISITOR_KINDS.filter((kind) => kinds.has(kind))).toEqual([...VISITOR_KINDS]);
  });

  it('names each visit by the day and its place', () => {
    expect(visitsOn(DAY).map((visit) => visit.id)).toEqual(
      visitsOn(DAY).map((_, i) => `2026-10-12#${String(i)}`),
    );
  });

  it('puts each visit at the drawn minute of its slot (lowest draws: three, at the slot starts)', () => {
    const visits = visitsOn(DAY, always(0));
    expect(visits.map((visit) => visit.at)).toEqual([540, 780, 1020]);
    expect(visits.map((visit) => visit.kind)).toEqual(['merchant', 'postman', 'merchant']);
  });

  it('puts the highest draws at the end of each slot but its last half hour (four)', () => {
    const visits = visitsOn(DAY, always(0.999_999));
    expect(visits.map((visit) => visit.at)).toEqual([689, 869, 1049, 1229]);
    expect(visits.map((visit) => visit.kind)).toEqual(['fortune', 'bard', 'fortune', 'bard']);
  });
});

describe('dueVisit', () => {
  const visits: PlannedVisit[] = [
    { id: 'a', at: 600, kind: 'merchant', pick: 0, say: 0 },
    { id: 'b', at: 800, kind: 'bard', pick: 0, say: 0 },
  ];

  it('is due from its minute until the grace is over (not including)', () => {
    expect(dueVisit(visits, 599.99, new Set(), 10)).toBeNull();
    expect(dueVisit(visits, 600, new Set(), 10)?.id).toBe('a');
    expect(dueVisit(visits, 609.99, new Set(), 10)?.id).toBe('a');
    expect(dueVisit(visits, 610, new Set(), 10)).toBeNull();
    expect(dueVisit(visits, 805, new Set(), 10)?.id).toBe('b');
  });

  it('never brings a visit that came already', () => {
    expect(dueVisit(visits, 600, new Set(['a']), 10)).toBeNull();
    expect(dueVisit(visits, 805, new Set(['a']), 10)?.id).toBe('b');
  });

  it('is null for a day without visits', () => {
    expect(dueVisit([], 600, new Set(), 10)).toBeNull();
  });
});
