<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import {
  EMPTY_CUE_QUEUE,
  guestCueToPlay,
  guestSparkleAfterHalt,
  receiveCue,
  takeCues,
  type GuestCue,
  type PartyRow,
  type SceneCue,
} from '../app/guildView';
import type { GuestView } from '../domain/guests';
import type { KeyValueStore } from '../adapters/storage';
import type { Summons } from '../app/guildStore';
import type { StageRecall } from '../app/messageQueue';
import { createGuestLastActiveTracker } from '../app/guestLastActive';
import { createLastActiveTracker } from '../app/lastActive';
import { bootStage, cueAction, type StageState } from '../app/stageBoot';
import { ambientMoodsOf } from '../render/ambient';
import type { GuildArt } from '../render/art';
import { bubblesOf } from '../render/bubbles';
import {
  CLICKABLES,
  MEMBER_SEAT_CLICKABLES,
  memberClickables,
  pressedAt,
  pressStyle,
  toLogical,
  withMembers,
  type Clickable,
} from '../render/clickables';
import { pressLinesOf, type PressLines } from '../render/examine';
import { monthAt } from '../render/ornament';
import { hourFromQuery } from '../render/daylight';
import { levelsOf } from '../render/levelTags';
import { kingQuestCountOf } from '../render/murmurs';
import type { GuestArt } from '../render/guestArt';
import { stageGuestsOf, type StageGuest } from '../render/guests';
import { loadArt, loadGuestArt, loadVisitorArt } from '../render/loadArt';
import type { IdleSeeds, IdleSince } from '../render/idle';
import type { HomeIn } from '../render/idleCrew';
import { isShown, startRenderLoop, type RenderLoop, type StageParty } from '../render/loop';
import PressGroup from './PressGroup.vue';

const props = defineProps<{
  /** Party rows; members who wait on someone get a bubble over their seat. */
  party: readonly PartyRow[];
  /** The event of the message now in the window; its scene starts when it changes. */
  cue: SceneCue | null;
  /** Per-member salts of the idle spells, shared with the narration (Issue #30). */
  idleSeeds: IdleSeeds;
  /** The president's latest order: the king calls those members when its id changes (Issue #28). */
  summons: Summons | null;
  /** The screen is halted: the king's calls stop (to come and playing). */
  halted: boolean;
  /** Where the idle times are kept; localStorage when absent (the demo keeps them in memory). */
  lastActiveStorage?: KeyValueStore;
  /** The guests at their spots (Issue #108). */
  guests: readonly GuestView[];
  /** How many guests the settings have: only their pictures are loaded. */
  guestCount: number;
  /** The guest whose PR or Issue the message now in the window reports: it sparkles. */
  sparkle: GuestCue | null;
}>();

const emit = defineEmits<{
  /** Whether the canvas is on screen (narrow screens hide it); sent on every change. */
  stageShown: [shown: boolean];
  /** Since when each member has had nothing to do, on every change (for the narration). */
  idleSince: [since: IdleSince];
  /** A call of the king starts on the stage now (its sound rings with it, Issue #28). */
  callStarted: [];
  /**
   * かなめ walks to the throne to hear the king's order (Issue #87): how long until she is back
   * (ms), for the message queue to wait for.
   */
  away: [homeIn: HomeIn];
  /** The stage once the loop runs, null when it stops: the message queue calls members back. */
  stage: [stage: StageRecall | null];
  /**
   * The pictures are in and the stage runs: scenes and calls from now on are played. Sent once,
   * even when the stage failed to start, so that nothing waits on it for ever.
   */
  ready: [];
  /**
   * A thing of the room was pressed (Issue #190): the message window tells what was in it, or what
   * the month's ornament is (Issue #192), from `lines`.
   */
  examine: [lines: PressLines];
}>();

const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
let loop: RenderLoop | null = null;
let observer: ResizeObserver | null = null;
let unmounted = false;
/** The latest displayed width (CSS px); null until the first observation. */
let cssWidth: number | null = null;
/** Cues seen so far; those that arrive while the pictures load wait for the loop. */
let cues = EMPTY_CUE_QUEUE;
/** The message last sparkled for (guestCueToPlay). */
let sparkledId: number | null = null;
/** When each member last had work (localStorage), for dozing, sleeping and playing (Issue #23). */
const lastActive = createLastActiveTracker(props.lastActiveStorage);
let idleSince: IdleSince = {};
/** When each guest last had work (localStorage), for dozing and sleeping on the spot (Issue #183). */
const guestLastActive = createGuestLastActiveTracker(props.lastActiveStorage);

