import { describe, expect, it } from 'vitest';
import type { GuildEvent } from '../domain/events';
import { CONFETTI_MS } from './confetti';
import { EMPTY_DIRECTOR, scheduleEvent } from './director';
import { createIdleCrew, freeIn, playEvent } from './idleCrew';
import { planMonthEvent } from './monthEvent';
import { actorOf, castOf, DEFAULT_SEATS } from './scenes';
import { releaseFromToast, withToast } from './toast';

/**
 * A scene whose cast is in the month's gathering (Issue #224): they walk back first and the scene
 * waits, so the message queue, which plans the scene from the moment its message shows, must be
 * told how long until the cast is free (loop.ts playIn, MessageQueue.occupy). Otherwise the next
 * message (a level-up of かなめ) shows while she is still in the hand-over, and "LEVEL UP" comes
 * seconds after it.
 */

const CONTEXT = { seats: DEFAULT_SEATS, random: () => 0 };
/** かなめ hands a quest to ひらめ (企画). */
const HAND_OVER: GuildEvent = {
  id: 'issue-opened#105',
  kind: 'issue-opened',
  number: 105,
  department: '企画',
};
const IDS = [...castOf(HAND_OVER), actorOf(HAND_OVER)];
/** ひらめ (企画) clears a quest: the confetti flies over her seat. */
const CLEARED: GuildEvent = {
  id: 'issue-closed#105',
  kind: 'issue-closed',
  number: 105,
  department: '企画',
};

function crew() {
  return createIdleCrew({ random: () => 0.5, wallNow: () => 0, onActive: () => undefined });
}

describe('freeIn (Issue #224)', () => {
  it('is 0 for a member already free and the rest of a scene otherwise', () => {
    const played = scheduleEvent(EMPTY_DIRECTOR, HAND_OVER, 1_000, CONTEXT);
    const homeIn = freeIn(played, ['kaname', 'sasae'], 1_000);
    expect(homeIn.sasae).toBe(0);
    expect(homeIn.kaname).toBe((played.busyUntil.kaname ?? 0) - 1_000);
  });

  it('counts the walk back from the month’s gathering, which the queue does not see', () => {
    const gathering = planMonthEvent(['hirame', 'sasae'], 0, DEFAULT_SEATS, 10);
    if (gathering === null) throw new Error('no gathering');
    const t = 30_000;
    const released = releaseFromToast(withToast(EMPTY_DIRECTOR, gathering), gathering, IDS, {
      t,
      seats: DEFAULT_SEATS,
    });
    const onStage = freeIn(playEvent(crew(), released, HAND_OVER, { t, context: CONTEXT }), IDS, t);
    // What the message queue plans from the message alone (messageQueue.ts withHeadScene).
    const queued = freeIn(scheduleEvent(EMPTY_DIRECTOR, HAND_OVER, t, CONTEXT), IDS, t);
    const walkBack = (released.busyUntil.hirame ?? t) - t;
    expect(walkBack).toBeGreaterThan(0);
    expect(onStage.kaname).toBe((queued.kaname ?? 0) + walkBack);
  });

  it('counts the confetti of a cleared quest, not only the walk back, as the hand-over’s scene', () => {
    const gathering = planMonthEvent(['hirame', 'sasae'], 0, DEFAULT_SEATS, 10);
    if (gathering === null) throw new Error('no gathering');
    const t = 30_000;
    const ids = [actorOf(CLEARED)];
    const released = releaseFromToast(withToast(EMPTY_DIRECTOR, gathering), gathering, ids, {
      t,
      seats: DEFAULT_SEATS,
    });
    const walkBack = (released.busyUntil.hirame ?? t) - t;
    expect(walkBack).toBeGreaterThan(0);
    const played = playEvent(crew(), released, CLEARED, { t, context: CONTEXT });
    // The confetti flies over her seat from `t` on, while she walks back under it.
    expect(walkBack).toBeLessThan(CONFETTI_MS);
    expect(freeIn(played, ids, t).hirame).toBe(CONFETTI_MS);
  });
});
