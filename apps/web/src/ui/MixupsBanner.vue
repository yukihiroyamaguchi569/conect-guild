<script setup lang="ts">
// Over the live screen while the collector suspects departments are mixed up in the settings
// (Issue #94). The names come from the settings; the status file carries positions only.
import { computed } from 'vue';
import { mixupsBannerText, type MixupNotice } from '../domain/mixups';
import { MIXUPS_GUIDE_URL } from '../project';

const props = defineProps<{ mixups: readonly MixupNotice[] }>();
const text = computed(() => mixupsBannerText(props.mixups));
</script>

<template>
  <p class="mixups-banner" role="status" aria-label="部門の設定の取り違え">
    <span class="mixups-banner__text">{{ text }}</span>
    <!-- Opened on a click only; nothing is loaded from GitHub (docs/DESIGN.md 4.3). -->
    <a
      class="mixups-banner__link"
      :href="MIXUPS_GUIDE_URL"
      target="_blank"
      rel="noopener noreferrer"
      >直し方（docs/setup.md の 3 章）</a
    >
  </p>
</template>

<style scoped>
/* The same strip as the automatic demo's banner (AutoDemoBanner.vue). */
.mixups-banner {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0 1em;
  width: 100%;
  min-height: var(--banner-height);
  margin: 0;
  padding: 0.2em 1em;
  font-size: 13px;
  background: var(--window-bg-deep);
  border-bottom: 1px solid var(--window-line);
  color: var(--window-text);
}

.mixups-banner__text {
  color: var(--danger);
}

.mixups-banner__link {
  color: var(--accent);
}
</style>
