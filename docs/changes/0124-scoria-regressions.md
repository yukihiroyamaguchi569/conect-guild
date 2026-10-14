# #124 scoria の退行を直す（2026-10-15）

- #116 の時点の scoria の計測（全体 84 点）で基準から悪くなっていたものを直した。社長の指示による。ふるまいは変えていない
- 循環 import 2 本（`run.ts` ↔ `guestRun.ts`、`run.ts` → `guestRun.ts` → `report.ts` → `run.ts`。どちらも型だけ）をなくした。`RunDeps`・`CycleResult`・`FailureKind` の型を `packages/collector/src/runTypes.ts` に出し、`run.ts`・`guestRun.ts`・`report.ts` とテストの組み立てはそこから読む。`circular.cycle_count` は 2 → 0
- どこからも使っていない export 24 個の `export` を外した（関数や値はそのまま）。`render/layouts/largeRoom.ts` の `UPPER_RIGHT_DESK` は、間取りを組み直す #122・#123 とぶつからないよう残した（実装時の判断。#123 のあとで外す）。`knip.unused_export_ratio` は 7.1% → 0.28%
- `render/loop.ts`（551 行。scoria の数え方で 511 行、上限 500）から、1 フレームの描き方（キャッシュする背景と前景、日の光・メンバー・お客さん・夜の影・頭上の文字を描く順）を `render/painter.ts` に分けた。関数を動かすだけ。loop.ts は 424 行になり、いつ描くか（スケジューラ・時計・演出の受け付け）だけを受け持つ。お客さんの描画の呼び出し（#108）は painter.ts に移った
- `.scoria/baseline.json` を取り直した（全体 86 点、`complete: true`）。`scoria baseline` が書く `root` は手元の絶対パスなので、これまでどおり `.` に戻した
- DESIGN.md: 3 章の構成に `render/painter.ts` を足した
