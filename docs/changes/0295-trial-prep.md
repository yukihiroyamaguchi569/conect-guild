# #295 お試しの手順（trial.md）の用意と最初の手順を、初めての人に分かりやすくする（2026-11-18）

- MacBook でお試しの手順をたどった社長の指摘で直した
- 「用意するもの」から、Node.js・Claude Code・`gh` を「事前準備」に分けた。Node.js は `node -v`、`gh` は `gh auth status` をコードブロックで示し、何が出れば大丈夫かを書いた
- `guild.settings.local.json` が無いことの項目に、初めて使うときは無いので気にしなくてよく、これまでに使ったことがある場合だけ確かめる、と書いた
- 「あなたがやること」の 1 を、conect-guild の直下で `claude` と打って起動する手順にし、ターミナルのスクショ（`assets/screenshots/start-claude.png`）を載せた。`/guild-trial` の実行は 2 として独立させ、後ろの番号を 1 つずつ下げた
- 前のお試しの司令塔のフォルダか GitHub のリポジトリが残っていると、止まらずに `guild-trial-2` のように番号を足した名前で作ることを、`guild.settings.local.json` の項目の下に書き足した。MacBook で試したとき、clone し直して手元の設定は無かったが前のお試しが残っていて `-2` ができた（社長の指摘）。スキルの決まり（設定があれば止まる、フォルダかリポジトリがあれば番号を足す）と合っていることを `.claude/skills/guild-trial/SKILL.md` で確かめた
- スクショの下に、`git:(main)` の部分は表示されなくてもかまわないと書き足した（社長の指摘）
