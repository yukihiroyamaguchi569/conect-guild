import type { Snapshot } from '@conect-guild/snapshot';
import { GUILD_SETTINGS, type GuildGuest } from '@conect-guild/snapshot/settings';
import { shallowReactive, type Ref } from 'vue';
import { z } from 'zod';
import {
  defaultExpectedRepo,
  loadSnapshot,
  type SnapshotLoadFailure,
  type SnapshotLoadResult,
} from '../adapters/snapshot';
import { createKeyValueStore, type KeyValueStore } from '../adapters/storage';
import { parseBaseline } from '../domain/baseline';
import type { KeptReward } from '../domain/dailyReward';
import { diffSnapshot } from '../domain/events';
import { guestEventMessage, guestEvents, type GuestBaseline } from '../domain/guests';
import { maskTitle } from '../domain/mask';
import { diffEntries, type MessageEntry } from '../domain/message';
import {
  comparedReading,
  lastKanameWork,
  readSessions,
  summonedMembers,
  summonsFrom,
  type SessionReading,
  type SummonsFrom,
} from '../domain/summons';
import { EVENT_GAP_LIMIT_MS, KING_QUESTS_ENABLED, type MemberId } from '../guild.config';
import {
  createMessageQueue,
  type GuildMessage,
  type MessageQueue,
  type StageRecall,
} from './messageQueue';
import type { HomeIn } from '../render/idleCrew';
import { createRewardWatch } from './rewardWatch';
import { globalScheduler, type Cancel, type Scheduler } from './scheduler';

export type { GuildMessage } from './messageQueue';

/** localStorage key of the diff baseline (numbers, states and times only). */
export const BASELINE_STORAGE_KEY = 'conect-guild:baseline';
/**
 * The collector rewrites the snapshot every 5 seconds (the session states; GitHub every 60).
 * The fetch is local and no-store, so following it closely is cheap.
 */
export const REFRESH_INTERVAL_MS = 5_000;
/**
 * How long a message stays at least before the next queued one replaces it; longer when the next
 * one's scene has to wait for its cast (app/messageQueue.ts). The last one stays.
 */
export const MESSAGE_HOLD_MS = 8_000;
/** How long the last message stays before the window goes back to the narration (Issue #30). */
const MESSAGE_LAST_HOLD_MS = 30_000;

export interface GuildState {
  /** The last successfully loaded snapshot; kept when later fetches fail. */
  snapshot: Snapshot | null;
  /** Failure of the latest fetch; null after a success. */
  failure: SnapshotLoadFailure | null;
  /**
   * True after a schema-version or repo-mismatch failure: the screen stops and asks to update the
   * collector, or to wait for it to collect the repository in guild.settings.json.
   */
  halted: boolean;
  /** Why the screen is halted; null while it is not. */
  haltReason: HaltReason | null;
  /** False when localStorage cannot be read or written: the screen goes on without events. */
  effectsAvailable: boolean;
  /** Epoch ms of the latest finished fetch (success or failure). */
  checkedAt: number | null;
  /**
   * Message window queue; the head is on screen. Each new event of a fetch arrives here once, on
   * its message, and its scene plays when that message reaches the head.
   */
  messages: readonly GuildMessage[];
  /** Result of the last "基準を消す". */
  baselineNotice: string | null;
  /** The latest order of the president (Issue #28); null until the first one. */
  summons: Summons | null;
  /** The last session reading, which the next one is compared with; null after a halt. */
  sessionReading: SessionReading | null;
  /** When かなめ was last seen working (Issue #155), kept and forgotten with the reading. */
  kanameWorkedAt: number | null;
}

/**
 * Sessions that went from waiting to working in one fetch: the king calls them (Issue #28).
 * A new id for every fetch that finds some, so the canvas and the sound take each one once.
 */
export interface Summons {
  readonly id: number;
  readonly members: readonly MemberId[];
  /** The king, or かなめ handing work on to departments (Issue #155). */
  readonly from: SummonsFrom;
}

