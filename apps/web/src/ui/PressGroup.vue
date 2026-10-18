<script setup lang="ts">
import { ref, type ComponentPublicInstance } from 'vue';
import { pressStyle, rovingIndex, type Clickable } from '../render/clickables';

/**
 * Buttons over the canvas for the keyboard that make one stop of Tab (Issue #190: the room has a
 * dozen things to examine): Tab reaches the last one focused, the arrows, Home and End move along
 * the row (clickables.rovingIndex), Enter and Space press. The mouse presses through them on the
 * canvas, as through the king's and the pet's buttons (GuildCanvas.vue).
 */
const props = defineProps<{
  items: readonly Clickable[];
  /** The accessible name of the row. */
  label: string;
}>();

const emit = defineEmits<{ press: [item: Clickable] }>();

/** The button Tab reaches. */
const current = ref(0);
/** The buttons by index (a ref array in v-for does not keep the order). */
const buttons: (HTMLButtonElement | undefined)[] = [];

function keep(element: Element | ComponentPublicInstance | null, index: number): void {
  buttons[index] = element instanceof HTMLButtonElement ? element : undefined;
}

function onKeydown(event: KeyboardEvent, index: number): void {
  const next = rovingIndex(index, event.key, props.items.length);
  if (next === null) return;
  event.preventDefault();
  current.value = next;
  buttons[next]?.focus();
}
</script>

<template>
  <div role="group" :aria-label="label">
    <button
      v-for="(item, index) in items"
      :ref="(element) => keep(element, index)"
      :key="index"
      type="button"
      class="press-group__press"
      :style="pressStyle(item.rect)"
      :aria-label="item.label"
      :tabindex="index === current ? 0 : -1"
      @focus="current = index"
      @keydown="onKeydown($event, index)"
      @click="emit('press', item)"
    />
  </div>
</template>

<style scoped>
.press-group__press {
  position: absolute;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  pointer-events: none;
}

.press-group__press:focus-visible {
  outline: 2px dashed #fff;
  outline-offset: -2px;
}
</style>
