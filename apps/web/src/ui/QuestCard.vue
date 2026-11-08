<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue';
import { RARITY_LABELS, type QuestCard } from '../app/questCard';
import { maskTitle } from '../domain/mask';

const props = withDefaults(
  defineProps<{
    card: QuestCard;
    /** The show mode (Issue #144): the title is masked, the number and names are not. */
    masked?: boolean;
  }>(),
  { masked: false },
);
const emit = defineEmits<{ close: [] }>();

const title = computed(() => (props.masked ? maskTitle(props.card.title) : props.card.title));
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton');

/**
 * A modal <dialog>: the screen behind is inert, so Tab stays in the card. Esc (cancel) and the
 * browser closing it both go through `close`; the screen owns whether it is open and where the
 * focus goes back to.
 */
onMounted(() => {
  dialog.value?.showModal();
  closeButton.value?.focus();
});

/** A click on the dark backdrop (the dialog itself, outside the card) closes it. */
function onClick(event: MouseEvent): void {
  if (event.target === dialog.value) emit('close');
}
</script>

<template>
  <dialog
    ref="dialog"
    class="card-backdrop"
    :aria-label="`クエスト #${card.number} のカード`"
    @cancel.prevent="emit('close')"
    @close="emit('close')"
    @click="onClick"
  >
    <article
      class="card"
      :class="card.rarity === null ? null : `card--${card.rarity}`"
      :style="{ '--frame': card.owner.frame }"
    >
      <header class="card__band">
        <span class="card__cost" :title="card.deadline ?? '締め切りなし'">{{ card.cost }}</span>
        <span class="card__number">#{{ card.number }}</span>
        <span class="card__title">{{ title }}</span>
      </header>
      <div class="card__art">
        <span v-if="card.owner.crown" class="card__crown" aria-hidden="true">♛</span>
        <span
          class="card__face"
          :style="{ background: card.owner.face.fill, color: card.owner.face.ink }"
          >{{ card.owner.name.charAt(0) }}</span
        >
      </div>
      <dl class="card__text">
        <dt>担当</dt>
        <dd>{{ card.owner.name }}（{{ card.owner.label }}）</dd>
        <template v-if="card.rarity !== null">
          <dt>レア度</dt>
          <dd>{{ RARITY_LABELS[card.rarity] }}</dd>
        </template>
        <dt>締め切り</dt>
        <dd>{{ card.deadline ?? 'なし' }}</dd>
        <template v-if="card.doDay !== null">
          <dt>やる日</dt>
          <dd>{{ card.doDay }}</dd>
        </template>
        <dt>PR</dt>
        <dd v-if="card.prs.length === 0">PR なし</dd>
        <dd v-for="pr in card.prs" v-else :key="pr.number">
          <span class="card__chest" aria-hidden="true">▣</span>#{{ pr.number }}・{{
            pr.files
          }}
          ファイル・{{ pr.wait }}
        </dd>
      </dl>
      <button ref="closeButton" type="button" class="rpg-button card__close" @click="emit('close')">
        とじる
      </button>
    </article>
  </dialog>
</template>

<style scoped>
.card-backdrop {
  box-sizing: border-box;
  width: 100vw;
  max-width: none;
  height: 100vh;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: rgb(0 0 0 / 65%);
  color: var(--window-text);
  font-size: clamp(13px, 1.4vw, 18px);
}

.card-backdrop[open] {
  display: grid;
  place-items: center;
}

.card-backdrop::backdrop {
  background: transparent;
}

.card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.5em;
  width: min(20em, calc(100vw - 32px));
  aspect-ratio: 5 / 7;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 0.6em;
  background: linear-gradient(180deg, var(--window-bg) 0%, var(--window-bg-deep) 100%);
  border: 0.4em solid var(--frame);
  border-radius: 0.8em;
  box-shadow:
    0 0 0 0.15em #000,
    0 0.4em 1.2em rgb(0 0 0 / 60%);
  color: var(--window-text);
  line-height: 1.35;
}

.card--rare {
  box-shadow:
    0 0 0 0.15em #000,
    0 0 0.8em 0.2em rgb(255 216 74 / 55%);
}

.card--super-rare {
  box-shadow:
    0 0 0 0.15em #000,
    0 0 1.2em 0.5em rgb(255 216 74 / 85%),
    0 0 2.4em 1em rgb(255 255 255 / 35%);
}

.card__band {
  display: flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.25em 0.4em;
  background: var(--scroll-paper);
  color: var(--scroll-ink);
  border: 0.12em solid var(--scroll-edge);
  border-radius: 0.3em;
  font-weight: 700;
}

.card__cost {
  flex: none;
  display: grid;
  place-items: center;
  width: 1.9em;
  height: 1.9em;
  margin: -0.6em 0 -0.6em -0.9em;
  border-radius: 50%;
  border: 0.15em solid #fff;
  background: #1d3aa8;
  color: #fff;
  font-size: 1.1em;
}

.card__number {
  flex: none;
}

.card__title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.card__art {
  position: relative;
  flex: 1;
  min-height: 6em;
  display: grid;
  place-items: center;
  border: 0.12em solid var(--frame);
  border-radius: 0.4em;
  background: radial-gradient(circle, #22348f 0%, #081040 75%);
}

.card__face {
  display: grid;
  place-items: center;
  width: 4.2em;
  height: 4.2em;
  border-radius: 50%;
  border: 0.15em solid #fff;
  font-size: 1.6em;
  font-weight: 700;
}

.card__crown {
  position: absolute;
  top: 0.1em;
  color: var(--frame);
  font-size: 1.8em;
}

.card__text {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.15em 0.6em;
  margin: 0;
  padding: 0.4em 0.5em;
  background: rgb(0 0 0 / 30%);
  border-radius: 0.3em;
  font-size: 0.9em;
}

.card__text dt {
  color: var(--muted-text);
}

.card__text dd {
  grid-column: 2;
  margin: 0;
}

.card__chest {
  margin-right: 0.3em;
  color: var(--accent);
}

.card__close {
  align-self: center;
}
</style>
