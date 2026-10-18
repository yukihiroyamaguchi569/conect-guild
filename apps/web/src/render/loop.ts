import { documentVisibility, type PageVisibility } from '../adapters/visibility';
import type { GuildEvent } from '../domain/events';
import type { SummonsFrom } from '../domain/summons';
import type { MemberId } from '../guild.config';
import type { AmbientMoods } from './ambient';
import type { GuildArt } from './art';
import type { Bubbles } from './bubbles';
import { RUNNING_CLOCK, stageTime, withPaused, type StageClock } from './clock';
import type { Random } from './confetti';
import { EMPTY_DIRECTOR, prune, type Director } from './director';
import { hourOf } from './daylight';
import { ANIMATED_DECOR } from './animatedDecor';
import { placeholderGuestArt, type GuestArt } from './guestArt';
import type { StageGuest } from './guests';
import { createGuestStage, guestControls, type GuestStage } from './guestStage';
import { SELECTED_LAYOUT } from './layouts';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import { AMBIENT } from './metrics';
import type { IdleSeeds, IdleSince } from './idle';
import { playEvent, recallHome, type HomeIn } from './idleCrew';
import type { Levels } from './levelTags';
import { createLinePicker, seenLines, type LinePicker } from './lines';
import { createCast, stageAt, talkOf, type Cast } from './cast';
import { context2d, createPainter, paint, type Painter } from './painter';
import { DEFAULT_SEATS, type SceneContext } from './scenes';
import type { Speeches } from './summons';
import { visitFor, withVisit } from './visit';

/**
 * The requestAnimationFrame loop. It runs every frame while a scene plays; between scenes it
 * redraws only every AMBIENT.frameMs for the small moves (members, lamps, the pet, the other small
 * things, and the light of the time of day, read from the local clock on each draw), and sleeps
 * when there are none until the bubbles change, a scene starts or the canvas is resized. While the
 * page is hidden or
 * the canvas has no width (narrow screens hide it) it does not run at all, and the stage clock
 * (clock.ts) stands still, so a scene goes on from where it was once the canvas is shown again.
 */

/** What to do after a frame: draw the next one, wait for the next ambient move, or sleep. */
export type NextDraw = 'frame' | 'ambient' | 'sleep';

export function nextDraw(state: {
  readonly hidden: boolean;
  readonly animating: boolean;
  readonly ambient: boolean;
}): NextDraw {
  if (state.hidden) return 'sleep';
  if (state.animating) return 'frame';
  return state.ambient ? 'ambient' : 'sleep';
}

export interface RenderLoopOptions {
  readonly canvas: HTMLCanvasElement;
  readonly art: GuildArt;
  readonly now?: () => number;
  /** The local time of day in hours, 0 to 24 (daylight.hourOf of the browser's clock). */
  readonly localHour?: () => number;
  readonly random?: Random;
  /** Whether かなめ tosses a scroll (scenes.SceneContext.tossRandom); apart from `random`. */
  readonly tossRandom?: Random;
  /**
   * Which line a member says in a scene (lines.ts, Issue #47), whether they say one on starting
   * to wait (remarks.ts), and who murmurs what when (murmurs.ts); apart from the other two.
   */
  readonly lineRandom?: Random;
  readonly visibility?: PageVisibility;
  /** Epoch ms, for the long idle spells (idle.ts); they go on while the page is hidden. */
  readonly wallNow?: () => number;
  /** Members in a scene at `at` (epoch ms), on every frame that shows them in one. */
  readonly onActive?: (ids: readonly MemberId[], at: number) => void;
  /** A call of the king (summons.ts) starts on the stage now: its sound rings with it. */
  readonly onCallStart?: () => void;
  /** The idle spells' per-member salts, so the narration tells the same outings (Issue #30). */
  readonly idleSeeds?: IdleSeeds;
  /** The guests' pictures (Issue #108); plain boxes when absent. */
  readonly guestArt?: GuestArt;
}

export interface StageParty {
  readonly bubbles: Bubbles;
  readonly moods: AmbientMoods;
  readonly idleSince: IdleSince;
  /**
   * The screen is halted (not live): the king's calls are dropped, to come or playing, and so are
   * the lines of the scenes (lines.ts), on starting to wait (remarks.ts) and the murmurs (murmurs.ts).
   */
  readonly halted: boolean;
  /**
   * False before the first snapshot: nobody has started waiting by its empty party (remarks.ts),
   * and nobody murmurs (murmurs.ts).
   */
  readonly known: boolean;
  /** The members' levels, shown small under their seats (levelTags.ts). */
  readonly levels: Levels;
  /** How many of the king's quests are open: what he murmurs on the throne (murmurs.ts). */
  readonly kingQuests: number;
}

