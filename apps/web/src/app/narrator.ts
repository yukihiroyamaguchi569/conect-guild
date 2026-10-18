import type { Cancel, Scheduler } from './scheduler';

/** How often the narration changes while no event is told (Issue #30). */
export const NARRATION_INTERVAL_MS = 20_000;

export interface Narration {
  /** Unique within the narrator's lifetime (the Vue key, so a new line types in again). */
  readonly id: number;
  readonly text: string;
}

export interface NarratorOptions {
  readonly scheduler: Scheduler;
  /** Wall time in ms, to keep the rest of the interval over a pause. */
  readonly now: () => number;
  readonly intervalMs: number;
  /** The next line after `previous` (app/narration.ts pickNarration); null when nothing to tell. */
  readonly compose: (previous: string | null) => string | null;
  readonly publish: (narration: Narration | null) => void;
}

export interface Narrator {
  /** Tells a new line now and starts the interval over. */
  next(): void;
  /** Tells `text` now instead of a composed line (a thing examined, Issue #190); as next(). */
  say(text: string): void;
  /** Tells a line now if none is shown (e.g. the first snapshot came); else does nothing. */
  wake(): void;
  /**
   * Stops the interval while the window cannot be seen (hidden page, halted screen), as the event
   * messages stop theirs; once it can, the rest of the interval goes on.
   */
  setPaused(paused: boolean): void;
  stop(): void;
}

/**
 * The narration's timer: a new line every `intervalMs` while not paused, or at once on next() (the
 * ▼ button, or the window coming back from the event messages). The lines come from `compose`.
 */
export function createNarrator(options: NarratorOptions): Narrator {
  const { scheduler, now, intervalMs, compose, publish } = options;
  let current: Narration | null = null;
  let nextId = 1;
  let cancel: Cancel | null = null;
  let paused = false;
  let stopped = false;
  /** Ms until the next line: counts down only while not paused. */
  let remaining = intervalMs;
  /** When the running timer started counting `remaining` down; null while none runs. */
  let armedAt: number | null = null;

  function show(text: string | null): void {
    current = text === null ? null : { id: nextId++, text };
    publish(current);
  }

  function tell(): void {
    show(compose(current?.text ?? null));
  }

  function disarm(): void {
    cancel?.();
    cancel = null;
    if (armedAt !== null) remaining = Math.max(remaining - (now() - armedAt), 0);
    armedAt = null;
  }

  function arm(): void {
    if (paused || stopped) return;
    armedAt = now();
    cancel = scheduler.after(remaining, () => {
      cancel = null;
      armedAt = null;
      tell();
      remaining = intervalMs;
      arm();
    });
  }

  /** Shows `text` now and starts the interval over. */
  function restart(text: string | null): void {
    disarm();
    show(text);
    remaining = intervalMs;
    arm();
  }

  function next(): void {
    restart(compose(current?.text ?? null));
  }

  return {
    next,
    say: restart,
    wake() {
      if (current === null) next();
    },
    setPaused(nextPaused) {
      if (nextPaused === paused) return;
      disarm();
      paused = nextPaused;
      arm();
    },
    stop() {
      stopped = true;
      disarm();
    },
  };
}
