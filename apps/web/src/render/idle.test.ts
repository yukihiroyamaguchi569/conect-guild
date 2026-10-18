import { describe, expect, it } from 'vitest';
import type { MemberState } from '../domain/party';
import type { MemberId, TilePos } from '../guild.config';
import {
  homeWalk,
  createIdleSeeds,
  idleActivities,
  idleHash,
  idlePose,
  idlePosesAt,
  idleStage,
  isRestful,
  plannedOuting,
  type IdleSeeds,
  type Outing,
} from './idle';
import { PLAY_SPOTS, turnsToPet } from './idleSpots';
import { isUnderWindow, isWalkable } from './map';
import { IDLE } from './metrics';
import { MS_PER_TILE, poseOnSegment } from './motion';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';

const MIN = 60_000;
const IDS: readonly MemberId[] = [
  'kaname',
  'minori',
  'hibiki',
  'hirame',
  'sasae',
  'takumi',
  'musubi',
  'yukihiro',
];
const SEEDS: IdleSeeds = {
  kaname: 11,
  minori: 222,
  hibiki: 3_333,
  hirame: 44_444,
  sasae: 555_555,
  takumi: 77_777_777,
  musubi: 888_888_888,
  yukihiro: 6_666_666,
};
/** The start of a play cycle far from zero, like a real epoch time. */
const CYCLE = 7_000_000;
const CYCLE_START = CYCLE * IDLE.playCycleMs;

/** A salt whose outing in CYCLE goes to the spot of `kind`, found by search. */
function saltFor(id: MemberId, kind: string): number {
  for (let salt = 0; salt < 100_000; salt += 1) {
    if (plannedOuting(id, salt, CYCLE)?.spot.kind === kind) return salt;
  }
  throw new Error(`no salt for ${id} ${kind}`);
}

function outingFor(id: MemberId, kind: string): Outing {
  const outing = plannedOuting(id, saltFor(id, kind), CYCLE);
  if (outing === null) throw new Error('no outing');
  return outing;
}

/** The tiles (off the seat) a member is on, every 50 ms of an outing to the spot of `kind`. */
function tilesWalked(id: MemberId, kind: string): TilePos[] {
  const outing = outingFor(id, kind);
  const tiles: TilePos[] = [];
  for (let now = outing.out.start; now < outing.back.end; now += 50) {
    const { step } = idlePose({ kind: 'play', outing }, DEFAULT_SEATS[id], 1, now);
    tiles.push(step.from, step.to);
  }
  return tiles;
}

describe('isRestful', () => {
  it('counts only idle and done as nothing to do', () => {
    const states: MemberState[] = [
      'awaiting-permission',
      'awaiting-president',
      'awaiting-kaname',
      'busy',
      'working',
      'done',
      'idle',
    ];
    expect(states.filter(isRestful)).toEqual(['done', 'idle']);
  });
});

describe('idleStage', () => {
  it('dozes from 10 minutes and sleeps from 30', () => {
    expect(idleStage(0, 0)).toBe('awake');
    expect(idleStage(0, 10 * MIN - 1)).toBe('awake');
    expect(idleStage(0, 10 * MIN)).toBe('doze');
    expect(idleStage(0, 30 * MIN - 1)).toBe('doze');
    expect(idleStage(0, 30 * MIN)).toBe('sleep');
    expect(idleStage(0, 3 * 24 * 60 * MIN)).toBe('sleep');
  });

  it('stays awake when the time is in the future', () => {
    expect(idleStage(1_000, 0)).toBe('awake');
  });
});

