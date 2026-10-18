import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import type { AmbientMoods } from './ambient';
import { EMPTY_DIRECTOR, isAnimating, poseAt, sendHome, trackEnd } from './director';
import type { IdlePose } from './idle';
import { SHARED_LINES } from './lineBook';
import { linesAt } from './lines';
import { isWalkable, PLACES } from './map';
import { walkSegment } from './motion';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';
import {
  planToast,
  releaseFromToast,
  TOAST,
  TOAST_SPOTS,
  toasters,
  withToast,
  type Toast,
} from './toast';

const FREE: AmbientMoods = {
  kaname: 'fan',
  minori: 'idle',
  hibiki: 'idle',
  hirame: 'idle',
  sasae: 'idle',
  yukihiro: 'idle',
};
const STAGE = { moods: FREE, idle: {}, seats: DEFAULT_SEATS };
const AT = { t: 0, seats: DEFAULT_SEATS };

function planned(ids: readonly MemberId[], start = 0): Toast {
  const toast = planToast(ids, start, DEFAULT_SEATS);
  if (toast === null) throw new Error('no toast');
  return toast;
}

/** When everyone is at the spots: the start of the raise. */
function gathered(toast: Toast): number {
  return toast.lines[0]?.start ?? Number.NaN;
}

function idleAt(id: MemberId, away: boolean): IdlePose {
  const seat = DEFAULT_SEATS[id];
  const tile = away ? { col: seat.col, row: seat.row + 3 } : seat;
  return {
    feet: tileToPoint(tile),
    step: { from: tile, to: tile, progress: 0 },
    frame: 0,
    flip: false,
    offset: { x: 0, y: 0 },
    mark: null,
    withPet: false,
  };
}

describe('TOAST_SPOTS', () => {
  it('stand on the red rug in front of the counter, the middle first, one for every member', () => {
    expect(TOAST_SPOTS.length).toBeGreaterThanOrEqual(6);
    expect(TOAST_SPOTS[0]).toEqual({ col: PLACES.counterFront.col, row: 11 });
    for (const spot of TOAST_SPOTS) expect(isWalkable(spot)).toBe(true);
  });
});

describe('toasters', () => {
  it('takes those with nothing to do in the members’ order, never the king', () => {
    expect(toasters(EMPTY_DIRECTOR, 0, STAGE)).toEqual([
      'kaname',
      'minori',
      'hibiki',
      'hirame',
      'sasae',
    ]);
  });

  it('leaves out those at work or with no state', () => {
    const moods: AmbientMoods = { kaname: 'tidy-scroll', minori: 'desk-work', hibiki: 'idle' };
    expect(toasters(EMPTY_DIRECTOR, 0, { ...STAGE, moods })).toEqual(['hibiki']);
  });

  it('leaves out those in a scene or with one to come', () => {
    const seat = DEFAULT_SEATS.kaname;
    const walk = walkSegment([seat, { col: seat.col + 1, row: seat.row }, seat], 1_000);
    const director = sendHome(EMPTY_DIRECTOR, 'kaname', walk);
    expect(toasters(director, 0, STAGE)).not.toContain('kaname');
    expect(toasters(director, 1_100, STAGE)).not.toContain('kaname');
    expect(toasters(director, walk.end, STAGE)).toContain('kaname');
  });

  it('takes those dozing at the seat, not those out playing', () => {
    const idle = { minori: idleAt('minori', false), hibiki: idleAt('hibiki', true) };
    const ids = toasters(EMPTY_DIRECTOR, 0, { ...STAGE, idle });
    expect(ids).toContain('minori');
    expect(ids).not.toContain('hibiki');
  });
});

