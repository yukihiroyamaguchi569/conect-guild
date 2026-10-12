# #89 設定ファイルを JSON にする（guild.settings.json / guild.settings.local.json）（2026-10-13）

- #79（セットアップの方法）の検討で、ウィザード・スキル・その組み合わせ（スキルが値を集め、決まった動きのスクリプトが書く）を比べたところ、どの案でも、設定が TS であることが次の問題の元だと分かった。道具が外から来た文字を起動時に実行されるファイルに書くことになり zod の検証より先に実行される、道具が既存の設定を実行せずに読み戻せないので手で直した値を消してしまう。社長の判断で、#79 の前に設定を JSON に変え、そのあと書く・検証する土台 → 入口の順に進める（DESIGN.md 10 章 9）
- `guild.settings.ts` を `guild.settings.json` に、手元の `guild.settings.local.ts` を `guild.settings.local.json`（gitignore）に変えた。どちらを読むかはファイルの有無だけで決める決まり（#76）は変えず、テストは常に既定のほう
- collector と開発サーバーは、起動時に選んだファイルを fs で読み、`JSON.parse` してから既存の zod の schema で検証する（`packages/snapshot/src/settingsFile.ts` の `loadSettingsFile`）。実行はしない。読めない・合わないときは、読んだファイルの名前を挙げて止まる。そのあとの読み込みは、`settings.ts` の JSON の import を #76 の hook・プラグインで手元のファイルに向ける形のまま（JSON の import は値を読むだけ）
- 検証を設定の読み込みより先にできるよう、schema を `settingsSchema.ts` に分けた（`settings.ts` が re-export する）
- 古い `guild.settings.local.ts` が残っていたら、黙って無視せず「guild.settings.local.json に移して」と案内して collector も開発サーバーも止まる（`.gitignore` の古い行は残した）
- 部門ラベルは JSON から来るので型が `string` になった。TS のときのリテラル型は既定の値の型で、手元の設定とは合っていなかった。部門 → メンバーは `departmentMember(label)` で引くようにした（実装時の判断）
- 画面への取り込みは、開発サーバーだけが手元のファイルに向ける #76 の作りを保った。build には既定の JSON だけが入る（手元の値が dist に入らないことを確かめた）
- TS のファイルにあった各項目の説明は docs/setup.md の 2-2 の表に寄せ、JSON の書き方の注意と、古い `.ts` からの移し方を足した。CLAUDE.md・docs（setup.md、orchestration.md、DESIGN.md）のファイル名を新しい名前に揃えた（CLAUDE.md はファイル名の置き換えだけ）
