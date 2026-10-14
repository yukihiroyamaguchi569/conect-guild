import { SELECTED_LAYOUT } from './layouts';

/**
 * Every size of the drawing in one place (contract with assets/tiles and assets/sprites):
 * 32 x 18 tiles of 32 px (logical 1024 x 576), members drawn from 80 x 80 frames.
 */

export const TILE_SIZE = 32;
/** One sprite frame (square); the feet are at the bottom centre. */
export const SPRITE_SIZE = 80;
/**
 * Logical px per detail pixel. Small hand-made shapes (bubbles, placeholder boxes, confetti) are
 * designed on a 16 px tile grid and scaled by this, so they keep their proportions.
 */
export const DETAIL_SCALE = TILE_SIZE / 16;
/** How far above the feet held items and confetti are centred: just over the head. */
export const OVERHEAD_OFFSET = SPRITE_SIZE + 2 * DETAIL_SCALE;
/**
 * The bubbles over the heads (bubbleShape.ts, Issue #77), in detail px: bold `textPx` text
 * (`glyphPx` for a waiting sign) with `padXPx` at the sides and `padYPx` over and under, inside a
 * 1 px border; a tail `tailInsidePx` wide inside its border at the base, `tailRows` rows under the
 * box. Over the head the box starts `overXPx` right (or left) of the feet; beside an item held up
 * over the head (itemHalf 8 detail px each side of the middle) it starts `besideXPx` out, its bottom
 * `besideBottomPx` under the point over the head (at the head's height).
 */
export const BUBBLE = {
  textPx: 8,
  glyphPx: 9,
  padXPx: 3,
  padYPx: 2,
  tailInsidePx: 4,
  tailRows: 4,
  overXPx: 2,
  besideXPx: 10,
  besideBottomPx: 4,
} as const;
/**
 * How far a bubble's top sits over OVERHEAD_OFFSET, in detail px: the text, its padding and the
 * border (bubbleShape.ts; a shout's spikes reach higher, only over the king).
 */
export const BUBBLE_RISE = BUBBLE.textPx + 2 * BUBBLE.padYPx + 2;
/** The highest point drawn over a member, above the feet: the top of a bubble. */
export const OVERHEAD_TOP = OVERHEAD_OFFSET + BUBBLE_RISE * DETAIL_SCALE;

/**
 * The small moves members make when nothing happens (ambient.ts), kept quiet on purpose.
 * Times are ms, distances logical px. Each member waits `minIntervalMs`–`maxIntervalMs` between
 * their moves (drawn once per member from the injected random source).
 */
export const AMBIENT = {
  /** Redraw interval while only ambient moves show (about 7 fps). */
  frameMs: 140,
  minIntervalMs: 5_000,
  maxIntervalMs: 14_000,
  /**
   * Desk work: typing (the front frame and the arms-in-front frame in turn, or an up-and-down bob
   * on a sheet without the holding frames), and a short turn to the side for papers.
   */
  typingMs: 280,
  typingBobPx: 2,
  pageTurnMs: 560,
  /** Idle: look right then left, or stretch up. */
  lookMs: 840,
  stretchMs: 1_120,
  stretchPx: 4,
  /** かなめ with nothing at the reception: fanning (front and side frames in turn). */
  fanBurstMs: 2_520,
  fanStrokeMs: 280,
  /** かなめ with quests at the reception: the scroll at hand, nudged left and right. */
  scrollBurstMs: 3_360,
  scrollStepMs: 420,
  scrollShakePx: 2,
  handHeightPx: 28,
  /** The king with PRs to approve: a small sway on the throne. */
  fidgetBurstMs: 3_360,
  fidgetStepMs: 420,
  fidgetPx: 2,
  /** Lamps and candles: the flame brightens by up to this much (added light), changing every step. */
  flameGlow: 0.22,
  flameStepMs: 280,
  /** The sleeping pet rises 1 px for half of each breath. */
  breathMs: 2_520,
  breathPx: 1,
  /** Shifts each lamp's flicker and the pet's breath against the others. */
  decorPhaseStepMs: 377,
} as const;

/**
 * Long idle spells (idle.ts, Issue #23): after `dozeAfterMs` with nothing to do a member dozes at
 * the seat, after `sleepAfterMs` they sleep or now and then get up to play. Play goes in cycles of
 * `playCycleMs` on the wall clock: in each, a member plays with chance `playShare`, leaving up to
 * `leaveMaxMs` after the cycle starts and staying `stayMinMs`–`stayMaxMs` before walking back, and
 * sleeps for the rest. Times are ms, distances logical px.
 */