export type HaltReason = Extract<SnapshotLoadFailure, 'schema-version' | 'repo-mismatch'>;

function haltReasonOf(reason: SnapshotLoadFailure): HaltReason | null {
  return reason === 'schema-version' || reason === 'repo-mismatch' ? reason : null;
}

export interface GuildStoreOptions {
  readonly loadSnapshot?: () => Promise<SnapshotLoadResult>;
  readonly storage?: KeyValueStore;
  readonly now?: () => number;
  readonly scheduler?: Scheduler;
  readonly refreshIntervalMs?: number;
  readonly messageHoldMs?: number;
  /**
   * The read of /snapshot.json that ended the automatic demo (Issue #67): the first refresh applies
   * it instead of loading again, so the error or the snapshot that ended the demo is what shows.
   */
  readonly firstResult?: SnapshotLoadResult;
  /**
   * The first snapshot replaces the stored baseline without a diff, so no events (Issue #67: after
   * the automatic demo, an old baseline would bring a burst of them). Failures before it leave the
   * stored baseline as it is.
   */
  readonly freshBaseline?: boolean;
  /** The settings' guests (Issue #108); defaults to those of the settings in use. */
  readonly guests?: readonly GuildGuest[];
  /**
   * Whether the king's quests are told (Issue #141); defaults to whether the settings have
   * `president`. The demo turns them on for its fictional quests (Issue #152).
   */
  readonly kingQuests?: boolean;
}

export interface GuildStore {
  readonly state: Readonly<GuildState>;
  /** The guests the screen shows (GuildStoreOptions.guests). */
  readonly guests: readonly GuildGuest[];
  /** Whether the king's quests show (GuildStoreOptions.kingQuests). */
  readonly kingQuests: boolean;
  /** The king's reward of the day on a desk (Issue #194, app/rewardWatch.ts). */
  readonly reward: Readonly<Ref<KeptReward | null>>;
  /** Loads once now, then every refresh interval. */
  start(): void;
  /** Stops all timers; results of a fetch still in flight are dropped. */
  stop(): void;
  /** Fetches once. Skipped while another fetch is in flight. */
  refresh(): Promise<void>;
  /** The ▼ button: skips the rest of the hold (the next message still waits for its scene). */
  nextMessage(): void;
  /** Stops the messages (and the scenes they start) while the page is hidden. */
  setHidden(hidden: boolean): void;
  /** Whether the canvas is on screen; while it is not, messages do not wait for scenes. */
  setStageShown(shown: boolean): void;
  /** The canvas's stage once it runs (null when it stops): a level-up's member walks back first. */
  setStage(stage: StageRecall | null): void;
  /** Members away from their seat for `homeIn` (MessageQueue.occupy, Issues #87 and #224). */
  occupy(homeIn: HomeIn): void;
  /** Removes the stored baseline; the next fetch counts as the first one (no events). */
  clearBaseline(): void;
}

interface SyncOutcome {
  readonly effectsAvailable: boolean;
  readonly entries: readonly MessageEntry[];
}

/**
 * Diffs against the stored baseline and stores the new one (docs/DESIGN.md 4.4).
 * Without a working localStorage there are no events, so nothing is replayed on every fetch.
 */
function syncBaseline(
  storage: KeyValueStore,
  snapshot: Snapshot,
  options: { readonly fresh: boolean; readonly kingQuests: boolean },
): SyncOutcome {
  const { fresh, kingQuests } = options;
  const stored = storage.read(BASELINE_STORAGE_KEY, z.unknown());
  if (!stored.ok && stored.reason === 'unavailable')
    return { effectsAvailable: false, entries: [] };
  // A fresh start counts as the first fetch: no events, only the new baseline.
  const baseline = stored.ok && !fresh ? parseBaseline(stored.value) : null;
  const diff = diffSnapshot(baseline, snapshot, EVENT_GAP_LIMIT_MS, kingQuests);
  if (diff.baselineUpdate.action === 'replace') {
    const written = storage.write(BASELINE_STORAGE_KEY, diff.baselineUpdate.baseline);
    if (!written.ok) return { effectsAvailable: false, entries: [] };
  }
  return { effectsAvailable: true, entries: diffEntries(diff, snapshot) };
}

