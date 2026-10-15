import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { DepartmentLabel, MemberId, TilePos } from '../guild.config';
import { heldLook } from './hands';
import { contains, isUnderWindow, isWalkable, MAP_OBJECTS, PLACES } from './map';
import { TILE_SIZE } from './metrics';
import { carry, poseOnSegment, raise, type Prop, type Segment } from './motion';
import { pointToTile, type Point } from './path';
import { seatedPoint } from './seating';
import {
  actorOf,
  castOf,
  DEFAULT_SEATS,
  HANDOVER_MS,
  HOLD_UP_MS,
  PICK_UP_MS,
  planScene,
  RECEIVE_MS,
  RECEPTION_MS,
  type Scene,
  type Track,
} from './scenes';

const context = { seats: DEFAULT_SEATS, random: () => 0.5 };

const DEPARTMENTS: readonly (readonly [DepartmentLabel, MemberId])[] = [
  ['経理', 'minori'],
  ['広報', 'hibiki'],
  ['企画', 'hirame'],
  ['総務', 'sasae'],
];

function event(kind: GuildEventKind, department: DepartmentLabel | null, number = 1): GuildEvent {
  return { id: `${kind}#${String(number)}`, kind, number, department };
}

function trackOf(scene: Scene, actor: string): Track {
  const track = scene.tracks.find((t) => t.actor === actor);
  if (track === undefined) throw new Error(`no track for ${actor}`);
  return track;
}

const firstTile = (s: Segment) => s.path[0];
const lastTile = (s: Segment) => s.path.at(-1);
const endOf = (track: Track) => track.segments.at(-1)?.end ?? Number.NaN;

function expectBackToBack(track: Track, start: number): void {
  let cursor = start;
  let at: TilePos | undefined;
  for (const segment of track.segments) {
    expect(segment.start).toBe(cursor);
    expect(segment.end).toBeGreaterThanOrEqual(segment.start);
    // Each segment starts on the tile where the previous one ended: nobody jumps.
    if (at !== undefined) expect(firstTile(segment)).toEqual(at);
    cursor = segment.end;
    at = lastTile(segment);
  }
}

/** The segment running at `t` (the last one when `t` is its end). */
function segmentAt(track: Track, t: number): Segment {
  const segment =
    track.segments.find((s) => s.start <= t && t < s.end) ??
    track.segments.find((s) => s.end === t);
  if (segment === undefined) throw new Error(`no segment at ${String(t)}`);
  return segment;
}

const tileAt = (track: Track, t: number) =>
  pointToTile(poseOnSegment(segmentAt(track, t), t).point);
const propAt = (track: Track, t: number) => segmentAt(track, t).held?.prop ?? null;
const holdAt = (track: Track, t: number) => segmentAt(track, t).held?.hold ?? null;

/** When the item changes hands: the first time the receiver holds it. */
function handoverTime(receiver: Track, prop: Prop): number {
  const segment = receiver.segments.find((s) => s.held?.prop === prop);
  if (segment === undefined) throw new Error('the item never changes hands');
  return segment.start;
}

/** Where the held item is drawn at `t` (seated like the director draws it), with or without holding frames. */
function itemAt(track: Track, t: number, withHoldFrames: boolean): Point {
  const pose = poseOnSegment(segmentAt(track, t), t);
  if (pose.held === null) throw new Error(`${track.actor} holds nothing at ${String(t)}`);
  const seated = { ...pose, point: seatedPoint(pose.point) };
  return heldLook(track.actor, seated, pose.held, withHoldFrames).item;
}

/** How far the item may move at the moment it changes hands: across the counter, not over heads. */
const HANDOVER_GAP_PX = 2.5 * TILE_SIZE;

