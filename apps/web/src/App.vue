<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { createScreenMode } from './app/screenMode';
import GuildScreen from './ui/GuildScreen.vue';

/**
 * The live data, `?demo=1`, or the automatic demo while nothing is collected (Issue #67). Each
 * change builds a new screen (the key), so no state of the demo reaches the live one.
 */
const screen = createScreenMode({ search: globalThis.location.search });
const { demo, handoff, generation, collectorFailure } = screen;
onBeforeUnmount(() => {
  screen.dispose();
});
</script>

<template>
  <GuildScreen
    :key="generation"
    :demo="demo"
    :handoff="handoff"
    :collector-failure="collectorFailure"
    @not-collected="screen.notCollected()"
  />
</template>
