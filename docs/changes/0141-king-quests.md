# #141 王様のクエストを掲示板とパーティの窓に出す（2026-10-15）

- 王様（社長）がやる仕事も画面に出す（社長、2026-10-15）。印は会社のリポジトリのラベル「社長」で、設定に `president: { label: "社長" }`（任意）を足した。部門のラベルと同じ名前は設定の検証で拒む。conect.llc の既定の `guild.settings.json` には書かず、手元の `guild.settings.local.json` に手で足す（docs/setup.md の設定の表）。`/guild-setup` は触らず、`settings:write` は出発点の設定の `president` をそのまま残すようにした
- collector: ラベル「社長」の open の Issue を部門の振り分けより先に拾い、snapshot の `president.issues`（番号・題名・更新日時）に入れる。このラベルの Issue は open も閉じたものも `issues` から外す（閉じたときに机や受付でクリアの演出が出ないように。codex の統合レビューの指摘）。部門のラベルが一緒に付いていても王様のもの。履歴は全履歴から数えるので変わらない。snapshot の版は上げず、任意の項目にした。ログは件数だけ（`president=N`）
- 画面: 掲示板のいちばん上に「おうさまの クエスト」の欄（部門の欄と同じ形、点は王様の色）、パーティの窓のゆきひろの行に「やること N 件」（承認まちと並べる。0 件なら出さない）。王様の状態と演出は変えない。巻物を玉座へ届ける演出と、閉じたときの紙吹雪は #142
- テスト: vitest（設定の検証、snapshot の schema、collector の振り分けとログ、`settings:write` が残すこと、domain、掲示板とパーティの窓）。e2e は架空の設定 `apps/web/e2e/settings/president.json`（4 部門）と架空の snapshot で、欄と行が出ることを確かめる 1 本（`kingQuests.spec.ts`。開発サーバーの口 `GUILD_E2E_DEPARTMENTS=president`）
- 関係する章: DESIGN.md 4.1・4.2・4.3・4.13、docs/setup.md
