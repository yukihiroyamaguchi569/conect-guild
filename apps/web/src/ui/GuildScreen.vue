<script setup lang="ts">
import type { CollectorFailureKind } from '@conect-guild/snapshot';
import { computed, watch } from 'vue';
import type { SnapshotLoadResult } from '../adapters/snapshot';
import type { DemoSession } from '../app/demo';
import { liveGuildOptions } from '../app/screenMode';
import { useGuild } from '../app/useGuild';
import { filterBoard, useBoardFilter } from '../app/useBoardFilter';
import { useMask } from '../app/useMask';
import { useMissingLabels } from '../app/useMissingLabels';
import { useNarration } from '../app/useNarration';
import { useSound } from '../app/useSound';
import { SELECTED_LAYOUT } from '../render/layouts';
import { BOARD_MAX_CQW, FETCH_TAB } from '../render/map';
import DemoStart from './DemoStart.vue';
import FetchStatus from './FetchStatus.vue';
import GuildCanvas from './GuildCanvas.vue';
import KingBubble from './KingBubble.vue';
import MaskControl from './MaskControl.vue';
import MessageWindow from './MessageWindow.vue';
import AutoDemoBanner from './AutoDemoBanner.vue';
import MissingLabelsBanner from './MissingLabelsBanner.vue';
import MixupsBanner from './MixupsBanner.vue';
import PartyStatus from './PartyStatus.vue';
import QuestBoard from './QuestBoard.vue';
import SoundControl from './SoundControl.vue';

const props = defineProps<{
  /**
   * The fictional script instead of /snapshot.json, nothing kept: `?demo=1` (Issue #49) or the
   * automatic demo while nothing is collected (Issue #67). null: the live data. Fixed for the
   * screen's lifetime (App.vue builds a new screen when it changes).
   */
  demo: DemoSession | null;
  /** The read that ended the automatic demo (Issue #67); null otherwise. */
  handoff: SnapshotLoadResult | null;
  /** The collector's failure, for the automatic demo's banner (Issue #74); null otherwise. */
  collectorFailure: CollectorFailureKind | null;
}>();
const emit = defineEmits<{
  /** /snapshot.json is not there yet (204) and nothing was shown: the collector never ran. */
  'not-collected': [];
}>();
const demo = props.demo;
/** はじめる waits for a click in the demo of ?demo=1 only; the automatic one starts itself. */
const demoWaiting = computed(() => demo !== null && !demo.auto && !demo.started.value);
/** Department labels missing in the repository (Issue #85), read on the live screen only. */
const { missing: missingLabels, mixups } = useMissingLabels(demo === null);
const showMissingLabels = computed(() => missingLabels.value.length > 0);
/**
 * Departments suspected to be mixed up (Issue #94). One strip at a time: the missing labels come
 * first, and this shows once they are fixed.
 */
const showMixups = computed(() => !showMissingLabels.value && mixups.value.length > 0);

const {
  state,
  board,
  party,
  king,
  fetchStatus,
  message,
  cue,
  summons,
  guests,
  guestCount,
  guestBoard,
  sparkle,
  nextMessage,
  clearBaseline,
  setStageShown,
  setStage,
  occupy,
} = useGuild(demo?.guildOptions ?? liveGuildOptions(props.handoff));
const {
  settings: soundSettings,
  toggleSound,
  cycleVolume,
  callStarted,
} = useSound({ message, party, halted: () => state.halted }, demo?.storage);
/** The show mode (Issue #144): live screen only, the demo's titles are fictional. */
const { masked, toggleMask } = useMask(demo === null);
/** The board's today, near or all filter (Issues #174, #178), judged at the snapshot's fetch. */
const { show, toggleShow } = useBoardFilter(demo?.storage);
const shownBoard = computed(() =>
  filterBoard(
    board.value,
    show.value,
    state.snapshot === null ? 0 : Date.parse(state.snapshot.fetchedAt),
  ),
);
const { narration, next, idleSeeds, setIdleSince, examine } = useNarration({
  message,
  party,
  snapshot: () => state.snapshot,
  nextMessage,
  halted: () => state.halted,
});

