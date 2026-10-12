import { describe, expect, it } from 'vitest';
import type { GuildEvent } from '../domain/events';
import {
  castFreeAt,
  EMPTY_DIRECTOR,
  inScene,
  isAtSeat,
  poseAt,
  scheduleEvent,
  sendHome,
  type Director,
} from './director';
import type { IdlePose } from './idle';
import { PLACES } from './map';
import { SUMMONS } from './metrics';
import { MS_PER_TILE, walkSegment } from './motion';
import { findPath, tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';
import { cutVisit, planVisit, visitFor, withVisit, type Visit } from './visit';

/** かなめ walks to the side of the throne to hear the king's order (Issue #87). */

const SEAT = DEFAULT_SEATS.kaname;
/** 5 tiles from her counter to the side of the throne (map.test.ts). */
const WALK_MS = 5 * MS_PER_TILE;
const ARRIVE = SUMMONS.callMs + WALK_MS;
const LEAVE = ARRIVE + SUMMONS.murmurMs + SUMMONS.replyMs;
const BACK = LEAVE + WALK_MS;
const context = { seats: DEFAULT_SEATS, random: () => 0.5 };
const scroll: GuildEvent = {
  id: 'issue-opened#1',
  kind: 'issue-opened',
  number: 1,
  department: '経理',
};
const reception: GuildEvent = {
  id: 'issue-opened#2',
  kind: 'issue-opened',
  number: 2,
  department: null,
};

function plan(start = 0): Visit {
  const visit = planVisit(start, SEAT);
  if (visit === null) throw new Error('no visit');
  return visit;
}

const free = { director: EMPTY_DIRECTOR, idle: undefined, seat: SEAT };

/** An idle pose with her feet between `from` and `to`. */
function idleAt(from = SEAT, to = SEAT): IdlePose {
  return {
    feet: tileToPoint(from),
    step: { from, to, progress: 0 },
    frame: 0,
    flip: false,
    offset: { x: 0, y: 0 },
    mark: null,
    withPet: false,
  };
}

describe('planVisit: the walk to the throne and back', () => {
  it('sets off after the "！", stays through the whisper and the answer, and walks back', () => {
    const visit = plan(1_000);
    expect(visit.out.start).toBe(1_000 + SUMMONS.callMs);
    expect(visit.arrive).toBe(1_000 + ARRIVE);
    expect(visit.home.start).toBe(1_000 + LEAVE);
    expect(visit.back).toBe(1_000 + BACK);
    expect(visit.track.actor).toBe('kaname');
    expect(visit.track.segments.map((s) => [s.start, s.end])).toEqual([
      [1_000 + SUMMONS.callMs, 1_000 + ARRIVE],
      [1_000 + ARRIVE, 1_000 + LEAVE],
      [1_000 + LEAVE, 1_000 + BACK],
    ]);
  });

  it('takes about 6 seconds in all, as the president asked (6 to 7 s)', () => {
    expect(BACK).toBe(6_200);
  });

  it('walks the way findPath finds, from the counter to the side of the throne and back', () => {
    const visit = plan();
    expect(visit.out.path).toEqual(findPath(SEAT, PLACES.throneSide));
    expect(visit.home.path).toEqual(findPath(PLACES.throneSide, SEAT));
    expect(visit.home.path.at(-1)).toEqual(SEAT);
  });

  it('stands her at the side of the throne while the king whispers, at her seat after', () => {
    const director = withVisit(EMPTY_DIRECTOR, plan());
    expect(poseAt(director, 'kaname', SUMMONS.callMs - 1, SEAT).point).toEqual(tileToPoint(SEAT));
    expect(poseAt(director, 'kaname', ARRIVE, SEAT).point).toEqual(tileToPoint(PLACES.throneSide));
    expect(poseAt(director, 'kaname', LEAVE - 1, SEAT).point).toEqual(
      tileToPoint(PLACES.throneSide),
    );
    expect(poseAt(director, 'kaname', BACK, SEAT).point).toEqual(tileToPoint(SEAT));
    expect(isAtSeat(director, ARRIVE, { id: 'kaname', seat: SEAT, idle: undefined })).toBe(false);
    expect(inScene(director, 'kaname', BACK)).toBe(false);
  });

  it('has no visit when there is no way to the throne', () => {
    expect(planVisit(0, { col: 0, row: 0 })).toBeNull();
    expect(planVisit(0, PLACES.throneSide)).toBeNull();
  });
});

describe('visitFor: whether she goes', () => {
  it('goes when she is called and free at her counter', () => {
    expect(visitFor(['kaname'], 0, free)).toEqual(plan());
    expect(visitFor(['minori', 'kaname'], 500, free)).toEqual(plan(500));
  });

  it('does not go when only the departments are called', () => {
    expect(visitFor(['minori', 'sasae'], 0, free)).toBeNull();
  });

  it('does not go while a scene has her, or one is to come', () => {
    const busy = scheduleEvent(EMPTY_DIRECTOR, scroll, 0, context);
    expect(visitFor(['kaname'], 1_000, { ...free, director: busy })).toBeNull();
    const after = busy.busyUntil.kaname ?? 0;
    expect(visitFor(['kaname'], after, { ...free, director: busy })).toEqual(plan(after));
  });

  it('does not go under her confetti (a cleared quest of the reception)', () => {
    const cleared = scheduleEvent(
      EMPTY_DIRECTOR,
      { ...reception, id: 'issue-closed#2', kind: 'issue-closed' },
      0,
      context,
    );
    expect(visitFor(['kaname'], 100, { ...free, director: cleared })).toBeNull();
  });

  it('does not go while she is out playing or walking back from play', () => {
    const spot = { col: SEAT.col - 2, row: SEAT.row };
    expect(visitFor(['kaname'], 0, { ...free, idle: idleAt(spot, spot) })).toBeNull();
    expect(visitFor(['kaname'], 0, { ...free, idle: idleAt(SEAT, spot) })).toBeNull();
    const way = findPath(spot, SEAT);
    if (way === null) throw new Error('no way');
    const walking = sendHome(EMPTY_DIRECTOR, 'kaname', walkSegment(way, 0));
    expect(visitFor(['kaname'], 100, { ...free, director: walking })).toBeNull();
  });

  it('goes when she dozes or sleeps at her counter', () => {
    expect(visitFor(['kaname'], 0, { ...free, idle: idleAt() })).toEqual(plan());
  });
});

describe('withVisit: scenes wait for her (配役待ち)', () => {
  it('starts a scroll or a chest for her once she is back at the counter', () => {
    const director = withVisit(EMPTY_DIRECTOR, plan());
    expect(director.busyUntil.kaname).toBe(BACK);
    expect(castFreeAt(director, scroll, 1_000)).toBe(BACK);
    const scene = scheduleEvent(director, scroll, 1_000, context);
    const scrollTrack = scene.tracks.find((t) => t.actor === 'kaname' && t !== director.tracks[0]);
    expect(scrollTrack?.segments[0]?.start).toBe(BACK);
    // She never jumps: the scene starts from her seat, where the walk back ends.
    expect(poseAt(scene, 'kaname', BACK - 1, SEAT).point.y).toBeGreaterThan(
      tileToPoint(PLACES.throneSide).y,
    );
    expect(poseAt(scene, 'kaname', BACK, SEAT).point).toEqual(tileToPoint(SEAT));
  });

  it('keeps a later busy time than hers', () => {
    const director: Director = { ...EMPTY_DIRECTOR, busyUntil: { kaname: BACK + 5_000 } };
    expect(withVisit(director, plan()).busyUntil.kaname).toBe(BACK + 5_000);
  });
});

describe('cutVisit: the call is dropped (halted)', () => {
  const visit = plan();
  const director = withVisit(EMPTY_DIRECTOR, visit);
  const kanameAt = (d: Director, t: number) => poseAt(d, 'kaname', t, SEAT).point;

  it('drops a visit not started yet: she stays at her counter', () => {
    const cut = cutVisit(director, visit, SUMMONS.callMs);
    expect(cut.tracks).toEqual([]);
    expect(cut.busyUntil.kaname).toBeUndefined();
  });

  it('turns her back from where she is on her way out, without a jump', () => {
    const t = SUMMONS.callMs + 2.5 * MS_PER_TILE;
    const cut = cutVisit(director, visit, t);
    expect(kanameAt(cut, t)).toEqual(kanameAt(director, t));
    const end = cut.busyUntil.kaname ?? 0;
    expect(end).toBeLessThan(BACK);
    expect(kanameAt(cut, end)).toEqual(tileToPoint(SEAT));
  });

  it('walks her back now from the side of the throne', () => {
    const t = ARRIVE + 500;
    const cut = cutVisit(director, visit, t);
    expect(kanameAt(cut, t)).toEqual(tileToPoint(PLACES.throneSide));
    expect(cut.busyUntil.kaname).toBe(t + WALK_MS);
    expect(kanameAt(cut, t + WALK_MS)).toEqual(tileToPoint(SEAT));
  });

  it('leaves her walk back as it is', () => {
    expect(cutVisit(director, visit, LEAVE)).toBe(director);
  });

  it('keeps the scenes of others and a later scene of hers', () => {
    const later = scheduleEvent(director, scroll, 0, context);
    const cut = cutVisit(later, visit, ARRIVE);
    expect(cut.tracks.filter((t) => t.actor === 'minori')).toHaveLength(1);
    expect(cut.busyUntil.kaname).toBe(later.busyUntil.kaname);
  });

  it('changes nothing once her track is gone (the scenes were dropped while hidden)', () => {
    expect(cutVisit(EMPTY_DIRECTOR, visit, ARRIVE)).toBe(EMPTY_DIRECTOR);
  });
});
