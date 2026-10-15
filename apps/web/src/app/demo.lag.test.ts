import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_LOOP_MS } from '../domain/demo';
import { DEMO_SCRIPT } from '../domain/demoScript';
import { DEFAULT_SEATS } from '../render/scenes';
import { planVisit } from '../render/visit';
import { createDemoSession } from './demo';
import { createGuildStore } from './guildStore';

/**
 * How long the demo's messages wait for the window (Issue #152): each shows at least 8 s, in turn,
 * so too many in a loop keep the screen behind the script. Measured on a fake clock, as the store
 * runs in the demo, from when a message joins the queue to when it reaches the window. The queue
 * paces the scenes itself (a message waits for its cast); the stage is stood in for: nobody is out
 * playing, and かなめ is away at the throne for the king's order at the head of each loop (the
 * canvas tells the store so: MessageQueue.occupy, Issue #87).
 */

/** How long かなめ is away hearing the king's order (render/visit.ts). */
const VISIT_MS = planVisit(0, DEFAULT_SEATS.kaname)?.back ?? 0;
/** When the store reads the order to かなめ: the first read after the beat (every second). */
const ORDER_IN_LOOP_MS =
  Math.ceil(
    (DEMO_SCRIPT.find((beat) => beat.lane === 'commander' && beat.action === 'work')?.at ?? 0) /
      1_000,
  ) * 1_000;

/** The longest wait (ms) over `loops` loops after はじめる. */
async function longestWait(loops: number): Promise<number> {
  vi.useFakeTimers({ now: Date.parse('2026-10-12T03:00:00.000Z') });
  const demo = createDemoSession(() => Date.now());
  const store = createGuildStore(demo.guildOptions);
  store.setStage({ recall: () => ({}) });
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
    if ((t + 100) % DEMO_LOOP_MS === ORDER_IN_LOOP_MS) store.occupy({ kaname: VISIT_MS });
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

  it('keeps every message waiting 22 s at most over 30 loops, the king’s quests included', async () => {
    // Without them the longest wait is 18.7 s; with one every five loops from the third, 21.6 s
    // (docs/changes/0152-demo-king.md has the other frequencies).
    expect(await longestWait(30)).toBeLessThanOrEqual(22_000);
  });
});