function initialState(): GuildState {
  return {
    snapshot: null,
    failure: null,
    halted: false,
    haltReason: null,
    effectsAvailable: true,
    checkedAt: null,
    messages: [],
    baselineNotice: null,
    summons: null,
    sessionReading: null,
    kanameWorkedAt: null,
  };
}

/**
 * Compares the session reading of a fetch with the last one and publishes the president's
 * orders (Issue #28). A halt forgets the reading, so the first one after it only starts over.
 */
function noteSessions(state: GuildState, result: SnapshotLoadResult, now: number): void {
  if (!result.ok) {
    if (state.halted) {
      state.sessionReading = null;
      state.kanameWorkedAt = null;
    }
    return;
  }
  const next = readSessions(result.snapshot.sessions, now);
  const members = summonedMembers(state.sessionReading, next);
  state.kanameWorkedAt = lastKanameWork(state.kanameWorkedAt, state.sessionReading, next);
  state.sessionReading = comparedReading(state.sessionReading, next);
  if (members.length === 0 || next === null) return;
  const from = summonsFrom(members, state.kanameWorkedAt, next.checkedAt);
  state.summons = { id: (state.summons?.id ?? 0) + 1, members, from };
}

/**
 * Applies one fetch result, finished at `now` (epoch ms). Returns the messages (with their events)
 * to queue.
 */
function applyResult(
  state: GuildState,
  storage: KeyValueStore,
  result: SnapshotLoadResult,
  at: {
    readonly now: number;
    readonly fresh: { pending: boolean };
    readonly kingQuests: boolean;
  },
): readonly MessageEntry[] {
  const { now, fresh, kingQuests } = at;
  if (!result.ok) {
    state.failure = result.reason;
    // Once halted, only a snapshot of the expected version and repository resumes the screen.
    state.haltReason = haltReasonOf(result.reason) ?? state.haltReason;
    state.halted = state.haltReason !== null;
    noteSessions(state, result, now);
    return [];
  }
  state.snapshot = result.snapshot;
  state.failure = null;
  state.halted = false;
  state.haltReason = null;
  noteSessions(state, result, now);
  const outcome = syncBaseline(storage, result.snapshot, { fresh: fresh.pending, kingQuests });
  // Fresh until the new baseline is really stored (localStorage may fail for a while).
  if (outcome.effectsAvailable) fresh.pending = false;
  state.effectsAvailable = outcome.effectsAvailable;
  return outcome.entries;
}

/**
 * The guests' finished PRs and Issues since the last snapshot, as message lines (Issue #108). What
 * was seen is kept in memory only, so the first snapshot after a load brings none. Parts beyond
 * the settings' guests (the build's sample, which is not checked against them) are not read.
 */
function createGuestWatch(guests: readonly GuildGuest[]): (snapshot: Snapshot) => MessageEntry[] {
  let seen: GuestBaseline | null = null;
  return (snapshot) => {
    const { events, baseline } = guestEvents(seen, snapshot.guests.slice(0, guests.length));
    seen = baseline;
    return events.map((event) => {
      const name = guests[event.guest]?.name ?? '';
      return {
        text: guestEventMessage(event, name),
        maskedText: guestEventMessage(event, name, maskTitle),
        event: null,
        guest: event.guest,
      };
    });
  };
}

/** The message queue that publishes into `state.messages`. */
function queueInto(
  state: GuildState,
  options: { scheduler: Scheduler; now: () => number; holdMs: number | undefined },
): MessageQueue {
  return createMessageQueue({
    scheduler: options.scheduler,
    now: options.now,
    holdMs: options.holdMs ?? MESSAGE_HOLD_MS,
    lastHoldMs: MESSAGE_LAST_HOLD_MS,
    publish: (list) => {
      state.messages = list;
    },
  });
}

