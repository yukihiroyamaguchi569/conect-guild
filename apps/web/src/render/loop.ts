import { createKeyValueStore, type KeyValueStore } from '../adapters/storage';
import { documentVisibility, type PageVisibility } from '../adapters/visibility';
import type { GuildEvent } from '../domain/events';
import type { SummonsFrom } from '../domain/summons';
import type { VisitorKind } from '../domain/visitors';
import { ACTIVE_MEMBER_IDS, type MemberId } from '../guild.config';
import type { AmbientMoods } from './ambient';
import type { GuildArt } from './art';
import type { Bubbles } from './bubbles';
import { RUNNING_CLOCK, stageTime, withPaused, type StageClock } from './clock';
import type { Random } from './confetti';
import { EMPTY_DIRECTOR, isAnimating, prune, type Director } from './director';
import { hourOf } from './daylight';
import { ANIMATED_DECOR } from './animatedDecor';
import { placeholderGuestArt, type GuestArt } from './guestArt';
import type { StageGuest } from './guests';
import { createGuestStage, guestControls, type GuestStage } from './guestStage';
import { SELECTED_LAYOUT } from './layouts';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import type { IdleSeeds, IdleSince } from './idle';
import { playEvent, recallHome, type HomeIn } from './idleCrew';
import type { Levels } from './levelTags';
import { createLinePicker, seenLines, type LinePicker } from './lines';
import { createCast, stageAt, talkOf, type Cast } from './cast';
import { context2d, createPainter, paint, type Painter } from './painter';
import { presses, type Presses } from './presses';
import { actorOf, castOf, DEFAULT_SEATS, type SceneContext } from './scenes';
import { createScheduler, follow, nextDraw, type Scheduler } from './scheduler';
import { monthAt } from './ornament';
import type { StageReward } from './rewardDesk';
import type { Speeches } from './summons';
import { createGatheringsStage } from './monthEvent';
import type { ToastStage } from './toastStage';
import {
  createVisitorStage,
  visitorControls,
  visitorScene,
  type VisitorPresses,
  type VisitorStage,
} from './visitorStage';
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
  /**
   * Epoch ms, for the long idle spells (idle.ts; they go on while the page is hidden) and the
   * month's ornament (ornament.ts).
   */
  readonly wallNow?: () => number;
  /** Members in a scene at `at` (epoch ms), on every frame that shows them in one. */
  readonly onActive?: (ids: readonly MemberId[], at: number) => void;
  /** A call of the king (summons.ts) starts on the stage now: its sound rings with it. */
  readonly onCallStart?: () => void;
  /** The visitor came in (its kind) or is gone (null), Issue #212: its button shows meanwhile. */
  readonly onVisitor?: (kind: VisitorKind | null) => void;
  /** The idle spells' per-member salts, so the narration tells the same outings (Issue #30). */
  readonly idleSeeds?: IdleSeeds;
  /** The guests' pictures (Issue #108); plain boxes when absent. */
  readonly guestArt?: GuestArt;
  /** The visitors' pictures (Issue #195), in the order of VISITOR_KINDS; plain boxes when absent. */
  readonly visitorArt?: GuestArt;
  /**
   * Where the day of the last toast (Issue #193) and of the month's gathering (Issue #214) is kept;
   * localStorage when absent.
   */
  readonly toastStore?: KeyValueStore;
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
  /** The king's reward of the day on a desk (Issue #194); null when there is none. */
  readonly reward: StageReward | null;
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
  reward: null,
};

