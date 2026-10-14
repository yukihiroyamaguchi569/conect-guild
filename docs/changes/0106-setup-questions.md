# #106 gh の前提と、/guild-setup で聞くことを 2 つに減らす（2026-10-15）

- ほかの人に試してもらうための改修のうち、`gh` の前提と `/guild-setup` の質問を減らす部分。文書とスキルだけで、道具（`npm run settings:write`）と collector のコードは変えていない
- docs/setup.md の 0 章「使える条件」（社長の判断、2026-10-13）
  - 前提を「Claude Code から `gh` で GitHub を使っていること」にした。確かめ方は、Claude Code に `gh issue list` を実行させて一覧が出れば何もしなくてよい、の 1 行
  - 端末アプリは、司令塔 1 と部門の数のセッションを並べて開けるものを前提にし、MulmoTerminal を勧め、cmux なども使えると書いた。「いま作業中」などセッションの状態は MulmoTerminal のときだけ出て、Issue・PR の表示はどの端末でも動く
  - ほかのエージェント（Codex など）でも Issue・PR の表示は動くが、設定のスキル・部門の `CLAUDE.md` の確認・状態の表示は Claude Code（と MulmoTerminal）向けだと一言足した
- docs/setup.md の 3 章に「`gh issue list` が動かない」を足した。証明書のエラー（`x509` など）は sandbox が原因で、`~/.claude/settings.json` の `excludedCommands` に `gh *` を入れる（公式の説明へのリンク）。ログインしていなければ `gh auth login`。`excludedCommands` が効くのは単独の `gh` だけで、`cd … &&` を付けたものや `npm run` の中の `gh` は sandbox に残ることも書いた。2-2b の「ラベルを問い合わせられなかった」警告にも、道具を sandbox の中で動かすとこの警告になると添えた
- `/guild-setup`（`.claude/skills/guild-setup/SKILL.md`）
  - 聞くのは「あなたの会社の GitHub リポジトリ」（conect-guild 自身ではないと添える）と「司令塔のフォルダ」の 2 つだけにした。部門（ラベル・司令塔の下のフォルダ・接頭辞）は司令塔の `CLAUDE.md` の表から読んだ値を確認の表に出し、違うところだけ直してもらう。表が読めないときの規定値は雛形の 4 部門（経理・広報・企画・総務）。表の一部だけ読めない値は、これまでどおり推測で埋めずに聞く（実装時の判断）。部門が 2〜6 でなければ止まる決まり（#18）は変えていない
  - ラベルの確認は、スキルが `gh label list -R <repo>` を単独の 1 行で実行して行う。道具も同じ照合をするが、`npm run` の中から呼ぶ `gh` は sandbox の中に残り、問い合わせられない警告になるため。その警告が出ても道具を sandbox の外で動かし直さず、スキルの結果を使う。#104 で足した「sandbox の外でもう一度確かめる」は、これに置き換えた
  - 「守ること」に、`gh` は `gh` で始まるコマンドを単独で実行する（`cd`・`;`・`&&`・パイプ・リダイレクトとつながない。別のリポジトリは `-R`）を足した
- docs/setup.md の 2-2 のスキルの説明と、DESIGN.md の 10 章 9（入口のスキル）を合わせた
