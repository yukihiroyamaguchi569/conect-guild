<script setup lang="ts">
import type { FetchStatusView } from '../app/guildView';

defineProps<{
  status: FetchStatusView;
  /** False when localStorage cannot be used (no events are shown). */
  effectsAvailable: boolean;
  /** Result of the last "基準を消す". */
  baselineNotice: string | null;
  /** The demo mode (Issue #49): its data are fictional and its baseline is not stored. */
  demo?: boolean;
  /**
   * One line, as a tab on the message window (six departments, Issue #121): the notes shrink to an
   * ellipsis, their whole text in the tooltip.
   */
  tab?: boolean;
}>();

const emit = defineEmits<{ 'clear-baseline': [] }>();

const EFFECTS_NOTE = 'localStorage が使えないため、演出は出ません';
const SESSIONS_HINT = '作業中・許可待ちは GitHub だけでは分からないため、いまは出していません';
</script>

<template>
  <section class="rpg-window fetch" :class="{ 'fetch--tab': tab }" aria-label="取得のようす">
    <p class="fetch__line">
      <span>最終取得 {{ status.fetchedAt ?? '--:--' }}</span>
      <span
        v-if="status.stale"
        class="fetch__badge fetch__badge--stale"
        title="5 分以上更新されていません。収集スクリプトが止まっているかもしれません"
        >情報が古い</span
      >
    </p>
    <p
      v-if="status.sessions !== null"
      class="fetch__line fetch__note"
      :title="tab ? `${status.sessions}。${SESSIONS_HINT}` : SESSIONS_HINT"
    >
      {{ status.sessions }}
    </p>
    <p
      v-if="status.failure !== null"
      class="fetch__line fetch__failure"
      role="status"
      :title="tab ? status.failure : undefined"
    >
      {{ status.failure }}
    </p>
    <p
      v-if="!effectsAvailable"
      class="fetch__line fetch__note"
      :title="tab ? EFFECTS_NOTE : undefined"
    >
      {{ EFFECTS_NOTE }}
    </p>
    <p class="fetch__line">
      <span v-if="demo" class="fetch__note">デモ（架空のデータ）</span>
      <button
        v-else
        type="button"
        class="rpg-button"
        title="この端末に保存した差分の基準（番号・状態・時刻）を消します"
        @click="emit('clear-baseline')"
      >
        基準を消す
      </button>
      <!-- Controls that sit on this line without making the window taller (the sound buttons). -->
      <slot />
      <span
        v-if="baselineNotice !== null"
        class="fetch__note"
        :title="tab ? baselineNotice : undefined"
        >{{ baselineNotice }}</span
      >
    </p>
  </section>
</template>

<style scoped>
.fetch {
  font-size: 0.8em;
  padding: 0.35em 0.6em;
}

.fetch__line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5em;
  margin: 0;
}

.fetch__line + .fetch__line {
  margin-top: 0.3em;
}

.fetch__badge {
  padding: 0 0.4em;
  border-radius: 0.25em;
  font-weight: 700;
}

.fetch__badge--stale {
  background: #b36b00;
  color: #fff;
}

.fetch__failure {
  color: var(--danger);
  font-weight: 700;
}

.fetch__note {
  color: var(--muted-text);
}

/*
 * The tab (GuildScreen.vue .stage__tab): every line side by side on one line, never wrapped. The
 * notes and the failure give way first, down to an ellipsis; the time and the buttons keep their
 * size. No bottom edge: it opens into the message window under it, and stays low enough for the
 * members walking above it (render/map.ts FETCH_TAB).
 */
.fetch--tab {
  display: flex;
  align-items: center;
  gap: 0.5em;
  padding: 0 0.6em;
  border-bottom: none;
  border-radius: 0.5em 0.5em 0 0;
  white-space: nowrap;
  overflow: hidden;
}

/* The sound buttons come through the slot, hence :deep. */
.fetch--tab :deep(.rpg-button) {
  padding: 0 0.5em;
  border-width: 0.1em;
  line-height: 1.15;
}

.fetch--tab .fetch__line {
  flex-wrap: nowrap;
}

.fetch--tab .fetch__line + .fetch__line {
  margin-top: 0;
}

.fetch--tab .fetch__line:last-child {
  min-width: 0;
}

/* Block, not flex, so that the text itself (not an anonymous flex item) gets the ellipsis. */
.fetch--tab p.fetch__note,
.fetch--tab .fetch__failure {
  display: block;
}

.fetch--tab .fetch__note,
.fetch--tab .fetch__failure {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
