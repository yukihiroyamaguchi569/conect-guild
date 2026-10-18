import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessageQueue, type GuildMessage } from './messageQueue';
import { globalScheduler } from './scheduler';

/** Lines with a time limit (Issue #194: the reward of the day): dropped once their time is over. */

const HOLD_MS = 8_000;
const T0 = 1_000_000;

/** A queue on the fake timers: what the window was last given, and every head it showed. */
function setup() {
  const seen: { last: readonly GuildMessage[]; heads: string[] } = { last: [], heads: [] };
  const queue = createMessageQueue({
    scheduler: globalScheduler,
    now: Date.now,
    holdMs: HOLD_MS,
    lastHoldMs: 30_000,
    publish: (messages) => {
      seen.last = messages;
      const head = messages[0];
      if (head !== undefined && seen.heads.at(-1) !== head.text) seen.heads.push(head.text);
    },
  });
  return { queue, seen };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('messageQueue: lines with a time limit', () => {
  it('drops a line whose turn comes after its time, unshown', async () => {
    const { queue, seen } = setup();
    queue.push([
      { text: 'a', event: null },
      { text: 'b', event: null, until: T0 + HOLD_MS / 2 },
      { text: 'c', event: null, until: T0 + HOLD_MS * 2 },
    ]);
    await vi.advanceTimersByTimeAsync(HOLD_MS * 3);
    expect(seen.heads).toEqual(['a', 'c']);
    queue.dispose();
  });

  it('drops it when the page comes back after its time, even in the window', async () => {
    const { queue, seen } = setup();
    queue.setHidden(true);
    queue.push([{ text: 'b', event: null, until: T0 + HOLD_MS }]);
    expect(seen.last.map((m) => m.text)).toEqual(['b']);
    await vi.advanceTimersByTimeAsync(HOLD_MS * 2);
    queue.setHidden(false);
    expect(seen.last).toEqual([]);
    queue.dispose();
  });
});
