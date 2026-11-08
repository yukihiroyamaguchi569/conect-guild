<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { RARITY_LABELS, type QuestCard } from '../app/questCard';
import { CARD_BACK, cardArtOf, type CardBox } from '../app/questCardArt';
import { maskTitle } from '../domain/mask';

const props = withDefaults(
  defineProps<{
    card: QuestCard;
    /** The show mode (Issue #144): the title is masked, the number and names are not. */
    masked?: boolean;
    /** The quest's own picture (Issue #271); null: the member in charge's. */
    taskPicture?: string | null;
  }>(),
  { masked: false, taskPicture: null },
);
const emit = defineEmits<{ close: [] }>();

const title = computed(() => (props.masked ? maskTitle(props.card.title) : props.card.title));
/** The quest's own picture did not load: the member's is shown instead (Issue #271). */
const taskPictureFailed = shallowRef(false);
watch(
  () => props.taskPicture,
  () => {
    taskPictureFailed.value = false;
  },
);
/** The frame and the picture (Issues #269, #271). */
const art = computed(() =>
  cardArtOf(props.card.owner, taskPictureFailed.value ? null : props.taskPicture),
);
function onPictureError(): void {
  if (art.value.picture === props.taskPicture) taskPictureFailed.value = true;
}
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton');

/** Places a part over the frame, in % of the card. */
function place(box: CardBox): Record<string, string> {
  return {
    left: `${String(box.left)}%`,
    top: `${String(box.top)}%`,
    width: `${String(box.width)}%`,
    height: `${String(box.height)}%`,
  };
}

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
    <div class="card-stage">
      <div class="card-scene">
        <article
          class="card"
          :class="card.rarity === null ? null : `card--${card.rarity}`"
          :style="{ '--frame': card.owner.frame }"
        >
          <img
            class="card__picture"
            :src="art.picture"
            alt=""
            :style="place(art.frame.window)"
            @error="onPictureError"
          />
          <img class="card__layer" :src="art.frame.image" alt="" data-part="frame" />
          <div
            v-if="art.frame.tinted"
            class="card__layer card__tint"
            :style="{ maskImage: `url(${art.frame.image})` }"
          />
          <img
            v-if="art.frame.scroll !== null"
            class="card__layer"
            :src="art.frame.scroll"
            alt=""
          />
          <span
            class="card__cost"
            :style="place(art.frame.cost)"
            :title="card.deadline ?? '締め切りなし'"
            >{{ card.cost }}</span
          >
          <header class="card__band" :style="place(art.frame.band)">
            <span class="card__number">#{{ card.number }}</span>
            <span class="card__title">{{ title }}</span>
          </header>
          <dl class="card__text" :style="place(art.frame.text)">
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
        </article>
        <div
          class="card-back"
          aria-hidden="true"
          :style="{ backgroundImage: `url(${CARD_BACK})` }"
        />
      </div>
      <button ref="closeButton" type="button" class="rpg-button card__close" @click="emit('close')">
        とじる
      </button>
    </div>
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

/* The card, and 「とじる」 under it (the scroll has no room for it, Issue #269). */
.card-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6em;
  perspective: 60em;
}

/*
 * The card comes face down and turns over (Issue #268). Without motion (prefers-reduced-motion)
 * it is face up from the start.
 */
.card-scene {
  position: relative;
  transform-style: preserve-3d;
  animation: card-flip 0.5s ease-out both;
}

@keyframes card-flip {
  from {
    transform: rotateY(180deg);
  }

  to {
    transform: rotateY(0deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .card-scene {
    animation: none;
  }
}

.card,
.card-back {
  backface-visibility: hidden;
}

/* The back (Issue #269): the picture fills the card. */
.card-back {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: 100% 100%;
  transform: rotateY(180deg);
}

/*
 * The front: the frame's picture (600 x 840) with the parts laid over it where the frame has
 * room for them (app/questCardArt.ts). Sizes follow the card's width (cqw).
 */
.card {
  position: relative;
  box-sizing: border-box;
  width: min(24em, calc(100vw - 32px), calc((100vh - 5em) * 5 / 7));
  aspect-ratio: 5 / 7;
  container-type: inline-size;
  isolation: isolate;
  color: var(--scroll-ink);
  line-height: 1.2;
  filter: drop-shadow(0 0.4em 0.8em rgb(0 0 0 / 60%));
}

/* Rare cards glow around the frame's edge. */
.card--rare {
  filter: drop-shadow(0 0 0.5em rgb(255 216 74 / 80%));
}

.card--super-rare {
  filter: drop-shadow(0 0 0.6em rgb(255 216 74 / 95%)) drop-shadow(0 0 1.4em rgb(255 255 255 / 60%));
}

.card__picture,
.card__layer,
.card__cost,
.card__band,
.card__text {
  position: absolute;
  box-sizing: border-box;
}

.card__picture {
  object-fit: cover;
}

.card__layer {
  inset: 0;
  width: 100%;
  height: 100%;
}

/* The department's metal takes the member's colour; its shading stays (the scroll is apart). */
.card__tint {
  background: var(--frame);
  mask-size: 100% 100%;
  mix-blend-mode: color;
}

.card__cost {
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #1d3aa8;
  color: #fff;
  font-size: 7cqw;
  font-weight: 700;
}

.card__band {
  display: flex;
  align-items: center;
  gap: 0.4em;
  padding: 0 0.6em;
  font-size: 3.8cqw;
  font-weight: 700;
}

.card__number {
  flex: none;
}

.card__title {
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.card__text {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-content: safe center;
  gap: 0 0.6em;
  margin: 0;
  overflow-y: auto;
  font-size: 3.3cqw;
  scrollbar-width: thin;
}

.card__text dt {
  color: #7a5426;
  font-weight: 700;
}

.card__text dd {
  grid-column: 2;
  margin: 0;
}

.card__chest {
  margin-right: 0.3em;
  color: #9a6a10;
}
</style>
