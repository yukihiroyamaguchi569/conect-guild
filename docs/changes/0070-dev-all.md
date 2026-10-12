# #70 collector と開発サーバーを 1 つのコマンドで起動する（concurrently）（2026-10-12）

- `npm run dev:all` を足した。`concurrently --kill-others` で `npm run collect` と `npm run dev` を並べて動かし、Ctrl-C やどちらかの終了で両方止める。collector の起動忘れで `/snapshot.json` が 404 になる（#67）のを減らす。`npm run dev`・`npm run collect` はそのまま残す
- シェルの `&` で並べる案は Ctrl-C で collector が残りうる、Vite のプラグインから起動する案は開発サーバーと収集の責務が混ざるため、開発時の依存として `concurrently` を足した（実行時の依存と待ち受けは増えない）
- 7 章の手順で入れた。`concurrently@10.0.6` は公開から 7 日未満のため 10.0.5 にした。10.0.5 が固定で使う `shell-quote@1.9.0` に critical の脆弱性（GHSA-pqg4-j6r4-53mv）があるため、直った版（公開から 7 日以上の 1.12.0。10.0.6 が使う版）に `overrides` で固定した。関係する章: 7 章、docs/setup.md