describe.each([
  ['issue-opened', 'scroll', 'kaname', 'member'],
  ['pr-merged', 'chest', 'member', 'kaname'],
] as const)('planScene: %s handover moment', (kind, prop, giverRole, receiverRole) => {
  it.each(DEPARTMENTS)('keeps the %s item where it was, then raises it', (department, id) => {
    const scene = planScene(event(kind, department), 0, context);
    const giver = trackOf(scene, giverRole === 'kaname' ? 'kaname' : id);
    const receiver = trackOf(scene, receiverRole === 'kaname' ? 'kaname' : id);
    const handover = handoverTime(receiver, prop);
    // Taken in the arms first, the way it was brought ...
    expect(segmentAt(receiver, handover).held).toEqual(carry(prop));
    for (const withHoldFrames of [true, false]) {
      const from = itemAt(giver, handover - 1, withHoldFrames);
      const to = itemAt(receiver, handover, withHoldFrames);
      expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeLessThanOrEqual(HANDOVER_GAP_PX);
    }
    // ... and raised over the head a little later, at the same place.
    const raising = handover + RECEIVE_MS;
    expect(segmentAt(receiver, raising).held).toEqual(raise(prop));
    expect(segmentAt(receiver, raising).end - raising).toBe(HOLD_UP_MS);
    expect(tileAt(receiver, raising)).toEqual(tileAt(receiver, handover));
  });
});

const isNextTo = (a: TilePos, b: TilePos) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;

const door = MAP_OBJECTS.find((o) => o.tile === 'door');

describe('actorOf / castOf', () => {
  it('maps departments to their members and no department to かなめ', () => {
    expect(actorOf(event('issue-opened', '経理'))).toBe('minori');
    expect(actorOf(event('issue-opened', '総務'))).toBe('sasae');
    expect(actorOf(event('issue-opened', null))).toBe('kaname');
  });

  it('casts the member and かなめ for every handover', () => {
    expect(castOf(event('issue-opened', '広報'))).toEqual(['hibiki', 'kaname']);
    expect(castOf(event('pr-merged', '企画'))).toEqual(['hirame', 'kaname']);
    expect(castOf(event('issue-opened', null))).toEqual(['kaname']);
    expect(castOf(event('pr-merged', null))).toEqual(['kaname']);
  });

  it('casts nobody for confetti (nobody has to move)', () => {
    expect(castOf(event('issue-closed', '経理'))).toEqual([]);
  });
});

describe.each(['issue-opened', 'pr-merged'] as const)('planScene: %s, every department', (kind) => {
  it.each(DEPARTMENTS)('runs both tracks of %s back to back, seat to seat', (department, id) => {
    const scene = planScene(event(kind, department), 1_000, context);
    expect(new Set(scene.tracks.map((t) => t.actor))).toEqual(new Set([id, 'kaname']));
    expect(scene.tracks).toHaveLength(2);
    for (const track of scene.tracks) {
      expectBackToBack(track, 1_000);
      expect(tileAt(track, 1_000)).toEqual(DEFAULT_SEATS[track.actor]);
      expect(tileAt(track, endOf(track))).toEqual(DEFAULT_SEATS[track.actor]);
    }
    expect(scene.bursts).toEqual([]);
  });

  it.each(DEPARTMENTS)('walks %s’s scene only on walkable tiles clear of windows', (department) => {
    const scene = planScene(event(kind, department), 0, context);
    const tiles = scene.tracks.flatMap((t) => t.segments.flatMap((s) => [...s.path]));
    for (const tile of tiles) {
      expect(isWalkable(tile)).toBe(true);
      expect(isUnderWindow(tile)).toBe(false);
    }
  });

  it.each(DEPARTMENTS)('never goes near the door in %s’s scene', (department) => {
    expect(door).toBeDefined();
    if (door === undefined) return;
    const scene = planScene(event(kind, department), 0, context);
    const tiles = scene.tracks.flatMap((t) => t.segments.flatMap((s) => [...s.path]));
    expect(tiles.filter((tile) => contains(door, tile))).toEqual([]);
  });

  it.each(DEPARTMENTS)('takes 10 to 14 s in all for %s', (department) => {
    const scene = planScene(event(kind, department), 0, context);
    const length = Math.max(...scene.tracks.map(endOf));
    expect(length).toBeGreaterThanOrEqual(10_000);
    expect(length).toBeLessThanOrEqual(14_000);
  });
});

