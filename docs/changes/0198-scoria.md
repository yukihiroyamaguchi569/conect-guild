# #198 scoria の退行を直す: 循環 import と使われていない export（2026-10-18）

- #186〜#191 のあいだに下がった scoria の数字を、ふるまいを変えない整理で戻した（#124 と同じ）。社長の指示による。`render/loop.ts` の分割は別の PR（`0198-loop-split.md`）
- 循環 import 2 本（`collector.config.ts` → `src/sessionFiles.ts` → `collector.config.ts` と、`src/sessions.ts` を通るもの。どちらも `Seat` の型だけ）をなくした。`Seat` の型を `packages/collector/src/seat.ts` に出し、`collector.config.ts`・`sessionFiles.ts`・`sessions.ts` とテストはそこから読む。`circular.cycle_count` は 2 → 0
- どこからも import されていない export 13 個の `export` を外した（関数や値はそのまま。どれも同じファイルの中で使っている）。`trialScaffold.ts` の 4 つ、`clickables.ts` の `spriteFrame`、`domain/events.ts` の `kingQuestEvents`、`domain/mask.ts` の 2 つ、`layouts/slots.ts` の 3 つ、`layouts/largeRoom.ts` の `GUEST_TABLE`、`drawLevelTags.ts` の `LEVEL_TAG_ALPHA`。`knip.unused_export_ratio` は 3.05% → 0%
- 色の種類（`ui-token.color_cardinality` 24 → 34）は直していない。基準から足された 11 のうち 10 は .vue のコメントの「Issue #121」「#132」「#144」「#174」「#178」「#183」「#186」「#187」「#190」「#191」で、3 桁の番号が 16 進の色（`#rgb`）として数えられている誤検知（基準のあとに消えた色が 1 つある）。#186〜#191 で足した本物の色は無い。コメントの書き方は変えていない。残る 1 つの `#6a3fb0`（`ui/MaskControl.vue` の伏せ字の印の紫、#144）は、ほかの色に寄せると見た目が変わるので残した（司令塔の判断）
- `.scoria/baseline.json` は取り直していない
