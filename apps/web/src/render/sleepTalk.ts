import type { DecorName } from '../../../../assets/decor/decor';
import { ANIMATED_DECOR } from './animatedDecor';
import { PET_DECOR } from './idleSpots';
import { TRINKETS } from './metrics';
import { BARK, PET_RECT, TOAST_BARK, VISITOR_BARK, type PetAt } from './petting';
import { hashStep, petLookAt, visitorBarking, type DecorCues } from './trinkets';

/**
 * The pet talks in its sleep (Issue #313, docs/DESIGN.md 8): now and then, while it sleeps, a
 * murmur's bubble over it says 「くぅん…」 or 「zzz」, as its 「わん」 does (petting.ts). The times
 * are fixed slots of the stage clock and a hash of each slot picks whether it talks and what it
 * says: no randomness. Pure.
 */

/** What the pet says in its sleep. */
export const SLEEP_WORDS: readonly [string, string] = ['くぅん…', 'zzz'];

/** Added to the slot for the hash that picks the word, so it does not follow whether it talks. */
const WORD_SALT = 0x5bd1;

/** What the pet would say in its sleep at `now`, or null, from the time slots alone. */
export function sleepWordAt(now: number): string | null {
  const slot = Math.floor(now / TRINKETS.sleepTalkSlotMs);
  if (now - slot * TRINKETS.sleepTalkSlotMs >= TRINKETS.sleepTalkMs) return null;
  if (hashStep(slot) >= TRINKETS.sleepTalkShare) return null;
  const [first, second] = SLEEP_WORDS;
  return hashStep(slot + WORD_SALT) < 0.5 ? first : second;
}

/**
 * The pet's sleep talk at `now`: only while it sleeps (its pose is its sleeping picture `asleep`,
 * not up from a click, hopping, with company or sitting up on its own), and not on a halted screen.
 */
export function sleepTalkAt(
  asleep: DecorName,
  phaseMs: number,
  now: number,
  cues: DecorCues,
): string | null {
  if (cues.halted) return null;
  if (petLookAt(asleep, phaseMs, now, cues).name !== asleep) return null;
  return sleepWordAt(now);
}

/** The phase of the pet of the selected layout (animatedDecor.ts); 0 when it has none. */
const PET_PHASE_MS =
  ANIMATED_DECOR.find((thing) => thing.placement.name === PET_DECOR)?.phaseMs ?? 0;

/** True while the pet says 「わん！」 for the toast: TRINKETS.toastBarkMs from 「かんぱーい！」. */
export function toastBarking(now: number, cues: DecorCues): boolean {
  const { cheeredAt } = cues;
  return !cues.halted && cheeredAt !== null && now < cheeredAt + TRINKETS.toastBarkMs;
}

/**
 * What the pet of the selected layout says at `now`: 「わん」 while petted, else 「わんわん」 at a
 * visitor coming in (Issue #317), else 「わん！」 as the toast's tankards go up (Issue #315), else its
 * sleep talk.
 */
export function petLineAt(now: number, cues: DecorCues): string | null {
  if (cues.petted) return BARK;
  if (!cues.halted && visitorBarking(now, cues)) return VISITOR_BARK;
  if (toastBarking(now, cues)) return TOAST_BARK;
  return sleepTalkAt(PET_DECOR, PET_PHASE_MS, now, cues);
}

/**
 * Where the pet of the selected layout is drawn at `now` (PET_RECT, moved as its pose: while it
 * walks round the guild, Issue #319), for the clicks; null when it has none.
 */
export function petAt(now: number, cues: DecorCues): PetAt | null {
  if (PET_RECT === null) return null;
  const { dx, dy } = petLookAt(PET_DECOR, PET_PHASE_MS, now, cues);
  const { left, top, right, bottom } = PET_RECT;
  const x = dx ?? 0;
  const rect = { left: left + x, top: top + dy, right: right + x, bottom: bottom + dy };
  return { rect, away: dx !== undefined };
}