watch(
  () => fetchStatus.value.notCollected,
  (notCollected) => {
    if (notCollected) emit('not-collected');
  },
);

/**
 * The fetch status is a one-line tab on the message window's top edge (Issue #121; every layout
 * since Issue #132), so that its notes never make the right-hand column taller. Halted, there is no
 * message window to sit on: the fetch status goes back to the column.
 */
const tabbed = computed(() => !state.halted);
const fetchTabStyle = {
  '--tab-max-width': `${String(FETCH_TAB.maxWidthPct)}%`,
  '--tab-height': `${String(FETCH_TAB.heightCqw)}cqw`,
};

/** The canvas on screen or not: the messages stop waiting for scenes, the demo cannot start. */
function onStageShown(shown: boolean): void {
  setStageShown(shown);
  demo?.setStageShown(shown);
}
</script>

<template>
  <main class="guild" :class="{ 'guild--banner': demo?.auto || showMissingLabels || showMixups }">
    <AutoDemoBanner
      v-if="demo?.auto"
      class="guild__banner"
      :collector-failure="props.collectorFailure"
    />
    <MissingLabelsBanner v-if="showMissingLabels" class="guild__banner" :missing="missingLabels" />
    <MixupsBanner v-if="showMixups" class="guild__banner" :mixups="mixups" />
    <div class="stage" :class="{ 'stage--halted': state.halted }">
      <GuildCanvas
        class="stage__art"
        :party="party"
        :cue="cue"
        :idle-seeds="idleSeeds"
        :summons="summons"
        :halted="state.halted"
        :guests="guests"
        :guest-count="guestCount"
        :sparkle="sparkle"
        :last-active-storage="demo?.storage"
        @stage-shown="onStageShown"
        @stage="setStage"
        @away="occupy"
        @call-started="callStarted"
        @idle-since="setIdleSince"
        @ready="demo?.markReady()"
        @examine="examine"
      />
      <section v-if="state.halted" class="rpg-window stage__halt" role="alert">
        <template v-if="state.haltReason === 'repo-mismatch'">
          <h2 class="rpg-window__title">収集の対象と設定が違います</h2>
          <p>
            snapshot.json のリポジトリが設定（guild.settings.local.json があればそちら、無ければ
            guild.settings.json）の repo と違うため、表示を止めています。collector
            を起動し直して、新しいリポジトリの収集が終わるのを待ってください。
          </p>
        </template>
        <template v-else>
          <h2 class="rpg-window__title">収集スクリプトを更新してください</h2>
          <p>snapshot.json の形（schemaVersion）が画面の想定と違うため、表示を止めています。</p>
        </template>
      </section>
      <template v-else>
        <QuestBoard
          class="stage__board"
          :style="{ '--board-max-height': `${SELECTED_LAYOUT.boardMaxCqw ?? BOARD_MAX_CQW}cqw` }"
          :groups="shownBoard.groups"
          :guests="guestBoard"
          :loaded="state.snapshot !== null"
          :masked="masked"
          :show="show"
          :hidden="shownBoard.hidden"
          @toggle-show="toggleShow"
        />
        <KingBubble class="stage__king" :waiting="king.waiting" :detail="king.detail" />
        <MessageWindow
          class="stage__message"
          :message="message"
          :remaining="Math.max(state.messages.length - 1, 0)"
          :narration="narration"
          :masked="masked"
          @next="next"
        />
        <DemoStart
          v-if="demoWaiting"
          class="stage__demo"
          :block="demo?.block.value ?? null"
          @start="demo?.start()"
        />
      </template>
      <div class="stage__side">
        <PartyStatus
          v-if="!state.halted"
          class="stage__party"
          :rows="party"
          :dense="SELECTED_LAYOUT.partyWindow.dense"
          :tight="SELECTED_LAYOUT.partyWindow.tight"
        />
        <FetchStatus
          v-if="!tabbed"
          :status="fetchStatus"
          :effects-available="state.effectsAvailable"
          :baseline-notice="state.baselineNotice"
          :demo="demo !== null"
          @clear-baseline="clearBaseline"
        >
          <SoundControl
            :settings="soundSettings"
            @toggle="toggleSound"
            @cycle-volume="cycleVolume"
          />
          <MaskControl v-if="demo === null" :masked="masked" @toggle="toggleMask" />
        </FetchStatus>
      </div>
      <FetchStatus
        v-if="tabbed"
        class="stage__tab"
        :style="fetchTabStyle"
        tab
        :status="fetchStatus"
        :effects-available="state.effectsAvailable"
        :baseline-notice="state.baselineNotice"
        :demo="demo !== null"
        @clear-baseline="clearBaseline"
      >
        <SoundControl :settings="soundSettings" @toggle="toggleSound" @cycle-volume="cycleVolume" />
        <MaskControl v-if="demo === null" :masked="masked" @toggle="toggleMask" />
      </FetchStatus>
    </div>
  </main>