/** Before the first party: no bubbles, no moves, no levels. */
const NO_PARTY: StageParty = {
  bubbles: {},
  moods: {},
  idleSince: {},
  halted: false,
  known: false,
  levels: {},
  kingQuests: 0,
};

export interface RenderLoop {
  /** Starts the scene for an event now (or when its cast is free); dropped while not shown. */
  play(event: GuildEvent): void;
  /**
   * Calls members out playing back to their seat now, ahead of their scene (a level-up), and says
   * how long until each is free there (stage ms). Nothing while drawing would not be seen.
   */
  recall(members: readonly MemberId[]): HomeIn;
  /**
   * The king calls the members the president gave an order to (summons.ts, Issue #28), now or
   * after the call still playing. Dropped while the page is hidden or the canvas not shown: the
   * moment has passed by the time it is seen. A call cut off by a hide goes on after it.
   * かなめ, when free at her counter, walks to the throne to hear it (visit.ts, Issue #87): says
   * how long until she is back (stage ms), which the message queue waits for. From かなめ
   * (Issue #155), she asks the departments from her counter instead and nobody walks.
   */
  summon(members: readonly MemberId[], from?: SummonsFrom): HomeIn;
  /**
   * What the party state shows on the stage: the waiting bubbles, the ambient moves, and since
   * when each member has had nothing to do (idle.ts; a member whose time changes while out playing
   * walks back to their seat).
   */
  setParty(party: StageParty): void;
  /** The guests at their spots (Issue #108), in the settings' order. */
  setGuests(guests: readonly StageGuest[]): void;
  /** A small sparkle over guest `index` now (its PR merged or Issue completed); dropped unseen. */
  sparkle(index: number): void;
  /** Matches the backing store to the displayed width (CSS px) and the device pixel ratio. */
  resize(cssWidth: number, pixelRatio: number): void;
  /** Cancels the pending frame and stops listening; the loop does nothing after this. */
  stop(): void;
}

/** False while narrow screens hide the canvas (display: none gives it no width). */
export function isShown(cssWidth: number): boolean {
  return cssWidth > 0;
}

/**
 * The scenes to keep: none while the canvas is out of sight, so they never play late when it comes
 * back (the message queue drops them too and does not wait for them).
 */
export function scenesShown(director: Director, cssWidth: number): Director {
  return isShown(cssWidth) ? director : EMPTY_DIRECTOR;
}

/** True while drawing would not be seen: the page is hidden or the canvas has no width. */
export function isPaused(pageHidden: boolean, cssWidth: number): boolean {
  return pageHidden || !isShown(cssWidth);
}

export interface Scheduler {
  /** Draws on the next animation frame (sooner than any ambient wait). */
  now(): void;
  /** Draws after AMBIENT.frameMs unless a draw is already on the way. */
  later(): void;
  /** Cancels what is pending when paused, otherwise draws soon (after a pause ends). */
  refresh(): void;
  stop(): void;
}

/** One pending draw at most; nothing runs while `paused()` is true or after stop(). */
export function createScheduler(draw: () => void, paused: () => boolean): Scheduler {
  let pending: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function cancel(): void {
    if (pending !== null) cancelAnimationFrame(pending);
    if (timer !== null) clearTimeout(timer);
    pending = null;
    timer = null;
  }

  function now(): void {
    if (stopped || paused() || pending !== null) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = requestAnimationFrame(() => {
      pending = null;
      draw();
    });
  }

  function later(): void {
    if (stopped || paused() || pending !== null || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      now();
    }, AMBIENT.frameMs);
  }

  return {
    now,
    later,
    refresh() {
      if (paused()) cancel();
      else now();
    },
    stop() {
      stopped = true;
      cancel();
    },
  };
}

/**
 * Matches the backing store to the displayed width; returns the new scale, or null when nothing
 * changed or the canvas is not shown (width 0).
 */
function fitCanvas(canvas: HTMLCanvasElement, cssWidth: number, pixelRatio: number): number | null {
  if (cssWidth <= 0) return null;
  const width = Math.max(Math.round(cssWidth * pixelRatio), 1);
  if (canvas.width === width) return null;
  canvas.width = width;
  canvas.height = Math.round((width * LOGICAL_HEIGHT) / LOGICAL_WIDTH);
  return width / LOGICAL_WIDTH;
}