describe('planScene: issue-opened (かなめ brings the scroll to the seat)', () => {
  it.each(DEPARTMENTS)('hands the scroll to %s side by side at the seat', (department, id) => {
    const scene = planScene(event('issue-opened', department), 0, context);
    const kaname = trackOf(scene, 'kaname');
    const member = trackOf(scene, id);
    const handover = handoverTime(member, 'scroll');
    expect(tileAt(member, handover)).toEqual(DEFAULT_SEATS[id]);
    // Beside the member in the same row, so neither hides the other.
    expect(isNextTo(tileAt(kaname, handover), DEFAULT_SEATS[id])).toBe(true);
    expect(tileAt(kaname, handover).row).toBe(DEFAULT_SEATS[id].row);
    // Side by side for the whole stop, not only at the moment of the handover.
    expect(tileAt(kaname, handover - HANDOVER_MS / 2)).toEqual(tileAt(kaname, handover));
    expect(tileAt(kaname, handover + HANDOVER_MS / 2 - 1)).toEqual(tileAt(kaname, handover));
    expect([propAt(kaname, handover - 1), propAt(member, handover - 1)]).toEqual(['scroll', null]);
    expect([propAt(kaname, handover), propAt(member, handover)]).toEqual([null, 'scroll']);
    // かなめ carries it in her arms; the member takes it in theirs (raised later).
    expect([holdAt(kaname, handover - 1), holdAt(member, handover)]).toEqual(['carry', 'carry']);
  });

  it('has かなめ take up the scroll at the counter first, the member wait at the seat', () => {
    const scene = planScene(event('issue-opened', '企画'), 0, context);
    const [pickUp, toSeat] = trackOf(scene, 'kaname').segments;
    expect([pickUp?.held, pickUp?.end, pickUp?.path]).toEqual([
      carry('scroll'),
      PICK_UP_MS,
      [DEFAULT_SEATS.kaname],
    ]);
    expect(toSeat?.held).toEqual(carry('scroll'));
    const [waiting, receiving, holding] = trackOf(scene, 'hirame').segments;
    expect([waiting?.held, waiting?.path]).toEqual([null, [DEFAULT_SEATS.hirame]]);
    // Taken in the arms, then raised (how long each lasts: the handover moment tests).
    expect([receiving?.held, holding?.held]).toEqual([carry('scroll'), raise('scroll')]);
  });

  it('walks かなめ back empty-handed', () => {
    const scene = planScene(event('issue-opened', '総務'), 0, context);
    const back = trackOf(scene, 'kaname').segments.at(-1);
    expect([back?.held, back && lastTile(back)]).toEqual([null, DEFAULT_SEATS.kaname]);
    expect(back?.path.length).toBeGreaterThan(2);
  });

  it('only has かなめ take the scroll at the reception when there is no department', () => {
    const reception = planScene(event('issue-opened', null), 500, context);
    expect(reception.tracks).toHaveLength(1);
    expect(trackOf(reception, 'kaname').segments).toEqual([
      {
        start: 500,
        end: 500 + RECEPTION_MS,
        path: [DEFAULT_SEATS.kaname],
        held: raise('scroll'),
      },
    ]);
  });
});

