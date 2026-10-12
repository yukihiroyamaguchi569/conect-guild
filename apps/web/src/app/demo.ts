import { computed, shallowRef, type Ref } from 'vue';
import { createKeyValueStore, createMemoryStorage, type KeyValueStore } from '../adapters/storage';
import { SOUND_STORAGE_KEY, type SoundSettings } from '../audio/settings';
import { demoSnapshotAt } from '../domain/demo';
import type { GuildStoreOptions } from './guildStore';

/**
 * The demo mode for filming (Issue #49): `?demo=1` plays the fictional script (domain/demo.ts)
 * instead of reading /snapshot.json. Nothing of it reaches localStorage.
 */

/** True for `?demo=1` in the page's query (like `?hour=`). */
export function isDemoQuery(search: string): boolean {
  return new URLSearchParams(search).get('demo') === '1';
}

/** The demo is local and cheap to read, so it is read often: events follow the script closely. */
export const DEMO_REFRESH_INTERVAL_MS = 1_000;

/** The sound is on in the demo: the はじめる click lets the browser play it (app/useSound.ts). */
const DEMO_SOUND: SoundSettings = { enabled: true, volume: 2 };
/**
 * The automatic demo (Issue #67) starts with no click, and the browser plays no sound before one:
 * it starts silent, and the 音を出す button turns the sound on.
 */
const AUTO_DEMO_SOUND: SoundSettings = { enabled: false, volume: 2 };

export interface DemoSessionOptions {
  /**
   * The automatic demo shown while nothing is collected yet (Issue #67): no はじめる, the script
   * starts by itself, silent, once the canvas is ready, even when it is hidden (narrow screens):
   * the stacked windows still show the messages and the party, and only the unseen scenes are
   * dropped. Filming (`?demo=1`) keeps waiting for a shown canvas.
   */
  readonly auto?: boolean;
}

/**
 * Why はじめる cannot start the script yet: the canvas is still loading its pictures, or it is
 * hidden (narrow screens). Either way the king's call at the script's head would be dropped
 * (calls seen while the stage cannot play them are not kept), with its sound. null: it can start.
 */
export type DemoBlock = 'loading' | 'narrow' | null;

export function demoBlock(ready: boolean, stageShown: boolean): DemoBlock {
  if (!ready) return 'loading';
  return stageShown ? null : 'narrow';
}

export interface DemoSession {
  /** The store reads the script, keeps its baseline in memory and follows the script closely. */
  readonly guildOptions: GuildStoreOptions;
  /** In memory: the sound settings and the idle times of the demo stay in the page. */
  readonly storage: KeyValueStore;
  /** What はじめる waits for (and says so); null once it can start. */
  readonly block: Readonly<Ref<DemoBlock>>;
  /** False until はじめる: the script waits at its start (an empty board). */
  readonly started: Readonly<Ref<boolean>>;
  /**
   * The canvas runs (GuildCanvas `ready`). Before it, the king's call at the script's head would be
   * dropped (calls seen while the pictures load are not kept), with its sound.
   */
  markReady(): void;
  /** Whether the canvas is on screen (GuildCanvas `stageShown`); hidden on narrow screens. */
  setStageShown(shown: boolean): void;
  /** はじめる: the script starts now. Only the first call with no block counts; else nothing. */
  start(): void;
  /** The automatic demo (Issue #67): no はじめる window, the script starts by itself. */
  readonly auto: boolean;
}

export function createDemoSession(
  now: () => number = Date.now,
  options: DemoSessionOptions = {},
): DemoSession {
  const auto = options.auto ?? false;
  const memory = createMemoryStorage();
  const storage = createKeyValueStore(() => memory);
  storage.write(SOUND_STORAGE_KEY, auto ? AUTO_DEMO_SOUND : DEMO_SOUND);
  const ready = shallowRef(false);
  // Unknown until the canvas measures itself: counted as hidden until then.
  const stageShown = shallowRef(false);
  const block = computed(() => demoBlock(ready.value, stageShown.value));
  const started = shallowRef(false);
  let startedAt: number | null = null;
  function begin(): void {
    if (startedAt !== null) return;
    startedAt = now();
    started.value = true;
  }
  return {
    guildOptions: {
      loadSnapshot: () => {
        const at = now();
        const snapshot = demoSnapshotAt(startedAt === null ? 0 : at - startedAt, at);
        return Promise.resolve({ ok: true, snapshot });
      },
      storage,
      now,
      refreshIntervalMs: DEMO_REFRESH_INTERVAL_MS,
    },
    storage,
    block,
    started,
    markReady() {
      ready.value = true;
      if (auto) begin();
    },
    setStageShown(shown) {
      stageShown.value = shown;
    },
    start() {
      if (block.value === null) begin();
    },
    auto,
  };
}
