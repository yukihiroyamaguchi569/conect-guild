import type { GuildEvent } from '../domain/events';
import type { MessageEntry } from '../domain/message';
import { RUNNING_CLOCK, stageTime, withPaused, type StageClock } from '../render/clock';
import {
  castFreeAt,
  EMPTY_DIRECTOR,
  prune,
  scheduleEvent,
  type Director,
} from '../render/director';
import type { HomeIn } from '../render/idleCrew';
import { actorOf, DEFAULT_SEATS } from '../render/scenes';
import { memberIdSchema } from '@conect-guild/snapshot/settings';
import type { MemberId } from '../guild.config';
import type { Cancel, Scheduler } from './scheduler';

export interface GuildMessage {
  /** Unique within the queue's lifetime (used as the Vue key). */
  readonly id: number;
  readonly text: string;
  /** `text` with its title masked, for the show mode (Issue #144; MessageEntry.maskedText). */
  readonly maskedText?: string;
  /** The event this line reports; its scene starts when the line reaches the window. */
  readonly event: GuildEvent | null;
  /** The guest whose PR or Issue this line reports: it sparkles when the line shows (Issue #108). */
  readonly guest?: number;
  /** Epoch ms from which the line is dropped unshown (MessageEntry.until). */
  readonly until?: number;
}

export interface MessageQueue {
  push(entries: readonly MessageEntry[]): void;
  /**
   * The ▼ button: skips the rest of the head's hold. The next message still waits until its scene
   * can start (the press is kept until then); without one, the head goes away at once.
   */
  next(): void;
  /** Cancels the hold timer. */
  dispose(): void;
  /** Holds the head message (no timer) until resume(), e.g. while the screen is halted. */
  pause(): void;
  resume(): void;
  /**
   * Stops the queue's clock while the page is hidden, as the canvas stops its own (render/loop.ts),
   * so the hold and the scenes go on together from where they were once it is shown again.
   */
  setHidden(hidden: boolean): void;
  /**
   * Whether the canvas is on screen (narrow screens hide it). While it is not, no scenes are kept
   * and nobody waits for them: messages go on every `holdMs`, as the canvas drops those scenes too.
   */
  setStageShown(shown: boolean): void;
  /** The canvas's stage once it runs (null before and after): it calls members back to their seat. */
  setStage(stage: StageRecall | null): void;
  /**
   * Members away from their seat on the stage for a while (`homeIn`, stage ms from now): かなめ
   * hearing the king's order at the throne (Issue #87), or a scene's cast walking back from a
   * gathering before it starts (Issue #224). The next scenes that need them wait.
   */
  occupy(homeIn: HomeIn): void;
}

/**
 * What the queue asks of the canvas (render/loop.ts RenderLoop.recall): call members out playing
 * back to their seat now, and say how long until each is free there (ms on the stage's clock,
 * which stops with the queue's while the page is hidden).
 */
export interface StageRecall {
  recall(members: readonly MemberId[]): HomeIn;
}

export interface MessageQueueOptions {
  readonly scheduler: Scheduler;
  /** Wall time in ms. */
  readonly now: () => number;
  /** How long a message stays at least before the next one replaces it. */
  readonly holdMs: number;
  /** How long the last message stays before it closes by itself (the window goes back to the narration). */
  readonly lastHoldMs: number;
  readonly publish: (messages: readonly GuildMessage[]) => void;
}

/**
 * Only the timing of the scenes matters here; the random numbers shape confetti, not its time.
 * With no source for tosses (render/toss.ts) the queue always counts the walk: a toss ends sooner,
 * so whichever the canvas plays, its cast is free by then and the next scene starts with its message.
 */
const PACING_CONTEXT = { seats: DEFAULT_SEATS, random: () => 0 };

/**
 * When the message after the head may take its place: once the head has stayed its hold (until
 * `holdEnd`), and once the cast of the next message's scene is free, so that scene starts the
 * moment its message shows (docs/DESIGN.md chapter 6 M2). `director` holds the scenes started so
 * far, on the queue's clock.
 */
function nextShowAt(
  director: Director,
  holdEnd: number,
  next: Pick<GuildMessage, 'event'>,
): number {
  return next.event === null ? holdEnd : castFreeAt(director, next.event, holdEnd);
}

/**
 * Members a level-up message will need at their seat (Issue #19). They are called back as soon as
 * it is queued, and the message waits until they are there, so the message, its sound and the
 * hops start together. Other scenes keep starting with their message (their walk back comes
 * after it, docs/DESIGN.md 8 章 #23).
 */