describe('planScene: pr-merged (the member brings the chest to the reception)', () => {
  it.each(DEPARTMENTS)('has %s hand the chest across the counter', (department, id) => {
    const scene = planScene(event('pr-merged', department), 0, context);
    const kaname = trackOf(scene, 'kaname');
    const member = trackOf(scene, id);
    const handover = handoverTime(kaname, 'chest');
    expect(tileAt(member, handover)).toEqual(PLACES.counterFront);
    expect(tileAt(kaname, handover)).toEqual(DEFAULT_SEATS.kaname);
    expect([propAt(member, handover - 1), propAt(kaname, handover - 1)]).toEqual(['chest', null]);
    expect([propAt(member, handover), propAt(kaname, handover)]).toEqual([null, 'chest']);
    expect(segmentAt(kaname, handover).end - handover).toBe(RECEIVE_MS);
    expect([holdAt(member, handover - 1), holdAt(kaname, handover)]).toEqual(['carry', 'carry']);
    expect(holdAt(kaname, handover + RECEIVE_MS)).toBe('raise');
  });

  it('meets across the counter: same column, only counter between them', () => {
    const { counterFront } = PLACES;
    const seat = DEFAULT_SEATS.kaname;
    expect(counterFront.col).toBe(seat.col);
    for (let row = seat.row + 1; row < counterFront.row; row += 1) {
      const counter = MAP_OBJECTS.find((o) => contains(o, { col: seat.col, row }));
      expect(counter?.tile.startsWith('counter-')).toBe(true);
    }
  });

  it('has the member take up the chest at the seat first and walk back empty-handed', () => {
    const segments = trackOf(planScene(event('pr-merged', '経理'), 0, context), 'minori').segments;
    expect([segments[0]?.held, segments[0]?.end]).toEqual([carry('chest'), PICK_UP_MS]);
    // Carried all the way to the counter, never raised by the one who brings it.
    for (const segment of segments) expect(segment.held?.hold ?? 'carry').toBe('carry');
    const back = segments.at(-1);
    expect([back?.held, back && lastTile(back)]).toEqual([null, DEFAULT_SEATS.minori]);
  });

  it('only has かなめ take the chest when there is no department', () => {
    const reception = planScene(event('pr-merged', null), 0, context);
    expect(reception.tracks).toHaveLength(1);
    expect(trackOf(reception, 'kaname').segments).toEqual([
      { start: 0, end: RECEPTION_MS, path: [DEFAULT_SEATS.kaname], held: raise('chest') },
    ]);
  });
});

describe('planScene: issue-closed', () => {
  it('bursts confetti over the member without moving anyone', () => {
    const scene = planScene(event('issue-closed', '広報'), 42, context);
    expect(scene.tracks).toEqual([]);
    expect(scene.bursts).toHaveLength(1);
    expect(scene.bursts[0]).toMatchObject({ actor: 'hibiki', start: 42 });
    expect(scene.bursts[0]?.particles.length).toBeGreaterThan(0);
  });

  it('bursts over かなめ when there is no department', () => {
    const scene = planScene(event('issue-closed', null), 0, context);
    expect(scene.bursts[0]?.actor).toBe('kaname');
  });

  it('uses the injected random numbers', () => {
    const a = planScene(event('issue-closed', null), 0, { ...context, random: () => 0.1 });
    const b = planScene(event('issue-closed', null), 0, { ...context, random: () => 0.9 });
    expect(a.bursts[0]?.particles).not.toEqual(b.bursts[0]?.particles);
  });
});

describe('planScene: unreachable places', () => {
  // A seat boxed in by walls: no way to the counter or to かなめ.
  const seats = { ...DEFAULT_SEATS, minori: { col: 0, row: 5 } };

  it.each([
    ['issue-opened', 'scroll'],
    ['pr-merged', 'chest'],
  ] as const)('falls back to かなめ alone at the reception in %s (nobody jumps)', (kind, prop) => {
    const scene = planScene(event(kind, '経理'), 0, { ...context, seats });
    expect(scene.tracks).toEqual([
      {
        actor: 'kaname',
        segments: [
          { start: 0, end: RECEPTION_MS, path: [DEFAULT_SEATS.kaname], held: raise(prop) },
        ],
      },
    ]);
  });

  it('falls back too when かなめ cannot leave the counter with the scroll', () => {
    const boxed = { ...DEFAULT_SEATS, kaname: { col: 0, row: 5 } };
    const scene = planScene(event('issue-opened', '広報'), 0, { ...context, seats: boxed });
    expect(scene.tracks.map((t) => [t.actor, t.segments.length])).toEqual([['kaname', 1]]);
  });
});
