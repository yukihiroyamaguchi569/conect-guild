# #192〜#195 遊びの機能の絵の素材（2026-10-18）

- 社長が遊びの機能（#192 月の飾り、#193 乾杯のジョッキ、#194 ごほうび、#195 訪問者）を選び、司令塔が出した絵の案を見て OK を出した。この PR は**絵の素材だけ**を入れる。いつ置く・クリック・歩くといったふるまいは、あとの PR で作る。画面のふるまいは変えていない
- 絵は描き直さず、OK が出た案をそのまま使った。案を作ったときの切り出し方（物ごとの高さか幅にそろえる）を `assets/decor/build_decor.py`（`FIT_SIZE`）と `assets/props/build_props.py` に移し、リポジトリの中の生成元から作り直せるようにした。作り直した絵は、案の絵と 1 画素も違わないことを確かめた
  - 月見だんご（`tsukimi`）は、案を切り出したときにすすきの右端（生成元で 4px）が切れていた。案のとおりにするため、この 1 つだけ探す範囲の端で切る（`CLIP_TO_REGION`）
- 飾り（`assets/decor/decor.png`）: 53 種 → 68 種、256×352 → 256×512（8×11 → 8×16 マス）。前からある 53 種の画素は変わっていない（増えたのは前は空いていたマスと、下に足した 5 行だけ）
  - 月の飾り 12 種（1〜12 月の順）: `kadomatsu`・`setsubun`・`hina-dolls`・`sakura-vase`・`kabuto`・`hydrangea`・`tanabata`・`watermelon`・`tsukimi`・`jack-o-lantern`・`autumn-leaves`・`christmas-tree`。かぼちゃだけ 1×1 マス、豆の升と鬼の面は 2×1 マス、ほかは 2×2 マス（床に置く大きさ）
  - ごほうび 3 種（机の上に置く）: `onigiri`・`dango`・`medal`。どれも 1×1 マス
- 持ち物（`assets/props/props.png`）: 2 種 → 3 種、80×40 → 120×40。乾杯のジョッキ `tankard`（24×26px）を足した。生成元はごほうびと同じシート（`assets/decor/decor_raw_small.png`）の左端のマスで、`build_props.py` はその部分だけを、`build_decor.py` は残りだけを読む
- 訪問者（`assets/sprites/visitor-<id>.png`）: merchant（旅の商人）・postman（郵便屋）・bard（吟遊詩人）・fortune（占い師のおばあさん）の 4 人。320×80（正面・右向き・歩き 1・歩き 2 の 4 コマ）。`build_sprites.py` に `--walk-only`（メインのシートのコマ 0〜3 だけを切り出す）を足し、ファイル名に `-` を使えるようにした。縮尺は 10 体と同じ（`--scale-from source-sheet.png`）
- 訪問者の読み込みの口と描く関数は入れていない。画面に出すのはふるまいの PR で、そのときに足す（使われないコードを先に置かないため）
- テスト（`apps/web/sprite-sheets.test.ts`）: 訪問者のシートが 320×80 であること、飾り・持ち物のシートの大きさと種類の数、新しい名前がシートにあること、どの小物もシートの外にはみ出さないことを足した