/** The painter, the guests of the layout in use (Issue #108) and the members' cast. */
function stageOf(
  options: RenderLoopOptions,
  context: ReturnType<typeof loopSources>['context'],
): { readonly painter: Painter; readonly guests: GuestStage; readonly cast: Cast } {
  const { canvas, art } = options;
  const painter = createPainter(context2d(canvas), art, options.guestArt ?? placeholderGuestArt);
  const guestArt = painter.guestArt;
  const guests = createGuestStage(
    SELECTED_LAYOUT.guestSpots,
    (i) => guestArt.hasHoldFrames(i),
    Math.random,
    options.wallNow,
  );
  const cast = createCast(art, context.random, options, talkOf(options, context));
  return { painter, guests, cast };
}

/** The scenes and the remarks to keep: none while the canvas is out of sight (scenesShown). */
function keepShown(cast: Cast, director: Director, cssWidth: number, guests: GuestStage): Director {
  if (!isShown(cssWidth)) {
    cast.silence();
    guests.clearSparkles();
  }
  return scenesShown(director, cssWidth);
}

/**
 * How the scenes are planned. The toss and the lines draw from sources of their own, never the
 * injected `random`: an injected (reproducible) sequence keeps its confetti. All default to
 * Math.random, which has no sequence anyone could reproduce, so sharing it is harmless.
 */
export function sceneContext(
  options: Pick<RenderLoopOptions, 'random' | 'tossRandom' | 'lineRandom'>,
): SceneContext & { readonly sawLines: LinePicker['saw'] } {
  const picker = createLinePicker(options.lineRandom ?? Math.random);
  return {
    seats: DEFAULT_SEATS,
    random: options.random ?? Math.random,
    tossRandom: options.tossRandom ?? Math.random,
    pickLine: picker.pick,
    sawLines: (lines, now) => {
      picker.saw(lines, now);
    },
  };
}

/**
 * True when a scene played now says nothing: halted (its lines are dropped then: StageParty.halted)
 * or the canvas is out of sight (the scene itself is dropped: scenesShown). No line is picked for
 * it, so the lines said last stay those that were seen.
 */
export function isQuiet(halted: boolean, cssWidth: number): boolean {
  return halted || !isShown(cssWidth);
}

/** The context without the picker while quiet (isQuiet). */
export function sceneContextWhile(context: SceneContext, quiet: boolean): SceneContext {
  return quiet ? { ...context, pickLine: undefined } : context;
}

/** Asks for the next draw as `next` says. */
function follow(schedule: Scheduler, next: NextDraw): void {
  if (next === 'frame') schedule.now();
  if (next === 'ambient') schedule.later();
}

/** The clocks and the random sources of the loop (sceneContext): the injected ones, else the browser's. */
function loopSources(options: RenderLoopOptions) {
  const context = sceneContext(options);
  return {
    now: options.now ?? (() => performance.now()),
    localHour: options.localHour ?? (() => hourOf(new Date())),
    context,
    visibility: options.visibility ?? documentVisibility,
  };
}

/**
 * After a frame is painted: the lines it showed are seen (lines.createLinePicker remembers them),
 * then what is over is pruned.
 */
function seenAndPruned(
  context: { readonly sawLines: LinePicker['saw'] },
  director: Director,
  frame: { readonly t: number; readonly speeches: Speeches },
): Director {
  context.sawLines(seenLines(director.lines, frame.t, frame.speeches), frame.t);
  return prune(director, frame.t);
}

/**
 * The king calls `members` at stage time `t` (null: drawing would not be seen, the call is dropped),
 * with かなめ's walk to the throne when she goes (visit.ts, Issue #87), and how long until she is
 * back at her counter. An order from かなめ (Issue #155) has her ask from her counter: nobody walks.
 */
export function summonOn(
  cast: Pick<Cast, 'calls' | 'crew'>,
  director: Director,
  order: { readonly members: readonly MemberId[]; readonly from?: SummonsFrom },
  t: number | null,
): { readonly director: Director; readonly homeIn: HomeIn } {
  const { members } = order;
  if (order.from === 'kaname') {
    cast.calls.dispatch(members, t);
    return { director, homeIn: {} };
  }
  const stage = { director, idle: cast.crew.poses().kaname, seat: DEFAULT_SEATS.kaname };
  const added = cast.calls.add(members, t, (start) => visitFor(members, start, stage));
  if (t === null || added?.visit === undefined) return { director, homeIn: {} };
  return { director: withVisit(director, added.visit), homeIn: { kaname: added.visit.back - t } };
}