export const IDLE = {
  dozeAfterMs: 10 * 60_000,
  sleepAfterMs: 30 * 60_000,
  playCycleMs: 4 * 60_000,
  playShare: 0.4,
  leaveMaxMs: 30_000,
  stayMinMs: 40_000,
  stayMaxMs: 150_000,
  /** Dozing: the head nods down `nodPx` for half of every `nodMs`. */
  nodMs: 1_400,
  nodPx: 2,
  /** One dozing cycle: a yawn (the side frame) in every fourth, a "…" in every third. */
  dozeCycleMs: 6_000,
  yawnMs: 1_260,
  dozeDotsMs: 1_680,
  /** Asleep: sunk a little deeper, a "Z" rising `zRisePx` and fading every `zRiseMs`. */
  sleepSinkPx: 4,
  zRiseMs: 2_100,
  zRisePx: 14,
  /** At a play spot: bubbles change every `bubbleMs`; at a window, a look aside every `lookMs`. */
  bubbleMs: 1_680,
  lookMs: 2_520,
  /** By the pet: the member crouches `crouchPx` for the last `crouchMs` of every `crouchEveryMs`. */
  crouchEveryMs: 3_360,
  crouchMs: 840,
  crouchPx: 3,
  /** The last-active times are written to localStorage when one moved on by this much. */
  persistStepMs: 10_000,
} as const;

/**
 * The king calls a member the president gave an order to (summons.ts, Issue #28): "！" with the
 * king rising `kingRisePx` for `callMs`, then "ゴニョゴニョ" for `murmurMs`; then the members turn
 * to the throne and answer "はっ！" for `replyMs` (one facing the throne head-on hops `hopPx` for
 * `hopMs` instead). Times are ms, distances logical px. When かなめ goes to the throne to hear
 * it (visit.ts, Issue #87) she sets off after `callMs`, walks at motion.MS_PER_TILE (5 tiles, 1.25 s
 * each way), and the whisper starts once she is there: about 6.2 s in all.
 */
export const SUMMONS = {
  callMs: 700,
  kingRisePx: 4,
  murmurMs: 1_400,
  replyMs: 1_600,
  hopMs: 280,
  hopPx: 4,
} as const;

/**
 * How far a member at a seat is drawn below the feet of their tile (logical px), so the furniture
 * in front hides the lower body (seating.ts). Measured on the tiles: a desk's back edge is 12 px
 * below its top, the counter's 3 px, the throne's seat cushion 62 px.
 */
export const SEATING = {
  /** On a chair behind a desk: the desk hides everything below the chest. */
  chairPx: 36,
  /** かなめ right behind the counter top: it hides her from the waist down. */
  counterPx: 30,
  /** The king deep in the throne: its seat and arms hide his legs. */
  thronePx: 26,
} as const;

/** Where a carried item is centred (motion.heldItemPoint), logical px from the feet. */
export const HOLD = {
  /** Up from the feet: between the chest and the waist. */
  carryHeightPx: 30,
  /** Forward of the middle when facing sideways: at the hands, a little out from the body. */
  carryForwardPx: 14,
  /** Up on every other step while walking in the carrying frame (it has no stepping legs). */
  walkBobPx: 2,
  /** Half the height of a raised item's picture (chest 31 px, scroll bundle 32 px): it sits on the hands. */
  raisedItemHalfPx: 16,
} as const;

/**
 * Confetti over a member when a quest is cleared (confetti.ts): squares of `smallPx` or `largePx`,
 * thrown up and out, then drifting down slowly (light paper, low gravity) for `durationMs`.
 * Velocities are logical px / s. Chosen so that over every seat the squares stay on screen and
 * above the message window until the end: the fastest rise stays under the top of the room from
 * the upper seats, and the slowest one has not fallen past the message window from the lower ones.
 */
export const CONFETTI = {
  durationMs: 2_600,
  count: 48,
  smallPx: 2 * DETAIL_SCALE,
  largePx: 3 * DETAIL_SCALE,
  /** Share of the large squares. */
  largeShare: 0.4,
  /** Sideways speed, -spread/2 to +spread/2. */
  spreadPx: 60 * DETAIL_SCALE,
  riseMinPx: 25 * DETAIL_SCALE,
  riseMaxPx: 60 * DETAIL_SCALE,
  gravityPx: 40 * DETAIL_SCALE,
} as const;

/**
 * The small things that move (trinkets.ts): times are ms, distances logical px (one px of the
 * decor pictures). Each thing is still unless its trigger holds (who works, the king waiting, a
 * quest just cleared); the pet and the light patches always move.
 */
