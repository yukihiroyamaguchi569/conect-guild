/**
 * The visitors who drop in on the guild a few times a day (Issue #195, a thing for fun): a merchant,
 * a postman, a bard and an old fortune teller. Which day brings whom when is pure: the day's seed
 * gives the same visits all day, on any screen, and the random source is injected for the tests.
 * Where they walk and what they say is render/visitors.ts.
 */

export const VISITOR_KINDS = ['merchant', 'postman', 'bard', 'fortune'] as const;
export type VisitorKind = (typeof VISITOR_KINDS)[number];

/** A day of the local calendar (month 1 to 12). */
export interface LocalDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface PlannedVisit {
  /** The day and the place in it: a visit comes once. */
  readonly id: string;
  /** Minutes after the local midnight. */
  readonly at: number;
  readonly kind: VisitorKind;
  /** 0 to 1: whom of the members free then the visitor goes to (render/visitors.ts). */
  readonly pick: number;
  /** 0 to 1: which of the visitor's words they say. */
  readonly say: number;
}

/** From 9 to 21 o'clock, three or four a day, at least half an hour apart. */
export const VISIT_HOURS = { from: 9, to: 21 } as const;
const MIN_GAP_MINUTES = 30;

type Random = () => number;

/** A small seeded generator (mulberry32): the same seed always draws the same numbers. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function dayKey(day: LocalDay): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${String(day.year)}-${two(day.month)}-${two(day.day)}`;
}

/** A kind other than `last`, evenly. */
function nextKind(random: Random, last: VisitorKind | null): VisitorKind {
  const kinds = VISITOR_KINDS.filter((kind) => kind !== last);
  return kinds[Math.floor(random() * kinds.length)] ?? VISITOR_KINDS[0];
}

/**
 * The visits of `day`, in time order: the open hours cut into as many equal slots as visits, one
 * visit at a random minute of each slot (but its last half hour), so they never come together.
 * Two in a row are never the same kind.
 */
export function visitsOn(
  day: LocalDay,
  randomFor: (seed: number) => Random = seededRandom,
): PlannedVisit[] {
  const random = randomFor(day.year * 10_000 + day.month * 100 + day.day);
  const count = random() < 0.5 ? 3 : 4;
  const slot = ((VISIT_HOURS.to - VISIT_HOURS.from) * 60) / count;
  const visits: PlannedVisit[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = VISIT_HOURS.from * 60 + i * slot + Math.floor(random() * (slot - MIN_GAP_MINUTES));
    const kind = nextKind(random, visits.at(-1)?.kind ?? null);
    visits.push({ id: `${dayKey(day)}#${String(i)}`, at, kind, pick: random(), say: random() });
  }
  return visits;
}

/**
 * The visit due at `minute` of the day: its time has come, it is less than `graceMinutes` late
 * (a busy room or a page opened later lets it wait that long, no more) and it has not come yet.
 */
export function dueVisit(
  visits: readonly PlannedVisit[],
  minute: number,
  came: ReadonlySet<string>,
  graceMinutes: number,
): PlannedVisit | null {
  return (
    visits.find(
      (visit) => !came.has(visit.id) && visit.at <= minute && minute < visit.at + graceMinutes,
    ) ?? null
  );
}