function levelUpCast(messages: readonly GuildMessage[]): MemberId[] {
  return messages.flatMap((m) => (m.event?.kind === 'level-up' ? [actorOf(m.event)] : []));
}

/** The scenes with each member busy until they are back at their seat (`homeIn` from `t`). */
function withReturns(director: Director, homeIn: HomeIn, t: number): Director {
  const busyUntil = { ...director.busyUntil };
  for (const id of memberIdSchema.options) {
    const ms = homeIn[id];
    if (ms !== undefined) busyUntil[id] = Math.max(busyUntil[id] ?? t, t + ms);
  }
  return { ...director, busyUntil };
}

/** The scenes once `head` reaches the window at `t`: the canvas starts its scene then. */
function withHeadScene(director: Director, head: GuildMessage, t: number): Director {
  if (head.event === null) return director;
  return scheduleEvent(prune(director, t), head.event, t, PACING_CONTEXT);
}

/**
 * Decides when the next message shows: it keeps the head's hold and the scenes the canvas plays (as
 * the queue sees them), on a clock that stops with the canvas's while the page is hidden.
 */
interface Pacer {
  /** `head` reached the window: its hold starts now, and so does its scene on the canvas. */
  headShown(head: GuildMessage): void;
  /** Ms until `head`, not shown yet, may show (its cast free); null while stopped. */
  headDelay(head: GuildMessage): number | null;
  /** New messages were queued: members of their level-ups walk back to their seat now. */
  recall(added: readonly GuildMessage[]): void;
  /** Members the stage took away from their seat for `homeIn` (MessageQueue.occupy). */
  occupy(homeIn: HomeIn): void;
  setStage(stage: StageRecall | null): void;
  /**
   * Ms until `next` may show (nextShowAt), or until the head closes when it is the last one; null
   * while stopped (hidden page or halted screen).
   */
  delayFor(next: GuildMessage | undefined): number | null;
  /** The ▼ button: ends the head's hold. True when `next` (if any) may show at once. */
  skipHold(next: GuildMessage | undefined): boolean;
  setHidden(hidden: boolean): void;
  /** While halted the window is hidden: the head gets its full hold again once it is back. */
  setHalted(halted: boolean): void;
  setStageShown(shown: boolean): void;
}

function createPacer(
  wallNow: () => number,
  holds: Pick<MessageQueueOptions, 'holdMs' | 'lastHoldMs'>,
): Pacer {
  const { holdMs, lastHoldMs } = holds;
  let clock: StageClock = RUNNING_CLOCK;
  let director: Director = EMPTY_DIRECTOR;
  let stageShown = true;
  let stage: StageRecall | null = null;
  let halted = false;
  /** Queue time when the head's hold began (when it showed); null after a halt (starts over). */
  let holdStart: number | null = null;
  const now = () => stageTime(clock, wallNow());
  return {
    headShown(head) {
      holdStart = now();
      if (stageShown) director = withHeadScene(director, head, now());
    },
    headDelay(head) {
      if (halted || clock.pausedAt !== null) return null;
      return Math.max(nextShowAt(director, now(), head) - now(), 0);
    },
    recall(added) {
      const members = levelUpCast(added);
      if (stage === null || !stageShown || members.length === 0) return;
      director = withReturns(director, stage.recall(members), now());
    },
    occupy(homeIn) {
      if (stage === null || !stageShown) return;
      director = withReturns(director, homeIn, now());
    },
    setStage(next) {
      stage = next;
    },
    delayFor(next) {
      if (halted || clock.pausedAt !== null) return null;
      const t = now();
      holdStart ??= t;
      if (next === undefined) return Math.max(holdStart + lastHoldMs - t, 0);
      return Math.max(nextShowAt(director, holdStart + holdMs, next) - t, 0);
    },
    skipHold(next) {
      if (next === undefined) return true;
      const t = now();
      holdStart = t - holdMs;
      return nextShowAt(director, t, next) <= t;
    },
    setHidden(hidden) {
      clock = withPaused(clock, hidden, wallNow());
    },
    setHalted(next) {
      halted = next;
      if (halted) holdStart = null;
    },
    setStageShown(shown) {
      stageShown = shown;
      // The canvas drops its scenes when it goes out of sight; old ones never play later.
      if (!shown) director = EMPTY_DIRECTOR;
    },
  };
}

/** The queued messages, and what of them the window shows. */
interface Line {
  readonly messages: readonly GuildMessage[];
  /**
   * True while the head waits for its cast before it shows (a level-up whose member walks back
   * from play): the window shows none of the queue until then.
   */
  readonly held: boolean;
  /** Replaces the queue; a new head shows now, or is held while its cast is not free. */
  set(next: readonly GuildMessage[]): void;
  /** The held head shows now. */
  release(): void;
}