describe('idleHash and createIdleSeeds', () => {
  it('is in [0, 1) and the same for the same input', () => {
    for (let i = 0; i < 500; i += 1) {
      const value = idleHash(i * 7_919, CYCLE + i, i % 4);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(idleHash(i * 7_919, CYCLE + i, i % 4)).toBe(value);
    }
  });

  it('spreads its values', () => {
    const values = Array.from({ length: 1_000 }, (_, i) => idleHash(5, CYCLE + i, 0));
    const low = values.filter((v) => v < 0.5).length;
    expect(low).toBeGreaterThan(400);
    expect(low).toBeLessThan(600);
  });

  it('draws one salt per member from the injected random source', () => {
    let calls = 0;
    const seeds = createIdleSeeds(() => {
      calls += 1;
      return 0.5;
    });
    expect(calls).toBe(8);
    expect(Object.keys(seeds)).toHaveLength(IDS.length);
    expect(Object.keys(seeds)).toEqual(expect.arrayContaining([...IDS]));
    expect(seeds.minori).toBe(2 ** 30);
  });
});

describe('plannedOuting', () => {
  it('never takes the king off the throne', () => {
    for (let salt = 0; salt < 200; salt += 1) {
      expect(plannedOuting('yukihiro', salt, CYCLE)).toBeNull();
    }
  });

  it('goes out with about the chance in IDLE.playShare', () => {
    const outings = Array.from({ length: 1_000 }, (_, i) => plannedOuting('minori', 99, CYCLE + i));
    const share = outings.filter((o) => o !== null).length / outings.length;
    expect(share).toBeGreaterThan(IDLE.playShare - 0.06);
    expect(share).toBeLessThan(IDLE.playShare + 0.06);
  });

  it('leaves, stays and is back within its cycle for every member and spot', () => {
    for (const id of IDS) {
      for (let i = 0; i < 300; i += 1) {
        const outing = plannedOuting(id, SEEDS[id] + i, CYCLE + i);
        if (outing === null) continue;
        const start = (CYCLE + i) * IDLE.playCycleMs;
        expect(outing.out.start).toBeGreaterThanOrEqual(start);
        expect(outing.out.start).toBeLessThan(start + IDLE.leaveMaxMs);
        const stay = outing.back.start - outing.out.end;
        expect(stay).toBeGreaterThanOrEqual(IDLE.stayMinMs);
        expect(stay).toBeLessThan(IDLE.stayMaxMs);
        expect(outing.back.end).toBeLessThanOrEqual(start + IDLE.playCycleMs);
        expect(outing.back.path).toEqual(outing.out.path.toReversed());
      }
    }
  });

  it('can go to every spot of a member', () => {
    for (const spot of PLAY_SPOTS.hibiki) {
      expect(outingFor('hibiki', spot.kind).spot).toEqual(spot);
    }
  });
});

describe('idleActivities', () => {
  const longAgo = CYCLE_START - 60 * MIN;

  it('leaves out members with work and those idle for under 10 minutes', () => {
    const now = CYCLE_START;
    const activities = idleActivities({ minori: now - 10 * MIN + 1 }, SEEDS, now);
    expect(activities).toEqual({});
  });

  it('dozes between 10 and 30 minutes and never plays then', () => {
    for (let i = 0; i < 100; i += 1) {
      const now = CYCLE_START + i * IDLE.playCycleMs + 60_000;
      const activities = idleActivities({ hibiki: now - 20 * MIN }, SEEDS, now);
      expect(activities.hibiki).toEqual({ kind: 'doze' });
    }
  });

  it('plays only in cycles that start after the 30 minutes', () => {
    const salt = saltFor('hibiki', 'pet');
    const outing = outingFor('hibiki', 'pet');
    const during = (outing.out.end + outing.back.start) / 2;
    const seeds = { ...SEEDS, hibiki: salt };
    // 30 minutes are reached in the middle of the cycle: sleep through it.
    const late = idleActivities({ hibiki: CYCLE_START - 30 * MIN + 1 }, seeds, during);
    expect(late.hibiki).toEqual({ kind: 'sleep' });
    const onTime = idleActivities({ hibiki: CYCLE_START - 30 * MIN }, seeds, during);
    expect(onTime.hibiki).toEqual({ kind: 'play', outing });
  });

  it('sleeps before leaving and after coming back', () => {
    const outing = outingFor('sasae', 'window');
    const seeds = { ...SEEDS, sasae: saltFor('sasae', 'window') };
    const at = (now: number) => idleActivities({ sasae: longAgo }, seeds, now).sasae?.kind;
    expect(at(outing.out.start - 1)).toBe('sleep');
    expect(at(outing.out.start)).toBe('play');
    expect(at(outing.back.end - 1)).toBe('play');
    expect(at(outing.back.end)).toBe('sleep');
  });

  it('never sends two members to the same tile in one cycle (the later one sleeps)', () => {
    const seeds = { ...SEEDS, minori: saltFor('minori', 'pet'), hibiki: saltFor('hibiki', 'pet') };
    const minori = outingFor('minori', 'pet');
    const hibiki = outingFor('hibiki', 'pet');
    const now = Math.max(minori.out.end, hibiki.out.end) + 1;
    const activities = idleActivities({ minori: longAgo, hibiki: longAgo }, seeds, now);
    expect(activities.minori?.kind).toBe('play');
    expect(activities.hibiki).toEqual({ kind: 'sleep' });
  });
});

