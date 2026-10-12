<script setup lang="ts">
// Over the automatic demo, while nothing is collected yet (Issue #67).
import { SETUP_GUIDE_URL } from '../project';
</script>

<template>
  <p class="auto-demo-banner" role="status" aria-label="デモ表示中">
    <span>デモ表示中（架空のデータ）。データを集めると自分のリポジトリに切り替わります</span>
    <!-- Opened on a click only; nothing is loaded from GitHub (docs/DESIGN.md 4.3). -->
    <a
      class="auto-demo-banner__link"
      :href="SETUP_GUIDE_URL"
      target="_blank"
      rel="noopener noreferrer"
      >集め方（docs/setup.md）</a
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

.auto-demo-banner__link {
  color: var(--accent);
}
</style>
