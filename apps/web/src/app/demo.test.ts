import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSoundSettings } from '../audio/settings';
import { DEMO_LOOP_MS } from '../domain/demo';
import { createDemoSession, DEMO_REFRESH_INTERVAL_MS, demoBlock, isDemoQuery } from './demo';
import { createGuildStore } from './guildStore';

const START = Date.parse('2026-10-12T03:00:00.000Z');

/** The level-ups of the demo's first loop (domain/demo.ts's made-up past, Issue #19). */
const FIRST_LOOP_LEVEL_UPS = [
  'かなめは レベル 6 に あがった！',
  'みのりは レベル 7 に あがった！',
  'ひらめは レベル 6 に あがった！',
];

describe('isDemoQuery', () => {
  it('is on for demo=1 only', () => {
    expect(isDemoQuery('?demo=1')).toBe(true);
    expect(isDemoQuery('?hour=12&demo=1')).toBe(true);
    expect(isDemoQuery('demo=1')).toBe(true);
    for (const search of ['', '?', '?demo', '?demo=', '?demo=0', '?demo=true', '?demo=11'])
      expect(isDemoQuery(search), search).toBe(false);
  });
});

/** Throws on any use: the demo must not reach localStorage or the network. */
function forbidden(name: string) {
  return vi.fn(() => {
    throw new Error(`${name} was used in the demo`);
  });
}

/** The store as GuildScreen.vue builds it in the demo, the timers faked. */
function setup() {
  const demo = createDemoSession(() => Date.now());
  const store = createGuildStore(demo.guildOptions);
  const heads: string[] = [];
  let lastId = -1;
  const record = () => {
    const head = store.state.messages[0];
    if (head !== undefined && head.id !== lastId) {
      lastId = head.id;
      heads.push(head.text);
    }
  };
  const run = async (ms: number) => {
    for (let t = 0; t < ms; t += 100) {
      await vi.advanceTimersByTimeAsync(100);
      record();
    }
  };
  return { demo, store, heads, run };
}

const fetchSpy = forbidden('fetch');
const storage = {
  getItem: forbidden('getItem'),
  setItem: forbidden('setItem'),
  removeItem: forbidden('removeItem'),
};

describe('demoBlock', () => {
  it('waits for the pictures first, then for the canvas to be on screen', () => {
    expect(demoBlock(false, false)).toBe('loading');
    expect(demoBlock(false, true)).toBe('loading');
    expect(demoBlock(true, false)).toBe('narrow');
    expect(demoBlock(true, true)).toBeNull();
  });
});

describe('the demo session', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('waits at the start (an empty board) until はじめる', async () => {
    const { demo, store, heads, run } = setup();
    store.start();
    await run(20_000);
    expect(demo.started.value).toBe(false);
    expect(store.state.snapshot?.issues).toEqual([]);
    expect(heads).toEqual([]);
    store.stop();
  });

  it('plays the script after はじめる and repeats it every loop, never fetching nor storing', async () => {
    const { demo, store, heads, run } = setup();
    store.start();
    await run(2_000);
    demo.markReady();
    demo.setStageShown(true);
    demo.start();
    await run(2 * DEMO_LOOP_MS);
    // Two loops: six messages each, all from the fictional script, three level-ups in the first
    // (Issue #19) and the king's quest, opened in the first and cleared in the second (Issue #152).
    // They hold the window longer, so the last messages still wait their turn.
    expect(heads).toHaveLength(14);
    expect(heads[0]).toContain('「10 月分の請求書を作る」');
    expect(heads.some((text) => text.includes('クリアした！'))).toBe(true);
    expect(heads.filter((text) => text.includes('あがった！'))).toEqual(FIRST_LOOP_LEVEL_UPS);
    expect(heads[6]).toContain('おうさまに クエスト#101「来年の方針を決める」が とどいた！');
    expect(heads[10]).toContain('「秋の講座の告知文を書く」');
    expect(heads[12]).toBe('おうさまは クエスト#101 を クリアした！');
    expect(store.state.halted).toBe(false);
    expect(store.state.effectsAvailable).toBe(true);
    expect(store.state.summons?.members).toBeDefined();
    // The real data's path is never taken, and nothing is kept in localStorage.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    store.stop();
  });

  it('starts once: a second はじめる does not rewind the script', async () => {
    const { demo, store, heads, run } = setup();
    store.start();
    demo.markReady();
    demo.setStageShown(true);
    demo.start();
    await run(15_000);
    const seen = heads.length;
    demo.start();
    await run(1_000);
    expect(heads.length).toBeGreaterThanOrEqual(seen);
    expect(store.state.snapshot?.issues.length).toBeGreaterThan(0);
    store.stop();
  });
});