/** "基準を消す": the next fetch counts as the first one; the result is noted for the window. */
function clearStoredBaseline(state: GuildState, storage: KeyValueStore): void {
  const removed = storage.remove(BASELINE_STORAGE_KEY);
  state.baselineNotice = removed.ok
    ? '基準を消しました'
    : '基準を消せませんでした（localStorage が使えません）';
}

/** Loads with `load`, after handing out `first` once when given (Issue #67). */
function handedFirst(
  load: () => Promise<SnapshotLoadResult>,
  first: SnapshotLoadResult | undefined,
): () => Promise<SnapshotLoadResult> {
  let handed = first ?? null;
  return () => {
    const result = handed;
    handed = null;
    return result === null ? load() : Promise.resolve(result);
  };
}

/** The store's loads; after the automatic demo (Issue #67) the read that ended it comes first. */
function loaderOf(options: GuildStoreOptions): () => Promise<SnapshotLoadResult> {
  return handedFirst(
    options.loadSnapshot ?? (() => loadSnapshot({ expectedRepo: defaultExpectedRepo() })),
    options.firstResult,
  );
}

/** What the store passes on to its message queue. */
function queueControls(
  queue: MessageQueue,
): Pick<GuildStore, 'nextMessage' | 'setHidden' | 'setStageShown' | 'setStage' | 'occupy'> {
  return {
    nextMessage() {
      queue.next();
    },
    setHidden(hidden) {
      queue.setHidden(hidden);
    },
    setStageShown(shown) {
      queue.setStageShown(shown);
    },
    setStage(stage) {
      queue.setStage(stage);
    },
    occupy(homeIn) {
      queue.occupy(homeIn);
    },
  };
}

export function createGuildStore(options: GuildStoreOptions = {}): GuildStore {
  const storage = options.storage ?? createKeyValueStore();
  const load = loaderOf(options);
  // Until the first snapshot is applied (Issue #67).
  const fresh = { pending: options.freshBaseline === true };
  const now = options.now ?? Date.now;
  const scheduler = options.scheduler ?? globalScheduler;
  const state = shallowReactive<GuildState>(initialState());
  const queue = queueInto(state, { scheduler, now, holdMs: options.messageHoldMs });
  const guests = options.guests ?? GUILD_SETTINGS.guests ?? [];
  const kingQuests = options.kingQuests ?? KING_QUESTS_ENABLED;
  const watchGuests = createGuestWatch(guests);
  const rewards = createRewardWatch(storage, now());
  let cancelRefresh: Cancel | null = null;
  let inFlight = false;
  // Bumped by stop(), so a fetch that started before it cannot touch the state.
  let generation = 0;

  async function refresh(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    const started = generation;
    try {
      const result = await load();
      if (started !== generation) return;
      state.checkedAt = now();
      const entries = applyResult(state, storage, result, { now: now(), fresh, kingQuests });
      const guestEntries = result.ok ? watchGuests(result.snapshot) : [];
      const rewardEntries = result.ok ? rewards.observe(result.snapshot, now()) : [];
      // While halted the window is hidden: hold the messages (and their scenes) until it is back.
      if (state.halted) queue.pause();
      else queue.resume();
      queue.push([...entries, ...guestEntries, ...rewardEntries]);
    } finally {
      inFlight = false;
    }
  }

  return {
    state,
    guests,
    kingQuests,
    reward: rewards.reward,
    start() {
      if (cancelRefresh !== null) return;
      cancelRefresh = scheduler.every(options.refreshIntervalMs ?? REFRESH_INTERVAL_MS, () => {
        void refresh();
      });
      void refresh();
    },
    stop() {
      generation += 1;
      cancelRefresh?.();
      cancelRefresh = null;
      queue.dispose();
    },
    refresh,
    ...queueControls(queue),
    clearBaseline() {
      clearStoredBaseline(state, storage);
    },
  };
}
