<script setup lang="ts">
defineProps<{ masked: boolean }>();

const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <span class="mask">
    <button
      type="button"
      class="rpg-button"
      :aria-pressed="masked"
      title="人に見せるとき、クエストの題名を ＊ で伏せます（この端末にだけ保存します）"
      @click="emit('toggle')"
    >
      {{ masked ? 'もどす' : '見せる' }}
    </button>
    <span v-if="masked" class="mask__mark">伏せ中</span>
  </span>
</template>

<style scoped>
.mask {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}

.mask__mark {
  padding: 0 0.4em;
  border-radius: 0.25em;
  background: #6a3fb0;
  color: #fff;
  font-weight: 700;
}
</style>