describe('the demo, alone', () => {
  it('ignores はじめる until the canvas is ready and on screen, so the first call of the king is not lost', async () => {
    vi.useFakeTimers({ now: START });
    const { demo, store, run } = setup();
    store.start();
    demo.start();
    await run(10_000);
    // The script did not start: no order, no scroll, the button still waits.
    expect(demo.started.value).toBe(false);
    expect(store.state.summons).toBeNull();
    expect(store.state.snapshot?.issues).toEqual([]);

    expect(demo.block.value).toBe('loading');

    // Ready, but the canvas is hidden (a narrow screen): still no start.
    demo.markReady();
    demo.setStageShown(false);
    expect(demo.block.value).toBe('narrow');
    demo.start();
    await run(3_000);
    expect(demo.started.value).toBe(false);
    expect(store.state.summons).toBeNull();

    demo.setStageShown(true);
    expect(demo.block.value).toBeNull();
    demo.start();
    await run(2_000);
    expect(demo.started.value).toBe(true);
    expect(store.state.summons?.members).toEqual(['kaname']);
    store.stop();
    vi.useRealTimers();
  });

  it('reads the script often, so the events follow it closely', async () => {
    vi.useFakeTimers({ now: START });
    const demo = createDemoSession(() => Date.now());
    const load = vi.spyOn(demo.guildOptions, 'loadSnapshot');
    const store = createGuildStore(demo.guildOptions);
    store.start();
    await vi.advanceTimersByTimeAsync(10 * DEMO_REFRESH_INTERVAL_MS);
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(10);
    store.stop();
    vi.useRealTimers();
  });

  it('turns the sound on in memory only', () => {
    vi.stubGlobal('localStorage', storage);
    const demo = createDemoSession(() => Date.now());
    expect(loadSoundSettings(demo.storage)).toEqual({ enabled: true, volume: 2 });
    expect(storage.setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('the automatic demo (Issue #67)', () => {
  it('starts silent, in memory only', () => {
    vi.stubGlobal('localStorage', storage);
    const demo = createDemoSession(() => Date.now(), { auto: true });
    expect(demo.auto).toBe(true);
    expect(loadSoundSettings(demo.storage)).toEqual({ enabled: false, volume: 2 });
    expect(storage.setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('starts by itself once the canvas is ready and on screen, not before', async () => {
    vi.useFakeTimers({ now: START });
    const demo = createDemoSession(() => Date.now(), { auto: true });
    const store = createGuildStore(demo.guildOptions);
    store.start();
    demo.setStageShown(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(demo.started.value).toBe(false);
    // No はじめる: the canvas being ready is enough, and the king's first call is not lost.
    demo.markReady();
    expect(demo.started.value).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.state.summons?.members).toEqual(['kaname']);
    store.stop();
    vi.useRealTimers();
  });

  it('starts on a narrow screen too (the canvas hidden), and the messages go on', async () => {
    vi.useFakeTimers({ now: START });
    const demo = createDemoSession(() => Date.now(), { auto: true });
    const store = createGuildStore(demo.guildOptions);
    store.setStageShown(false);
    store.start();
    demo.setStageShown(false);
    demo.markReady();
    expect(demo.block.value).toBe('narrow');
    expect(demo.started.value).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.state.snapshot?.issues.length).toBeGreaterThan(0);
    expect(store.state.messages[0]?.text).toContain('わたした');
    store.stop();
    vi.useRealTimers();
  });

  it('does not start by itself in the demo of ?demo=1, nor on a narrow screen', () => {
    const demo = createDemoSession(() => Date.now());
    demo.markReady();
    demo.start();
    expect(demo.started.value).toBe(false);
    demo.setStageShown(true);
    expect(demo.auto).toBe(false);
    expect(demo.started.value).toBe(false);
  });
});
