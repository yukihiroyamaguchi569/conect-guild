import { describe, expect, it } from 'vitest';
import { decorDraw, flippedDraw } from './decorArt';
import { TRINKETS } from './metrics';
import { createPetting, NO_SPIN, spinAfterPress, spinningSince, type Spin } from './petting';
import {
  NO_CUES,
  PET_AWAKE_DECOR,
  PET_SIDE_DECOR,
  petLookAt,
  SPIN_TURN_FRAMES,
  spinPoseAt,
  wagDecorAt,
} from './trinkets';

/** Issue #312: petted 5 times within 4 s, the pet spins for a while; then it wags on. */

const LIVE = { halted: false, paused: false };
const T0 = 7_000_000;

function pressAll(times: readonly number[], from: Spin = NO_SPIN): Spin {
  return times.reduce((spin, t) => spinAfterPress(spin, LIVE, t), from);
}

/** `n` presses from T0, `gapMs` apart. */
const presses = (n: number, gapMs: number) => Array.from({ length: n }, (_, i) => T0 + i * gapMs);

describe('counting the presses', () => {
  it('spins on the 5th press within the window, from that press', () => {
    const spin = pressAll(presses(5, 500));
    expect(spin.since).toBe(T0 + 2_000);
    expect(spin.presses).toEqual([]);
  });

  it('does not spin on 4 presses', () => {
    expect(pressAll(presses(4, 100)).since).toBeNull();
  });

  it('spins when the 5th press is the window after the 1st, not 1 ms later', () => {
    const gap = TRINKETS.petSpinWindowMs / 4;
    expect(pressAll(presses(5, gap)).since).toBe(T0 + TRINKETS.petSpinWindowMs);
    expect(pressAll([...presses(4, gap), T0 + TRINKETS.petSpinWindowMs + 1]).since).toBeNull();
  });

  it('counts the presses within the window only, and keeps no more than it needs', () => {
    const spin = pressAll([T0, T0 + 3_000, T0 + 4_500, T0 + 4_600]);
    expect(spin.presses).toEqual([T0 + 3_000, T0 + 4_500, T0 + 4_600]);
    expect(spinAfterPress(spin, LIVE, T0 + 4_700).since).toBeNull();
    expect(pressAll([T0 + 4_700, T0 + 4_800], spin).since).toBe(T0 + 4_800);
  });

  it('drops the presses of a halted or unseen screen', () => {
    const four = pressAll(presses(4, 100));
    expect(spinAfterPress(four, { ...LIVE, halted: true }, T0 + 500)).toBe(four);
    expect(spinAfterPress(four, { ...LIVE, paused: true }, T0 + 500)).toBe(four);
  });

  it('neither restarts nor counts the presses during a spin', () => {
    const spin = pressAll(presses(5, 100));
    const during = pressAll(
      presses(5, 100).map((t) => t + 500),
      spin,
    );
    expect(during).toBe(spin);
    const end = (spin.since ?? 0) + TRINKETS.petSpinMs;
    expect(
      pressAll(
        presses(4, 100).map((t) => t - T0 + end),
        spin,
      ).since,
    ).toBe(spin.since);
    expect(
      pressAll(
        presses(5, 100).map((t) => t - T0 + end),
        spin,
      ).since,
    ).toBe(end + 400);
  });
});

describe('the spin', () => {
  const since = T0 + 400;
  const spin = pressAll(presses(5, 100));

  it('lasts TRINKETS.petSpinMs', () => {
    expect(spinningSince(spin, since - 1, false)).toBeNull();
    expect(spinningSince(spin, since, false)).toBe(since);
    expect(spinningSince(spin, since + TRINKETS.petSpinMs - 1, false)).toBe(since);
    expect(spinningSince(spin, since + TRINKETS.petSpinMs, false)).toBeNull();
    expect(spinningSince(spin, since, true)).toBeNull();
  });

  it('keeps the pet petted, wagging after the spin until the time up ends', () => {
    const petting = createPetting();
    for (const t of presses(5, 100)) petting.press(LIVE, t);
    const end = since + TRINKETS.petSpinMs;
    expect(petting.spinningSince(since, false)).toBe(since);
    expect(petting.isPetted(since, false)).toBe(true);
    expect(petting.spinningSince(end, false)).toBeNull();
    expect(petting.isPetted(end, false)).toBe(true);
    expect(petting.isPetted(since + TRINKETS.pettedMs, false)).toBe(false);
  });

  it('ends for good with a halt', () => {
    const petting = createPetting();
    for (const t of presses(5, 100)) petting.press(LIVE, t);
    petting.setHalted(true);
    petting.setHalted(false);
    expect(petting.spinningSince(since + 1, false)).toBeNull();
  });
});

describe('the spinning pose', () => {
  const frame = TRINKETS.petSpinFrameMs;

  it('turns round: facing us, side on to the right, side on to the left (mirrored)', () => {
    const at = (i: number) => spinPoseAt(i * frame + 1);
    expect([at(0).name, at(0).flipped]).toEqual([PET_AWAKE_DECOR, undefined]);
    expect([at(1).name, at(1).flipped]).toEqual([PET_SIDE_DECOR, undefined]);
    expect([at(2).name, at(2).flipped]).toEqual([PET_SIDE_DECOR, true]);
    expect(at(SPIN_TURN_FRAMES)).toEqual(at(0));
  });

  it('changes picture on the frame boundaries', () => {
    expect(spinPoseAt(frame - 1).name).toBe(PET_AWAKE_DECOR);
    expect(spinPoseAt(frame).name).toBe(PET_SIDE_DECOR);
    expect(spinPoseAt(2 * frame - 1).flipped).toBeUndefined();
    expect(spinPoseAt(2 * frame).flipped).toBe(true);
  });

  it('lasts whole turns, so it ends side on to the left and wags facing us', () => {
    expect(TRINKETS.petSpinMs % (SPIN_TURN_FRAMES * frame)).toBe(0);
    expect(spinPoseAt(TRINKETS.petSpinMs - 1).flipped).toBe(true);
  });

  it('hops a little, never below the floor', () => {
    const dys = new Set<number>();
    for (let t = 0; t < TRINKETS.petSpinMs; t += 5) dys.add(spinPoseAt(t).dy);
    expect(Math.min(...dys)).toBe(-TRINKETS.petSpinHopPx);
    expect(Math.max(...dys)).toBe(0);
  });

  it('comes before wagging, hopping, the toast, the king and company', () => {
    const now = T0 + 1_000;
    const cues = {
      ...NO_CUES,
      petted: true,
      petCompany: true,
      kingBlessing: true,
      toasting: true,
      clearedAt: { kaname: T0 },
      spinningSince: T0 + 500,
    };
    expect(petLookAt('sleeping-poodle', 0, now, cues)).toEqual(spinPoseAt(500));
    expect(petLookAt('sleeping-poodle', 0, now, { ...cues, spinningSince: null })).toEqual({
      name: wagDecorAt(now),
      dy: 0,
    });
  });
});

describe('flippedDraw', () => {
  it('mirrors the picture onto its own place', () => {
    const { d, left, top, mirrorX } = flippedDraw('awake-poodle', 100.4, 50);
    expect(d).toEqual(decorDraw('awake-poodle'));
    expect([left, top]).toEqual([100, 50]);
    // Its left edge lands on its right edge and the other way round.
    expect(mirrorX - left).toBe(left + d.w);
    expect(mirrorX - (left + d.w)).toBe(left);
  });
});
