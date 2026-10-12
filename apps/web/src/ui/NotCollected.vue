<!--
  Shown before the first snapshot while /snapshot.json is not there yet: the collector has never
  run (Issue #67). It goes away by itself once the collector writes the file.
-->
<template>
  <section class="rpg-window not-collected" role="status" aria-label="データのじゅんび">
    <h2 class="rpg-window__title">まだ データを あつめていません</h2>
    <p>
      じぶんの リポジトリを みるなら、べつの ターミナルで
      <code class="not-collected__command">npm run collect</code>
      を うごかしてください（くわしくは docs/setup.md）。あつまると、じどうで がめんが かわります。
    </p>
    <p class="not-collected__demo">
      デモを みるなら <a class="not-collected__link" href="?demo=1">デモを ひらく（?demo=1）</a>
    </p>
  </section>
</template>

<style scoped>
.not-collected p {
  margin: 0.4em 0 0;
}

.not-collected__command {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  color: var(--accent);
  white-space: nowrap;
}

.not-collected__demo {
  text-align: center;
}

.not-collected__link {
  color: var(--accent);
}
</style>