describe('idleActivities between members', () => {
  const longAgo = CYCLE_START - 60 * MIN;

  it('does not change what the others do when one member gets work', () => {
    const since = Object.fromEntries(IDS.map((id) => [id, longAgo]));
    for (const busy of IDS) {
      const rest = Object.fromEntries(IDS.filter((id) => id !== busy).map((id) => [id, longAgo]));
      for (let i = 0; i < 300; i += 1) {
        const now = CYCLE_START + i * 7_919;
        const all = idleActivities(since, SEEDS, now);
        const without = idleActivities(rest, SEEDS, now);
        for (const id of IDS.filter((other) => other !== busy)) {
          expect(without[id]).toEqual(all[id]);
        }
      }
    }
  });

  it('never has two members standing on one spot at any moment', () => {
    const since = Object.fromEntries(IDS.map((id) => [id, longAgo]));
    let seen = 0;
    for (let i = 0; i < 2_000; i += 1) {
      const now = CYCLE_START + i * 7_919;
      const activities = idleActivities(since, SEEDS, now);
      const spots = IDS.flatMap((id) => {
        const activity = activities[id];
        return activity?.kind === 'play'
          ? [`${String(activity.outing.spot.tile.col)},${String(activity.outing.spot.tile.row)}`]
          : [];
      });
      seen += spots.length;
      expect(new Set(spots).size).toBe(spots.length);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('idlePose at the seat', () => {
  const seat = DEFAULT_SEATS.minori;

  it('dozes at the seat: nods 0 to 2 px, yawns aside, a "…" now and then', () => {
    const poses = Array.from({ length: 400 }, (_, i) =>
      idlePose({ kind: 'doze' }, seat, 7, CYCLE_START + i * 150),
    );
    for (const pose of poses) {
      expect(pose.feet).toEqual(tileToPoint(seat));
      expect([0, IDLE.nodPx]).toContain(pose.offset.y);
      expect(pose.offset.x).toBe(0);
      expect([0, 1]).toContain(pose.frame); // the sleeping frame is for sleep only (Issue #179)
    }
    expect(poses.some((p) => p.offset.y === IDLE.nodPx)).toBe(true);
    expect(poses.some((p) => p.frame === 1)).toBe(true);
    expect(poses.some((p) => p.mark?.kind === 'bubble' && p.mark.glyph === '…')).toBe(true);
    expect(poses.some((p) => p.mark === null && p.frame === 0)).toBe(true);
  });

  it('sleeps in the sleeping frame, not sunk, with a "Z" rising and starting over', () => {
    const rises = Array.from({ length: 60 }, (_, i) => {
      const pose = idlePose({ kind: 'sleep' }, seat, 7, CYCLE_START + i * 100);
      expect(pose.feet).toEqual(tileToPoint(seat));
      expect(pose.offset).toEqual({ x: 0, y: 0 });
      expect(pose.frame).toBe(7);
      if (pose.mark?.kind !== 'z') throw new Error('no Z');
      expect(pose.mark.rise).toBeGreaterThanOrEqual(0);
      expect(pose.mark.rise).toBeLessThan(1);
      return pose.mark.rise;
    });
    expect(Math.max(...rises)).toBeGreaterThan(0.8);
    expect(rises.some((rise, i) => i > 0 && rise < (rises[i - 1] ?? 0))).toBe(true);
  });
});

describe('idlePose out playing', () => {
  it('walks out from the seat, stays at the spot and walks back to the seat', () => {
    const outing = outingFor('hirame', 'tea');
    const activity = { kind: 'play', outing } as const;
    const pose = (now: number) => idlePose(activity, DEFAULT_SEATS.hirame, 1, now);
    expect(pose(outing.out.start).feet).toEqual(tileToPoint(DEFAULT_SEATS.hirame));
    expect(pose(outing.out.end).feet).toEqual(tileToPoint(outing.spot.tile));
    expect(pose(outing.back.start).feet).toEqual(tileToPoint(outing.spot.tile));
    expect(pose(outing.back.end - 1).feet.y).toBeCloseTo(tileToPoint(DEFAULT_SEATS.hirame).y, -1);
    expect([2, 3]).toContain(pose(outing.out.start + 100).frame);
    expect(pose(outing.out.end).frame).not.toBe(7); // standing at the spot, not asleep
  });

  it('walks on walkable tiles only, never under a window', () => {
    const tiles = IDS.flatMap((id) => PLAY_SPOTS[id].flatMap((spot) => tilesWalked(id, spot.kind)));
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(isWalkable(tile)).toBe(true);
      expect(isUnderWindow(tile)).toBe(false);
    }
  });
});

describe('idlePose at a spot', () => {
  it('chats facing the partner, the bubbles "…" and "♪" in turn', () => {
    const outing = outingFor('minori', 'chat');
    const marks = [0, 1, 2, 3].map((step) => {
      const pose = idlePose(
        { kind: 'play', outing },
        DEFAULT_SEATS.minori,
        1,
        outing.out.end + step * IDLE.bubbleMs,
      );
      expect(pose.frame).toBe(1);
      // ひびき sits to the right of the chat tile: facing right.
      expect(pose.flip).toBe(false);
      return pose.mark;
    });
    expect(marks).toEqual([
      { kind: 'bubble', glyph: '…' },
      { kind: 'bubble', glyph: '♪' },
      { kind: 'bubble', glyph: '…' },
      { kind: 'bubble', glyph: '♪' },
    ]);
  });

  it('shows a "♪" by the pet now and then, turned toward it', () => {
    const outing = outingFor('kaname', 'pet');
    const at = (step: number) =>
      idlePose(
        { kind: 'play', outing },
        DEFAULT_SEATS.kaname,
        1,
        outing.out.end + step * IDLE.bubbleMs,
      );
    const flip = turnsToPet(outing.spot.tile);
    expect(at(0)).toMatchObject({ frame: 1, flip, mark: { kind: 'bubble', glyph: '♪' } });
    expect(at(1)).toMatchObject({ frame: 1, flip, mark: null });
  });

  it('looks around at the window', () => {
    const outing = outingFor('minori', 'window');
    const at = (n: number) =>
      idlePose({ kind: 'play', outing }, DEFAULT_SEATS.minori, 1, outing.out.end + n * IDLE.lookMs);
    expect([at(0), at(1), at(2), at(3)].map((p) => [p.frame, p.flip])).toEqual([
      [0, false],
      [1, false],
      [0, false],
      [1, true],
    ]);
  });

  it('just stands by the mugs for tea', () => {
    const outing = outingFor('hibiki', 'tea');
    const pose = idlePose({ kind: 'play', outing }, DEFAULT_SEATS.hibiki, 1, outing.out.end + 10);
    expect(pose).toMatchObject({ frame: 0, flip: false, mark: null });
  });
});

describe('idlePosesAt', () => {
  it('poses only the members in a long idle spell, the king on the throne', () => {
    const now = CYCLE_START + 5_000;
    const poses = idlePosesAt({ yukihiro: now - 40 * MIN, sasae: now - MIN }, SEEDS, now);
    expect(Object.keys(poses)).toEqual(['yukihiro']);
    expect(poses.yukihiro?.feet).toEqual(tileToPoint(DEFAULT_SEATS.yukihiro));
    expect(poses.yukihiro?.frame).toBe(7);
  });
});

describe('homeWalk', () => {
  const seat = DEFAULT_SEATS.sasae;
  const left = { col: seat.col - 1, row: seat.row };
  const twoLeft = { col: seat.col - 2, row: seat.row };
  const still = (tile: TilePos) => ({ from: tile, to: tile, progress: 0 });

  it('is null on the seat or when there is no way', () => {
    expect(homeWalk(still(seat), seat, 0)).toBeNull();
    expect(homeWalk(still({ col: -3, row: 0 }), seat, 0)).toBeNull();
  });

  it('walks back from a tile, starting now', () => {
    const walk = homeWalk(still(twoLeft), seat, 1_000);
    expect(walk?.start).toBe(1_000);
    expect(walk?.path).toEqual([twoLeft, left, seat]);
  });

  it('goes on from between two tiles without a jump, toward the seat', () => {
    const step = { from: twoLeft, to: left, progress: 0.4 };
    const walk = homeWalk(step, seat, 1_000);
    expect(walk?.path).toEqual([twoLeft, left, seat]);
    expect(walk?.start).toBeCloseTo(1_000 - 0.4 * MS_PER_TILE);
    if (walk === null) return;
    const feet = poseOnSegment(walk, 1_000).point;
    expect(feet.x).toBeCloseTo(
      tileToPoint(twoLeft).x + 0.4 * (tileToPoint(left).x - tileToPoint(twoLeft).x),
    );
  });

  it('turns round between two tiles when walking away from the seat', () => {
    const step = { from: left, to: twoLeft, progress: 0.25 };
    const walk = homeWalk(step, seat, 1_000);
    expect(walk?.path).toEqual([twoLeft, left, seat]);
    expect(walk?.start).toBeCloseTo(1_000 - 0.75 * MS_PER_TILE);
    if (walk === null) return;
    const feet = poseOnSegment(walk, 1_000).point;
    expect(feet.x).toBeCloseTo(
      tileToPoint(left).x - 0.25 * (tileToPoint(left).x - tileToPoint(twoLeft).x),
    );
  });

  it('finishes the last step when it was just leaving the seat', () => {
    const walk = homeWalk({ from: seat, to: left, progress: 0.1 }, seat, 500);
    expect(walk?.path).toEqual([left, seat]);
    expect(walk?.end).toBeCloseTo(500 + 0.1 * MS_PER_TILE);
  });

  it('matches the pose of a member out playing at any moment', () => {
    const outing = outingFor('hirame', 'pet');
    for (let now = outing.out.start; now < outing.back.end; now += 333) {
      const pose = idlePose({ kind: 'play', outing }, DEFAULT_SEATS.hirame, 1, now);
      const walk = homeWalk(pose.step, DEFAULT_SEATS.hirame, now);
      if (walk === null) {
        expect(pose.feet).toEqual(tileToPoint(DEFAULT_SEATS.hirame));
        continue;
      }
      const start = poseOnSegment(walk, now).point;
      expect(start.x).toBeCloseTo(pose.feet.x);
      expect(start.y).toBeCloseTo(pose.feet.y);
      expect(walk.path.at(-1)).toEqual(DEFAULT_SEATS.hirame);
    }
  });
});