export interface RenderLoop extends Presses, VisitorPresses {
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

/** The painter, the guests of the layout in use (Issue #108), the visitor (#195) and the cast. */
function stageOf(
  options: RenderLoopOptions,
  context: ReturnType<typeof loopSources>['context'],
): { readonly painter: Painter; readonly room: Room; readonly cast: Cast } {
  const { canvas, art } = options;
  const painter = createPainter(
    context2d(canvas),
    art,
    options.guestArt ?? placeholderGuestArt,
    options.visitorArt ?? placeholderGuestArt,
  );
  const guestArt = painter.guestArt;
  const guests = createGuestStage(
    SELECTED_LAYOUT.guestSpots,
    (i) => guestArt.hasHoldFrames(i),
    Math.random,
    options.wallNow,
  );
  const cast = createCast(art, context.random, options, talkOf(options, context));
  const visitors = createVisitorStage(options.wallNow, {
    onVisitor: (kind) => options.onVisitor?.(kind),
  });
  const toast = createGatheringsStage(options.toastStore ?? createKeyValueStore(), options.wallNow);
  return { painter, room: { guests, visitors, toast }, cast };
}

/**
 * Who is in the room besides the members' scenes: the guests (Issue #108), the visitor (Issue
 * #195) and the Friday toast (Issue #193) with the month's gathering (Issue #214, monthEvent.ts).
 */
interface Room {
  readonly guests: GuestStage;
  readonly visitors: VisitorStage;
  readonly toast: ToastStage;
}

/**
 * While halted the sparkles stop, the visitor turns back to the door and the toast breaks up
 * (everyone walks back to the seat).
 */
function haltRoom(room: Room, director: Director, halted: boolean, t: number): Director {
  room.guests.setHalted(halted);
  room.visitors.setHalted(halted, t);
  return halted ? room.toast.release(director, ACTIVE_MEMBER_IDS, t) : director;
}

/** The toast starts at `t` when it is time (toastStage.ts). */
function toastAt(room: Room, cast: Cast, director: Director, at: { t: number; party: StageParty }) {
  const { t, party } = at;
  const { moods, halted } = party;
  const calling = cast.calls.isCalling(t);
  const visiting = room.visitors.isVisiting();
  return room.toast.start(director, {
    t,
    moods,
    halted,
    calling,
    visiting,
    idle: cast.crew.poses(),
  });
}

/**
 * Plays the scene of `event`: those in it leave the toast first (they walk back to the seat now),
 * and members out playing come back (idleCrew.playEvent); the scene waits for them.
 */
function playIn(
  room: Room,
  cast: Cast,
  director: Director,
  at: { event: GuildEvent; t: number; context: SceneContext },
): Director {
  const { event, t, context } = at;
  const released = room.toast.release(director, [...castOf(event), actorOf(event)], t);
  return playEvent(cast.crew, released, event, { t, context });
}

/**
 * Calls `members` back to their seat, out of the toast too (idleCrew.recallHome); nobody while
 * drawing would not be seen.
 */
function recallIn(
  room: Room,
  cast: Cast,
  director: Director,
  at: { members: readonly MemberId[]; t: number; paused: boolean },
) {
  const { t } = at;
  const members = at.paused ? [] : at.members;
  return recallHome(cast.crew, room.toast.release(director, members, t), members, t);
}

/** Takes a new party at `t`: the room halts with it (haltRoom), then the cast (Cast.receive). */
function receiveIn(
  room: Room,
  cast: Cast,
  director: Director,
  at: { party: StageParty; t: number; quiet: boolean },
): Director {
  const { party, t, quiet } = at;
  return cast.receive(haltRoom(room, director, party.halted, t), party, { t, quiet });
}

/** The scenes and the remarks to keep: none while the canvas is out of sight (scenesShown). */
function keepShown(cast: Cast, director: Director, cssWidth: number, room: Room): Director {
  if (!isShown(cssWidth)) {
    cast.silence();
    room.guests.clearSparkles();
    room.visitors.clear();
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

/**
 * The local hour (daylight), month (the ornament, Issue #192) and wall clock (the reward of the
 * day, Issue #194) to draw a frame at. The month follows `wallNow`, the clock the canvas also reads
 * the month of a press from (GuildCanvas.vue).
 */
export function calendarOf(
  options: Pick<RenderLoopOptions, 'localHour' | 'wallNow'>,
): () => { readonly hour: number; readonly month: number; readonly wall: number } {
  const localHour = options.localHour ?? (() => hourOf(new Date()));
  const wallNow = options.wallNow ?? Date.now;
  return () => {
    const wall = wallNow();
    return { hour: localHour(), month: monthAt(wall), wall };
  };
}

/** The clocks and the random sources of the loop (sceneContext): the injected ones, else the browser's. */
function loopSources(options: RenderLoopOptions) {
  const context = sceneContext(options);
  return {
    now: options.now ?? (() => performance.now()),
    calendar: calendarOf(options),
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
  readonly room: Room;
  readonly party: StageParty;
  readonly t: number;
  readonly hour: number;
  readonly month: number;
  readonly wall: number;
}

/**
 * Paints the frame at `t`; returns the speeches heard and how soon the next frame is needed
 * (nextDraw without `hidden`).
 */
function paintAt(
  painter: Painter,
  scale: number,
  { cast, director, room, party, t, hour, month, wall }: PaintInput,
): { readonly speeches: Speeches; readonly pace: { animating: boolean; ambient: boolean } } {
  const { calling, ...stage } = stageAt(cast, director, { t, hour, party });
  const guestNow = room.guests.frameAt(t);
  const busy = isAnimating(director, t) || calling;
  const visitor = room.visitors.frameAt(
    t,
    visitorScene(stage.frame.members, cast.crew.poses(), busy),
  );
  paint(painter, scale, { ...party, ...stage, now: t, month, wall, guests: guestNow, visitor });
  // A call needs no more than the ambient pace: its words and turns change every few hundred ms.
  const ambient = Object.keys(party.moods).length > 0 || ANIMATED_DECOR.length > 0 || calling;
  return {
    speeches: stage.speeches,
    pace: { animating: stage.animating || guestNow.animating || visitor !== null, ambient },
  };
}

/** What the loop does for the guests (Issue #108) and the visitor (Issue #212). */
function roomControls(room: Room, loop: Parameters<typeof guestControls>[1]) {
  return { ...guestControls(room.guests, loop), ...visitorControls(room.visitors, loop) };
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
  const { now, calendar, context, visibility } = loopSources(options);
  const { painter, room, cast } = stageOf(options, context);
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
    director = toastAt(room, cast, director, { t, party });
    const drawn = paintAt(painter, scale, { cast, director, room, party, t, ...calendar() });
    director = seenAndPruned(context, director, { t, speeches: drawn.speeches });
    follow(schedule, nextDraw({ hidden: paused(), ...drawn.pace }));
  }

  const { paused, schedule } = pausedScheduler(draw, visibility, () => cssWidth);
  /**
   * Drops the scenes nobody can see, stops or restarts the stage clock with the paused state, then
   * draws (or not) to match.
   */
  function refresh(): void {
    director = keepShown(cast, director, cssWidth, room);
    clock = withPaused(clock, paused(), now());
    schedule.refresh();
  }
  const unsubscribe = visibility.subscribe(refresh);
  refresh();
  return {
    play(event) {
      director = playIn(room, cast, director, { event, t: stageNow(), context: quiet() });
      refresh();
    },
    recall(members) {
      const recalled = recallIn(room, cast, director, { members, t: stageNow(), paused: paused() });
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
    ...presses(cast, schedule, () => ({ director, party, t: stageNow(), paused: paused() })),
    setParty(next) {
      party = next;
      director = receiveIn(room, cast, director, { party, t: stageNow(), quiet: paused() });
      schedule.now();
    },
    ...roomControls(room, { schedule, paused, stageNow }),
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
