import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNarrator, type Narration } from './narrator';
import { globalScheduler } from './scheduler';

const INTERVAL = 20_000;

function setup(lines: (string | null)[]) {
  const published: (Narration | null)[] = [];
  const previous: (string | null)[] = [];
  let i = 0;
  const narrator = createNarrator({
    scheduler: globalScheduler,
    now: Date.now,
    intervalMs: INTERVAL,
    compose: (prev) => {
      previous.push(prev);
      return lines[Math.min(i++, lines.length - 1)] ?? null;
    },
    publish: (n) => published.push(n),
  });
  return { narrator, published, previous };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('narrator', () => {
  it('tells a line at once on next(), then one every interval', async () => {
    const { narrator, published, previous } = setup(['a', 'b', 'c']);
    narrator.next();
    expect(published.map((n) => n?.text)).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(published).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(published.map((n) => n?.text)).toEqual(['a', 'b', 'c']);
    // compose hears the line on screen, so it can avoid telling it again.
    expect(previous).toEqual([null, 'a', 'b']);
    narrator.stop();
  });

  it('gives every line a new id (a new line types in again)', () => {
    const { narrator, published } = setup(['a', 'b']);
    narrator.next();
    narrator.next();
    expect(published.map((n) => n?.id)).toEqual([1, 2]);
    narrator.stop();
  });

  it('restarts the interval on next() (the ▼ button)', async () => {
    const { narrator, published } = setup(['a', 'b', 'c']);
    narrator.next();
    await vi.advanceTimersByTimeAsync(INTERVAL - 1_000);
    narrator.next();
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(published).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(published).toHaveLength(3);
    narrator.stop();
  });

  it('wakes only when nothing is told', () => {
    const { narrator, published } = setup([null, 'a', 'b']);
    narrator.next();
    expect(published).toEqual([null]);
    narrator.wake();
    expect(published.map((n) => n?.text)).toEqual([undefined, 'a']);
    narrator.wake();
    expect(published).toHaveLength(2);
    narrator.stop();
  });

  it('tells nothing after stop()', async () => {
    const { narrator, published } = setup(['a', 'b']);
    narrator.next();
    narrator.stop();
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(published).toHaveLength(1);
  });
});

describe('narrator: paused while the window cannot be seen', () => {
  it('stops the interval while paused and keeps the rest of it', async () => {
    const { narrator, published } = setup(['a', 'b', 'c']);
    narrator.next();
    await vi.advanceTimersByTimeAsync(5_000);
    narrator.setPaused(true);
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    expect(published).toHaveLength(1);
    narrator.setPaused(false);
    await vi.advanceTimersByTimeAsync(INTERVAL - 5_000 - 1);
    expect(published).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(published.map((n) => n?.text)).toEqual(['a', 'b']);
    // Then a whole interval again.
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(published).toHaveLength(3);
    narrator.stop();
  });

  it('keeps the rest over several pauses, and ignores repeated ones', async () => {
    const { narrator, published } = setup(['a', 'b']);
    narrator.next();
    for (let i = 0; i < 4; i += 1) {
      await vi.advanceTimersByTimeAsync(4_000);
      narrator.setPaused(true);
      narrator.setPaused(true);
      await vi.advanceTimersByTimeAsync(60_000);
      narrator.setPaused(false);
      narrator.setPaused(false);
    }
    expect(published).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(INTERVAL - 16_000);
    expect(published).toHaveLength(2);
    narrator.stop();
  });

  it('tells at once on next() while paused, and counts a whole interval from the resume', async () => {
    const { narrator, published } = setup(['a', 'b', 'c']);
    narrator.setPaused(true);
    narrator.next();
    expect(published).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(published).toHaveLength(1);
    narrator.setPaused(false);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(published).toHaveLength(2);
    narrator.stop();
  });

  it('does not start again after stop(), even when unpaused', async () => {
    const { narrator, published } = setup(['a', 'b']);
    narrator.next();
    narrator.setPaused(true);
    narrator.stop();
    narrator.setPaused(false);
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(published).toHaveLength(1);
  });
});

describe('narrator: a given line (Issue #190)', () => {
  it('says a given line at once, with a new id, and counts a whole interval from it', async () => {
    const { narrator, published, previous } = setup(['a', 'b']);
    narrator.next();
    await vi.advanceTimersByTimeAsync(INTERVAL - 1_000);
    narrator.say('x');
    expect(published.map((n) => n?.text)).toEqual(['a', 'x']);
    expect(published.map((n) => n?.id)).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(published).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(published.map((n) => n?.text)).toEqual(['a', 'x', 'b']);
    // compose hears the line said, as any line on screen.
    expect(previous).toEqual([null, 'x']);
    narrator.stop();
  });

  it('says a line while paused, and counts a whole interval from the resume', async () => {
    const { narrator, published } = setup(['a', 'b']);
    narrator.next();
    narrator.setPaused(true);
    narrator.say('x');
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(published.map((n) => n?.text)).toEqual(['a', 'x']);
    narrator.setPaused(false);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(published.map((n) => n?.text)).toEqual(['a', 'x', 'b']);
    narrator.stop();
  });
});
