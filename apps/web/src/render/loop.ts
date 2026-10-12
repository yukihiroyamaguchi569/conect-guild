import { documentVisibility, type PageVisibility } from '../adapters/visibility';
import type { GuildEvent } from '../domain/events';
import type { MemberId } from '../guild.config';
import type { AmbientMoods } from './ambient';
import type { GuildArt } from './art';
import type { Bubbles } from './bubbles';
import { RUNNING_CLOCK, stageTime, withPaused, type StageClock } from './clock';
import type { Random } from './confetti';
import { EMPTY_DIRECTOR, prune, type Director, type StageFrame } from './director';
import { daylightAt, hourOf, lampLights } from './daylight';
import { ANIMATED_DECOR } from './animatedDecor';
import {
  drawActors,
  drawFrontLayer,
  drawOverhead,
  drawStatic,
  type CachedFrontLayer,
} from './draw';
import { drawAnimatedDecor } from './drawDecor';
import { drawLightPatches, drawShade, drawWindowSun, type ShadeScratch } from './drawDaylight';
import { drawLevelTags } from './drawLevelTags';
import { drawLevelUpBanners } from './drawLevelUp';
import {
  NO_PLACES,
  overheadsOf,
  rememberPlaces,
  type OverheadStage,
  type PlaceMemory,
  type Placed,
} from './overheadPlace';
import { BACK_ANIMATED_DECOR, FRONT_LAYERS } from './layers';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import { AMBIENT } from './metrics';
import type { IdleSeeds, IdleSince } from './idle';
import { playEvent, recallHome, type HomeIn } from './idleCrew';
import { levelTags, type Levels } from './levelTags';
import { createLinePicker, seenLines, type LinePicker, type SpokenLines } from './lines';
import { createCast, stageAt, talkOf, type Cast } from './cast';
import { DEFAULT_SEATS, type SceneContext } from './scenes';
import type { Speeches } from './summons';
import type { DecorCues } from './trinkets';

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
}

/** Before the first party: no bubbles, no moves, no levels. */
const NO_PARTY: StageParty = {
  bubbles: {},
  moods: {},
  idleSince: {},
  halted: false,
  known: false,
  levels: {},
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
   */
  summon(members: readonly MemberId[]): void;
  /**
   * What the party state shows on the stage: the waiting bubbles, the ambient moves, and since
   * when each member has had nothing to do (idle.ts; a member whose time changes while out playing
   * walks back to their seat).
   */
  setParty(party: StageParty): void;
  /** Matches the backing store to the displayed width (CSS px) and the device pixel ratio. */
  resize(cssWidth: number, pixelRatio: number): void;
  /** Cancels the pending frame and stops listening; the loop does nothing after this. */
  stop(): void;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2D canvas is not available');
  return ctx;
}

function cachedLayer(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  layer.width = LOGICAL_WIDTH;
  layer.height = LOGICAL_HEIGHT;
  draw(context2d(layer));
  return layer;
}

