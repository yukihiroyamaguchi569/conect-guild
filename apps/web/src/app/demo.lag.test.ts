import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Baseline } from '../domain/baseline';
import { DEMO_LOOP_MS } from '../domain/demo';
import { DEMO_SCRIPT } from '../domain/demoScript';
import { diffSnapshot } from '../domain/events';
import { EVENT_GAP_LIMIT_MS } from '../guild.config';
import { DEFAULT_SEATS } from '../render/scenes';
import { planVisit } from '../render/visit';
import { createDemoSession } from './demo';
import { createGuildStore, type GuildStoreOptions } from './guildStore';

/**
 * How long the demo's messages wait for the window (Issue #152): each shows at least 8 s, in turn,
 * so too many in a loop keep the screen behind the script. Measured on a fake clock, as the store
 * runs in the demo, from when the store first reads an event to when its line reaches the window
 * (the queue publishes a line only when it shows, so the read is noted beside the store's own).
 * The queue paces the scenes itself (a line waits for its cast); the stage is stood in for: nobody
 * is out playing, and かなめ is away at the throne for the king's order at the head of each loop
 * (the canvas tells the store so: MessageQueue.occupy, Issue #87).
 */

/** How long かなめ is away hearing the king's order (render/visit.ts). */
const VISIT_MS = planVisit(0, DEFAULT_SEATS.kaname)?.back ?? 0;
/** When the store reads the order to かなめ: the first read after the beat (every second). */
const ORDER_IN_LOOP_MS =
  Math.ceil(
    (DEMO_SCRIPT.find((beat) => beat.lane === 'commander' && beat.action === 'work')?.at ?? 0) /
      1_000,
  ) * 1_000;
/** Time left after the last loop for the lines still queued to show (bounded). */
const DRAIN_MS = 5 * DEMO_LOOP_MS;
const STEP_MS = 100;

/** The demo's options, noting when each event is first read (epoch ms, by event id) in `read`. */
function noting(options: GuildStoreOptions, read: Map<string, number>): GuildStoreOptions {
  const load = options.loadSnapshot;
  if (load === undefined) throw new Error('the demo reads its own snapshot');
  let baseline: Baseline | null = null;
  return {
    ...options,
    loadSnapshot: async () => {
      const result = await load();
      if (result.ok) {
        const diff = diffSnapshot(baseline, result.snapshot, EVENT_GAP_LIMIT_MS, true);
        for (const event of diff.events) if (!read.has(event.id)) read.set(event.id, Date.now());
        if (diff.baselineUpdate.action === 'replace') baseline = diff.baselineUpdate.baseline;
      }
      return result;
    },
  };
}

/** The longest wait (ms) of the events read over `loops` loops after はじめる; all must show. */
async function longestWait(loops: number): Promise<number> {
  vi.useFakeTimers({ now: Date.parse('2026-10-12T03:00:00.000Z') });
  const demo = createDemoSession(() => Date.now());
  const read = new Map<string, number>();
  const store = createGuildStore(noting(demo.guildOptions, read));
  store.setStage({ recall: () => ({}) });
  store.start();
  await vi.advanceTimersByTimeAsync(1_000);
  demo.markReady();
  demo.setStageShown(true);
  demo.start();
  const waits = new Map<string, number>();
  let counted = -1;
  for (let t = 0; t < loops * DEMO_LOOP_MS + DRAIN_MS; t += STEP_MS) {
    await vi.advanceTimersByTimeAsync(STEP_MS);
    // Events read after the last loop are left out: the drain is only for those before.
    if (t + STEP_MS === loops * DEMO_LOOP_MS) counted = read.size;
    if ((t + STEP_MS) % DEMO_LOOP_MS === ORDER_IN_LOOP_MS) store.occupy({ kaname: VISIT_MS });
    const event = store.state.messages[0]?.event;
    if (event == null || waits.has(event.id)) continue;
    waits.set(event.id, Date.now() - (read.get(event.id) ?? Date.now()));
  }
  store.stop();
  const measured = [...read.keys()].slice(0, counted);
  expect(measured.length).toBeGreaterThan(loops * 6);
  // Every event read in the loops reached the window before the drain ran out.
  expect(measured.filter((id) => !waits.has(id))).toEqual([]);
  return Math.max(...measured.map((id) => waits.get(id) ?? Number.POSITIVE_INFINITY));
}

describe('the demo keeps up with its script', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps every message waiting 22 s at most over 30 loops, the king’s quests included', async () => {
    // Without them the longest wait is 18.7 s; with one every five loops from the third, 21.6 s
    // (docs/changes/0152-demo-king.md has the other frequencies).
    expect(await longestWait(30)).toBeLessThanOrEqual(22_000);
    // 35 loops of the fake clock in 0.1 s steps: slower than most tests when they all run at once.
  }, 30_000);
});
