# docs/setup.md を自分のチームで使う人の文書にする（Issue #233）

- README が「できること → デモを見る → 架空の会社を作って試す → 自分のチームで試す → もっと知る」に分かれたので、docs/setup.md を自分のチームで使う人だけの文書にした（社長の判断）
  - 並びを「1. 使える条件 → 2. 設定して使う → 3. 困ったとき → 4. MulmoTerminal との関係・絵の差し替え・データの扱い」にした。冒頭の「試し方は 3 段あります」と目次は、短い導入と目次に替えた
  - 「1-1. デモを動かす」は README の「デモを見る」と同じなので消した。2 章の前提だった「1 章の clone と npm ci」は、2 章の冒頭に clone と `npm ci --ignore-scripts` を短く書いた
  - 「1-2. お試しの会社」は docs/trial.md（「架空の会社を作って試す」）に移した。中身は保ち、前提に clone と `npm ci --ignore-scripts` を足した
- 章の番号と見出しが変わったので、README.md・README.en.md・docs/orchestration.md・スキル（guild-trial、guild-trial-cleanup）のリンクと、画面の帯の「集め方」のリンク（`apps/web/src/project.ts`）とそのテストのアンカーを直した
