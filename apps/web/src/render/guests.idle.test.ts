import { describe, expect, it } from 'vitest';
import { dozeMotion } from './idle';
import { GUEST, guestLook, markFeet, type StageGuest } from './guests';
import { IDLE } from './metrics';

/** The guests' long idle spells, as the members' (Issue #183). Times are wall ms from 0. */
const MIN = 60_000;
const SEC = 1_000;

function idleGuest(index: number, over: Partial<StageGuest> = {}): StageGuest {
  return { index, state: 'idle', idleSince: 0, ...over };
}

const lookAt = (guest: StageGuest, wall: number) => guestLook(guest, { t: wall, wall }, true);

describe('a guest with nothing to do', () => {
  it('stays awake for 10 minutes: standing facing front, nothing over the head', () => {
    for (const wall of [0, 5 * MIN, 9 * MIN + 59 * SEC]) {
      for (const state of ['idle', 'resting'] as const) {
        expect(lookAt(idleGuest(0, { state }), wall)).toEqual({
          frame: 0,
          flip: false,
          dy: 0,
          reading: false,
          mark: null,
        });
      }
    }
  });

  it('dozes from 10 minutes as a member does (dozeMotion), up to 29:59', () => {
    for (const wall of [10 * MIN, 20 * MIN, 29 * MIN + 59 * SEC]) {
      for (const index of [0, 1]) {
        const doze = dozeMotion(index * GUEST.phaseMs, wall);
        expect(lookAt(idleGuest(index), wall)).toEqual({
          frame: doze.frame,
          flip: doze.flip,
          dy: doze.offset.y,
          reading: false,
          mark: doze.mark === null ? null : { kind: 'dots' },
        });
      }
    }
  });

  it('nods, yawns aside and shows a 「…」 while dozing, never the sleeping frame', () => {
    const looks = Array.from({ length: 240 }, (_, i) => lookAt(idleGuest(0), 10 * MIN + i * 100));
    expect(looks.some((look) => look.dy === IDLE.nodPx)).toBe(true);
    expect(looks.some((look) => look.frame === 1)).toBe(true);
    expect(looks.some((look) => look.mark?.kind === 'dots')).toBe(true);
    expect(looks.every((look) => look.frame !== 7 && look.mark?.kind !== 'z')).toBe(true);
  });

  it('sleeps from 30 minutes: the sleeping frame and a 「Z」', () => {
    for (const wall of [30 * MIN, 90 * MIN]) {
      const look = lookAt(idleGuest(0), wall);
      expect(look.frame).toBe(7);
      expect(look.mark?.kind).toBe('z');
    }
  });

  it('stays awake while the time is not known', () => {
    expect(lookAt(idleGuest(0, { idleSince: null }), 90 * MIN)).toMatchObject({
      frame: 0,
      mark: null,
    });
  });

  it('is up at once when work comes, however long it slept', () => {
    const working = lookAt(idleGuest(0, { state: 'working' }), 90 * MIN);
    expect(working.reading).toBe(true);
    expect(working.mark).toBeNull();
    const waiting = lookAt(idleGuest(0, { state: 'awaiting-permission' }), 90 * MIN);
    expect(waiting.mark).toEqual({ kind: 'question' });
  });

  it('shows the 「…」 where the 「?」 is, so it keeps clear of what the 「?」 does', () => {
    const feet = { x: 300, y: 500 };
    expect(markFeet(feet, { kind: 'dots' })).toEqual(markFeet(feet, { kind: 'question' }));
  });
});
