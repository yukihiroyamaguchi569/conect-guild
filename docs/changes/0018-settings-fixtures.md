# #18 部門の数を変えられるようにする準備: 設定に頼らないテストと collector の分割（2026-10-14）

- 部門の数を 2〜6 で変えられるようにする（#18）と、客の来訪（#108）の前に、振る舞いを変えない準備だけをした
- 多くのテストがリポジトリ直下の `guild.settings.json`（4 部門、conect.llc のラベル）に頼っていた。部門の数を変えるテストを書けるように、架空の会社の設定を部門の数を指定して作る `makeSettings`（`packages/snapshot/src/settings.fixtures.test-util.ts`）を足した。ラベル・フォルダ・リポジトリは架空のもので、実際の値は写していない。スキーマはまだ 4 部門ちょうどを求めるので、4 以外の数の確かめは #18 の本体で足す
- `apps/web/src/guild.config.ts` で設定から導いていた値（メンバー、部門ラベル → メンバー、ブランチ名の接頭辞、社長の承認が要るパス）を、純粋関数 `guildFromSettings(settings)` に切り出した。これまでの export は同じ名前・同じ値のまま、`GUILD_SETTINGS` から作る。席の表（SEATS）は次の段階で扱うので動かしていない
- `packages/collector/src/run.ts` が 404 行で `max-lines`（400）を超えていたので、ログ行の組み立て（時刻の接頭辞、`gh-failed` のあとの「次にやること」、各報告の行、sessions の要約）を `packages/collector/src/report.ts` に移した。ログの文言は変えていない
- DESIGN.md の仕様は変えていない
