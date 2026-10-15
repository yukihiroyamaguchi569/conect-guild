<script setup lang="ts">
import type { PartyRow } from '../app/guildView';

defineProps<{
  rows: readonly PartyRow[];
  /** Packed rows, so that seven or eight fit (the layouts of five and six departments). */
  dense?: boolean;
  /** Packed tighter still, the type unchanged (six departments, Issue #121). */
  tight?: boolean;
}>();
</script>

<template>
  <section
    class="rpg-window party"
    :class="{ 'party--dense': dense, 'party--tight': tight }"
    aria-label="パーティのようす"
  >
    <h2 class="rpg-window__title">パーティのようす</h2>
    <p v-if="rows.length === 0" class="party__empty">よみこみちゅう…</p>
    <ul class="party__rows">
      <li
        v-for="row in rows"
        :key="row.id"
        class="member"
        :class="`member--${row.state}`"
        :title="row.tooltip ?? undefined"
      >
        <span class="member__face" :style="{ background: row.face.fill, color: row.face.ink }">{{
          row.name.charAt(0)
        }}</span>
        <span class="member__name" :title="`${row.name} ${row.role}`">
          {{ row.name }}<small class="member__role">{{ row.role }}</small>
        </span>
        <span class="member__level" :title="row.level.detail">
          {{ row.level.label }}
          <span
            v-if="row.level.progress !== null"
            class="member__gauge"
            role="meter"
            aria-label="つぎのレベルまで"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="Math.round(row.level.progress * 100)"
            ><span
              class="member__gauge-fill"
              :style="{ width: `${row.level.progress * 100}%` }"
            ></span
          ></span>
        </span>
        <span class="member__state">{{ row.stateLabel }}</span>
        <span v-if="row.rewards !== null" class="member__rewards" title="直近 7 日にマージされた PR"
          >成果 {{ row.rewards }}</span
        >
      </li>
    </ul>
  </section>
</template>

<style scoped>
.party__empty {
  margin: 0.6em 0;
  text-align: center;
  color: var(--muted-text);
}

.party__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.member {
  display: grid;
  grid-template-columns: 1.7em minmax(0, 1fr) auto auto;
  grid-template-areas:
    'face name level rewards'
    'face state state state';
  align-items: center;
  column-gap: 0.45em;
  padding: 0.18em 0.35em;
  border: 0.1em solid rgb(255 255 255 / 35%);
  border-radius: 0.3em;
  background: rgb(0 0 0 / 25%);
}

.member + .member {
  margin-top: 0.2em;
}

/* Seven or eight rows (render/layouts partyWindow.dense): smaller type and gaps, same layout. */
.party--dense .rpg-window__title {
  margin-bottom: 0.2em;
}

.party--dense .member {
  padding: 0.06em 0.35em;
  font-size: 0.92em;
  line-height: 1.15;
}

.party--dense .member + .member {
  margin-top: 0.14em;
}

/*
 * Eight rows above the sales desk's bubble (render/layouts partyWindow.tight, Issue #121): the
 * dense type, with the room around it taken out.
 */
.party--tight {
  padding-top: 0.3em;
  padding-bottom: 0.3em;
}

.party--tight .rpg-window__title {
  margin-bottom: 0.1em;
  line-height: 1.2;
}

.party--tight .member {
  padding: 0 0.35em;
  line-height: 1.05;
}

.party--tight .member + .member {
  margin-top: 0.08em;
}

.member[title] {
  cursor: help;
}

.member__face {
  grid-area: face;
  display: grid;
  place-items: center;
  width: 1.6em;
  height: 1.6em;
  border-radius: 50%;
  border: 0.1em solid #fff;
  font-weight: 700;
  font-size: 0.95em;
}

/*
 * Names, roles and states from the settings may be long: one line each, cut with an ellipsis, so
 * that a row never grows past the column the layouts measured (render/layouts partyWindow).
 */
.member__name,
.member__state {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member__name {
  grid-area: name;
  font-weight: 700;
}

.member__role {
  margin-left: 0.4em;
  font-size: 0.75em;
  font-weight: 400;
  color: var(--muted-text);
}

.member__state {
  grid-area: state;
  font-size: 0.85em;
  font-weight: 700;
}

.member__level {
  grid-area: level;
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  font-size: 0.75em;
  font-weight: 700;
  line-height: 1.1;
  color: #ffe9a8;
}

/* A thin bar under 「Lv N」: the way to the next level. Its height adds nothing to the row. */
.member__gauge {
  display: block;
  height: 0.25em;
  margin-top: 0.1em;
  border-radius: 0.1em;
  background: rgb(255 255 255 / 20%);
  overflow: hidden;
}

.member__gauge-fill {
  display: block;
  height: 100%;
  background: #ffd75e;
}

.member__rewards {
  grid-area: rewards;
  font-size: 0.75em;
  color: var(--accent);
}

.member--awaiting-permission .member__state {
  color: #ff6b6b;
}

/* Live states (MulmoTerminal) blink a dot, so they read as happening right now. */
.member--awaiting-permission .member__state::before,
.member--busy .member__state::before {
  content: '●';
  margin-right: 0.3em;
  animation: member-live 1.2s ease-in-out infinite;
}

.member--busy .member__state {
  color: #8dffb0;
}

@keyframes member-live {
  50% {
    opacity: 0.25;
  }
}

@media (prefers-reduced-motion: reduce) {
  .member--awaiting-permission .member__state::before,
  .member--busy .member__state::before {
    animation: none;
  }
}

.member--awaiting-president .member__state {
  color: #ff9ad5;
}

.member--awaiting-kaname .member__state {
  color: var(--accent);
}

.member--working .member__state {
  color: #6cf07a;
}

.member--done .member__state {
  color: #6cc8ff;
}

.member--idle .member__state {
  color: var(--muted-text);
}
</style>
