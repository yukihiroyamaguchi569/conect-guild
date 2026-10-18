import type { MemberId } from '../guild.config';
import type { Asking } from './asking';
import type { Cast, CastParty } from './cast';
import type { Director } from './director';
import type { Scheduler } from './scheduler';

/** The presses on the canvas (the king, the pet, the members), as the render loop takes them. */
export interface Presses {
  /**
   * The king was clicked (Issue #187): he says a word of his own now, never the one he said last.
   * Dropped, not kept for later, while halted, before the first snapshot, while drawing would not
   * be seen, while he awaits approval, and while a call plays or he has a part in a scene
   * (blessing.mayBless). True when he speaks.
   */
  bless(): boolean;
  /**
   * The pet was clicked (Issue #186): it wakes, or stays up, for TRINKETS.pettedMs wagging its tail
   * and says 「わん」, whatever else plays. Dropped while halted and while drawing would not be seen
   * (petting.mayPet). True when it is up from the click.
   */
  pet(): boolean;
  /**
   * Member `id` was clicked (Issue #191): they answer over their head with a line of what they do.
   * Dropped while halted, before the first snapshot, while drawing would not be seen, while a call
   * plays, and while they are in a scene, on the way, or say something else (asking.askSceneOf).
   * True when they answer.
   */
  ask(id: MemberId): boolean;
  /** Where each member was drawn in the last frame (feet; the king too), for the clicks. */
  feet(): ReturnType<Asking['feet']>;
}

/** The stage at a press: the scenes, the party, the stage time and whether drawing is paused. */
interface PressMoment {
  readonly director: Director;
  readonly party: CastParty;
  readonly t: number;
  readonly paused: boolean;
}

/** The king clicked (Issue #187): he speaks, and the frame is drawn, unless the click is dropped. */
function blessNow(cast: Pick<Cast, 'bless'>, schedule: Scheduler, at: PressMoment): boolean {
  const said = cast.bless(at.director, at.party, at);
  if (said) schedule.now();
  return said;
}

/** The pet clicked (Issue #186): it is up, and the frame is drawn, unless the click is dropped. */
function petNow(
  cast: Pick<Cast, 'petting'>,
  schedule: Scheduler,
  at: { readonly party: CastParty; readonly paused: boolean; readonly t: number },
): boolean {
  const up = cast.petting.press({ halted: at.party.halted, paused: at.paused }, at.t);
  if (up) schedule.now();
  return up;
}

/** A member clicked (Issue #191): they answer, and the frame is drawn, unless the click is dropped. */
function askNow(
  cast: Pick<Cast, 'ask'>,
  schedule: Scheduler,
  id: MemberId,
  at: PressMoment,
): boolean {
  const said = cast.ask(id, at.director, at.party, at);
  if (said) schedule.now();
  return said;
}

/**
 * The presses on the canvas (the king, the pet, the members), on the stage as `now()` gives it at
 * the press.
 */
export function presses(
  cast: Pick<Cast, 'bless' | 'petting' | 'ask' | 'asking'>,
  schedule: Scheduler,
  now: () => PressMoment,
): Presses {
  return {
    bless: () => blessNow(cast, schedule, now()),
    pet: () => petNow(cast, schedule, now()),
    ask: (id) => askNow(cast, schedule, id, now()),
    feet: () => cast.asking.feet(),
  };
}
