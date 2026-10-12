import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuildEvent } from '../domain/events';
import { createMessageQueue, type GuildMessage, type StageRecall } from './messageQueue';
import { globalScheduler } from './scheduler';

/**
 * かなめ hearing the king's order at the throne (Issue #87): a message whose scene needs her waits
 * until she is back at her counter, so the message and its scene start together.
 */

const T0 = 1_000_000;
const AWAY_MS = 6_200;
const HOLD_MS = 8_000;
const scroll: GuildEvent = {
  id: 'issue-opened#1',
  kind: 'issue-opened',
  number: 1,
  department: '経理',
};
const NO_RECALL: StageRecall = { recall: () => ({}) };

function setup(stage: StageRecall | null = NO_RECALL) {
  const shown: { message: GuildMessage; at: number }[] = [];
  const queue = createMessageQueue({
    scheduler: globalScheduler,
    now: Date.now,
    holdMs: HOLD_MS,
    lastHoldMs: 30_000,
    publish: (messages) => {
      const head = messages[0];
      if (head !== undefined && shown.at(-1)?.message.id !== head.id)
        shown.push({ message: head, at: Date.now() - T0 });
    },
  });
  queue.setStage(stage);
  return { queue, shown };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('messageQueue: かなめ away at the throne', () => {
  it('holds a scroll until she is back, then shows it', async () => {
    const { queue, shown } = setup();
    queue.occupy({ kaname: AWAY_MS });
    queue.push([{ text: 'scroll', event: scroll }]);
    expect(shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(AWAY_MS);
    expect(shown.map((s) => s.at)).toEqual([AWAY_MS]);
    queue.dispose();
  });

  it('shows a message that needs nobody at once', () => {
    const { queue, shown } = setup();
    queue.occupy({ kaname: AWAY_MS });
    queue.push([{ text: 'notice', event: null }]);
    expect(shown.map((s) => s.at)).toEqual([0]);
    queue.dispose();
  });

  it('makes the next message wait longer than the hold when she is away past it', async () => {
    const { queue, shown } = setup();
    queue.push([
      { text: 'notice', event: null },
      { text: 'scroll', event: scroll },
    ]);
    queue.occupy({ kaname: HOLD_MS + 2_000 });
    await vi.advanceTimersByTimeAsync(HOLD_MS + 2_000);
    expect(shown.map((s) => s.at)).toEqual([0, HOLD_MS + 2_000]);
    queue.dispose();
  });

  it('does not wait for her without a stage, or while the canvas is out of sight', () => {
    for (const hidden of [true, false]) {
      const { queue, shown } = setup(hidden ? NO_RECALL : null);
      if (hidden) queue.setStageShown(false);
      queue.occupy({ kaname: AWAY_MS });
      queue.push([{ text: 'scroll', event: scroll }]);
      expect(shown.map((s) => s.at)).toEqual([0]);
      queue.dispose();
    }
  });
});
