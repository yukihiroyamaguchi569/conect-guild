<script setup lang="ts">
import type { BoardGroup, GuestBoardGroup } from '../app/guildView';
import type { BoardFilter } from '../app/useBoardFilter';
import { maskTitle } from '../domain/mask';

withDefaults(
  defineProps<{
    groups: readonly BoardGroup[];
    /** The お客さん section (Issue #108); empty without guests, and then not shown. */
    guests: readonly GuestBoardGroup[];
    /** False until the first snapshot arrives. */
    loaded: boolean;
    /** The show mode (Issue #144): titles are masked, numbers and names are not. */
    masked?: boolean;
    /** The filter (Issue #174): today's quests only (Issue #178), near ones (the default) or all. */
    show?: BoardFilter;
    /** Quests the today or near filter left out (「ほか N 件」). */
    hidden?: number;
  }>(),
  { masked: false, show: 'near', hidden: 0 },
);

const emit = defineEmits<{ 'toggle-show': [] }>();

/** The switch's label for each filter. */
const FILTER_LABELS = {
  today: 'きょう',
  near: 'ちかいもの',
  all: 'すべて',
} as const satisfies Record<BoardFilter, string>;
</script>

<template>
  <section class="rpg-window board" aria-label="クエスト掲示板">
    <h2 class="rpg-window__title board__title">クエスト掲示板</h2>
    <p class="board__filter">
      <button
        type="button"
        class="rpg-button"
        title="きょう: 締め切り（題名の 〆M/D）かやる日（@M/D）が今日か過ぎたものだけを出します。ちかいもの: 締め切りが 7 日以内か過ぎたもの、やる日が来たもの、どちらの印もないものだけを出します。押すと きょう → ちかいもの → すべて の順に切り替えます（この端末にだけ保存します）"
        @click="emit('toggle-show')"
      >
        {{ FILTER_LABELS[show] }}
      </button>
    </p>
    <p v-if="!loaded" class="board__empty">よみこみちゅう…</p>
    <p v-else-if="groups.length === 0 && hidden > 0" class="board__empty">
      {{ show === 'today' ? 'きょうの クエストは ありません' : 'ちかい クエストは ありません' }}
    </p>
    <p v-else-if="groups.length === 0" class="board__empty">
      {{
        guests.length > 0 ? '会社の クエストは いまは ありません' : 'いまは クエストが ありません'
      }}
    </p>
    <div class="board__list">
      <div v-for="group in groups" :key="group.key" class="board__group">
        <h3 class="board__group-label">
          <span class="board__dot" :style="{ background: group.color }" />{{ group.label }}
        </h3>
        <ul class="board__scrolls">
          <li v-for="quest in group.quests" :key="quest.number" class="scroll">
            <span class="scroll__number">#{{ quest.number }}</span>
            <span class="scroll__title">{{ masked ? maskTitle(quest.title) : quest.title }}</span>
            <span
              v-if="quest.multiDepartment"
              class="scroll__multi"
              title="部門ラベルが複数あります。最初の部門が担当します"
              >複数部門</span
            >
          </li>
        </ul>
      </div>
      <p v-if="hidden > 0" class="board__more">
        ほか {{ hidden }} 件（{{ show === 'today' ? '今日より 先・印なし' : '日付が 先' }}）
      </p>
    </div>
    <section v-if="guests.length > 0" class="board__guests" aria-label="お客さん">
      <h3 class="board__section">お客さん</h3>
      <div v-for="guest in guests" :key="guest.key" class="board__guest">
        <h4 class="board__group-label">{{ guest.name }}</h4>
        <p v-if="guest.items !== null && guest.items.length === 0" class="board__none">
          ひらいている Issue・PR は ない
        </p>
        <ul v-if="guest.items !== null" class="board__guest-items">
          <li v-for="item in guest.items" :key="item.number" class="guest-item">
            <span class="guest-item__number">#{{ item.number }}</span>
            <span v-if="item.isPr" class="guest-item__pr">PR</span>
            <span class="guest-item__title">{{ masked ? maskTitle(item.title) : item.title }}</span>
          </li>
        </ul>
        <p v-if="guest.more > 0" class="board__more">ほか {{ guest.more }} 件</p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
}

.board__title {
  background: linear-gradient(180deg, #1d3aa8, #0f2273);
  border: 0.12em solid #e8c66a;
  border-radius: 0.3em;
  padding: 0.15em 0;
}

.board__filter {
  margin: 0.2em 0.3em 0;
  text-align: right;
  font-size: 0.75em;
}

.board__empty {
  margin: 0.6em 0;
  text-align: center;
  color: var(--muted-text);
}

/*
 * Only the company's quests scroll; the お客さん section stays under them, whole, however many
 * quests there are (Issue #121: the lower board of five departments showed only its heading).
 */
.board__list {
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
}

.board__group + .board__group {
  margin-top: 0.3em;
}

.board__group-label {
  margin: 0.1em 0 0.15em;
  font-size: 0.8em;
  font-weight: 700;
  color: var(--muted-text);
}

.board__dot {
  display: inline-block;
  width: 0.6em;
  height: 0.6em;
  margin-right: 0.35em;
  border-radius: 50%;
  border: 0.08em solid #fff;
}

.board__scrolls {
  margin: 0;
  padding: 0;
  list-style: none;
}

.scroll {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 0.4em;
  margin: 0 0.5em 0.25em;
  padding: 0.2em 0.9em;
  background: var(--scroll-paper);
  color: var(--scroll-ink);
  border-top: 0.1em solid var(--scroll-edge);
  border-bottom: 0.1em solid var(--scroll-edge);
  font-weight: 700;
}

/* Rolled ends of the scroll. */
.scroll::before,
.scroll::after {
  content: '';
  position: absolute;
  top: -0.15em;
  bottom: -0.15em;
  width: 0.55em;
  border-radius: 0.3em;
  background: linear-gradient(90deg, #a77b35, #f1d79a 50%, #a77b35);
}

.scroll::before {
  left: -0.4em;
}

.scroll::after {
  right: -0.4em;
}

.scroll__number {
  flex: none;
}

.scroll__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board__guests {
  flex: none;
  margin-top: 0.4em;
  padding-top: 0.25em;
  border-top: 0.1em dashed var(--muted-text);
}

.board__section {
  margin: 0 0 0.1em;
  font-size: 0.85em;
  font-weight: 700;
}

.board__guest + .board__guest {
  margin-top: 0.2em;
}

.board__guest-items {
  margin: 0;
  padding: 0;
  list-style: none;
}

.guest-item {
  display: flex;
  align-items: baseline;
  gap: 0.35em;
  margin: 0 0.5em 0.1em;
  font-size: 0.85em;
}

.guest-item__number {
  flex: none;
  color: var(--muted-text);
}

.guest-item__pr {
  flex: none;
  font-size: 0.8em;
  padding: 0 0.3em;
  border-radius: 0.25em;
  background: #2b5d8e;
  color: #fff;
}

.guest-item__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board__none,
.board__more {
  margin: 0 0.5em 0.1em;
  font-size: 0.8em;
  color: var(--muted-text);
}

.scroll__multi {
  flex: none;
  font-size: 0.7em;
  padding: 0 0.35em;
  border-radius: 0.25em;
  background: #8e2b2b;
  color: #fff;
}
</style>
