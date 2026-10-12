<script setup lang="ts">
// Over the automatic demo, while nothing is collected yet (Issue #67), with the collector's
// failure when it runs and fails (Issue #74).
import type { CollectorFailureKind } from '@conect-guild/snapshot';
import { computed } from 'vue';
import { autoDemoBannerText } from '../domain/collectorStatus';
import { COLLECT_GUIDE_URL } from '../project';

const props = defineProps<{ collectorFailure: CollectorFailureKind | null }>();
const text = computed(() => autoDemoBannerText(props.collectorFailure));
</script>

<template>
  <p class="auto-demo-banner" role="status" aria-label="デモ表示中">
    <span :class="{ 'auto-demo-banner__failure': props.collectorFailure !== null }">{{
      text
    }}</span>
    <!-- Opened on a click only; nothing is loaded from GitHub (docs/DESIGN.md 4.3). -->
    <a
      class="auto-demo-banner__link"
      :href="COLLECT_GUIDE_URL"
      target="_blank"
      rel="noopener noreferrer"
      >集め方（docs/setup.md の 2 章）</a
    >
  </p>
</template>

<style scoped>
.auto-demo-banner {
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

.auto-demo-banner__failure {
  color: var(--danger);
}

.auto-demo-banner__link {
  color: var(--accent);
}
</style>
