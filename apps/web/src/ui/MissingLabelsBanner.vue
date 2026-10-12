<script setup lang="ts">
// Over the live screen while the collector finds department labels missing in the repository
// (Issue #85). The names come from the settings; the status file carries positions only.
import { computed } from 'vue';
import { missingLabelsBannerText, type MissingLabel } from '../domain/missingLabels';
import { MISSING_LABELS_GUIDE_URL } from '../project';

const props = defineProps<{ missing: readonly MissingLabel[] }>();
const text = computed(() => missingLabelsBannerText(props.missing));
</script>

<template>
  <p class="missing-labels-banner" role="status" aria-label="部門のラベルの食い違い">
    <span class="missing-labels-banner__text">{{ text }}</span>
    <!-- Opened on a click only; nothing is loaded from GitHub (docs/DESIGN.md 4.3). -->
    <a
      class="missing-labels-banner__link"
      :href="MISSING_LABELS_GUIDE_URL"
      target="_blank"
      rel="noopener noreferrer"
      >直し方（docs/setup.md の 3 章）</a
    >
  </p>
</template>

<style scoped>
/* The same strip as the automatic demo's banner (AutoDemoBanner.vue). */
.missing-labels-banner {
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

.missing-labels-banner__text {
  color: var(--danger);
}

.missing-labels-banner__link {
  color: var(--accent);
}
</style>
