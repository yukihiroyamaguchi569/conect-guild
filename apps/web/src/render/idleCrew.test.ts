import { describe, expect, it } from 'vitest';
import type { GuildEvent } from '../domain/events';
import type { DepartmentLabel, MemberId } from '../guild.config';
import { EMPTY_DIRECTOR, frameAt, inScene, poseAt, scheduleEvent, trackEnd } from './director';
import { createIdleSeeds, cycleOutings, type Outing } from './idle';
import { createIdleCrew } from './idleCrew';
import { IDLE } from './metrics';
import { tileToPoint } from './path';
import { castOf, DEFAULT_SEATS } from './scenes';

const MIN = 60_000;
/** A fresh random source drawing a different salt for each member. */
function randomSource(): () => number {
  let n = 0;
  return () => {
    n += 1;
    return (n * 0.618_034) % 1;
  };
}
const SEEDS = createIdleSeeds(randomSource());
/** A cycle in which every department member goes out (found from the seeds). */
const CYCLE = findCycle();
const CYCLE_START = CYCLE * IDLE.playCycleMs;

function findCycle(): number {
  const ids = ['minori', 'hibiki'] as const;
  for (let cycle = 7_000_000; cycle < 7_010_000; cycle += 1) {
    const outings = cycleOutings(SEEDS, cycle);
    if (ids.every((id) => outings[id] !== undefined)) return cycle;
  }
  throw new Error('no cycle');
}

function createIssueEvent(department: DepartmentLabel | null): GuildEvent {
  return { id: 'issue-opened#1', kind: 'issue-opened', number: 1, department };
}

function outingOf(id: MemberId): Outing {
  const outing = cycleOutings(SEEDS, CYCLE)[id];
  if (outing === undefined) throw new Error(`no outing for ${id} in this cycle`);
  return outing;
}

function setup(wall: number) {
  const clock = { wall };
  const active: { ids: readonly MemberId[]; at: number }[] = [];
  const crew = createIdleCrew({
    random: randomSource(),
    wallNow: () => clock.wall,
    onActive: (ids, at) => active.push({ ids, at }),
  });
  return { clock, active, crew };
}

/** A member out at their spot in the middle of the stay. */
function playing(id: MemberId) {
  const outing = outingOf(id);
  const wall = (outing.out.end + outing.back.start) / 2;
  const env = setup(wall);
  const since = { [id]: wall - 40 * MIN };
  const director = env.crew.setSince(EMPTY_DIRECTOR, since, 1_000);
  return { ...env, outing, director, since };
}

describe('createIdleCrew', () => {
  it('poses the member out at the spot while idle', () => {
    const { crew, director, outing } = playing('minori');
    expect(director).toEqual(EMPTY_DIRECTOR);
    expect(crew.frame(director, 1_000).minori?.feet).toEqual(tileToPoint(outing.spot.tile));
  });

  it('walks a member back from the spot when work comes (no teleport)', () => {
    const { crew, director, outing } = playing('minori');
    const back = crew.setSince(director, {}, 1_000);
    const track = back.tracks.find((t) => t.actor === 'minori');
    expect(track?.segments[0]?.path[0]).toEqual(outing.spot.tile);
    expect(track?.segments[0]?.path.at(-1)).toEqual(DEFAULT_SEATS.minori);
    expect(track?.segments[0]?.start).toBe(1_000);
    expect(poseAt(back, 'minori', 1_000, DEFAULT_SEATS.minori).point).toEqual(
      tileToPoint(outing.spot.tile),
    );
    expect(back.busyUntil.minori).toBe(track && trackEnd(track));
    expect(crew.frame(back, 1_000).minori).toBeUndefined();
  });

  it('leaves members at their seat where they are', () => {
    const { crew } = setup(CYCLE_START + 1);
    const director = crew.setSince(EMPTY_DIRECTOR, { sasae: CYCLE_START - 15 * MIN }, 0);
    expect(crew.setSince(director, {}, 0)).toEqual(EMPTY_DIRECTOR);
  });

  it('leaves members whose time did not change where they are', () => {
    const { crew, director, since } = playing('minori');
    expect(crew.setSince(director, { ...since, hibiki: 5 }, 1_000)).toEqual(EMPTY_DIRECTOR);
  });
});