describe('planToast', () => {
  it('is nothing with fewer than two', () => {
    expect(planToast([], 0, DEFAULT_SEATS)).toBeNull();
    expect(planToast(['minori'], 0, DEFAULT_SEATS)).toBeNull();
  });

  it('walks each to a spot with a tankard, raises it together, stays a minute and walks back', () => {
    const toast = planned(['kaname', 'minori', 'sasae'], 1_000);
    const all = gathered(toast);
    for (const [i, track] of toast.tracks.entries()) {
      const [first] = track.segments;
      const last = track.segments.at(-1);
      const up = track.segments.find((segment) => segment.held?.hold === 'raise');
      if (first === undefined || last === undefined || up === undefined)
        throw new Error('no toast');
      expect(first.start).toBe(1_000);
      expect(first.path[0]).toEqual(DEFAULT_SEATS[track.actor]);
      expect(first.held).toEqual({ prop: 'tankard', hold: 'carry' });
      expect(up.start).toBe(all);
      expect(up.path).toEqual([TOAST_SPOTS[i]]);
      expect(up.end - up.start).toBe(TOAST.raiseMs);
      expect(last.start).toBe(all + TOAST.stayMs);
      expect(last.path.at(-1)).toEqual(DEFAULT_SEATS[track.actor]);
      // Nobody stands still for nothing: the last to arrive raises at once.
      expect(track.segments.every((segment) => segment.end > segment.start)).toBe(true);
    }
    expect(Math.max(...toast.tracks.map((track) => track.segments[0]?.end ?? 0))).toBe(all);
  });

  it('has the first say 「かんぱーい！」 when all are there, and nobody else', () => {
    const toast = planned(['minori', 'hibiki', 'hirame']);
    expect(toast.lines).toHaveLength(1);
    expect(toast.lines[0]).toMatchObject({ actor: 'minori', line: SHARED_LINES.toast[0] });
    expect(SHARED_LINES.toast).toEqual(['かんぱーい！']);
  });
});

describe('withToast and releaseFromToast', () => {
  const toast = planned(['minori', 'hibiki', 'hirame']);
  const director = withToast(EMPTY_DIRECTOR, toast);
  const all = gathered(toast);

  it('keeps those in it busy until they are back', () => {
    for (const track of toast.tracks) expect(director.busyUntil[track.actor]).toBe(trackEnd(track));
    expect(isAnimating(director, all + 10_000)).toBe(true);
    expect(linesAt(director.lines, all)).toEqual({ minori: 'かんぱーい！' });
  });

  it('sends one back from where they are, without a jump, and drops their words', () => {
    const t = all + 500;
    const released = releaseFromToast(director, toast, ['minori'], { ...AT, t });
    const before = poseAt(director, 'minori', t, DEFAULT_SEATS.minori).point;
    const after = poseAt(released, 'minori', t, DEFAULT_SEATS.minori).point;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1);
    expect(linesAt(released.lines, t)).toEqual({});
    expect(released.busyUntil.minori).toBeLessThan(director.busyUntil.minori ?? 0);
    const home = released.busyUntil.minori ?? 0;
    expect(poseAt(released, 'minori', home, DEFAULT_SEATS.minori).point).toEqual(
      tileToPoint(DEFAULT_SEATS.minori),
    );
    // The others go on.
    expect(released.busyUntil.hibiki).toBe(director.busyUntil.hibiki);
  });

  it('sends one back mid-walk from where the feet are', () => {
    const t = 300;
    const released = releaseFromToast(director, toast, ['hirame'], { ...AT, t });
    const before = poseAt(director, 'hirame', t, DEFAULT_SEATS.hirame).point;
    const after = poseAt(released, 'hirame', t, DEFAULT_SEATS.hirame).point;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1);
  });

  it('lets one already walking back go on, and changes nothing for those not in it', () => {
    const t = all + TOAST.stayMs + 100;
    expect(releaseFromToast(director, toast, ['minori'], { ...AT, t })).toBe(director);
    expect(releaseFromToast(director, toast, ['sasae', 'kaname'], { ...AT, t: all })).toBe(
      director,
    );
  });

  it('changes nothing once the toast is out of the director (dropped with the scenes)', () => {
    expect(releaseFromToast(EMPTY_DIRECTOR, toast, ['minori'], { ...AT, t: all })).toBe(
      EMPTY_DIRECTOR,
    );
  });
});