/** What paintAt needs: the members' and the guests' stages, the party and the time. */
interface PaintInput {
  readonly cast: Cast;
  readonly director: Director;
  readonly guests: GuestStage;
  readonly party: StageParty;
  readonly t: number;
  readonly hour: number;
}

/**
 * Paints the frame at `t`; returns the speeches heard and how soon the next frame is needed
 * (nextDraw without `hidden`).
 */
function paintAt(
  painter: Painter,
  scale: number,
  { cast, director, guests, party, t, hour }: PaintInput,
): { readonly speeches: Speeches; readonly pace: { animating: boolean; ambient: boolean } } {
  const { calling, ...stage } = stageAt(cast, director, { t, hour, party });
  const guestNow = guests.frameAt(t);
  paint(painter, scale, { ...party, ...stage, now: t, guests: guestNow });
  // A call needs no more than the ambient pace: its words and turns change every few hundred ms.
  const ambient = Object.keys(party.moods).length > 0 || ANIMATED_DECOR.length > 0 || calling;
  return {
    speeches: stage.speeches,
    pace: { animating: stage.animating || guestNow.animating, ambient },
  };
}

/** The scheduler of `draw`, paused while the page is hidden or the canvas has no width (isPaused). */
function pausedScheduler(
  draw: () => void,
  visibility: PageVisibility,
  cssWidth: () => number,
): { readonly paused: () => boolean; readonly schedule: Scheduler } {
  const paused = () => isPaused(visibility.isHidden(), cssWidth());
  return { paused, schedule: createScheduler(draw, paused) };
}

export function startRenderLoop(options: RenderLoopOptions): RenderLoop {
  const { now, localHour, context, visibility } = loopSources(options);
  const { painter, guests, cast } = stageOf(options, context);
  // Narrow screens hide the canvas (display: none): its width is 0 and nothing is drawn.
  let cssWidth = 1;
  let director: Director = EMPTY_DIRECTOR;
  let party: StageParty = NO_PARTY;
  let scale = 1;
  let clock: StageClock = RUNNING_CLOCK;
  const stageNow = () => stageTime(clock, now());
  const quiet = () => sceneContextWhile(context, isQuiet(party.halted, cssWidth));

  function draw(): void {
    const t = stageNow();
    const drawn = paintAt(painter, scale, { cast, director, guests, party, t, hour: localHour() });
    director = seenAndPruned(context, director, { t, speeches: drawn.speeches });
    follow(schedule, nextDraw({ hidden: paused(), ...drawn.pace }));
  }

  const { paused, schedule } = pausedScheduler(draw, visibility, () => cssWidth);
  /**
   * Drops the scenes nobody can see, stops or restarts the stage clock with the paused state, then
   * draws (or not) to match.
   */
  function refresh(): void {
    director = keepShown(cast, director, cssWidth, guests);
    clock = withPaused(clock, paused(), now());
    schedule.refresh();
  }
  const unsubscribe = visibility.subscribe(refresh);
  refresh();
  return {
    play(event) {
      // Members out playing come back first; the scene waits for them (idleCrew.playEvent).
      director = playEvent(cast.crew, director, event, { t: stageNow(), context: quiet() });
      refresh();
    },
    recall(members) {
      const recalled = recallHome(cast.crew, director, paused() ? [] : members, stageNow());
      director = recalled.director;
      refresh();
      return recalled.homeIn;
    },
    summon(members, from) {
      const summoned = summonOn(cast, director, { members, from }, paused() ? null : stageNow());
      director = summoned.director;
      schedule.now();
      return summoned.homeIn;
    },
    setParty(next) {
      party = next;
      guests.setHalted(next.halted);
      director = cast.receive(director, party, { t: stageNow(), quiet: paused() });
      schedule.now();
    },
    ...guestControls(guests, { schedule, paused, stageNow }),
    resize(nextCssWidth, pixelRatio) {
      cssWidth = nextCssWidth;
      scale = fitCanvas(options.canvas, cssWidth, pixelRatio) ?? scale;
      refresh();
    },
    stop() {
      schedule.stop();
      unsubscribe();
    },
  };
}