/** Everything that never moves, drawn once: the background and each front layer. */
function cachedScenery(art: GuildArt): {
  background: HTMLCanvasElement;
  front: CachedFrontLayer[];
} {
  const background = cachedLayer((ctx) => {
    drawStatic(ctx, art);
  });
  const front = FRONT_LAYERS.map((layer) => ({
    depth: layer.depth,
    layer,
    image: cachedLayer((ctx) => {
      drawFrontLayer(ctx, art, layer);
    }),
  }));
  return { background, front };
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

interface Painter {
  readonly ctx: CanvasRenderingContext2D;
  /** A logical-size canvas for the shade of the night. */
  readonly scratch: ShadeScratch;
  readonly background: HTMLCanvasElement;
  readonly front: readonly CachedFrontLayer[];
  readonly art: GuildArt;
  /** Where the words over each head were in the frame painted last (overheadPlace.ts). */
  readonly placer: Placer;
}

interface Moment {
  readonly now: number;
  readonly hour: number;
  readonly frame: StageFrame;
  readonly bubbles: Bubbles;
  readonly speeches: Speeches;
  readonly remarks: SpokenLines;
  readonly murmurs: SpokenLines;
  readonly cues: DecorCues;
  readonly levels: Levels;
}

/**
 * One frame: the cached background with the sun in the windows and the light patches, the moving
 * things, the members between the cached front layers (desks, the counter, the throne's arms),
 * the shade of the time of day with the lamps' light, and the bubbles and confetti on top.
 */
function paint(painter: Painter, scale: number, moment: Moment): void {
  const { ctx, art } = painter;
  const light = daylightAt(moment.hour);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(painter.background, 0, 0);
  drawWindowSun(ctx, art, light);
  drawLightPatches(ctx, art, moment, light);
  drawAnimatedDecor(ctx, art, moment, BACK_ANIMATED_DECOR);
  drawActors(ctx, moment, art, painter.front);
  drawShade(ctx, painter.scratch, light, lampLights(moment.now));
  const tags = levelTags(moment.levels, DEFAULT_SEATS);
  drawLevelTags(ctx, tags);
  const placed = painter.placer.place({ ...moment, tags });
  drawOverhead(ctx, { placed, confetti: moment.frame.confetti });
  drawLevelUpBanners(ctx, { placed, confetti: moment.frame.confetti });
}

/** Places what is over the heads, keeping each line's spot from the frame painted before. */
interface Placer {
  place(stage: OverheadStage): Placed[];
}

function createPlacer(): Placer {
  let places: PlaceMemory = NO_PLACES;
  return {
    place(stage) {
      const placed = overheadsOf(stage, places);
      places = rememberPlaces(placed);
      return placed;
    },
  };
}

/** The canvas, the scenery drawn once and an empty canvas for the shade. */
function createPainter(ctx: CanvasRenderingContext2D, art: GuildArt): Painter {
  const { background, front } = cachedScenery(art);
  const image = cachedLayer(() => undefined);
  const scratch = { ctx: context2d(image), image };
  return { ctx, scratch, background, front, art, placer: createPlacer() };
}

/** The scenes and the remarks to keep: none while the canvas is out of sight (scenesShown). */
function keepShown(cast: Cast, director: Director, cssWidth: number): Director {
  if (!isShown(cssWidth)) cast.silence();
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

export function startRenderLoop(options: RenderLoopOptions): RenderLoop {
  const { canvas, art } = options;
  const { now, localHour, context } = loopSources(options);
  const painter = createPainter(context2d(canvas), art);
  const cast = createCast(art, context.random, options, talkOf(options, context));
  const visibility = options.visibility ?? documentVisibility;
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
    const { calling, ...stage } = stageAt(cast, director, { t, hour: localHour(), party });
    paint(painter, scale, { ...party, ...stage, now: t });
    director = seenAndPruned(context, director, { t, speeches: stage.speeches });
    // A call needs no more than the ambient pace: its words and turns change every few hundred ms.
    const ambient = Object.keys(party.moods).length > 0 || ANIMATED_DECOR.length > 0 || calling;
    follow(schedule, nextDraw({ hidden: paused(), animating: stage.animating, ambient }));
  }

  const paused = () => isPaused(visibility.isHidden(), cssWidth);
  const schedule = createScheduler(draw, paused);
  /**
   * Drops the scenes nobody can see, stops or restarts the stage clock with the paused state, then
   * draws (or not) to match.
   */
  function refresh(): void {
    director = keepShown(cast, director, cssWidth);
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
    summon(members) {
      if (cast.calls.add(members, paused() ? null : stageNow())) schedule.now();
    },
    setParty(next) {
      party = next;
      director = cast.receive(director, party, { t: stageNow(), quiet: paused() });
      schedule.now();
    },
    resize(nextCssWidth, pixelRatio) {
      cssWidth = nextCssWidth;
      scale = fitCanvas(canvas, cssWidth, pixelRatio) ?? scale;
      refresh();
    },
    stop() {
      schedule.stop();
      unsubscribe();
    },
  };
}
