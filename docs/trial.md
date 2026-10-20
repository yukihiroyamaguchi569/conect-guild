# 架空の会社を作って試す

自分の会社の準備ができていなくても、架空の会社「お試し商会」を作って、GitHub の本物のリポジトリに置いた架空の Issue で画面を試せます。

[setup.md の使える条件](setup.md#1-使える条件)は自分の会社で使うときのものです。お試しの会社に要るのは、Node.js・`gh`・Claude Code と `npm ci` だけです。

**前提**

- conect-guild の clone と `npm ci --ignore-scripts` を済ませていること（作る道具がワークスペースのパッケージを使うため、無いと動きません）。README の「[デモを見る](../README.md#デモを見る)」と同じで、Node.js 26.10 以上で次を実行します

  ```bash
  git clone https://github.com/yukihiroyamaguchi569/conect-guild.git
  cd conect-guild
  npm ci --ignore-scripts
  ```
- Claude Code と、private のリポジトリを作れる `gh`（`gh auth status` でログイン済み。private のリポジトリを作る権限が要ります）
- `guild.settings.local.json` が無いこと。あると、自分の会社の設定を上書きしないよう、何も作らずに止まります

**やること**

conect-guild の直下で Claude Code を起動し、`/guild-trial` を実行します（「お試しの会社を作って」でも使われます）。聞かれるのは、部門の数（2〜6。決めていなければ 4）と、リポジトリを作る前の承認の 2 回だけです。作るのは次のものです。

- GitHub の private のリポジトリ `<あなたのアカウント>/guild-trial`（部門のラベルと、架空の Issue 付き。片付けで見分けるため、説明に「conect-guild のお試し商会（架空の会社）」が入ります）
- 手元の司令塔のフォルダ `~/guild-trial/guild-trial` と、その下の部門のフォルダ（それぞれの `CLAUDE.md` 付き）
- 手元の設定 `guild.settings.local.json`

同じ名前のリポジトリかフォルダが既にあれば、`guild-trial-2`、`guild-trial-3` … と番号を足した名前にします。

最後にスキルが `npm run dev:all` を起動し、collector が集め終わったら「http://127.0.0.1:5273 を開いてください」と伝えます。既に `npm run dev:all` が動いていたら、スキルは止めずに、止めて起動し直すよう伝えます。

`~/guild-trial/` は Claude Code の sandbox の書き込める場所の外なので、フォルダを書く操作は初めから sandbox の外で実行します。`npm run dev:all` も、collector の `gh` が sandbox の中では証明書のエラーになるので、sandbox の外で起動します。そのため許可を求められます。

**確かめること**

- ブラウザで http://127.0.0.1:5273 を開くと「デモ表示中」の帯が消え、お試しの Issue が部門の机に配られること
- 任意（動きを見たい人だけ）: MulmoTerminal を使っているなら、Claude Code で `! npm run trial:open-cells` を打つと、司令塔のフォルダと部門のフォルダのセルがまとめて開きます（各セルの「信頼しますか？」に答えます）。お試しの会社の設定のときだけ動き、自分の会社の設定ではまとめて開きません。MulmoTerminal が動いていなければ何も開きません。Claude Code の安全確認で止まるので、スキルは代わりに実行せず、自分で打ちます。ほかの端末では、司令塔のフォルダと部門のフォルダをそれぞれ開いて Claude Code を起動します（フォルダそのもので起動します。[orchestration.md の 3-5](orchestration.md#3-5-部門のセッションを開く)）。MulmoTerminal なら `sessions=<部門の数 + 1> ok` になります。お試しの Issue はセッションが無くても机に配られます

**卒業する（自分の会社にする）**

お試しの会社が気に入ったら、そのまま自分の会社として使い続けられます。conect-guild の直下で `/guild-trial-graduate` を実行します（「お試しの会社を自分の会社にしたい」でも使われます）。聞かれるのは、新しい会社の名前（GitHub のリポジトリ名と手元のフォルダ名。英小文字・数字・ハイフン）と、変える前の承認の 2 回だけです。似た名前のリポジトリがあれば、別の会社として作ってよいかも聞かれます。

先に、開いているお試しのセルを閉じ、`npm run dev:all` を止めておきます（フォルダが移るため。スキルは画面を止めません）。スキルは次の順に変えます。

1. リポジトリの説明を `<新しい名前> の会社` に変える（片付けがお試しと見分ける印を最初に外します）
2. 司令塔と部門の `CLAUDE.md` から、お試しの印の行（「これは conect-guild を試すための架空の会社「お試し商会」のものである。…」）を消し、`main` に直接 commit・push する
3. リポジトリの名前を `<新しい名前>` に変え、手元の `origin` も合わせる
4. フォルダを `~/guild-trial/<お試しの名前>` から `~/<新しい名前>` に移す
5. 手元の設定 `guild.settings.local.json` の `repo`・`commanderSessionDir`・部門の `sessionDir` を書き直す（前の設定は `.bak` に残ります）
6. 架空の Issue（題名が「お試し: 」で始まり、本文が決まった文のもの）を not planned で閉じる

部門（名前・ラベル・フォルダ・部門の数）は卒業では変えません。変えたいときは、卒業のあとで司令塔に頼みます（[orchestration.md の 1 章](orchestration.md#1-登場する役割)の最後の段落）。前の形の名前 `<日付>-<4 文字>` のお試しは、リポジトリに説明が無く片付けの対象から外せないので卒業できません（片付けて作り直します）。

卒業のあとは `npm run dev:all` で起動し直し、MulmoTerminal などで `~/<新しい名前>` と部門のフォルダでセルを開き直します。`npm run trial:open-cells` は卒業した会社では動きません。最近のフォルダに残った古いお試しのフォルダは `! npm run trial:open-cells -- --forget` で外せます。卒業した会社は `/guild-trial-cleanup` の対象になりません（要らなくなったら自分で消します）。途中で止まっても、GitHub のリポジトリは片付けで消されない状態になっています。卒業が終わるまで `/guild-trial-cleanup` は使わず、スキルに続きを頼みます。

**片付け**

`/guild-trial-cleanup` を実行します。消すものの一覧（リポジトリ、手元のフォルダ、手元の設定、集めたデータ）と、動いていれば止める画面（5273 番の開発サーバー）を見せ、承認を 1 回もらってから消します。画面はスキルが PID を名指しして止めます（collector も一緒に止まります）。リポジトリを消すには `gh` に `delete_repo` の権限が要ります。足りなければスキルが案内するので、自分で `gh auth refresh -h github.com -s delete_repo` を実行します。片付けたあとは手元の設定が無くなるので、画面の帯の扱いは [setup.md の 3 章](setup.md#画面の帯に失敗が出る手元の設定が無いとき)のとおりです。MulmoTerminal の最近のフォルダに残ったお試しのフォルダは、`! npm run trial:open-cells -- --forget` で外せます（もう無いお試しのフォルダだけを外します）。チップの × で 1 つずつ外してもかまいません。
