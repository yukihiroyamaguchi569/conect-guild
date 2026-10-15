# 自分のチームで使う

GitHub の Issue・PR で仕事を回しているチームなら、設定ファイルを 1 つ書くだけで、自分のリポジトリをギルド画面で眺められます。画面は手元のブラウザで見るもので、どこにも公開しません。

試し方は 3 段あります。

- **0 デモ**: GitHub も設定も要りません（[1 章](#1-まずデモを見る)）
- **1 お試しの会社**: 1 章の clone と `npm ci --ignore-scripts` を済ませたうえで、Claude Code の `/guild-trial` を実行すると、架空の会社「お試し商会」（GitHub の private のリポジトリ、司令塔と部門のフォルダ、部門のラベルと架空の Issue、手元の設定）を作ります。終わったら `/guild-trial-cleanup` で片付けます（[1-2](#1-2-お試しの会社)）
- **2 自分の会社**: 自分のリポジトリで使います（[2 章](#2-自分のリポジトリで使う)）

0 デモに条件は要りません。1 お試しの会社に要るのは、Node.js・`gh`・Claude Code と `npm ci` だけです。下の 0 章の条件は、2 自分の会社向けです。

このページは次の順に進みます。

0. [使える条件](#0-使える条件)
1. [まずデモを見る](#1-まずデモを見る)（[1-1 デモを動かす](#1-1-デモを動かす)、[1-2 お試しの会社](#1-2-お試しの会社)）
2. [自分のリポジトリで使う](#2-自分のリポジトリで使う)
3. [困ったとき](#3-困ったとき)
4. [MulmoTerminal との関係・絵の差し替え・データの扱い](#4-mulmoterminal-との関係絵の差し替えデータの扱い)

## 0. 使える条件

自分の会社で使う（2 章）前に、次がそろっているか確かめてください。チームの動かし方（司令塔と部門の AI を GitHub でどう回すか）は [orchestration.md](orchestration.md) にまとめています。これから始めるなら、先にそちらを読んでください。

- **部門は 2〜6。** 登場するのは司令塔 1・部門 2〜6・社長 1 です。部屋の机の並び（間取り）を部門の数ごとに用意しています。1 つや 7 つ以上にすると、設定の検証で止まります
- **Issue に部門のラベルを付ける。** 巻物の担当は、Issue に付いた部門のラベルで決まります。ラベルの無い Issue は司令塔の受付に置かれます
- **PR を Issue に結ぶ。** PR の題名か本文に `#番号`（おすすめは本文の `Closes #番号`）を書くか、部門の接頭辞で始まるブランチ名（例: `accounting/12-monthly-report`）にします。どちらも無い PR は「担当不明」として受付に置かれます
- **Node.js 26.10 以上**（collector は Node の型除去で TypeScript をそのまま動かします）
- **Claude Code から GitHub CLI（`gh`）で GitHub を使っていること。** 対象のリポジトリの Issue・PR を `gh` で読めることが前提です。collector は `gh` の認証をそのまま使い、トークンを別に置きません。確かめ方: 会社のリポジトリの直下で起動した Claude Code に `gh issue list` を実行させ、Issue の一覧が出れば何もしなくてよい（出なければ [3 章](#gh-issue-list-が動かない)）
- **司令塔 1 と部門の数のセッション（4 部門なら 5 つ）を並べて開ける端末アプリ。** [MulmoTerminal](https://github.com/receptron/mulmoterminal) を勧めます。cmux などほかの端末アプリでも使えます。Issue・PR の表示はどの端末でも動きますが、「いま作業中」「許可待ち」などセッションの状態と王様の呼びかけは MulmoTerminal のときだけ出ます。MulmoTerminal を使うときは、司令塔と各部門の AI を**別々のフォルダ**で起動し、そのフォルダを設定に**文字列で完全に一致**させて書きます（別のフォルダで起動したセッションは映りません。起動したあとセッションの中で worktree に移るのは構いません。[3 章](#いま作業中許可待ちが出ない)）
- **ほかのエージェント（Codex など）でも**、Issue・PR の表示は動きます。設定のスキル（`/guild-setup`）とセッションの状態の表示は、Claude Code（状態の表示は MulmoTerminal も）向けに作っています。設定の道具（2-2b）が部門のフォルダで確かめるのも、Claude Code の `CLAUDE.md` です

## 1. まずデモを見る

### 1-1. デモを動かす

GitHub も設定も要りません。まず画面が動くことを確かめます。

**やること**

```bash
git clone https://github.com/yukihiroyamaguchi569/conect-guild.git
cd conect-guild
npm ci --ignore-scripts
npm run dev
```

ブラウザで http://127.0.0.1:5173 を開きます。

**確かめること**

- 画面の上に「デモ表示中（架空のデータ）。データを集めると自分のリポジトリに切り替わります」の帯が出て、架空のクエストのデモが流れます。collector がまだデータを書いていないときの自動のデモで、エラーではありません
- 音は画面の「♪ 音を出す」で鳴ります

確かめたら、`Ctrl-C` で開発サーバーを止めます。

### 1-2. お試しの会社

自分の会社の準備ができていなくても、架空の会社「お試し商会」を作って、本物のリポジトリ・Issue・PR の画面を試せます。

**前提**

- 1-1 の clone と `npm ci --ignore-scripts` を済ませていること（作る道具がワークスペースのパッケージを使うため、無いと動きません）
- Claude Code と、private のリポジトリを作れる `gh`（`gh auth status` でログイン済み。private のリポジトリを作る権限が要ります）
- `guild.settings.local.json` が無いこと。あると、自分の会社の設定を上書きしないよう、何も作らずに止まります

**やること**

conect-guild の直下で Claude Code を起動し、`/guild-trial` を実行します（「お試しの会社を作って」でも使われます）。聞かれるのは、部門の数（2〜6。決めていなければ 4）と、リポジトリを作る前の承認の 2 回だけです。作るのは次のものです。

- GitHub の private のリポジトリ `<あなたのアカウント>/<日付>-<4 文字>`（部門のラベルと、架空の Issue 付き）
- 手元の司令塔のフォルダ `~/guild-trial/<日付>-<4 文字>` と、その下の部門のフォルダ（それぞれの `CLAUDE.md` 付き）
- 手元の設定 `guild.settings.local.json`

`~/guild-trial/` は Claude Code の sandbox の書き込める場所の外なので、フォルダを書く操作は初めから sandbox の外で実行します。そのため許可を求められます。

**確かめること**

- `npm run dev:all` を起動し（動いていたら止めて起動し直す）、ログの `settings:` の行が `guild.settings.local.json` で、`ok:` の行が出ること
- ブラウザで http://127.0.0.1:5173 を開くと「デモ表示中」の帯が消え、お試しの Issue が部門の机に配られること
- MulmoTerminal などの端末で、司令塔のフォルダと部門のフォルダをそれぞれ開いて Claude Code を起動すること（フォルダそのもので起動します。[orchestration.md の 3-5](orchestration.md#3-5-部門のセッションを開く)）。MulmoTerminal なら `sessions=<部門の数 + 1> ok` になります

**片付け**

`/guild-trial-cleanup` を実行します。消すものの一覧（リポジトリ、手元のフォルダ、手元の設定、集めたデータ）を見せ、承認を 1 回もらってから消します。リポジトリを消すには `gh` に `delete_repo` の権限が要ります。足りなければスキルが案内するので、自分で `gh auth refresh -h github.com -s delete_repo` を実行します。片付けたあとは手元の設定が無くなるので、画面の帯の扱いは [3 章](#画面の帯に失敗が出る手元の設定が無いとき) のとおりです。

## 2. 自分のリポジトリで使う

1 章の clone と `npm ci --ignore-scripts` を済ませていること（以降のコマンドは conect-guild の直下で実行します）。

### 2-1. `gh` で対象のリポジトリを読めるようにする

**やること**

```bash
gh auth login               # まだなら。済んでいれば要りません
gh auth status              # ログインしているアカウントを確かめる
gh repo view <owner/name>   # 眺めたいリポジトリ（例: your-name/my-company）
```

**確かめること**

- `gh repo view` がリポジトリの説明を表示すること。エラーになるなら、そのアカウントでは読めません。読めるアカウントで `gh auth login` し直します

### 2-2. 設定ファイルを作って書き換える

**Claude Code を使うなら、スキルで書けます。** conect-guild の直下で Claude Code を起動し、`/guild-setup` を実行します（「guild の設定を作って」と頼んでも使われます）。スキルが聞くのは、あなたの会社の GitHub リポジトリ（conect-guild 自身ではありません）と司令塔のフォルダの 2 つだけです。部門（ラベル・司令塔の下のフォルダ・接頭辞）は司令塔の `CLAUDE.md` の部門の表（[orchestration.md の 4 章](orchestration.md#4-司令塔の-claudemd-の雛形)の形）から読み、読めないときは雛形の 4 部門を規定値にして、確認の表に出します。違うところだけ直してください。ラベルがリポジトリにあるかはスキルが `gh label list` で確かめ、2-2b の道具で確かめた結果とあわせて確認の表と警告にして見せます。OK と答えたときだけ `guild.settings.local.json` を書きます。書けたら 2-3 に進みます。

手で書くときは、下の手順に従います。リポジトリ名・司令塔と部門のフォルダ・部門のラベルと接頭辞を書き換えるだけなら（部門の数を変えるときも）、手で書く代わりに道具（`npm run settings:write`）でも書けます（[2-2b](#2-2b-道具で書くnpm-run-settingswrite)）。

**やること**

リポジトリ直下の [`guild.settings.json`](../guild.settings.json)（conect.llc の設定。既定）をコピーして `guild.settings.local.json` を作り、コピーのほうを書き換えます。

```bash
cp guild.settings.json guild.settings.local.json
```

`guild.settings.local.json` は git に入りません。このファイルがあれば、collector と画面は `guild.settings.json` の代わりにこちらを読みます。`guild.settings.json` は書き換えないでください。

設定は JSON で書きます。collector と画面はファイルを JSON として読んで検証するだけで、実行はしません。JSON なので、文字列と項目名は `"` で囲み、最後の要素の後ろに `,` を付けず、コメントは書けません（各項目の説明は下の表にあります）。

以前の `guild.settings.local.ts` を使っていた場合は、次の順に移します。`guild.settings.local.ts` が残っていると、collector と開発サーバーは「guild.settings.local.ts は読まなくなりました」と案内して止まります。

1. 上の `cp guild.settings.json guild.settings.local.json` で、既定の JSON をコピーします
2. 古い `guild.settings.local.ts` でどの値を変えていたかを確かめます。覚えていなければ、古い `.ts` を以前の既定のファイルと見比べます。以前の既定は、設定を JSON にしたコミット（f76825e）の直前のものを `git show f76825e^:guild.settings.ts` で見られます（例: `git show f76825e^:guild.settings.ts | diff - guild.settings.local.ts`）
3. 古い `guild.settings.local.ts` で変えていた値だけを、コピーした JSON の同じ項目に書き写します。`.ts` のブロックをそのまま貼らないでください。一重引用符、引用符の無い項目名、最後の要素の後ろの `,`、コメント、`as const satisfies` が残ると JSON として読めません（書き方は上の段落のとおり）
4. `guild.settings.local.ts` を消して、collector と開発サーバーを起動し直します

書き換える項目は次の 6 つと、任意の `guests`（[2-5](#2-5-お客さんを足す任意)）・`president` です。

| 項目 | 中身 |
|---|---|
| `repo` | 眺める GitHub リポジトリ（`owner/name`）。Issue と PR をここから集める |
| `members` | メンバーの名前・役・色（`#rrggbb`）。id（`kaname` など）は絵のファイル名なので変えない。`kaname` は受付の司令塔、`yukihiro` は玉座の王。部門の机に座るのは `minori`・`hibiki`・`hirame`・`sasae`・`takumi`・`musubi` のうち `departments` の `member` に書いた人。書くのは `kaname`・`yukihiro` と部門の机に座る人だけでよい（既定の `guild.settings.json` は 4 部門なので `takumi`・`musubi` が無い。5・6 部門にするときは足す。`settings:write` が足すときは、名前と色がたくみ・`#00897b`、むすび・`#ff7043` で、役はその部門のラベルになる） |
| `commanderSessionDir` | 司令塔のセッションを起動するフォルダ |
| `departments` | 2〜6 の部門。それぞれ GitHub のラベル（`label`）・担当のメンバー（`member`。部門の机に座れる 6 人のどれかで、部門どうしで重ならない）・セッションを起動するフォルダ（`sessionDir`）。並び順が、Issue に部門ラベルが複数あるときの優先順になる。部門の数に合わせた間取りに切り替わる |
| `branchPrefixes` | ブランチ名の接頭辞（`prefix`）→ 部門のラベル（`department`）。部門ラベルの付いた Issue に結べない PR の担当を推定する。上から順に見て、ブランチ名が最初に当てはまったものを使う |
| `ruleChangePaths` | 変えると社長の承認が要るファイル。`exact`（パスが等しい）・`suffix`（で終わる）・`prefix`（で始まる）の 3 種類で書き、glob は使えない。既定は `CLAUDE.md`・`/CLAUDE.md` で終わるもの・`.claude/agents/` で始まるもので、そのままでよければ変えない |
| `president` | 任意。王様（社長）がやる Issue の印のラベル（例 `{ "label": "社長" }`）。このラベルが付いた open の Issue は、部門のラベルが一緒に付いていても王様のものになり、掲示板のいちばん上の「おうさまの クエスト」の欄と、パーティの窓のゆきひろの行の「やること N 件」に出る（部門の机・かなめの受付には出ない）。部門の `label` と同じ名前にはできない。`/guild-setup` と `settings:write` は書かないので、`guild.settings.local.json` に手で足す（`settings:write` は、いまの設定の `president` をそのまま保つ）。足したら `npm run dev:all` を起動し直す。無ければこの欄と行は出ない。ラベルは自分で作る（`gh label create 社長 -R <owner/name>`）。collector はこのラベルがリポジトリにあるかを照合しない（部門のラベルと違い、帯もログも出ない）ので、書き間違えても気づけず、王様のクエストが空のままになる |

たとえば、リポジトリ `your-name/my-company` を `~/my-company` に clone し、その下の 4 つのフォルダで 4 つの部門の AI を動かすなら、次のようになります（`members` と `ruleChangePaths` は省略）。

```json
  "repo": "your-name/my-company",
  "commanderSessionDir": "~/my-company",
  "departments": [
    { "label": "経理", "member": "minori", "sessionDir": "~/my-company/accounting" },
    { "label": "広報", "member": "hibiki", "sessionDir": "~/my-company/pr" },
    { "label": "企画", "member": "hirame", "sessionDir": "~/my-company/planning" },
    { "label": "総務", "member": "sasae", "sessionDir": "~/my-company/general-affairs" }
  ],
  "branchPrefixes": [
    { "prefix": "accounting/", "department": "経理" },
    { "prefix": "pr/", "department": "広報" },
    { "prefix": "planning/", "department": "企画" },
    { "prefix": "general-affairs/", "department": "総務" }
  ],
```

書くときの注意:

- **`label` は GitHub のラベル名と 1 文字も違わないように**書きます（全角・半角、空白も含めて）
- **`branchPrefixes` の `department` には、`departments` の `label` のどれかを書きます**
- **フォルダ（`commanderSessionDir` と `sessionDir`）** は `~`（ホームそのもの）、`~/...`（ホームの下）、絶対パスのどれかで書き、末尾に `/` や前後の空白を付けません。MulmoTerminal が記録するパスと文字列で比べるためです。司令塔と部門のフォルダはすべて別のフォルダにします。`~` とホームの絶対パスのように、書き方が違っても同じフォルダを指すものは、collector が起動時に見つけて止まります。MulmoTerminal を使わないなら、フォルダは画面の表示に関わりません（重ならない値を書いておけば足ります）

対象のリポジトリなどは、コマンドラインの引数や環境変数では変えられません。設定ファイルを書き換えてください。

**確かめること**

- 設定は collector と画面の起動時に zod で検証します。間違いがあると、次の 2-3 で起動したときに、どの項目が悪いかを出して止まります（[3 章](#設定の検証で止まる)）

### 2-2b. 道具で書く（`npm run settings:write`）

2-2 の手作業の代わりに使えます。値だけを書いた JSON を標準入力で渡すと、検証してから `guild.settings.local.json` を書きます。2-2 の最初のスキル（`/guild-setup`）も、この道具で確かめて書きます。

**やること**

値だけの JSON を作ります（例: `input.json`。置き場所はどこでも構いません）。部門は 2〜6 を並び順のとおりにまとめて書きます（下は 4 部門の例）。`prefix` はその部門のブランチ名の接頭辞です。

```json
{
  "repo": "your-name/my-company",
  "commanderSessionDir": "~/my-company",
  "departments": [
    { "label": "経理", "sessionDir": "~/my-company/accounting", "prefix": "accounting/" },
    { "label": "広報", "sessionDir": "~/my-company/pr", "prefix": "pr/" },
    { "label": "企画", "sessionDir": "~/my-company/planning", "prefix": "planning/" },
    { "label": "総務", "sessionDir": "~/my-company/general-affairs", "prefix": "general-affairs/" }
  ]
}
```

まず書かずに確かめ、よければ書きます。

```bash
npm run settings:write -- --dry-run < input.json   # 書かずに、確認の表と警告・エラーを出す
npm run settings:write -- --write < input.json     # 書く（guild.settings.local.json が既にあるときは --overwrite も付ける）
```

- 入力に無い項目（`members` の名前・色、`ruleChangePaths`、`branchPrefixes` の `docs/` で始まる行など）は、いまの設定（`guild.settings.local.json`、無ければ `guild.settings.json`）の値を保ちます。ただし `branchPrefixes` の既存の行は、入力のラベルのどれかを指すものだけを保ちます（ラベルを変えた部門を指していた行は消えます）。`guests`（お客さん）も、入力に無ければ保ちます（入力に書くときは 2-5）
- i 番目の部門の担当（`member`）は、いまの設定の i 番目のままです。いまの設定より部門が多いときは、増えた部門に、どの部門も担当していないメンバーがみのり・ひびき・ひらめ・ささえ・たくみ・むすびの順で就き、役（`role`）はその部門のラベルになります。いまの設定に無いたくみ・むすびは、名前と色を既定のまま足します
- 既にある `guild.settings.local.json` を上書きするときは、前の内容を `guild.settings.local.json.bak`（git に入りません）に残します。戻すときはこのファイルを `guild.settings.local.json` に名前を変えます
- `--json` を付けると、同じ結果を JSON で出します

**確かめること**

- 確認の表で、部門ごとのラベル・接頭辞と、そのフォルダの `CLAUDE.md` にラベルが見つかったか、フォルダを見ます
- **エラー**（書けません）: 設定の検証に合わない、フォルダが無い、`~` を展開すると 2 つのフォルダが同じになる、`guild.settings.local.json` があるのに `--overwrite` が無い
- **警告**（書けます）: ラベルがリポジトリに無い、GitHub にラベルを問い合わせられなかった（collector があとで照合し直します。道具は `npm run` の中から `gh` を呼ぶので、Claude Code の sandbox の中で動かすとこの警告になります）、部門のフォルダの `CLAUDE.md` にその部門のラベルが見つからない、接頭辞とフォルダ名が違う。最後の 2 つは、部門のフォルダを取り違えたときに出ます。[orchestration.md](orchestration.md) の雛形どおりでない会社では、取り違えていなくても出ることがあります
- 部門の `CLAUDE.md` は、ラベルの文字があるかを調べるだけで、中身を表示も保存もしません
- 書いたら、2-3 の手順で起動し、`settings:` の行が `guild.settings.local.json` で、`ok:` の行が出ることを確かめます。`sessions=<部門の数 + 1> ok`（4 部門なら `sessions=5 ok`）は MulmoTerminal を使う人だけの確認です

### 2-3. collector と画面を起動する

**やること**

```bash
npm run dev:all   # collector と開発サーバーを一緒に起動する。Ctrl-C で両方止まる
```

出力の行頭の `[collect]` が collector、`[web]` が開発サーバーです。どちらかが止まると、もう片方も止まります。

**確かめること**

起動から数秒で、次のような行が出ます（4 部門の例。時刻と件数は環境で変わります）。

```text
[collect] [collector] settings: guild.settings.local.json
[web]   ➜  Local:   http://127.0.0.1:5173/
[collect] [collector] 2026-10-12T01:23:45.678Z ok: issues=12 prs=8 president=2 history: opened=40 completed=31 merged=27
[collect] [collector] 2026-10-12T01:23:45.690Z sessions=5 ok
```

- `settings:` の行が `guild.settings.local.json` であること。`guild.settings.json` と出たら、手元のファイルが無いか、名前か置き場所（リポジトリ直下）が違います
- `ok:` の行が出ること。`issues`・`prs` は画面に渡す Issue・PR の件数、`president=` は王様のクエスト（ラベルが付いた open の Issue）の件数で、設定に `president` があるときだけ出ます、`history` は経験値に数える全履歴の件数です（時刻は UTC で出ます）。`failed:` の行が出たら [3 章](#3-困ったとき) へ
- `sessions=` の行は MulmoTerminal のセッションを読んだ結果です（司令塔と部門のうち見つかった数。4 部門で `sessions=5 ok` なら 5 つとも見つかった）。MulmoTerminal を使わないなら `sessions unavailable: missing` などと出ますが、気にしなくてかまいません

collector は GitHub を 60 秒ごと、MulmoTerminal を 5 秒ごとに読みます。別々に動かしたいときは、ターミナルを 2 つ使い、`npm run collect` を先に動かしてから `npm run dev` を動かします。1 回だけ集めるなら `npm run collect:once` です。

### 2-4. 画面が自分のリポジトリに切り替わるのを確かめる

**やること**

ブラウザで http://127.0.0.1:5173 を開きます（デモを開いたままなら、そのままで構いません）。

**確かめること**

- 「デモ表示中」の帯が消え、掲示板に自分のリポジトリの Issue が並びます。collector の最初の収集が終われば、再読み込みしなくても 5 秒ほどで切り替わります
- 巻物が部門の机に配られていること（ラベルの無い Issue は受付に置かれます）

これで準備は終わりです。

`npm run verify`（lint・型検査・テスト）は、このリポジトリを開発するためのものです。テストは `guild.settings.local.json` を読まず、いつも conect.llc の設定（`guild.settings.json`）で動くので、手元の設定を書き換えても通ります。

### 2-5. お客さんを足す（任意）

会社の外のプロジェクト（自分の別のアプリなど）の AI のセッションを、「お客さん」としてギルドに来させられます。かなめ・部門のメンバー・お客さんを合わせて 7 人まで（王様は数えません）なので、お客さんは 2〜4 部門で 2 人、5 部門で 1 人まで、6 部門では足せません。無くても構いません（既定は無し）。上限を超えると、設定の検証が `at most 1 guests with 5 departments (#108)` のように上限の数を挙げて止まります。画面では、お客さんは部屋の決まった場所（部門の数で変わります）に立ち、セッションの状態を見た目で表します。名前とリポジトリの開いている Issue・PR は、掲示板のお客さんの欄に出ます。

**スキルで足す**

conect-guild のリポジトリで開いた Claude Code のセッションで `/guild-setup` を動かし、「お客さんを足したい」（外したい・入れ替えたい）と頼みます。スキルは次の順に進めます。

1. `npm run --silent settings:list-sessions` で、MulmoTerminal のセッションのフォルダを新しい順に番号付きで見せます（MulmoTerminal が `~/.mulmoterminal/dev-terminal-cwds.json` に記録しているもので、閉じたセッションのフォルダが残っていることもあります。司令塔と部門のフォルダは除きます）。いまのお客さんと、部門の数で決まる上限も出ます。一覧はその場で見せるだけで、ファイルにもログにも残しません
2. 番号で選ぶと、フォルダ名から名前を提案します。直したい名前を伝えます
3. `npm run settings:write` に、お客さん全員（`guests`）だけの入力（スキルがリポジトリの外の一時ファイルに書き、終わったら消します）を渡し、設定ファイルを書かずに（`--dry-run`）確かめます。`repo` は、選んだフォルダの git の `origin`（GitHub のもの）から提案するので、合っているか、要らないかを答えます
4. 確認の表を見て OK と答えると、`guild.settings.local.json` に書きます（会社の値は今のまま保ちます）

道具だけで書くときは、2-2b の入力に `guests` を足します。`guests` は全員をまとめて書き、いまのお客さんを置き換えます（空の `[]` で全員外します）。お客さんだけを変えるときは、`repo`・`commanderSessionDir`・`departments` を書きません（3 つとも書かないと、いまの値を保ちます）。`repo` を書かないお客さんは、フォルダの git の `origin` から道具が `owner/name` を提案して、そのまま書きます。リポジトリを付けないなら `"repo": null` と書きます。

```json
{
  "guests": [
    { "name": "たびびと", "sessionDir": "~/side-project" },
    { "name": "ぼうけんしゃ", "sessionDir": "~/another-app", "repo": null }
  ]
}
```

**手で書く**

`guild.settings.local.json` に `guests` を手で足しても構いません。

```json
  "guests": [
    { "name": "たびびと", "sessionDir": "~/side-project", "repo": "your-name/side-project" },
    { "name": "ぼうけんしゃ", "sessionDir": "~/another-app" }
  ]
```

| 項目 | 中身 |
|---|---|
| `name` | 画面に出す名前（1〜12 文字）。お客さんどうしで重ならない。snapshot にもログにも入れない |
| `sessionDir` | お客さんのセッションを起動するフォルダ。書き方は会社のフォルダと同じで、文字列で完全に一致したセッションだけを読む（その下のフォルダや worktree で起動したものは映らない）。会社のフォルダとも、ほかのお客さんとも違うフォルダにする |
| `repo` | 任意。お客さんの GitHub リポジトリ（`owner/name`）。会社の `repo` とは違うものにする（大文字と小文字は区別しない） |

**集めるもの**

- セッションの状態（いま作業中・許可待ち）を、会社と同じく MulmoTerminal のファイルから読みます。collector のログの `sessions=` の行に、セッションが見つかったお客さんの数が `guests=1` のように加わります
- `repo` があれば、お客さんごとに 5 分おきに `gh` で読みます（1 人目は起動から 20 秒ほど、2 人目は 40 秒ほどで始め、会社の 60 秒ごとの取得と重ならないようにずらします）。読むのは、開いている Issue・PR（更新の新しい 100 件まで）と、直近 7 日に完了で閉じた Issue・マージした PR（閉じたものを更新の新しい順に 100 件まで読み、その中から新しい順に 20 件まで）で、お客さん 1 人につき 5 分に 2 回までの呼び出しです（1 回目が失敗すると 2 回目は呼びません）。`gh` でログインしているアカウントで、そのリポジトリを読めるようにしておきます
- お客さんの Issue・PR は題名つきで snapshot に入ります（画面に出すのは上のとおり画面の PR から。会社の Issue と同じく、公開しない前提です）。ログには番号・件数・エラーの種類だけを出し（`guests[0] github ok: open=3 recent=2`・`guests[1] github failed: gh-failed`）、名前・リポジトリ名・題名は出しません
- お客さんの取得に失敗しても、会社の部分はそのまま集めます。そのお客さんは最後に読めたときの結果のままです

`guests` を書き換えたら、`npm run dev:all` を止めて起動し直します（collector と画面は起動時に設定を読みます）。画面は、snapshot のお客さんの数や `repo` が設定と合わないとき、お客さんの分をまとめて使いません。

## 3. 困ったとき

### 画面の帯に「collector が失敗しています」と出る

collector は動いていますが、データを集められていません。collector のターミナル（`npm run dev:all` なら行頭が `[collect]` の行）に `failed:` で始まる行があり、失敗の種類が出ています。帯の（　）の中は、その種類を短くしたものです。ブラウザのコンソールにも同じ内容が警告として 1 回出ます。

| 帯の（　） | ログの種類 | 何が起きたか・どうするか |
|---|---|---|
| 認証・取得 | `failed: gh-failed` | `gh` で GitHub から読めていません。下の「`gh-failed` が出る」へ |
| データの検証 | `failed: validation-failed` | GitHub から読んだデータが想定の形と違いました。次の取得で直ることがあります。続くなら [conect-guild の Issue](https://github.com/yukihiroyamaguchi569/conect-guild/issues) で知らせてください |
| ファイルの書き込み | `failed: write-failed` | `apps/web/.data/` に書けません。フォルダの権限や空き容量を確かめてください |
| 想定外のエラー | `failed: unexpected` | 上のどれでもない失敗です。collector を止めて起動し直し、続くなら conect-guild の Issue で知らせてください |

ログには件数・時刻・種類だけを出し、Issue の題名やリポジトリ名は出しません。collector は 60 秒ごとに試し直すので、原因を直せば止めずにそのまま本物の画面に切り替わります。

### `failed: gh-failed` が出る

すぐ下に「次にやること: …」の行が続きます。`guild.settings.local.json`（無ければ `guild.settings.json`。起動時の `settings:` の行に、読んだほうが出ます）の `repo` を、`gh` でログインしているアカウントで読めるか確かめます。

```bash
gh auth status                 # gh にログインしているか
gh repo view <owner/name>      # repo に書いたリポジトリを読めるか（<owner/name> は repo の値）
```

読めなければ、読めるリポジトリに `repo` を書き換えるか、読めるアカウントで `gh auth login` します。`repo` を書き換えたときは、collector を止めて起動し直してください（設定は起動時に読みます）。

### `gh issue list` が動かない

0 章の確かめ方で、Claude Code に `gh issue list` を実行させて一覧が出なかったときです。

- **証明書のエラー（`x509` など）が出る**: Claude Code の sandbox が原因です。sandbox の中では `gh` が証明書を確かめられません。`~/.claude/settings.json` の sandbox の `excludedCommands` に `"gh *"` を入れると、`gh` で始まるコマンドが sandbox の外で動きます（[公式の説明](https://code.claude.com/docs/en/sandboxing.md)）
- **ログインしていない**（`gh auth status` がエラーになる）: `gh auth login` でログインします

`excludedCommands` が効くのは、`gh` で始まるコマンドを単独で実行したときだけです。`cd … && gh …` のように前に別のコマンドを付けたものや、`npm run …` の中から呼ばれる `gh` は sandbox の中に残り、同じエラーになります。

### 画面の帯に失敗が出る（手元の設定が無いとき）

起動時の `settings:` の行が `guild.settings.json` なら、まだ手元の設定がありません。既定の設定は作者の会社のリポジトリを読みにいくので、`failed: gh-failed` と失敗の帯が出ます。お試しの会社を片付けたあとも同じです。デモだけなら `npm run dev`、お試しなら [1-2](#1-2-お試しの会社)、自分の会社なら [2 章](#2-自分のリポジトリで使う)へ進みます。

### 帯が「デモ表示中（架空のデータ）。データを集めると…」のまま変わらない

collector を動かしていないか、止まっています（5 分より前に止まった collector の失敗は帯に出しません）。`npm run dev:all` か `npm run collect` で動かしてください。

### 画面の帯に「部門のラベルがリポジトリにありません」と出る

設定（`guild.settings.local.json`、無ければ `guild.settings.json`）の `departments[].label` のうち、対象のリポジトリに同じ名前のラベルが無いものがあります。そのままだと、その部門の Issue は部門の机に配られず、受付に置かれます。帯には部門のラベルと、設定の何番目か（`departments[n]`。0 から数えます）が出ます。collector のターミナルにも `labels missing 1/4: departments[1] のラベルがリポジトリに無い` のような行と「次にやること: …」の行が出ます（ログにはラベル名を出しません）。

collector は起動したときと、そのあと 10 分ごとに、リポジトリのラベル名を `gh` で読んで設定と照らし合わせます。比べ方は Issue のラベルを部門に結ぶときと同じで、1 文字でも違えば別の名前です（大文字と小文字、前後の空白、全角と半角も区別します）。

まず、リポジトリのラベル名を確かめます。

```bash
gh label list --repo <owner/name> --limit 1000
```

| 見つかったこと | 直し方 |
|---|---|
| 設定の名前のラベルが無い | `gh label create "<設定のラベル>" --repo <owner/name>` で作る |
| 似た名前のラベルがある（`Accounting` と `accounting` など） | GitHub 側を `gh label edit "<今のラベル>" --name "<設定のラベル>" --repo <owner/name>` で設定の名前にする（付いている Issue はそのまま新しい名前になります）か、設定の `label` を GitHub の名前に書き換える |

GitHub 側を直したときは、collector を止めずに次の照合（10 分以内）で帯が消えます。設定を書き換えたときは、`npm run dev:all` を止めて起動し直してください（collector と画面は起動時に設定を読みます）。起動し直すと、すぐに照合し直します。

ラベルを読めなかったとき（ログに `labels unknown: gh-failed` など）は「無い」とは扱いません。帯は最後に読めたときの結果のままで、次に読めたときに更新します。collector を止めて 5 分たつと、帯は消えます。

### 画面の帯に「部門の設定が入れ替わっているかもしれません」と出る

ある部門の接頭辞（設定の `branchPrefixes` でその部門に当たるブランチ名）の PR が、続けて別の部門のラベルの Issue に結び付いています。形は正しいが中身が違う設定（例: 広報と企画の接頭辞が入れ替わっている）のときに出ます。帯には部門のラベルと、設定の何番目か（`departments[n]`。0 から数えます）が出ます。2 つの部門が互いに相手のラベルの Issue に結び付いていれば「互いに相手の」、片方だけならその向きを出します。collector のターミナルにも `mixups suspected: departments[1] と departments[2] が入れ替わっているかもしれない（…）` のような行（件数付き）と「次にやること: …」の行が出ます（ログにはラベル名・題名・ブランチ名を出しません）。

collector は GitHub を読むたび（60 秒ごと）に、直近 30 日にマージした PR で確かめます。数えるのは、接頭辞で部門が決まり、結び付いた Issue の部門ラベルがちょうど 1 つの PR です（部門ラベルが無い Issue・2 つ以上ある Issue、Issue に結び付いていない PR は数えません）。部門 i の接頭辞の PR のうち、別の 1 部門 j のラベルのものが 3 件以上で、かつ半分を超えると帯が出ます。

設定（`guild.settings.local.json`、無ければ `guild.settings.json`）と、部門のフォルダで次を確かめます。

| 確かめること | 直し方 |
|---|---|
| `branchPrefixes` の `department` が、その接頭辞のブランチを作る部門のラベルになっているか | 入れ替わっていれば `department` を直す |
| 部門のフォルダ（`sessionDir`）の `CLAUDE.md` が、その部門のラベルと接頭辞を使うように書いているか（対象のリポジトリの側） | 書き違いがあれば `CLAUDE.md` を直す |

設定を書き換えたときは、`npm run dev:all` を止めて起動し直してください（collector と画面は起動時に設定を読みます）。起動し直すと、最初の取得で確かめ直します。`CLAUDE.md` を直したときや、設定が正しく、実際に部門をまたいだ仕事が続いただけのときは、それまでの PR のマージが 30 日より前になると帯が消えます。

部門のラベルがリポジトリに無いとき（上の帯）は、そちらを先に出します。直すとこちらの帯が出ます。GitHub を読めなかったときは最後に読めたときの結果のままで、collector を止めて 5 分たつと帯は消えます。

### 設定の検証で止まる

collector は `[collector] guild.settings.local.json is invalid:`（読んだファイルの名前）に続けて、悪い項目を `✖` と `→ at <項目>` の組で出して止まります。開発サーバーも起動時に同じものを出して止まります。よく出るもの:

| メッセージ | 直し方 |
|---|---|
| `2 or 3 or 4 or 5 or 6 departments (#18)` | `departments` を 2〜6 にする |
| `missing`（`members.<id>`） | 部門の `member` に書いたメンバー（または `kaname`・`yukihiro`）が `members` に無い。`members` にそのメンバーの名前・役・色を足す |
| `not a department label`（`branchPrefixes[n].department`） | `department` を `departments` のどれかの `label` と同じ文字にする |
| `~, ~/... or /... without a trailing / or surrounding spaces` | フォルダの書き方を直す（末尾の `/`、前後の空白を消す） |
| `label ... twice`・`member ... twice`・`session dir ... twice` | 部門どうしでラベル・担当・フォルダが重なっている。別々にする |
| `owner/name`（`repo`） | `repo` を `owner/name` の形にする |

JSON として読めないとき（`"` の付け忘れ、最後の要素の後ろの `,`、コメントなど）は `guild.settings.local.json を JSON として読めません（3 行 1 列）` のように、読めなくなった位置を出して止まります。その位置か、すぐ手前を直します。

`guild.settings.local.ts は読まなくなりました。…` と出たら、2-2 のとおり値を `guild.settings.local.json` に移し、`guild.settings.local.ts` を消します。

`~/x` と `/Users/<名前>/x` のように、書き方が違っても同じフォルダを指すものがあると、collector だけが `guild.settings.json is invalid: two session dirs point to the same directory` と出して止まります（読んだのが `guild.settings.local.json` でも、この文言です）。別々のフォルダにしてください。

### 「いま作業中」「許可待ち」が出ない

MulmoTerminal を使っていても出ないときは、セッションのフォルダが設定と**文字列で完全に一致**しているかを確かめます。

- MulmoTerminal のグリッドで、設定に書いたフォルダそのものでセルを開いて起動していること。子のフォルダや worktree（`.claude/worktrees/...` など別のフォルダ）で**起動**したセッションは映りません。MulmoTerminal が記録するのは起動したフォルダなので、起動したあとセッションの中で worktree に移って作業するのは構いません
- 設定のフォルダに末尾の `/` が無いこと（付けると設定の検証で止まります）
- グリッドのセル以外で開いたセッション（ふつうのターミナルの `claude` など）は映りません
- collector のログの `sessions=` の数が、開いているセッションの数と合っているか見ます。`sessions=0 ok` なら、どのセッションも設定のフォルダと一致していません
- `sessions unavailable: ...` と出るときは、MulmoTerminal のファイルを読めていません（`missing` はファイルが無い）。MulmoTerminal を一度起動すると作られます

すぐ終わった作業は、5 秒ごとの読み取りの間に終わって映らないことがあります。

### ポートを変えたい

`npm run dev -- --port 5191`（`--` の後ろが vite に渡ります）。`--port` を変えても待ち受けは `127.0.0.1` のままです。`--host` は渡さないでください（dev スクリプトの `--host 127.0.0.1` を上書きします）。

### 部門の数を変えたい

部門は 2〜6 にできます。部門の数に合わせて、部屋の机の並び（間取り）とパーティの窓の行が変わります。お客さん（[2-5](#2-5-お客さんを足す任意)）は、かなめ・部門のメンバーと合わせて 7 人までなので、5 部門にするときは 1 人に、6 部門にするときは `guests` を消します。

- `/guild-setup` か `npm run settings:write`（[2-2b](#2-2b-道具で書くnpm-run-settingswrite)）なら、入力の `departments` を新しい数だけ並べます。増えた部門の担当のメンバーは道具が決めます。`branchPrefixes` は入力の `prefix` の行を先に置き、いまの行のうち入力のラベルを指し、接頭辞が入力と重ならないものを後ろに残します
- 手で書くときは、`departments` の行を足すか消し、`branchPrefixes` も合わせます（消した部門のラベルを指す行は消す）。足した部門の `member` には、ほかの部門が使っていないメンバーを書き、`members` にそのメンバーが無ければ足します
- 書き換えたら `npm run dev:all` を止めて起動し直します。レベルは部門とメンバーの対応が変わったときに基準を取り直し、その回はレベルアップを出しません

## 4. MulmoTerminal との関係・絵の差し替え・データの扱い

### MulmoTerminal との関係

- MulmoTerminal が無くても動きます。GitHub の Issue・PR から、掲示板・パーティの状態・受け渡しの演出までを出します
- MulmoTerminal のグリッドで、設定に書いたフォルダのセッションを開いていると、「いま作業中」「許可待ち」が数秒の遅れで加わり、社長がセッションに指示を出したときに王様が呼びかけます。collector が MulmoTerminal のファイル（`~/.mulmoterminal/dev-terminal-cwds.json` と `activity-state.json`）を読むだけで、hooks は足しません
- それらのファイルには会社以外のセッションも載っています。collector は設定のフォルダに完全に一致する行だけを残し、ほかの行は読んだ直後に捨てます。保存もログもしません

### キャラの絵を差し替える

- 絵は `assets/sprites/<id>.png`（id は `kaname`・`minori`・`hibiki`・`hirame`・`sasae`・`takumi`・`musubi`・`yukihiro`）。透過 PNG で、80×80 のコマを横に 7 つ並べます（560×80）。足元をコマの下端の中央に置きます
- コマの意味: 0 正面、1 右向き、2・3 右向きの歩き、4 両手を上げる（受け取った物を掲げる）、5 正面で抱える（物を運ぶ・机で作業する）、6 右向きで抱える。左向きは右向きのコマを左右反転して描きます
- コマ 4〜6 は省けます（4 コマ・320×80）。そのときは運ぶ・掲げる物をコマ 0〜3 の絵に重ねて描き、机での作業は上下に揺れて表します
- コマ 4〜6 で物を持たせる位置は、いまの絵の手の位置を測った値です（`apps/web/src/render/hands.ts` の `MEASURED`）。手の位置が違う絵にすると、物がずれて見えます
- **絵を差し替えたら、開いているタブを再読み込みしてください。** 開発サーバーの絵の URL には内容のハッシュが付かないので、同じタブでは古い絵が使われ続けます。タイルや小物の絵も同じです
- 絵の出所とライセンスは [`assets/README.md`](../assets/README.md) に書きます。実在のゲームの素材は使わないでください

### データの扱い

- collector は取ったデータを `apps/web/.data/snapshot.json`（git の対象外、パーミッション 0600）に書きます。`apps/web/public/` には置かず、ビルドにも入りません
- 開発サーバーは `127.0.0.1` だけで待ち受けます（dev スクリプトの `--host 127.0.0.1` と `vite.config.ts`）。`--host 0.0.0.0` や値なしの `--host` など、ほかの待ち受け先を指定して LAN に出さないでください
- Issue の題名には取引先の名前などが入りえます。画面やデータを公開しない、題名を外に出さない前提で作っています。`npm run build` の成果物（`dist/`）はダミーのデータで作るもので、配布しません。ブラウザの localStorage にも番号・状態・時刻と、対象リポジトリを見分けるための短いハッシュ（リポジトリ名そのものではない）、音の設定、見せるモードの入り切りだけを残し、題名は残しません（キーは `conect-guild:baseline`・`conect-guild:last-active`・`conect-guild:sound`・`conect-guild:mask`）
- **見せるモード**: 人に画面を見せるときは、画面の「取得のようす」のタブの「見せる」を押します。掲示板などのクエストの題名が `＊` の並び（4〜8 個）に伏せられ、「伏せ中」と出ます。「もどす」で戻ります。入り切りは `conect-guild:mask` に残り、次に開いたときも続きます。デモでは出ません
- 実データを消すときは `apps/web/.data/` を消し、同じタブの「基準を消す」でブラウザ側の基準も消します