function stageGuests(guests: readonly GuestView[]): StageGuest[] {
  return stageGuestsOf(guests, guestLastActive.observe(guests, Date.now()));
}

function setIdleSince(next: IdleSince): void {
  idleSince = next;
  emit('idleSince', next);
}

function stageParty(rows: readonly PartyRow[]): StageParty {
  return {
    bubbles: bubblesOf(rows),
    moods: ambientMoodsOf(rows),
    idleSince,
    halted: props.halted,
    // Before the first snapshot the party is empty: not one to compare with (render/remarks.ts).
    known: rows.length > 0,
    levels: levelsOf(rows),
    kingQuests: kingQuestCountOf(rows),
  };
}

/** Loading its pictures, running, or failed to start (app/stageBoot.ts). */
let stage: StageState = 'loading';

/**
 * Starts the queued scenes in order, once the loop runs. While the canvas is out of sight they are
 * dropped, so they never play late (the message queue does not wait for them either); so they are
 * when the stage failed to start.
 */
function playCues(): void {
  const action = cueAction(stage, cssWidth !== null && !isShown(cssWidth));
  if (action === 'wait') return;
  const taken = takeCues(cues);
  cues = taken.queue;
  if (action === 'drop') return;
  for (const cue of taken.play) loop?.play(cue.event);
}

/** Dev only: `?hour=21.5` fixes the time of day, to check the day and the night by hand. */
const fixedHour = import.meta.env.DEV ? hourFromQuery(globalThis.location.search) : null;

/** Epoch ms: the month of the ornament drawn and of its line on a press is read from it (#192). */
const wallNow = (): number => Date.now();

function start(
  element: HTMLCanvasElement,
  art: GuildArt,
  { guestArt, visitorArt }: { readonly guestArt: GuestArt; readonly visitorArt: GuestArt },
): void {
  const running = startRenderLoop({
    canvas: element,
    art,
    guestArt,
    visitorArt,
    wallNow,
    ...(fixedHour === null ? {} : { localHour: () => fixedHour }),
    idleSeeds: props.idleSeeds,
    onCallStart: () => {
      emit('callStarted');
    },
    onActive: (ids, at) => {
      setIdleSince(lastActive.markActive(ids, at));
      loop?.setParty(stageParty(props.party));
    },
  });
  loop = running;
  stage = 'running';
  setIdleSince(lastActive.observe(props.party, Date.now()));
  running.setParty(stageParty(props.party));
  running.setGuests(stageGuests(props.guests));
  // The message in the window may have come while the pictures were loading.
  takeSparkle();
  running.resize(cssWidth ?? element.clientWidth, globalThis.devicePixelRatio);
  // Messages may have reached the window while the pictures were loading.
  playCues();
  // Only a loop that started in full calls members back for the message queue.
  emit('stage', running);
}

/** Follows the displayed width, from mount on, so the message queue knows it before the art. */
function observe(element: HTMLCanvasElement): void {
  observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? element.clientWidth;
    if (cssWidth === null || isShown(width) !== isShown(cssWidth))
      emit('stageShown', isShown(width));
    cssWidth = width;
    loop?.resize(width, globalThis.devicePixelRatio);
    playCues();
  });
  observer.observe(element);
}

onMounted(() => {
  if (canvas.value !== null) observe(canvas.value);
  // The loop starts once the pictures are in, so the cached background has them.
  const pictures = [loadArt(), loadGuestArt(props.guestCount), loadVisitorArt()] as const;
  void Promise.all(pictures).then(([art, guestArt, visitorArt]) => {
    const element = canvas.value;
    if (unmounted || element === null) return;
    // A stage that cannot start (no 2D context, for one) leaves the windows, messages and sounds
    // going without the room; `ready` is sent either way (the demo's はじめる waits for it).
    stage = bootStage(
      () => {
        start(element, art, { guestArt, visitorArt });
      },
      {
        failed: (error) => {
          globalThis.console.error('the stage could not start', error);
          // A loop that started but failed halfway (sizing, the first party) is not trusted: it
          // stops, and the stage counts as failed (its cues are dropped).
          loop?.stop();
          loop = null;
          emit('stage', null);
        },
        ready: () => {
          emit('ready');
        },
      },
    );
    playCues();
  });
});

onBeforeUnmount(() => {
  unmounted = true;
  observer?.disconnect();
  loop?.stop();
  loop = null;
  emit('stage', null);
});

watch(
  () => props.party,
  (rows) => {
    setIdleSince(lastActive.observe(rows, Date.now()));
    loop?.setParty(stageParty(rows));
  },
);

