# docs/setup.md を本筋だけにし、細部を docs/settings.md に移す（Issue #235）

- docs/setup.md（README の「自分のチームで試す」の行き先）は、はじめて自分のリポジトリで使う人の手順と細部が混ざって読みにくかった。本筋だけを残し、細部を新しい docs/settings.md（設定の詳しい説明）に移した（社長の判断）
  - setup.md は「1. 使える条件 → 2. 設定して使う（2-1 `gh` → 2-2 `/guild-setup` → 2-3 起動 → 2-4 画面で確かめる）→ 3. 困ったとき」にした。2-2 の見出しを「`/guild-setup` で設定を作る」に変えた。3 章の見出しはすべて残した（画面の帯のリンクが使う）
  - settings.md に、手で書く方法（項目の表・例・書くときの注意・部門の数を変えるとき）、`npm run settings:write`、お客さん、collector の出力の読み方、`npm run verify` は開発用という注意、MulmoTerminal との関係・絵の差し替え・データの扱いを移した
  - 昔の `guild.settings.local.ts` から移す手順は消した（社長の判断）。collector と開発サーバーが止まるときの案内は、docs/settings.md の「手で書く」を指すようにした
- README.md・README.en.md・docs/orchestration.md・docs/DESIGN.md・スキル（guild-setup、guild-trial）・.gitignore のリンクと参照を、新しい見出しと settings.md に直した。README には settings.md への行を足した