</template>

<style scoped>
.guild {
  /* The automatic demo's banner above the stage (Issue #67); the stage leaves it room. */
  --banner-height: 0px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
}

.guild--banner {
  --banner-height: 28px;
}

/*
 * The windows sit over the canvas (logical 1024 x 576, 16:9) where the map keeps nobody
 * (render/map.ts WINDOW_EXTENTS). Sizes follow the stage width through container query units.
 */
.stage {
  position: relative;
  width: min(100%, 1672px, calc((100vh - var(--banner-height)) * 16 / 9));
  min-width: 320px;
  container-type: inline-size;
  font-size: clamp(9px, 1.15cqw, 19px);
}

.stage__art {
  display: block;
}

/* Halted: the stage must not pass for live data. */
.stage--halted .stage__art {
  filter: blur(4px) brightness(0.35);
}

.stage__board,
.stage__side,
.stage__tab,
.stage__message,
.stage__king,
.stage__halt,
.stage__demo {
  position: absolute;
}

.stage__board {
  left: 1.2%;
  top: 1.6%;
  width: 29%;
  /* Heights in cqw (stage width) because the stage height is 9/16 of it. */
  min-height: 17.7cqw;
  /* render/map.ts WINDOW_EXTENTS: ends above the lower desks' bubbles even mid-stretch (31cqw, less
     with the workshop desk of five and six departments). */
  max-height: var(--board-max-height, 31cqw);
}

/* The party window; the fetch status joins it only when the screen halts. */
.stage__side {
  right: 1.1%;
  top: 1.6%;
  width: 24.6%;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}

.stage__party {
  min-height: 21.1cqw;
}

/* Above the king on the throne (render/map.ts: seat col 16, row 4), tail towards him. */
.stage__king {
  left: 52.5%;
  top: 0.8%;
  width: 9.6%;
  height: 7%;
}

/*
 * The fetch status as a tab on the message window's top edge, at its right end (render/map.ts
 * FETCH_TAB sets its max-width and height).
 */
.stage__tab {
  right: 9.8%;
  bottom: 19.3%;
  max-width: var(--tab-max-width);
  height: var(--tab-height);
}

.stage__message {
  left: 9.8%;
  bottom: 1.9%;
  width: 80.4%;
  height: 17.4%;
}

.stage__halt {
  left: 25%;
  top: 35%;
  width: 50%;
  font-size: 1.2em;
}

/* The demo's はじめる, over the middle of the room. */
.stage__demo {
  left: 32%;
  top: 30%;
  width: 36%;
  font-size: 1.1em;
}

/*
 * Narrow screens: stack the windows. The canvas is hidden because the windows no longer leave
 * its stage free; the king's row still shows 承認まち.
 */
@container (max-width: 760px) {
  .stage__art,
  .stage__king {
    display: none;
  }

  .stage__board,
  .stage__side,
  .stage__tab,
  .stage__message,
  .stage__halt,
  .stage__demo {
    position: static;
    width: auto;
    min-height: 0;
    max-height: none;
    max-width: none;
    height: auto;
    margin: 0.6em;
    font-size: 14px;
  }
}

@media (max-width: 760px) {
  .stage {
    width: 100%;
  }
}
</style>