/**
 * `next` without the lines whose time is over (`until`, the reward of the day: Issue #194), but the
 * one the window shows already.
 */
function withoutStale(
  next: readonly GuildMessage[],
  shown: GuildMessage | undefined,
  now: number,
): readonly GuildMessage[] {
  return next.filter((m) => m.id === shown?.id || m.until === undefined || now < m.until);
}

function createLine(
  pacer: Pacer,
  publish: MessageQueueOptions['publish'],
  wallNow: () => number,
): Line {
  let messages: readonly GuildMessage[] = [];
  let held = false;
  return {
    get messages() {
      return messages;
    },
    get held() {
      return held;
    },
    set(queued) {
      const next = withoutStale(queued, held ? undefined : messages[0], wallNow());
      const head = next[0];
      const fresh = head !== undefined && head.id !== messages[0]?.id;
      messages = next;
      // A head already held stays held when more messages are queued behind it.
      held = fresh ? (pacer.headDelay(head) ?? 0) > 0 : held && head !== undefined;
      if (fresh && !held) pacer.headShown(head);
      publish(held ? [] : messages);
    },
    release() {
      held = false;
      const head = messages[0];
      if (head !== undefined) pacer.headShown(head);
      publish(messages);
    },
  };
}

/** The hold timer of the queue: when the head gives way, or a held head shows. */
interface Hold {
  dispose(): void;
  /** Starts the timer for what the queue waits for now, unless one runs. */
  schedule(): void;
  /** The wait is over: a held head shows, else the next message takes the head's place. */
  advance(): void;
  /** Re-plans the pending hold after what it waits for has changed. */
  reschedule(): void;
}

function createHold(line: Line, pacer: Pacer, scheduler: Scheduler): Hold {
  let cancelHold: Cancel | null = null;

  function dispose(): void {
    cancelHold?.();
    cancelHold = null;
  }

  function schedule(): void {
    const [head, next] = line.messages;
    if (cancelHold !== null || head === undefined) return;
    const delay = line.held ? pacer.headDelay(head) : pacer.delayFor(next);
    // advance() clears the handle (cancelling a timer that has fired does nothing).
    if (delay !== null) cancelHold = scheduler.after(delay, advance);
  }

  function advance(): void {
    dispose();
    if (line.held) line.release();
    else line.set(line.messages.slice(1));
    schedule();
  }

  return {
    dispose,
    schedule,
    advance,
    reschedule() {
      dispose();
      schedule();
    },
  };
}

/**
 * The message window's queue. Each message shows once: the head stays at least `holdMs`, and the
 * next one waits until its scene can start (nextShowAt); the last one closes after `lastHoldMs`
 * (or on `next()`), unless another one is pushed meanwhile. A new head whose cast is away (a
 * level-up's member walking back from play) waits for them before it shows. Every change is
 * handed to `publish` as a new array.
 */
export function createMessageQueue(options: MessageQueueOptions): MessageQueue {
  const pacer = createPacer(options.now, options);
  const line = createLine(pacer, options.publish, options.now);
  const hold = createHold(line, pacer, options.scheduler);
  let nextId = 1;

  return {
    push(entries) {
      if (entries.length === 0) return;
      const added = entries.map((entry) => ({ id: nextId++, ...entry }));
      pacer.recall(added);
      line.set([...line.messages, ...added]);
      // The last one's closing gives way to the hold before the new ones.
      hold.reschedule();
    },
    next() {
      if (line.held) return;
      if (pacer.skipHold(line.messages[1])) hold.advance();
      else hold.reschedule();
    },
    dispose() {
      hold.dispose();
    },
    pause() {
      pacer.setHalted(true);
      hold.dispose();
    },
    resume() {
      pacer.setHalted(false);
      hold.schedule();
    },
    setHidden(hidden) {
      pacer.setHidden(hidden);
      // Back in sight: lines whose time ran out meanwhile go unseen, the one in the window too.
      if (!hidden) {
        const now = options.now();
        const live = line.messages.filter((m) => m.until === undefined || now < m.until);
        if (live.length < line.messages.length) line.set(live);
      }
      hold.reschedule();
    },
    setStageShown(shown) {
      pacer.setStageShown(shown);
      hold.reschedule();
    },
    setStage(stage) {
      pacer.setStage(stage);
    },
    occupy(homeIn) {
      pacer.occupy(homeIn);
      // A head waiting for its cast, or the next message, may have to wait longer.
      hold.reschedule();
    },
  };
}
