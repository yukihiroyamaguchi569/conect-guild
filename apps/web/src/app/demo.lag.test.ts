import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_LOOP_MS } from '../domain/demo';
import { createDemoSession } from './demo';
import { createGuildStore } from './guildStore';

/**
 * How long the demo's messages wait for the window (Issue #152): each shows at least 8 s, in turn,
 * so too many in a loop keep the screen behind the script. Measured on a fake clock, as the store
 * runs in the demo, from when a message joins the queue to when it reaches the window.
 */

/** The longest wait (ms) over `loops` loops after はじめる. */
async function longestWait(loops: number): Promise<number> {
  vi.useFakeTimers({ now: Date.parse('2026-10-12T03:00:00.000Z') });
  const demo = createDemoSession(() => Date.now());
  const store = createGuildStore(demo.guildOptions);
  store.start();
  await vi.advanceTimersByTimeAsync(1_000);
  demo.markReady();
  demo.setStageShown(true);
  demo.start();
  const queued = new Map<number, number>();
  const shown = new Set<number>();
  let longest = 0;
  for (let t = 0; t < loops * DEMO_LOOP_MS; t += 100) {
    await vi.advanceTimersByTimeAsync(100);
    const now = Date.now();
    for (const message of store.state.messages)
      if (!queued.has(message.id)) queued.set(message.id, now);
    const head = store.state.messages[0];
    if (head !== undefined && !shown.has(head.id)) {
      shown.add(head.id);
      longest = Math.max(longest, now - (queued.get(head.id) ?? now));
    }
  }
  store.stop();
  return longest;
}

describe('the demo keeps up with its script', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a message waiting at most as long as without the king’s quests, over 20 loops', async () => {
    // Without them the longest wait is 28.1 s, in the first loops (their three level-ups).
    // Every two loops they made it 49.1 s and growing; every three it stays 28.1 s.
    expect(await longestWait(20)).toBeLessThanOrEqual(28_100);
  });
});
