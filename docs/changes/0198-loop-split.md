# #198 scoria の退行を直す: loop.ts と demo.ts を分ける（2026-10-18）

- #186〜#191 で育った `render/loop.ts`（528 行。scoria の数え方で 492 行）を責務ごとに分けた。関数と型を動かすだけで、ふるまいは変えていない。循環 import と使われていない export は別の PR（`0198-scoria.md`）
- `render/scheduler.ts`: 次に描く時の予約（`nextDraw`・`createScheduler`・`follow`）。loop.ts からそのまま移した
- `render/presses.ts`: Canvas の上で押されたもの（王様・ペット・メンバー。#186・#187・#191）の受け付け（`presses` と、その中の `blessNow`・`petNow`・`askNow`）。`RenderLoop` の `bless`・`pet`・`ask`・`feet` は、`presses.ts` の `Presses` に移し、`RenderLoop` がそれを引き継ぐ。loop.ts との循環を作らないよう、押したときのパーティの型は `StageParty` ではなく、cast が受け取る `CastParty` にした（`StageParty` は `CastParty` の項目をすべて持つので、渡すものは変わらない。実装時の判断）
- loop.ts は 353 行（scoria の数え方。以下同じ）になり、いつ描くか・ループの組み立てだけを受け持つ
- `domain/demo.ts`（#152 で 415 行に育ち、loop.ts のつぎに大きかった）から、レーンの状態（`laneStatesAt`）とどの部門がクエストを運ぶか（`questCarriers`・`laneDepartments`。`departmentAt`・`carriesBefore` は demo.ts も使うので export にした）を `domain/demoLanes.ts` に分けた。demo.ts は 306 行
- DESIGN.md: 3 章の構成に `render/scheduler.ts`・`render/presses.ts`・`domain/demoLanes.ts` を足し、4.11 の見出しに `domain/demoLanes.ts` を足した
