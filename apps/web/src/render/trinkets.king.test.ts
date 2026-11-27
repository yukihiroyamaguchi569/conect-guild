import { describe, expect, it } from 'vitest';
import { BLESSINGS, blessingShown } from './blessing';
import { TRINKETS } from './metrics';
import { sleepTalkAt, sleepWordAt } from './sleepTalk';
import { NO_CUES, PET_AWAKE_DECOR, petLookAt, petPoseAt, wagDecorAt } from './trinkets';

/** Issue #314: the pet wakes and sits, listening, while the king's words for a click show. */

/** A moment the pet sleeps through on its own. */
const ASLEEP: number = TRINKETS.petSitMs;
const look = (cues: Partial<typeof NO_CUES>, now = ASLEEP) =>
  petLookAt('sleeping-poodle', 0, now, { ...NO_CUES, ...cues });

describe('blessingShown', () => {
  it('is on for the king’s words for a click only', () => {
    for (const words of BLESSINGS) expect(blessingShown({ yukihiro: words })).toBe(true);
    expect(blessingShown({})).toBe(false);
    expect(blessingShown({ yukihiro: '！' })).toBe(false);
    expect(blessingShown({ yukihiro: 'ゴニョゴニョ' })).toBe(false);
    expect(blessingShown({ kaname: 'おねがい！' })).toBe(false);
  });
});

describe('the pet listening to the king', () => {
  it('sits up while the words show, and sleeps again after', () => {
    expect(look({ kingBlessing: true })).toEqual({ name: PET_AWAKE_DECOR, dy: 0 });
    expect(look({ kingBlessing: false })).toEqual(petPoseAt('sleeping-poodle', 0, ASLEEP, false));
    expect(look({ kingBlessing: false }).name).toBe('sleeping-poodle');
  });

  it('wags rather than listens while petted, and hops while confetti flies', () => {
    expect(look({ kingBlessing: true, petted: true })).toEqual({
      name: wagDecorAt(ASLEEP),
      dy: 0,
    });
    const now = ASLEEP + TRINKETS.hopMs / 2;
    expect(look({ kingBlessing: true, clearedAt: { kaname: ASLEEP } }, now)).toEqual({
      name: PET_AWAKE_DECOR,
      dy: -TRINKETS.hopPx,
    });
  });

  it('does not talk in its sleep while it listens', () => {
    let t = ASLEEP;
    while (sleepWordAt(t) === null || sleepTalkAt('sleeping-poodle', 0, t, NO_CUES) === null) {
      t += 100;
    }
    const cues = { ...NO_CUES, kingBlessing: true };
    expect(sleepTalkAt('sleeping-poodle', 0, t, cues)).toBeNull();
  });
});
