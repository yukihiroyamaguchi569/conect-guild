import { describe, expect, it } from 'vitest';
import { EMPTY_DIRECTOR } from './director';
import { TRINKETS } from './metrics';
import { BARK, TOAST_BARK } from './petting';
import { DEFAULT_SEATS } from './scenes';
import { petLineAt, sleepWordAt, toastBarking } from './sleepTalk';
import { planToast, releaseFromToast, TOAST, toastCueAt, withToast } from './toast';
import { NO_CUES, PET_AWAKE_DECOR, petLookAt, wagDecorAt } from './trinkets';

/** Issue #315: the pet is up through the Friday toast and says 「わん！」 as the tankards go up. */

const START = 7_000_000;
const toast = planToast(['minori', 'hibiki', 'hirame'], START, DEFAULT_SEATS);
if (toast === null) throw new Error('no toast');
const director = withToast(EMPTY_DIRECTOR, toast);
const cheer = toast.lines[0]?.start ?? 0;
const wayBack = Math.min(...toast.tracks.map((track) => track.segments.at(-1)?.start ?? 0));

describe('toastCueAt', () => {
  it('is off before the toast and once all are on the way back', () => {
    expect(toastCueAt(EMPTY_DIRECTOR, START)).toEqual({ toasting: false, cheeredAt: null });
    expect(toastCueAt(director, START - 1).toasting).toBe(false);
    expect(toastCueAt(director, cheer + TOAST.stayMs).toasting).toBe(false);
  });

  it('is on from the walk there until they set off back, and tells when they cheered', () => {
    expect(toastCueAt(director, START)).toEqual({ toasting: true, cheeredAt: null });
    expect(toastCueAt(director, cheer - 1)).toEqual({ toasting: true, cheeredAt: null });
    expect(toastCueAt(director, cheer)).toEqual({ toasting: true, cheeredAt: cheer });
    expect(toastCueAt(director, wayBack - 1).toasting).toBe(true);
  });

  it('is off for those released from it, and their cheer to come is gone', () => {
    const ids = toast.tracks.map((track) => track.actor);
    const released = releaseFromToast(director, toast, ids, {
      t: START + 10,
      seats: DEFAULT_SEATS,
    });
    expect(toastCueAt(released, START + 10)).toEqual({ toasting: false, cheeredAt: null });
  });
});

describe('the pet at the toast', () => {
  /** A moment the pet sleeps through on its own. */
  const asleep: number = TRINKETS.petSitMs;
  const look = (cues: Partial<typeof NO_CUES>) =>
    petLookAt('sleeping-poodle', 0, asleep, { ...NO_CUES, ...cues });

  it('is up and sitting while the toast goes on', () => {
    expect(look({ toasting: true })).toEqual({ name: PET_AWAKE_DECOR, dy: 0 });
    expect(look({ toasting: false }).name).toBe('sleeping-poodle');
  });

  it('wags while petted and hops while confetti flies, toast or not', () => {
    expect(look({ toasting: true, petted: true })).toEqual({ name: wagDecorAt(asleep), dy: 0 });
    const hop = look({ toasting: true, clearedAt: { kaname: asleep - TRINKETS.hopMs / 2 } });
    expect(hop.dy).toBe(-TRINKETS.hopPx);
  });

  it('says 「わん！」 for toastBarkMs from the cheer, once', () => {
    const cues = { ...NO_CUES, toasting: true, cheeredAt: cheer };
    expect(petLineAt(cheer, cues)).toBe(TOAST_BARK);
    expect(petLineAt(cheer + TRINKETS.toastBarkMs - 1, cues)).toBe(TOAST_BARK);
    expect(petLineAt(cheer + TRINKETS.toastBarkMs, cues)).toBeNull();
    expect(petLineAt(cheer - 1, { ...cues, cheeredAt: null })).toBeNull();
    expect(toastBarking(cheer, { ...cues, halted: true })).toBe(false);
  });

  it('says 「わん」 while petted, and talks in its sleep only when the toast is not on', () => {
    const cues = { ...NO_CUES, toasting: true, cheeredAt: cheer };
    expect(petLineAt(cheer, { ...cues, petted: true })).toBe(BARK);
    let t = 0;
    while (sleepWordAt(t) === null || petLineAt(t, NO_CUES) === null) t += 100;
    expect(petLineAt(t, { ...NO_CUES, toasting: true })).toBeNull();
  });
});
