<script setup lang="ts">
import type { GuildMessage } from '../app/messageQueue';
import type { Narration } from '../app/narrator';
import { shownText } from '../domain/message';

defineProps<{
  /** The head of the queue; null when nothing new happened. */
  message: GuildMessage | null;
  /** Messages waiting after this one. */
  remaining: number;
  /** How the guild looks now, shown while there is no message; null before the first snapshot. */
  narration: Narration | null;
  /** The show mode (Issue #144): the line's title is masked. */
  masked?: boolean;
}>();

const emit = defineEmits<{ next: [] }>();
</script>

<template>
  <section class="rpg-window message" aria-label="メッセージ" aria-live="polite">
    <p v-if="message !== null" :key="message.id" class="message__text">
      {{ shownText(message, masked) }}
    </p>
    <p
      v-else-if="narration !== null"
      :key="`narration-${narration.id}`"
      class="message__text message__text--narration"
    >
      {{ narration.text }}
    </p>
    <p v-else class="message__text message__text--idle">あたらしい できごとは まだ ない。</p>
    <button
      v-if="message !== null || narration !== null"
      type="button"
      class="message__next"
      :aria-label="
        message === null
          ? 'つぎの ようす'
          : remaining > 0
            ? `つぎへ（あと ${remaining} 件）`
            : 'とじる'
      "
      @click="emit('next')"
    >
      <span class="message__mark" aria-hidden="true"
        >▼<span v-if="remaining > 0" class="message__count">{{ remaining }}</span></span
      >
    </button>
  </section>
</template>

<style scoped>
.message {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.6em 3em 0.6em 1.2em;
  background: #05071a;
}

.message__text {
  margin: 0;
  font-size: 1.45em;
  font-weight: 700;
  letter-spacing: 0.05em;
  overflow-wrap: anywhere;
  animation: message-in 0.35s steps(6, end);
}

.message__text--narration {
  color: var(--muted-text);
  font-size: 1.15em;
}

.message__text--idle {
  color: var(--muted-text);
  font-size: 1.15em;
  animation: none;
}

/* Covers the whole window so a click anywhere advances; the ▼ is only a mark inside it. */
.message__next {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0 0.6em 0.3em 0;
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
}

.message__next:focus-visible {
  outline: 0.1em solid var(--accent);
  outline-offset: -0.15em;
}

.message__mark {
  font-size: 1.1em;
  color: #fff;
  animation: blink 1s steps(2, start) infinite;
}

.message__count {
  margin-left: 0.2em;
  font-size: 0.6em;
}

@keyframes message-in {
  from {
    clip-path: inset(0 100% 0 0);
  }

  to {
    clip-path: inset(0 0 0 0);
  }
}

@keyframes blink {
  to {
    visibility: hidden;
  }
}

@media (prefers-reduced-motion: reduce) {
  .message__text,
  .message__mark {
    animation: none;
  }
}
</style>
