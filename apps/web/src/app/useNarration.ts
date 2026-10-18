import type { Snapshot } from '@conect-guild/snapshot';
import { documentVisibility } from '../adapters/visibility';
import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue';
import { dayPhaseOf, hourFromQuery, hourOf } from '../render/daylight';
import { createIdleSeeds, idleActivities, type IdleSeeds, type IdleSince } from '../render/idle';
import type { PartyRow } from './guildView';
import type { GuildMessage } from './messageQueue';
import { narrationPools, pickNarration, type NarrationPools } from './narration';
import { createNarrator, NARRATION_INTERVAL_MS, type Narration } from './narrator';
import { globalScheduler, type Scheduler } from './scheduler';
import type { Random } from '../render/confetti';
import {
  examineLineFor,
  withoutLine,
  type ExamineMoment,
  type PressLines,
} from '../render/examine';

export interface NarrationSources {
  /** The head of the message queue: while there is one, it is shown instead of the narration. */
  readonly message: Readonly<Ref<GuildMessage | null>>;
  readonly party: Readonly<Ref<readonly PartyRow[]>>;
  readonly snapshot: () => Pick<Snapshot, 'issues' | 'prs' | 'president'> | null;
  /** The ▼ button while an event message is shown. */
  readonly nextMessage: () => void;
  /** The screen is halted: the window is not shown, so the narration waits (reactive). */
  readonly halted: () => boolean;
}

const NOTHING: NarrationPools = { scene: [], time: [], record: [] };

/** Dev only: `?hour=21.5` fixes the time of day, as on the canvas (render/daylight.ts). */
function fixedHour(): number | null {
  return import.meta.env.DEV ? hourFromQuery(globalThis.location.search) : null;
}

export interface NarrationClock {
  readonly scheduler: Scheduler;
  readonly random: Random;
  /** Epoch ms. */
  readonly now: () => number;
  /** The local time of day, 0 to 24. */
  readonly hour: (now: number) => number;
}

const BROWSER_CLOCK: NarrationClock = {
  scheduler: globalScheduler,
  random: Math.random,
  now: Date.now,
  hour: (now) => fixedHour() ?? hourOf(new Date(now)),
};

/** Every line the window may tell now; nothing before the first snapshot. */
function poolsNow(
  sources: Pick<NarrationSources, 'snapshot' | 'party'>,
  idle: { readonly since: IdleSince; readonly seeds: IdleSeeds },
  clock: Pick<NarrationClock, 'now' | 'hour'>,
): NarrationPools {
  const snapshot = sources.snapshot();
  if (snapshot === null) return NOTHING;
  const now = clock.now();
  return narrationPools({
    party: sources.party.value,
    activities: idleActivities(idle.since, idle.seeds, now),
    phase: dayPhaseOf(clock.hour(now)),
    snapshot,
    now,
  });
}

/** The window when a thing of the room is pressed (Issue #190). */
function examineMoment(sources: NarrationSources): ExamineMoment {
  return {
    halted: sources.halted(),
    known: sources.snapshot() !== null,
    messageShown: sources.message.value !== null,
  };
}

/**
 * The narration bound to the screen, without the component's lifetime (useNarration adds it):
 * call start() once mounted and stop() when unmounted. Watchers follow the current effect scope.
 */
export function bindNarration(sources: NarrationSources, clock: NarrationClock = BROWSER_CLOCK) {
  const narration = shallowRef<Narration | null>(null);
  // The canvas's idle spells: the same salts, and the idle times it reports (GuildCanvas), so the
  // narration tells the outings the canvas shows. Empty until it reports: everybody is awake.
  const idleSeeds = createIdleSeeds(clock.random);
  let idleSince: IdleSince = {};

  const narrator = createNarrator({
    scheduler: clock.scheduler,
    now: clock.now,
    intervalMs: NARRATION_INTERVAL_MS,
    compose: (previous) =>
      pickNarration(
        poolsNow(sources, { since: idleSince, seeds: idleSeeds }, clock),
        previous,
        clock.random,
      ),
    publish: (next) => {
      narration.value = next;
    },
  });

  // The interval stops while the window cannot be seen, as the event messages do (narrow screens
  // still show the window, so they do not stop it).
  let hidden = false;
  const syncPaused = () => {
    narrator.setPaused(hidden || sources.halted());
  };
  watch(sources.halted, syncPaused);
  // The first snapshot: tell something at once instead of after a whole interval.
  watch(sources.party, () => {
    narrator.wake();
  });
  // The event messages are over: back to the narration with a fresh line.
  watch(
    () => sources.message.value === null,
    (empty) => {
      if (empty) narrator.next();
    },
  );

  return {
    narration,
    idleSeeds,
    setIdleSince: (since: IdleSince) => {
      idleSince = since;
    },
    /**
     * A thing of the room pressed (Issue #190), telling `lines` (examine.pressLinesOf; the month's
     * ornament too, Issue #192): what was found in it takes the narration's place
     * for a whole interval. Dropped while an event's message is in the window (the events come
     * first), while halted and before the first snapshot (examine.examineLineFor). The reward on a
     * desk (Issue #213) never tells the line in the window again (examine.withoutLine).
     */
    examine: (lines: PressLines) => {
      const pool = withoutLine(lines, narration.value?.text ?? null);
      const line = examineLineFor(examineMoment(sources), pool, clock.random);
      if (line !== null) narrator.say(line);
    },
    /** The ▼ button: the next event message while there is one, else the next narration. */
    next: () => {
      if (sources.message.value === null) narrator.next();
      else sources.nextMessage();
    },
    /** The page is hidden (or shown again). */
    setHidden: (next: boolean) => {
      hidden = next;
      syncPaused();
    },
    start: () => {
      syncPaused();
      narrator.next();
    },
    stop: () => {
      narrator.stop();
    },
  };
}

/**
 * The message window's narration while no event message is shown (Issue #30): a new line every
 * NARRATION_INTERVAL_MS, at once when the event messages are over, and on ▼. It never rings: the
 * sound effects follow the message queue only (useSound).
 */
export function useNarration(sources: NarrationSources) {
  const { start, stop, setHidden, ...binding } = bindNarration(sources);
  // The same signal stops the message queue and the canvas (useGuild, render/loop.ts).
  const syncHidden = () => {
    setHidden(documentVisibility.isHidden());
  };
  let unsubscribe: (() => void) | null = null;
  onMounted(() => {
    syncHidden();
    unsubscribe = documentVisibility.subscribe(syncHidden);
    start();
  });
  onBeforeUnmount(() => {
    unsubscribe?.();
    stop();
  });
  return binding;
}
