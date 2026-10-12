# 自分のチームで使う

GitHub の Issue・PR で仕事を回しているチームなら、設定ファイルを 1 つ書き換えるだけで、自分のリポジトリをギルド画面で眺められます。画面は手元のブラウザで見るもので、どこにも公開しません。

## 前提

- Node.js 26.10 以上（collector は Node の型除去で TypeScript をそのまま動かします）
- GitHub CLI（`gh`）で `gh auth login` を済ませ、対象のリポジトリの Issue・PR を読めること。collector は `gh` の認証をそのまま使い、トークンを別に置きません

## 手順

1. clone して依存を入れる

   ```bash
   git clone https://github.com/yukihiroyamaguchi569/conect-guild.git
   cd conect-guild
   npm ci --ignore-scripts
   ```

2. リポジトリ直下の [`guild.settings.ts`](../guild.settings.ts) をコピーして `guild.settings.local.ts` にし（`cp guild.settings.ts guild.settings.local.ts`）、コピーを書き換える。このファイルは git に入らず、あれば collector と画面が `guild.settings.ts` の代わりに読みます

   | 項目 | 中身 |
   |---|---|
   | `repo` | 収集する GitHub リポジトリ（`owner/name`） |
   | `members` | 6 人の名前・役・色。id（`kaname` など）は絵のファイル名なので変えない。`kaname` は受付の司令塔、`yukihiro` は玉座の王、残る 4 人が部門の机に座る |
   | `departments` | 部門の GitHub ラベル・担当のメンバー・セッションの起動ディレクトリ。並び順が、Issue に部門ラベルが複数あるときの優先順になる |
   | `commanderSessionDir` | 司令塔のセッションの起動ディレクトリ |
   | `branchPrefixes` | ブランチ名の接頭辞 → 部門。部門ラベルの付いた Issue に結べない PR の担当を推定する。上から順に見て、最初に当たったものを使う |
   | `ruleChangePaths` | 変えると社長の承認が要るファイル。`exact`（パスが等しい）・`suffix`（で終わる）・`prefix`（で始まる）の 3 種類で書き、glob は使えない |

   起動ディレクトリは `~`（ホームそのもの）、`~/...`（ホームの下）、絶対パスのどれかで、末尾に `/` や前後の空白を付けません。MulmoTerminal が記録するパスと文字列で比べるためです。5 つ（司令塔と 4 部門）はすべて別のディレクトリにします。`~` とホームの絶対パスのように、書き方が違っても同じディレクトリを指すものは collector が起動時に見つけて止まります（画面は起動ディレクトリを使わないので、そのまま動きます）。

   設定は collector と画面の起動時に zod で検証します。間違いがあると、どの項目が悪いかを出して止まります（画面はブラウザのコンソールに出ます）。対象のリポジトリなどは、コマンドラインの引数や環境変数では変えられません。設定ファイルを書き換えてください。

3. collector と画面を起動する

   ```bash
   npm run dev:all   # collector と開発サーバーを一緒に起動する。Ctrl-C で両方止まる
   ```

   出力の行頭の `[collect]` が collector、`[web]` が開発サーバーです。どちらかが止まると、もう片方も止まります。別々に動かしたいときは、ターミナルを 2 つ使い、`npm run collect` を先に動かします。

   ```bash
   npm run collect   # GitHub を 60 秒ごと、MulmoTerminal を 5 秒ごとに読む。1 回だけなら npm run collect:once
   npm run dev       # 開発サーバー
   ```

4. ブラウザで http://127.0.0.1:5173 を開く

   collector がまだ一度も書いていないと、画面は架空のデータのデモを自動で流し、上に「デモ表示中」の帯を出します（エラーではありません）。collector の最初の収集が終われば（`npm run dev:all` なら起動から数秒）、再読み込みしなくても 5 秒ほどで自分のリポジトリの画面に変わります。

部門の数は、いまは 4 つに決まっています。席・机・通路を部門の数に合わせて並べる作業は [#18](https://github.com/yukihiroyamaguchi569/conect-guild/issues/18) で進めます。4 つ以外にすると、設定の検証で止まります。

`npm run verify`（lint・型検査・テスト）は、このリポジトリを開発するためのものです。テストは `guild.settings.local.ts` を読まず、いつも conect.llc の設定（`guild.settings.ts`）で動くので、手元の設定を書き換えても通ります。

## MulmoTerminal との関係

- MulmoTerminal が無くても動きます。GitHub の Issue・PR から、掲示板・パーティの状態・受け渡しの演出までを出します
- MulmoTerminal のグリッドで、設定に書いた起動ディレクトリのセッションを開いていると、「いま作業中」「許可待ち」が数秒の遅れで加わります。collector が MulmoTerminal のファイル（`~/.mulmoterminal/dev-terminal-cwds.json` と `activity-state.json`）を読むだけで、hooks は足しません
- それらのファイルには会社以外のセッションも載っています。collector は設定の起動ディレクトリに完全に一致する行だけを残し、ほかの行は読んだ直後に捨てます。保存もログもしません

## キャラの絵を差し替える

- 絵は `assets/sprites/<id>.png`（id は `kaname`・`minori`・`hibiki`・`hirame`・`sasae`・`yukihiro`）。透過 PNG で、80×80 のコマを横に 7 つ並べます（560×80）。足元をコマの下端の中央に置きます
- コマの意味: 0 正面、1 右向き、2・3 右向きの歩き、4 両手を上げる（受け取った物を掲げる）、5 正面で抱える（物を運ぶ・机で作業する）、6 右向きで抱える。左向きは右向きのコマを左右反転して描きます
- コマ 4〜6 は省けます（4 コマ・320×80）。そのときは運ぶ・掲げる物をコマ 0〜3 の絵に重ねて描き、机での作業は上下に揺れて表します
- コマ 4〜6 で物を持たせる位置は、いまの絵の手の位置を測った値です（`apps/web/src/render/hands.ts` の `MEASURED`）。手の位置が違う絵にすると、物がずれて見えます
- **絵を差し替えたら、開いているタブを再読み込みしてください。** 開発サーバーの絵の URL には内容のハッシュが付かないので、同じタブでは古い絵が使われ続けます。タイルや小物の絵も同じです
- 絵の出所とライセンスは [`assets/README.md`](../assets/README.md) に書きます。実在のゲームの素材は使わないでください

## データの扱い

- collector は取ったデータを `apps/web/.data/snapshot.json`（git の対象外、パーミッション 0600）に書きます。`apps/web/public/` には置かず、ビルドにも入りません
- 開発サーバーは `127.0.0.1` だけで待ち受けます。`--host` を付けて LAN に出さないでください
- Issue の題名には取引先の名前などが入りえます。画面やデータを公開しない、題名を外に出さない前提で作っています。`npm run build` の成果物（`dist/`）はダミーのデータで作るもので、配布しません。ブラウザの localStorage にも番号・状態・時刻と、対象リポジトリを見分けるための短いハッシュ（リポジトリ名そのものではない）、音の設定だけを残し、題名は残しません
- 実データを消すときは `apps/web/.data/` を消し、画面の「基準を消す」でブラウザ側の基準も消します
