# docs/setup.md の 2-3 の最初に collector が何をするかを書く（Issue #237）

- 2-3（collector と画面を起動する）の最初に、collector が GitHub の Issue・PR を 60 秒ごと、MulmoTerminal のセッションの状態を 5 秒ごとに読み、`apps/web/.data/snapshot.json` に書くこと、画面はそのファイルを読んで描き、ブラウザから GitHub に問い合わせないことを書いた（社長の指摘）