describe('createIdleCrew and scenes', () => {
  it('brings the cast of a scene back first; the scene waits for them', () => {
    const { crew, director, outing } = playing('hibiki');
    const event = createIssueEvent('広報');
    const back = crew.callCast(director, castOf(event), 1_000);
    const walkEnd = back.busyUntil.hibiki ?? 0;
    expect(walkEnd).toBeGreaterThan(1_000);
    const scheduled = scheduleEvent(back, event, 1_000, { seats: DEFAULT_SEATS, random: () => 0 });
    const sceneStarts = scheduled.tracks
      .filter((t) => t.actor === 'hibiki')
      .map((t) => t.segments[0]?.start);
    expect(sceneStarts).toContain(walkEnd);
    expect(poseAt(scheduled, 'hibiki', walkEnd - 1, DEFAULT_SEATS.hibiki).point).not.toEqual(
      tileToPoint(outing.spot.tile),
    );
    // Back at the seat the idle spell starts over: no dozing right after the scene.
    expect(crew.frame(scheduled, walkEnd + 60_000).hibiki).toBeUndefined();
  });

  it('reports the members in a scene and starts their idle spell over', () => {
    const { crew, clock, active } = setup(CYCLE_START);
    const since = { kaname: CYCLE_START - 20 * MIN };
    let director = crew.setSince(EMPTY_DIRECTOR, since, 0);
    expect(crew.frame(director, 0).kaname).toBeDefined();
    director = scheduleEvent(director, createIssueEvent(null), 0, {
      seats: DEFAULT_SEATS,
      random: () => 0,
    });
    expect(inScene(director, 'kaname', 10)).toBe(true);
    crew.frame(director, 10);
    expect(active).toEqual([{ ids: ['kaname'], at: CYCLE_START }]);
    clock.wall = CYCLE_START + 5 * MIN;
    expect(crew.frame(director, 1e9).kaname).toBeUndefined();
    clock.wall = CYCLE_START + 10 * MIN;
    expect(crew.frame(director, 1e9).kaname).toBeDefined();
  });

  it('shows the idle poses in the stage frame, scenes first', () => {
    const { crew, director, outing } = playing('minori');
    const ambient = { moods: {}, seeds: SEEDS_ANY, hasHoldFrames: () => false };
    const frame = frameAt(director, 1_000, DEFAULT_SEATS, {
      ...ambient,
      idle: crew.frame(director, 1_000),
    });
    const minori = frame.members.find((m) => m.id === 'minori');
    expect(minori?.depth).toBe(tileToPoint(outing.spot.tile).y);
    expect(minori?.inScene).toBe(false);
  });
});

const SEEDS_ANY = {
  kaname: { phaseMs: 0, intervalMs: 5_000 },
  minori: { phaseMs: 0, intervalMs: 5_000 },
  hibiki: { phaseMs: 0, intervalMs: 5_000 },
  hirame: { phaseMs: 0, intervalMs: 5_000 },
  sasae: { phaseMs: 0, intervalMs: 5_000 },
  takumi: { phaseMs: 0, intervalMs: 5_000 },
  musubi: { phaseMs: 0, intervalMs: 5_000 },
  yukihiro: { phaseMs: 0, intervalMs: 5_000 },
};

describe('createIdleCrew: shared salts (Issue #30)', () => {
  it('uses the salts it is given, so the narration tells the same outings', () => {
    const outing = outingOf('minori');
    const wall = (outing.out.end + outing.back.start) / 2;
    // A random source that would draw other salts: the given ones win.
    const crew = createIdleCrew({
      random: () => 0.123,
      seeds: SEEDS,
      wallNow: () => wall,
      onActive: undefined,
    });
    const director = crew.setSince(EMPTY_DIRECTOR, { minori: wall - 40 * MIN }, 1_000);
    expect(crew.frame(director, 1_000).minori?.feet).toEqual(tileToPoint(outing.spot.tile));
  });
});

describe('createIdleCrew: poses (Issue #47)', () => {
  it('gives the same poses as a frame, out at the spot while idle', () => {
    const { crew, director, outing } = playing('minori');
    expect(crew.poses().minori?.feet).toEqual(tileToPoint(outing.spot.tile));
    expect(crew.poses()).toEqual(crew.frame(director, 1_000));
  });

  it('notes nobody active, even with a scene running (no call back into the loop)', () => {
    const { crew, active } = setup(CYCLE_START);
    const scene = scheduleEvent(EMPTY_DIRECTOR, createIssueEvent('経理'), 0, {
      seats: DEFAULT_SEATS,
      random: () => 0.5,
      tossRandom: () => 0.99,
    });
    expect(inScene(scene, 'minori', 100)).toBe(true);
    crew.poses();
    expect(active).toEqual([]);
    crew.frame(scene, 100);
    expect(active).not.toEqual([]);
  });
});

describe('createIdleCrew: activities (murmurs)', () => {
  it('tells what each member in a long idle spell does now, with the wall time', () => {
    const { crew, clock, outing } = playing('minori');
    const now = crew.activities();
    expect(now.wall).toBe(clock.wall);
    expect(now.activities.minori).toEqual({ kind: 'play', outing });
    expect(now.activities.hibiki).toBeUndefined();
  });

  it('notes nobody active', () => {
    const { crew, active } = playing('minori');
    crew.activities();
    expect(active).toEqual([]);
  });
});
