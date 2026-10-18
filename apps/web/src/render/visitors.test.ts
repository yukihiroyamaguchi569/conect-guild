import { PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import { describe, expect, it } from 'vitest';
import { VISITOR_KINDS } from '../domain/visitors';
import { ACTIVE_MEMBER_IDS, type MemberId } from '../guild.config';
import { SELECTED_LAYOUT } from './layouts';
import { isWalkable, LOGICAL_WIDTH, PLACES } from './map';
import { levelTags } from './levelTags';
import { meet, overheadLift, overheadSide, tagBox, WINDOWS, wordsBox } from './overhead';
import type { Segment } from './motion';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';
import {
  cutTrip,
  DOOR,
  planTrip,
  spotFor,
  tripEnd,
  VISITOR,
  VISITOR_LINES,
  visitorAt,
  type Trip,
} from './visitors';

const ALLOWED = /^[ぁ-ゖァ-ヺー〜！？…、♪]+$/u;
const SPOKEN_TO = ACTIVE_MEMBER_IDS.filter((id) => id !== PRESIDENT_ID);
const VISIT = { kind: 'postman', say: 0 } as const;

function tripTo(id: MemberId, start = 1_000): Trip {
  const trip = planTrip(VISIT, { id, seat: DEFAULT_SEATS[id] }, start);
  if (trip === null) throw new Error(`no way to ${id}`);
  return trip;
}

/** The walk in, the stay and the walk out of a planned trip. */
function partsOf(trip: Trip): { walkIn: Segment; talk: Segment; walkOut: Segment } {
  const [walkIn, talk, walkOut] = trip.segments;
  if (walkIn === undefined || talk === undefined || walkOut === undefined) {
    throw new Error('not a planned trip');
  }
  return { walkIn, talk, walkOut };
}

describe('VISITOR_LINES', () => {
  const all = VISITOR_KINDS.flatMap((kind) => [...VISITOR_LINES[kind]]);

  it.each(all)('「%s」 is kana and a few signs only, 1 to 7 characters', (line) => {
    expect(line).toMatch(ALLOWED);
    expect(Array.from(line).length).toBeLessThanOrEqual(7);
  });

  it('gives every visitor a few words of its own', () => {
    for (const kind of VISITOR_KINDS) expect(VISITOR_LINES[kind].length).toBeGreaterThanOrEqual(3);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('planTrip', () => {
  it.each(SPOKEN_TO)('walks from the door to %s, speaks, and walks back to the door', (id) => {
    const trip = tripTo(id);
    const { walkIn, talk, walkOut } = partsOf(trip);
    expect(trip.segments).toHaveLength(3);
    expect(walkIn.path[0]).toEqual(DOOR);
    expect(walkIn.start).toBe(1_000);
    expect(talk).toBe(trip.talk);
    expect(talk.path).toEqual([spotFor(id, DEFAULT_SEATS[id])]);
    expect(talk.start).toBe(walkIn.end);
    expect(talk.end - talk.start).toBe(VISITOR.talkMs);
    expect(walkOut.start).toBe(talk.end);
    expect(walkOut.path.at(-1)).toEqual(DOOR);
    expect(tripEnd(trip)).toBe(walkOut.end);
  });

  it.each(SPOKEN_TO)('keeps to the walkways and off the guests’ spots on the way to %s', (id) => {
    for (const segment of tripTo(id).segments) {
      for (const tile of segment.path) {
        expect(isWalkable(tile)).toBe(true);
        expect(SELECTED_LAYOUT.guestSpots).not.toContainEqual(tile);
      }
    }
  });

  it('speaks to かなめ in front of her counter, to a department beside the seat', () => {
    expect(spotFor('kaname', DEFAULT_SEATS.kaname)).toEqual(PLACES.counterFront);
    for (const id of SPOKEN_TO.filter((one) => one !== 'kaname')) {
      const spot = spotFor(id, DEFAULT_SEATS[id]);
      const seat = DEFAULT_SEATS[id];
      expect(Math.abs(spot.col - seat.col) + Math.abs(spot.row - seat.row)).toBe(1);
    }
  });

  it('says the words the draw picks', () => {
    const seat = DEFAULT_SEATS.kaname;
    const words = (say: number) =>
      planTrip({ kind: 'bard', say }, { id: 'kaname', seat }, 0)?.words;
    expect(words(0)).toBe(VISITOR_LINES.bard[0]);
    expect(words(0.5)).toBe(VISITOR_LINES.bard[1]);
    expect(words(0.999_999)).toBe(VISITOR_LINES.bard[2]);
  });

  it('is null when the member cannot be reached (the visitor stays out)', () => {
    expect(planTrip(VISIT, { id: 'minori', seat: { col: -5, row: -5 } }, 0)).toBeNull();
  });
});

describe('visitorAt', () => {
  const trip = tripTo('minori');
  const { walkIn, talk } = partsOf(trip);

  it('walks in at the door without words', () => {
    const view = visitorAt(trip, 1_000);
    expect(view?.feet).toEqual(tileToPoint(DOOR));
    expect([2, 3]).toContain(view?.frame);
    expect(view?.words).toBeNull();
  });

  it('faces the member sideways and speaks while it stays', () => {
    const view = visitorAt(trip, talk.start);
    const spot = talk.path[0];
    const seat = DEFAULT_SEATS.minori;
    expect(view?.feet).toEqual(tileToPoint(spot));
    expect(view?.words).toBe(trip.words);
    expect(view?.frame).toBe(spot.col === seat.col ? 0 : 1);
    expect(view?.flip).toBe(seat.col < spot.col);
  });

  it('is gone before the trip and once it is over', () => {
    expect(visitorAt(trip, 999)).toBeNull();
    expect(visitorAt(trip, tripEnd(trip))).toBeNull();
    expect(visitorAt(trip, walkIn.end - 1)?.words).toBeNull();
  });
});

describe('cutTrip', () => {
  const trip = tripTo('sasae');
  const { walkIn, talk, walkOut } = partsOf(trip);
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  it.each([0.1, 0.37, 0.5, 0.99])(
    'turns back from %s of the way in, from where the feet are',
    (share) => {
      const t = walkIn.start + share * (walkIn.end - walkIn.start);
      const cut = cutTrip(trip, t);
      const before = visitorAt(trip, t);
      const after = visitorAt(cut, t);
      if (before === null || after === null) throw new Error('nobody on the way');
      expect(near(after.feet, before.feet)).toBeLessThan(1);
      expect(cut.talk).toBeNull();
      expect(cut.segments).toHaveLength(1);
      expect(cut.segments[0]?.path.at(-1)).toEqual(DOOR);
      for (let at = t; at < tripEnd(cut); at += 100) expect(visitorAt(cut, at)?.words).toBeNull();
      expect(tripEnd(cut)).toBeLessThan(tripEnd(trip));
    },
  );

  it('stops the words and walks out from the spot when cut while it speaks', () => {
    const t = talk.start + 500;
    const cut = cutTrip(trip, t);
    expect(cut.segments[0]?.path[0]).toEqual(talk.path[0]);
    expect(cut.segments[0]?.start).toBe(t);
    expect(visitorAt(cut, t)?.words).toBeNull();
  });

  it('lets a visitor on the way out go on, and leaves a cut trip as it is', () => {
    const t = walkOut.start + 10;
    expect(cutTrip(trip, t)).toBe(trip);
    const cut = cutTrip(trip, talk.start + 1);
    expect(cutTrip(cut, talk.start + 200)).toBe(cut);
  });

  it('ends the trip at once when cut on the door tile itself', () => {
    const cut = cutTrip(trip, walkIn.start);
    expect(tripEnd(cut)).toBeLessThanOrEqual(walkIn.start);
    expect(visitorAt(cut, walkIn.start)).toBeNull();
  });
});

describe('the words over the visitor', () => {
  const levels = Object.fromEntries(ACTIVE_MEMBER_IDS.map((id) => [id, 12]));
  const tags = levelTags(levels, DEFAULT_SEATS).map(tagBox);
  const longest = VISITOR_KINDS.flatMap((kind) => [...VISITOR_LINES[kind]]).reduce(
    (a, b) => (Array.from(b).length > Array.from(a).length ? b : a),
    '',
  );

  it.each(SPOKEN_TO)('stay clear of the windows, the tags and the edges beside %s', (id) => {
    const feet = tileToPoint(spotFor(id, DEFAULT_SEATS[id]));
    const pose = { point: feet, held: null };
    const lift = overheadLift(pose, longest, levelTags(levels, DEFAULT_SEATS));
    const box = wordsBox(feet, Array.from(longest).length, lift, overheadSide(pose, longest));
    expect(WINDOWS.some((area) => meet(box, area))).toBe(false);
    expect(tags.some((tag) => meet(box, tag))).toBe(false);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(LOGICAL_WIDTH);
  });
});
