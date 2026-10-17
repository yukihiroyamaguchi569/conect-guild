import { describe, expect, it } from 'vitest';
import { DEMO_LOOP_MS, demoSnapshotAt } from '../domain/demo';
import { buildParty } from './guildView';
import { narrationPools } from './narration';

/** Issue #166: the demo's king's quest reaches the narration through the party rows. */

const NOW = Date.parse('2026-10-12T03:00:00.000Z');
const KING_WORKS = 'おうさまは ぎょくざで クエストに とりくんでいる。';

/** The king's narration lines at `elapsed` ms into the demo (the demo always has his quests). */
function kingLinesAt(elapsed: number): readonly string[] {
  const snapshot = demoSnapshotAt(elapsed, NOW + elapsed);
  const party = buildParty(snapshot, NOW + elapsed, true);
  const pools = narrationPools({
    party,
    activities: {},
    phase: 'day',
    snapshot,
    now: NOW + elapsed,
  });
  return pools.scene.at(-1) ?? [];
}

describe('the narration of the demo’s king’s quest', () => {
  it('tells the king works on it while it is open (loop 3, before its clear at 22.5 s)', () => {
    expect(kingLinesAt(3 * DEMO_LOOP_MS + 10_000)).toEqual([KING_WORKS]);
  });

  it('goes back to the king looking round once it is cleared', () => {
    expect(kingLinesAt(3 * DEMO_LOOP_MS + 30_000)).toEqual([
      'おうさまは ぎょくざから へやを みわたしている。',
    ]);
  });

  it('is not told before the first king’s quest (loops 1 and 2 before it opens)', () => {
    expect(kingLinesAt(DEMO_LOOP_MS + 10_000)).not.toContain(KING_WORKS);
  });
});