export const TRINKETS = {
  /** 経理: a glint on the abacus or the coins now and then, `showMs` out of every `stepMs`. */
  sparkleStepMs: 1_120,
  sparkleShowMs: 420,
  /** Share of the steps with a glint. */
  sparkleShare: 0.6,
  /** 広報: a note or a "!" leaves the megaphone every `noteEveryMs` and lives `noteLifeMs`. */
  noteEveryMs: 840,
  noteLifeMs: 1_680,
  noteRisePx: 28,
  noteDriftPx: 20,
  /** Share of "!" among them. */
  bangShare: 0.25,
  /** 企画: a band of light crosses the globe once every `spinMs`, as if it turned. */
  spinMs: 1_960,
  spinBandPx: 4,
  /**
   * 総務: the papers on ささえ's file stack are sorted. Each turn of `shuffleMs` the top sheet
   * slides `shuffleSlidePx`, lifts its corner, then lies flat again; on a share of the turns a
   * sheet floats up off the stack, `floatRisePx` up and `floatDriftPx` aside at the top, and
   * settles back on it by `floatMs`.
   */
  shuffleMs: 1_680,
  shuffleSlidePx: 3,
  floatShare: 0.35,
  floatMs: 1_120,
  floatRisePx: 14,
  floatDriftPx: 6,
  /** The hourglass: a grain falls through the neck every `sandMs`. */
  sandMs: 700,
  /** A banner flutters while the confetti flies, `wavePx` at the bottom, one wave every `waveMs`. */
  waveMs: 560,
  wavePx: 4,
  /** The pet wakes once every `petIntervalMs` and sits up for `petSitMs`. */
  petIntervalMs: 21_000,
  petSitMs: 1_680,
  /** The light patches drift with the sun (from morning to evening) and sway a little. */
  patchDriftPx: 16,
  patchSwayPx: 2,
  patchSwayMs: 17_000,
} as const;

/** Day and night (daylight.ts): the light around the lamps at night and the sun in the windows. */
export const DAYLIGHT = {
  /** Radius of the light around a lantern or a pillar lamp, and around a candle or a sconce. */
  lampRadiusPx: 84,
  smallLampRadiusPx: 60,
  /** The radius grows by up to this share with the flame's flicker. */
  lampFlickerShare: 0.1,
  /** Warm light added around the lamps at full night. */
  glowAlpha: 0.3,
  /** Light added over the window tiles in full sun. */
  windowSunAlpha: 0.3,
} as const;

/**
 * かなめ tosses the scroll to a near desk now and then instead of walking it over (toss.ts, Issue
 * #12). A desk is near when its seat is at most `maxTiles` tiles from hers in a straight line; the
 * distance belongs to the office layout (GuildLayout.toss, render/layouts: in the four-department
 * office 経理 and 広報 at 5 tiles behind the counter are near, 企画 and 総務 at 5.8 in front of it
 * are walked to). For a near desk she tosses with chance `share`. She raises the scroll for
 * `windUpMs`, it flies `flightMs` on an arc whose middle is `arcPx` over the higher of her hands
 * and the member's, and she watches `watchMs` more after the catch. Times are ms, distances
 * logical px.
 */
export const TOSS = {
  maxTiles: SELECTED_LAYOUT.toss.maxTiles,
  share: 0.4,
  windUpMs: 700,
  flightMs: 900,
  watchMs: 500,
  arcPx: 24,
} as const;

/**
 * The members' lines at the moments of a scene (lines.ts, Issue #47). How long each shows: the one
 * who brings an item until it changes hands (`giveMs`, at most half of scenes.HANDOVER_MS), the
 * toss as the scroll flies off (`tossMs`), the one who takes it as they hold it up (`takeMs`), the
 * cleared member under the confetti (`clearMs`), then the king `kingGapMs` later (`kingMs`). A
 * member does not say again any of the last `recentLines` lines they said at the same moment (fewer
 * when the moment has fewer lines). While the member holds an item up over the head, words go
 * beside the item (overhead.placeOverheads, Issue #77); where neither side is free, and for a
 * sign with no words, what is over the head goes `raisedLiftPx` higher, so the whole bubble and
 * its tail sit over the item (overhead.test.ts checks every member). Words that would meet a 「Lv N」 tag on a desk go up until they are
 * `tagGapPx` over it (overhead.overheadLift). A member who starts waiting on someone (the waiting
 * bubble is new) says a line `remarkMs` long only when the injected random number is under
 * `remarkChance` (remarks.ts: now and then, not every time). One member at a time murmurs
 * (murmurs.ts) for `murmurMs`; the next comes `murmurGapMinMs` to `murmurGapMaxMs` after it (drawn
 * evenly), but never while a scene, a call or a remark plays nor sooner than `murmurRestMs` after
 * one. A sleeper is chosen with the weight `sleepTalkWeight` against 1 for anyone awake. Times are
 * ms, distances logical px.
 */
export const LINES = {
  giveMs: 1_500,
  tossMs: 1_200,
  takeMs: 1_800,
  clearMs: 2_000,
  kingGapMs: 400,
  kingMs: 1_600,
  remarkMs: 2_000,
  remarkChance: 0.3,
  murmurMs: 2_400,
  murmurGapMinMs: 40_000,
  murmurGapMaxMs: 90_000,
  murmurRestMs: 2_000,
  sleepTalkWeight: 0.3,
  recentLines: 2,
  raisedLiftPx: 34,
  tagGapPx: 2,
} as const;