watch(
  () => props.halted,
  (halted) => {
    loop?.setParty(stageParty(props.party));
    // The window is hidden while halted: the guest line in it sparkles again once it is back.
    sparkledId = guestSparkleAfterHalt(sparkledId, halted);
    takeSparkle();
  },
);

/** Takes the message now in the window (once per message: receiveCue) and plays its scene. */
function takeCue(): void {
  cues = receiveCue(cues, props.cue);
  playCues();
}

// Not kept for later: an order seen while the pictures load or the canvas is out of sight is past.
// The message of the same fetch is taken first, whichever watcher runs first: a scene that needs
// かなめ is booked before the call, so she answers where she is (Issue #87).
watch(
  () => props.summons?.id,
  () => {
    takeCue();
    if (props.summons === null || loop === null) return;
    const homeIn = loop.summon(props.summons.members, props.summons.from);
    if (Object.keys(homeIn).length > 0) emit('away', homeIn);
  },
);

watch(
  () => props.guests,
  (guests) => {
    // Observed even while the pictures load, so the idle times follow every snapshot.
    const next = stageGuests(guests);
    loop?.setGuests(next);
  },
);

/** Sparkles the guest of the message in the window, once, as soon as the stage runs. */
function takeSparkle(): void {
  const taken = guestCueToPlay(sparkledId, props.sparkle, loop !== null && !props.halted);
  sparkledId = taken.lastId;
  if (taken.play !== null) loop?.sparkle(taken.play);
}

watch(() => props.sparkle?.id, takeSparkle);

/**
 * What a press on each thing on the canvas does (render/clickables.ts, Issues #187, #186 and
 * #190). Nothing while halted.
 */
function press(item: Clickable): void {
  if (props.halted) return;
  if (item.id === 'thing') emit('examine', pressLinesOf(item.thing, monthAt(wallNow())));
  else if (item.id === 'member') loop?.ask(item.member);
  else if (item.id === 'king') loop?.bless();
  else loop?.pet();
}

/** The king and the pet have a button each; the members, and the room's things, share one stop of Tab. */
const SOLO_PRESSES = CLICKABLES.filter((item) => item.id !== 'thing');
const THING_PRESSES = CLICKABLES.filter((item) => item.id === 'thing');

/** The pointer is over something to press: the cursor shows it. */
const pointing = ref(false);

/** What is under the pointer of `event` on the canvas, if anything. */
function clickableUnder(event: MouseEvent): Clickable | null {
  const element = canvas.value;
  if (element === null) return null;
  const box = element.getBoundingClientRect();
  const offset = { x: event.clientX - box.left, y: event.clientY - box.top };
  // The members are found where they were last drawn (Issue #191).
  const items = withMembers(CLICKABLES, memberClickables(loop?.feet() ?? []));
  return pressedAt(toLogical(offset, box), items);
}

function onClick(event: MouseEvent): void {
  const item = clickableUnder(event);
  if (item !== null) press(item);
}

function onPointerMove(event: MouseEvent): void {
  pointing.value = !props.halted && clickableUnder(event) !== null;
}

watch(
  () => props.halted,
  (halted) => {
    if (halted) pointing.value = false;
  },
);

// The message in the window at mount counts too.
watch(() => props.cue?.id, takeCue, { immediate: true });
</script>

<template>
  <div class="guild-canvas">
    <canvas
      ref="canvas"
      class="guild-canvas__art"
      :class="{ 'guild-canvas__art--pointing': pointing }"
      aria-label="ギルドの社屋"
      role="img"
      @click="onClick"
      @pointermove="onPointerMove"
      @pointerleave="pointing = false"
    />
    <!-- For the keyboard: the mouse presses through them on the canvas (render/clickables.ts). -->
    <template v-if="!halted">
      <button
        v-for="item in SOLO_PRESSES"
        :key="item.id"
        type="button"
        class="guild-canvas__press"
        :style="pressStyle(item.rect)"
        :aria-label="item.label"
        @click="press(item)"
      />
      <PressGroup :items="MEMBER_SEAT_CLICKABLES" label="メンバー" @press="press" />
      <PressGroup
        v-if="THING_PRESSES.length > 0"
        :items="THING_PRESSES"
        label="へやの こもの"
        @press="press"
      />
    </template>
  </div>
</template>

<style scoped>
.guild-canvas {
  position: relative;
}

.guild-canvas__art {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  image-rendering: pixelated;
  user-select: none;
}

.guild-canvas__art--pointing {
  cursor: pointer;
}

.guild-canvas__press {
  position: absolute;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  pointer-events: none;
}

.guild-canvas__press:focus-visible {
  outline: 2px dashed #fff;
  outline-offset: -2px;
}
</style>
