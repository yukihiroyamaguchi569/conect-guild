# #289 Dependabot: Playwright をまとめから外し、typescript のメジャー更新を当面止める（2026-11-18）

- Dependabot の最初の PR 2 本が CI で落ちたので、設定で避けるようにした
- `@playwright/test` を minor・patch のまとめ（`minor-and-patch`）から外した（`exclude-patterns`）。PR #286 では 1.63.0 → 1.65.0 がまとめに入り、E2E のワークフローが固定している Playwright の Docker イメージ（v1.63.0）と版がずれて E2E が止まった。Playwright はイメージのタグと digest と一緒に手で上げる決まりなので、個別の PR を受けたらそのブランチでイメージも上げる
- typescript のメジャー更新を `ignore` にした。PR #287（7.0.2）は、typescript-eslint と eslint-plugin-sonarjs が TypeScript 6.1 未満までしか対応せず `npm ci` が止まり、TypeScript 7.0 が従来の JS API を持たないため vue-tsc と ESLint も動かなかった。#287 は閉じた（社長の判断）。これらが TypeScript 7 に対応したら `ignore` を外す
