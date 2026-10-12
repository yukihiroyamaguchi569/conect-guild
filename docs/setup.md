# 自分のチームで使う

GitHub の Issue・PR で仕事を回しているチームなら、設定ファイルを 1 つ書くだけで、自分のリポジトリをギルド画面で眺められます。画面は手元のブラウザで見るもので、どこにも公開しません。

このページは次の順に進みます。

0. [使える条件](#0-使える条件)
1. [まずデモを見る](#1-まずデモを見る)
2. [自分のリポジトリで使う](#2-自分のリポジトリで使う)
3. [困ったとき](#3-困ったとき)
4. [MulmoTerminal との関係・絵の差し替え・データの扱い](#4-mulmoterminal-との関係絵の差し替えデータの扱い)

## 0. 使える条件

始める前に、次がそろっているか確かめてください。チームの動かし方（司令塔と部門の AI を GitHub でどう回すか）は [orchestration.md](orchestration.md) にまとめています。これから始めるなら、先にそちらを読んでください。

- **部門は 4 つ。** 登場するのは司令塔 1・部門 4・社長 1 の 6 人で固定です。部門の数を変えられるようにする作業は [#18](https://github.com/yukihiroyamaguchi569/conect-guild/issues/18) で進めます。4 つ以外にすると、設定の検証で止まります
- **Issue に部門のラベルを付ける。** 巻物の担当は、Issue に付いた部門のラベルで決まります。ラベルの無い Issue は司令塔の受付に置かれます
- **PR を Issue に結ぶ。** PR の題名か本文に `#番号`（おすすめは本文の `Closes #番号`）を書くか、部門の接頭辞で始まるブランチ名（例: `accounting/12-monthly-report`）にします。どちらも無い PR は「担当不明」として受付に置かれます
- **Node.js 26.10 以上**（collector は Node の型除去で TypeScript をそのまま動かします）
- **GitHub CLI（`gh`）でログイン済み**で、対象のリポジトリの Issue・PR を読めること。collector は `gh` の認証をそのまま使い、トークンを別に置きません
- **MulmoTerminal は任意。** 無くても動きます。あれば「いま作業中」「許可待ち」と王様の呼びかけが加わります。そのときは、5 つの AI（司令塔と 4 部門）を**別々のフォルダ**で起動し、そのフォルダを設定に**文字列で完全に一致**させて書きます（別のフォルダで起動したセッションは映りません。起動したあとセッションの中で worktree に移るのは構いません。[3 章](#いま作業中許可待ちが出ない)）

## 1. まずデモを見る

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

## 2. 自分のリポジトリで使う

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

**やること**

リポジトリ直下の [`guild.settings.ts`](../guild.settings.ts)（conect.llc の設定。既定）をコピーして `guild.settings.local.ts` を作り、コピーのほうを書き換えます。

```bash
cp guild.settings.ts guild.settings.local.ts
```

`guild.settings.local.ts` は git に入りません。このファイルがあれば、collector と画面は `guild.settings.ts` の代わりにこちらを読みます。`guild.settings.ts` は書き換えないでください。

書き換える項目は次の 6 つです。

| 項目 | 中身 |
|---|---|
| `repo` | 眺める GitHub リポジトリ（`owner/name`） |
| `members` | 6 人の名前・役・色（`#rrggbb`）。id（`kaname` など）は絵のファイル名なので変えない。`kaname` は受付の司令塔、`yukihiro` は玉座の王、残る 4 人（`minori`・`hibiki`・`hirame`・`sasae`）が部門の机に座る |
| `commanderSessionDir` | 司令塔のセッションを起動するフォルダ |
| `departments` | 4 つの部門。それぞれ GitHub のラベル（`label`）・担当のメンバー（`member`）・セッションを起動するフォルダ（`sessionDir`）。並び順が、Issue に部門ラベルが複数あるときの優先順になる |
| `branchPrefixes` | ブランチ名の接頭辞 → 部門のラベル。Issue に結べない PR の担当を推定する。上から順に見て、最初に当たったものを使う |
| `ruleChangePaths` | 変えると社長の承認が要るファイル。`exact`（パスが等しい）・`suffix`（で終わる）・`prefix`（で始まる）の 3 種類で書き、glob は使えない。既定は `CLAUDE.md`・`/CLAUDE.md` で終わるもの・`.claude/agents/` で始まるもので、そのままでよければ変えない |

たとえば、リポジトリ `your-name/my-company` を `~/my-company` に clone し、その下の 4 つのフォルダで部門の AI を動かすなら、次のようになります（`members` と `ruleChangePaths` は省略）。

```ts
  repo: 'your-name/my-company',
  commanderSessionDir: '~/my-company',
  departments: [
    { label: '経理', member: 'minori', sessionDir: '~/my-company/accounting' },
    { label: '広報', member: 'hibiki', sessionDir: '~/my-company/pr' },
    { label: '企画', member: 'hirame', sessionDir: '~/my-company/planning' },
    { label: '総務', member: 'sasae', sessionDir: '~/my-company/general-affairs' },
  ],
  branchPrefixes: [
    { prefix: 'accounting/', department: '経理' },
    { prefix: 'pr/', department: '広報' },
    { prefix: 'planning/', department: '企画' },
    { prefix: 'general-affairs/', department: '総務' },
  ],
```

書くときの注意:

- **`label` は GitHub のラベル名と 1 文字も違わないように**書きます（全角・半角、空白も含めて）
- **`branchPrefixes` の `department` には、`departments` の `label` のどれかを書きます**
- **フォルダ（`commanderSessionDir` と `sessionDir`）** は `~`（ホームそのもの）、`~/...`（ホームの下）、絶対パスのどれかで書き、末尾に `/` や前後の空白を付けません。MulmoTerminal が記録するパスと文字列で比べるためです。5 つはすべて別のフォルダにします。`~` とホームの絶対パスのように、書き方が違っても同じフォルダを指すものは、collector が起動時に見つけて止まります。MulmoTerminal を使わないなら、フォルダは画面の表示に関わりません（重ならない値を書いておけば足ります）

対象のリポジトリなどは、コマンドラインの引数や環境変数では変えられません。設定ファイルを書き換えてください。

**確かめること**

- 設定は collector と画面の起動時に zod で検証します。間違いがあると、次の 2-3 で起動したときに、どの項目が悪いかを出して止まります（[3 章](#設定の検証で止まる)）

### 2-3. collector と画面を起動する

**やること**

```bash
npm run dev:all   # collector と開発サーバーを一緒に起動する。Ctrl-C で両方止まる
```

出力の行頭の `[collect]` が collector、`[web]` が開発サーバーです。どちらかが止まると、もう片方も止まります。

**確かめること**

起動から数秒で、次のような行が出ます（時刻と件数は環境で変わります）。

```text
[collect] [collector] settings: guild.settings.local.ts
[web]   ➜  Local:   http://127.0.0.1:5173/
[collect] [collector] 2026-10-12T01:23:45.678Z ok: issues=12 prs=8 history: opened=40 completed=31 merged=27
[collect] [collector] 2026-10-12T01:23:45.690Z sessions=5 ok
```

- `settings:` の行が `guild.settings.local.ts` であること。`guild.settings.ts` と出たら、手元のファイルが無いか、名前か置き場所（リポジトリ直下）が違います
- `ok:` の行が出ること。`issues`・`prs` は画面に渡す Issue・PR の件数、`history` は経験値に数える全履歴の件数です（時刻は UTC で出ます）。`failed:` の行が出たら [3 章](#3-困ったとき) へ
- `sessions=` の行は MulmoTerminal のセッションを読んだ結果です（`sessions=5 ok` なら 5 つとも見つかった）。MulmoTerminal を使わないなら `sessions unavailable: missing` などと出ますが、気にしなくてかまいません

collector は GitHub を 60 秒ごと、MulmoTerminal を 5 秒ごとに読みます。別々に動かしたいときは、ターミナルを 2 つ使い、`npm run collect` を先に動かしてから `npm run dev` を動かします。1 回だけ集めるなら `npm run collect:once` です。

### 2-4. 画面が自分のリポジトリに切り替わるのを確かめる

**やること**

ブラウザで http://127.0.0.1:5173 を開きます（デモを開いたままなら、そのままで構いません）。

**確かめること**

- 「デモ表示中」の帯が消え、掲示板に自分のリポジトリの Issue が並びます。collector の最初の収集が終われば、再読み込みしなくても 5 秒ほどで切り替わります
- 巻物が部門の机に配られていること（ラベルの無い Issue は受付に置かれます）

これで準備は終わりです。

`npm run verify`（lint・型検査・テスト）は、このリポジトリを開発するためのものです。テストは `guild.settings.local.ts` を読まず、いつも conect.llc の設定（`guild.settings.ts`）で動くので、手元の設定を書き換えても通ります。

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

すぐ下に「次にやること: …」の行が続きます。`guild.settings.local.ts`（無ければ `guild.settings.ts`。起動時の `settings:` の行に、読んだほうが出ます）の `repo` を、`gh` でログインしているアカウントで読めるか確かめます。

```bash
gh auth status                 # gh にログインしているか
gh repo view <owner/name>      # repo に書いたリポジトリを読めるか（<owner/name> は repo の値）
```

読めなければ、読めるリポジトリに `repo` を書き換えるか、読めるアカウントで `gh auth login` します。`repo` を書き換えたときは、collector を止めて起動し直してください（設定は起動時に読みます）。

### 帯が「デモ表示中（架空のデータ）。データを集めると…」のまま変わらない

collector を動かしていないか、止まっています（5 分より前に止まった collector の失敗は帯に出しません）。`npm run dev:all` か `npm run collect` で動かしてください。

### 設定の検証で止まる

collector は `Error: guild.settings.local.ts or guild.settings.ts (whichever is used) is invalid:` に続けて、悪い項目を `✖` と `→ at <項目>` の組で出して止まります（画面はブラウザのコンソールに同じものを出します）。よく出るもの:

| メッセージ | 直し方 |
|---|---|
| `exactly 4 departments (#18)` | `departments` をちょうど 4 つにする |
| `not a department label`（`branchPrefixes[n].department`） | `department` を `departments` のどれかの `label` と同じ文字にする |
| `~, ~/... or /... without a trailing / or surrounding spaces` | フォルダの書き方を直す（末尾の `/`、前後の空白を消す） |
| `label ... twice`・`member ... twice`・`session dir ... twice` | 部門どうしでラベル・担当・フォルダが重なっている。別々にする |
| `owner/name`（`repo`） | `repo` を `owner/name` の形にする |

`~/x` と `/Users/<名前>/x` のように、書き方が違っても同じフォルダを指すものがあると、collector だけが `guild.settings.ts is invalid: two session dirs point to the same directory` と出して止まります（読んだのが `guild.settings.local.ts` でも、この文言です）。別々のフォルダにしてください。

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

いまは 4 つで固定です（[#18](https://github.com/yukihiroyamaguchi569/conect-guild/issues/18)）。部門が 3 つ以下なら、使わない部門にも、どの Issue にも付けないラベルと、使わないフォルダを書いておきます。5 つ以上なら、4 つにまとめたラベルで運用してください。

## 4. MulmoTerminal との関係・絵の差し替え・データの扱い

### MulmoTerminal との関係

- MulmoTerminal が無くても動きます。GitHub の Issue・PR から、掲示板・パーティの状態・受け渡しの演出までを出します
- MulmoTerminal のグリッドで、設定に書いたフォルダのセッションを開いていると、「いま作業中」「許可待ち」が数秒の遅れで加わり、社長がセッションに指示を出したときに王様が呼びかけます。collector が MulmoTerminal のファイル（`~/.mulmoterminal/dev-terminal-cwds.json` と `activity-state.json`）を読むだけで、hooks は足しません
- それらのファイルには会社以外のセッションも載っています。collector は設定のフォルダに完全に一致する行だけを残し、ほかの行は読んだ直後に捨てます。保存もログもしません

### キャラの絵を差し替える

- 絵は `assets/sprites/<id>.png`（id は `kaname`・`minori`・`hibiki`・`hirame`・`sasae`・`yukihiro`）。透過 PNG で、80×80 のコマを横に 7 つ並べます（560×80）。足元をコマの下端の中央に置きます
- コマの意味: 0 正面、1 右向き、2・3 右向きの歩き、4 両手を上げる（受け取った物を掲げる）、5 正面で抱える（物を運ぶ・机で作業する）、6 右向きで抱える。左向きは右向きのコマを左右反転して描きます
- コマ 4〜6 は省けます（4 コマ・320×80）。そのときは運ぶ・掲げる物をコマ 0〜3 の絵に重ねて描き、机での作業は上下に揺れて表します
- コマ 4〜6 で物を持たせる位置は、いまの絵の手の位置を測った値です（`apps/web/src/render/hands.ts` の `MEASURED`）。手の位置が違う絵にすると、物がずれて見えます
- **絵を差し替えたら、開いているタブを再読み込みしてください。** 開発サーバーの絵の URL には内容のハッシュが付かないので、同じタブでは古い絵が使われ続けます。タイルや小物の絵も同じです
- 絵の出所とライセンスは [`assets/README.md`](../assets/README.md) に書きます。実在のゲームの素材は使わないでください

### データの扱い

- collector は取ったデータを `apps/web/.data/snapshot.json`（git の対象外、パーミッション 0600）に書きます。`apps/web/public/` には置かず、ビルドにも入りません
- 開発サーバーは `127.0.0.1` だけで待ち受けます（dev スクリプトの `--host 127.0.0.1` と `vite.config.ts`）。`--host 0.0.0.0` や値なしの `--host` など、ほかの待ち受け先を指定して LAN に出さないでください
- Issue の題名には取引先の名前などが入りえます。画面やデータを公開しない、題名を外に出さない前提で作っています。`npm run build` の成果物（`dist/`）はダミーのデータで作るもので、配布しません。ブラウザの localStorage にも番号・状態・時刻と、対象リポジトリを見分けるための短いハッシュ（リポジトリ名そのものではない）、音の設定だけを残し、題名は残しません
- 実データを消すときは `apps/web/.data/` を消し、画面の「基準を消す」でブラウザ側の基準も消します
