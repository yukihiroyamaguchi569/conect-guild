# #76 手元だけの設定ファイル（guild.settings.local.ts）で、設定を書き換えても差分が残らずテストも通るようにする（2026-10-12）

- リポジトリ直下に手元だけの `guild.settings.local.ts`（gitignore）があれば collector と開発サーバーがそれを読み、無ければ `guild.settings.ts`（conect.llc の既定）を読むようにした。`guild.settings.ts` を直接書き換えると、差分が残り続ける・PR に混ざりうる・テストが通らなくなる、というメンターの提案（Issue #67 のコメント）による（3 章、4.1、10 章 9）
- どちらを読むかはファイルの有無だけで決める（`packages/snapshot/src/settingsFile.ts`）。引数・環境変数で設定を変えられない決まり（4.1）を保つため。検証は同じ schema にかけ、エラーの文言は両方の名前を出す（画面からはどちらを読んだか分からないため）
- collector は `src/main.ts` で判定してから Node の `module.registerHooks` で `guild.settings.ts` の import を手元のファイルに向け、残りを `src/start.ts`（元の main.ts）として動的 import する。静的 import は評価の前に解決されるため、hook を入れてから読み込む形にした。設定の値だけでなく snapshot の schema（部門ラベル）も同じ設定から作られるので、値を渡し直すのではなくモジュールごと差し替えた。起動時に読んだファイルの名前だけを 1 行出す
- 画面は `apps/web/vite-plugin-settings.ts` が、開発サーバーの既定のモードのときだけ同じ import を向ける。build（production）と E2E（`--mode e2e` を付けた）は向けず、vitest はこのプラグインを読まないので、テスト・型検査・build・E2E は手元の設定があっても既定で動く。モードで変えられるのは既定に戻す向きだけ
- ESLint と Prettier の対象から `guild.settings.local.ts` を外した（どの tsconfig にも入らないので型付きの lint ができず、書式も人それぞれのため）
- 収集の対象と設定が違うときの画面の案内と、`guild.settings.ts` の先頭の説明に、手元の設定ファイルを書き足した。docs/setup.md は手順の 2 と `npm run verify` の段落だけを直した（全体の書き直しは別の PR）
