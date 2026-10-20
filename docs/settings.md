# 設定の詳しい説明

[setup.md](setup.md) の補足です。設定ファイルを手や道具で書く方法、お客さんの足し方、collector の出力の読み方、MulmoTerminal との関係、絵の差し替え、データの扱いをまとめています。はじめて使うなら、先に setup.md の手順（`/guild-setup`）で設定を作ってください。

1. [手で書く](#1-手で書く)
2. [道具で書く（`npm run settings:write`）](#2-道具で書くnpm-run-settingswrite)
3. [お客さんを足す（任意）](#3-お客さんを足す任意)
4. [collector の出力を読む](#4-collector-の出力を読む)
5. [`npm run verify` は開発用](#5-npm-run-verify-は開発用)
6. [MulmoTerminal との関係](#6-mulmoterminal-との関係)
7. [キャラの絵を差し替える](#7-キャラの絵を差し替える)
8. [データの扱い](#8-データの扱い)

## 1. 手で書く

リポジトリ直下の [`guild.settings.json`](../guild.settings.json)（conect.llc の設定。既定）をコピーして `guild.settings.local.json` を作り、コピーのほうを書き換えます。

```bash
cp guild.settings.json guild.settings.local.json
```

- `guild.settings.local.json` は git に入りません。このファイルがあれば、collector と画面は `guild.settings.json` の代わりにこちらを読みます
- `guild.settings.json` は書き換えないでください
- 設定は JSON で書きます。collector と画面は、ファイルを JSON として読んで検証するだけで、実行はしません
- 文字列と項目名は `"` で囲みます。最後の要素の後ろに `,` を付けません。コメントは書けません
- 対象のリポジトリなどは、コマンドラインの引数や環境変数では変えられません。設定ファイルを書き換えてください
- 設定は collector と画面の起動時に zod で検証します。間違いがあると、どの項目が悪いかを出して止まります（[setup.md の「設定の検証で止まる」](setup.md#設定の検証で止まる)）
- 書き換えたら、`npm run dev:all` を止めて起動し直します。collector と画面は起動時に設定を読みます

リポジトリ名・司令塔と部門のフォルダ・部門のラベルと接頭辞を変えるだけなら（部門の数を変えるときも）、手で書く代わりに道具でも書けます（[2 章](#2-道具で書くnpm-run-settingswrite)）。

### 項目

書き換える項目は次の 6 つと、任意の `guests`（[3 章](#3-お客さんを足す任意)）・`president` です。

| 項目 | 中身 |
|---|---|
| `repo` | 眺める GitHub リポジトリ（`owner/name`）。Issue と PR をここから集める |
| `members` | メンバーの名前・役・色（`#rrggbb`）。id（`kaname` など）は絵のファイル名なので変えない。`kaname` は受付の司令塔、`yukihiro` は玉座の王。部門の机に座るのは `minori`・`hibiki`・`hirame`・`sasae`・`takumi`・`musubi` のうち、`departments` の `member` に書いた人。書くのは `kaname`・`yukihiro` と部門の机に座る人だけでよい。既定の `guild.settings.json` は 4 部門なので `takumi`・`musubi` が無い。5・6 部門にするときは足す。`settings:write` が足すときは、名前と色がたくみ・`#00897b`、むすび・`#ff7043` で、役はその部門のラベルになる |
| `commanderSessionDir` | 司令塔のセッションを起動するフォルダ |
| `departments` | 2〜6 の部門。それぞれ GitHub のラベル（`label`）・担当のメンバー（`member`）・セッションを起動するフォルダ（`sessionDir`）を書く。`member` は部門の机に座れる 6 人のどれかで、部門どうしで重ならない。並び順が、Issue に部門ラベルが複数あるときの優先順になる。部門の数に合わせた間取りに切り替わる |
| `branchPrefixes` | ブランチ名の接頭辞（`prefix`）→ 部門のラベル（`department`）。部門ラベルの付いた Issue に結べない PR の担当を推定する。上から順に見て、ブランチ名が最初に当てはまったものを使う |
| `ruleChangePaths` | 変えると社長の承認が要るファイル。`exact`（パスが等しい）・`suffix`（で終わる）・`prefix`（で始まる）の 3 種類で書き、glob は使えない。既定は `CLAUDE.md`・`/CLAUDE.md` で終わるもの・`.claude/agents/` で始まるもの。そのままでよければ変えない |
| `president` | 任意。王様（社長）がやる Issue の印のラベル（例 `{ "label": "社長" }`）。下の「王様のクエスト」を見る |

**王様のクエスト（`president`）**

- このラベルが付いた open の Issue は、部門のラベルが一緒に付いていても王様のものになります
- 掲示板のいちばん上の「おうさまの クエスト」の欄と、パーティの窓のゆきひろの行の「やること N 件」に出ます。部門の机とかなめの受付には出ません
- 部門の `label` と同じ名前にはできません
- `/guild-setup` と `settings:write` は書きません。`guild.settings.local.json` に手で足します。`settings:write` は、いまの設定の `president` をそのまま保ちます
- 足したら `npm run dev:all` を起動し直します。無ければ、この欄と行は出ません
- ラベルは自分で作ります（`gh label create 社長 -R <owner/name>`）
- collector は、このラベルがリポジトリにあるかを照合しません。部門のラベルと違い、帯もログも出ません。書き間違えても気づけず、王様のクエストが空のままになります

### 例

リポジトリ `your-name/my-company` を `~/my-company` に clone し、その下の 4 つのフォルダで 4 つの部門の AI を動かすなら、次のようになります（`members` と `ruleChangePaths` は省略）。

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

### 書くときの注意

- `label` は、GitHub のラベル名と 1 文字も違わないように書きます。全角・半角、空白も含めてです
- `branchPrefixes` の `department` には、`departments` の `label` のどれかを書きます
- フォルダ（`commanderSessionDir` と `sessionDir`）は、`~`（ホームそのもの）、`~/...`（ホームの下）、絶対パスのどれかで書きます。末尾の `/` や前後の空白は付けません。MulmoTerminal が記録するパスと文字列で比べるためです
- 司令塔と部門のフォルダは、すべて別のフォルダにします。`~` とホームの絶対パスのように、書き方が違っても同じフォルダを指すものは、collector が起動時に見つけて止まります
- MulmoTerminal を使わないなら、フォルダは画面の表示に関わりません。重ならない値を書いておけば足ります

### 部門の数を変えるとき

- `departments` の行を足すか消し、`branchPrefixes` も合わせます。消した部門のラベルを指す行は消します
- 足した部門の `member` には、ほかの部門が使っていないメンバーを書きます。`members` にそのメンバーが無ければ足します
- お客さんがいるときは、上限（[3 章](#3-お客さんを足す任意)）に合わせて `guests` を減らします

## 2. 道具で書く（`npm run settings:write`）

[1 章](#1-手で書く)の手作業の代わりに使えます。値だけを書いた JSON を標準入力で渡すと、検証してから `guild.settings.local.json` を書きます。setup.md の `/guild-setup` も、この道具で確かめて書きます。

**やること**

値だけの JSON を作ります（例: `input.json`。置き場所はどこでも構いません）。部門は 2〜6 を並び順のとおりに書きます（下は 4 部門の例）。`prefix` は、その部門のブランチ名の接頭辞です。

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

- 入力に無い項目は、いまの設定（`guild.settings.local.json`、無ければ `guild.settings.json`）の値を保ちます。`members` の名前・色、`ruleChangePaths`、`branchPrefixes` の `docs/` で始まる行などです。`guests`（お客さん）も、入力に無ければ保ちます（入力に書くときは [3 章](#3-お客さんを足す任意)）
- ただし `branchPrefixes` は、入力の `prefix` の行を先に置きます。いまの行は、入力のラベルのどれかを指し、接頭辞が入力と重ならないものだけを後ろに残します。ラベルを変えた部門を指していた行は消えます
- i 番目の部門の担当（`member`）は、いまの設定の i 番目のままです
- いまの設定より部門が多いときは、どの部門も担当していないメンバーが、みのり・ひびき・ひらめ・ささえ・たくみ・むすびの順で増えた部門に就きます。役（`role`）はその部門のラベルになります。いまの設定に無いたくみ・むすびは、名前と色を既定のまま足します
- 既にある `guild.settings.local.json` を上書きするときは、前の内容を `guild.settings.local.json.bak`（git に入りません）に残します。戻すときは、このファイルの名前を `guild.settings.local.json` に変えます
- `--json` を付けると、同じ結果を JSON で出します

**確かめること**

- 確認の表で、部門ごとのラベル・接頭辞、そのフォルダの `CLAUDE.md` にラベルが見つかったか、フォルダを見ます
- **エラー**（書けません）: 設定の検証に合わない、フォルダが無い、`~` を展開すると 2 つのフォルダが同じになる、`guild.settings.local.json` があるのに `--overwrite` が無い
- **警告**（書けます）: ラベルがリポジトリに無い、GitHub にラベルを問い合わせられなかった、部門のフォルダの `CLAUDE.md` にその部門のラベルが見つからない、接頭辞とフォルダ名が違う
- 問い合わせられなかったラベルは、collector があとで照合し直します。道具は `npm run` の中から `gh` を呼ぶので、Claude Code の sandbox の中で動かすとこの警告になります
- 最後の 2 つの警告は、部門のフォルダを取り違えたときに出ます。[orchestration.md](orchestration.md) の雛形どおりでない会社では、取り違えていなくても出ることがあります
- 道具が部門のフォルダで確かめるのは、Claude Code の `CLAUDE.md` です。ラベルの文字があるかを調べるだけで、中身を表示も保存もしません
- 書いたら setup.md の [2-3](setup.md#2-3-collector-と画面を起動する) の手順で起動し、`settings:` の行が `guild.settings.local.json` で、`ok:` の行が出ることを確かめます。`sessions=<部門の数 + 1> ok`（4 部門なら `sessions=5 ok`）は MulmoTerminal を使う人だけの確認です

## 3. お客さんを足す（任意）

会社の外のプロジェクト（自分の別のアプリなど）の AI のセッションを、「お客さん」としてギルドに来させられます。無くても構いません（既定は無し）。

- かなめ・部門のメンバー・お客さんを合わせて 7 人までです（王様は数えません）。お客さんは 2〜4 部門で 2 人、5 部門で 1 人までで、6 部門では足せません
- 上限を超えると、設定の検証が `at most 1 guests with 5 departments (#108)` のように上限の数を挙げて止まります
- 画面では、お客さんは部屋の決まった場所（部門の数で変わります）に立ち、セッションの状態を見た目で表します
- 名前と、リポジトリの開いている Issue・PR は、掲示板のお客さんの欄に出ます

### スキルで足す

conect-guild のリポジトリで開いた Claude Code のセッションで `/guild-setup` を動かし、「お客さんを足したい」（外したい・入れ替えたい）と頼みます。スキルは次の順に進めます。

1. `npm run --silent settings:list-sessions` で、MulmoTerminal のセッションのフォルダを新しい順に番号付きで見せます。いまのお客さんと、部門の数で決まる上限も出ます
   - 一覧は、MulmoTerminal が `~/.mulmoterminal/dev-terminal-cwds.json` に記録しているものです。閉じたセッションのフォルダが残っていることもあります。司令塔と部門のフォルダは除きます
   - 一覧はその場で見せるだけで、ファイルにもログにも残しません
2. 番号で選ぶと、フォルダ名から名前を提案します。直したい名前を伝えます
3. スキルは `npm run settings:write` に、お客さん全員（`guests`）だけの入力を渡し、書かずに（`--dry-run`）確かめます。入力はリポジトリの外の一時ファイルに書き、終わったら消します
4. `repo` は、選んだフォルダの git の `origin`（GitHub のもの）から提案します。合っているか、要らないかを答えます
5. 確認の表を見て OK と答えると、`guild.settings.local.json` に書きます。会社の値は今のまま保ちます

### 道具で足す

[2 章](#2-道具で書くnpm-run-settingswrite)の入力に `guests` を足します。

- `guests` は全員をまとめて書き、いまのお客さんを置き換えます。空の `[]` で全員外します
- お客さんだけを変えるときは、`repo`・`commanderSessionDir`・`departments` を書きません。3 つとも書かなければ、いまの値を保ちます
- `repo` を書かないお客さんは、フォルダの git の `origin` から道具が `owner/name` を提案して、そのまま書きます。リポジトリを付けないなら `"repo": null` と書きます

```json
{
  "guests": [
    { "name": "たびびと", "sessionDir": "~/side-project" },
    { "name": "ぼうけんしゃ", "sessionDir": "~/another-app", "repo": null }
  ]
}
```

### 手で足す

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
| `sessionDir` | お客さんのセッションを起動するフォルダ。書き方は会社のフォルダと同じ。文字列で完全に一致したセッションだけを読む（その下のフォルダや worktree で起動したものは映らない）。会社のフォルダとも、ほかのお客さんとも違うフォルダにする |
| `repo` | 任意。お客さんの GitHub リポジトリ（`owner/name`）。会社の `repo` とは違うものにする（大文字と小文字は区別しない） |

### 集めるもの

- セッションの状態（いま作業中・許可待ち）を、会社と同じく MulmoTerminal のファイルから読みます。collector の `sessions=` の行に、セッションが見つかったお客さんの数が `guests=1` のように加わります
- `repo` があれば、お客さんごとに 5 分おきに `gh` で読みます。1 人目は起動から 20 秒ほど、2 人目は 40 秒ほどで始め、会社の 60 秒ごとの取得と重ならないようにずらします
- 読むのは、開いている Issue・PR（更新の新しい 100 件まで）と、直近 7 日に完了で閉じた Issue・マージした PR です。閉じたものは更新の新しい順に 100 件まで読み、その中から新しい順に 20 件までを使います
- 呼び出しは、お客さん 1 人につき 5 分に 2 回までです。1 回目が失敗すると 2 回目は呼びません。`gh` でログインしているアカウントで、そのリポジトリを読めるようにしておきます
- お客さんの Issue・PR は、題名つきで snapshot に入ります。会社の Issue と同じく、公開しない前提です
- ログには番号・件数・エラーの種類だけを出します（`guests[0] github ok: open=3 recent=2`・`guests[1] github failed: gh-failed`）。名前・リポジトリ名・題名は出しません
- お客さんの取得に失敗しても、会社の部分はそのまま集めます。そのお客さんは、最後に読めたときの結果のままです

`guests` を書き換えたら、`npm run dev:all` を止めて起動し直します。画面は、snapshot のお客さんの数や `repo` が設定と合わないとき、お客さんの分をまとめて使いません。

## 4. collector の出力を読む

`npm run dev:all` を起動すると、次のような行が出ます（4 部門の例。時刻と件数は環境で変わります）。

```text
[collect] [collector] settings: guild.settings.local.json
[collect] [collector] 2026-10-12T01:23:45.678Z ok: issues=12 prs=8 president=2 history: opened=40 completed=31 merged=27
[collect] [collector] 2026-10-12T01:23:45.690Z sessions=5 ok
```

- `settings:` は、読んだ設定ファイルです
- `ok:` の行の `issues`・`prs` は、画面に渡す Issue・PR の件数です
- `president=` は、王様のクエスト（ラベルが付いた open の Issue）の件数です。設定に `president` があるときだけ出ます
- `history` は、経験値に数える全履歴の件数です
- 時刻は UTC で出ます
- `sessions=` の行は、MulmoTerminal のセッションを読んだ結果です。司令塔と部門のうち、見つかった数が出ます。4 部門で `sessions=5 ok` なら 5 つとも見つかっています
- MulmoTerminal を使わないなら `sessions unavailable: missing` などと出ますが、気にしなくてかまいません
- `failed:` の行が出たら、[setup.md の 3 章](setup.md#3-困ったとき)へ進みます

collector は GitHub を 60 秒ごと、MulmoTerminal を 5 秒ごとに読みます。

- collector と開発サーバーを別々に動かすときは、ターミナルを 2 つ使います。`npm run collect` を先に動かしてから、`npm run dev` を動かします
- 1 回だけ集めるなら `npm run collect:once` です

## 5. `npm run verify` は開発用

`npm run verify`（lint・型検査・テスト）は、このリポジトリを開発するためのものです。テストは `guild.settings.local.json` を読まず、いつも conect.llc の設定（`guild.settings.json`）で動きます。手元の設定を書き換えても通ります。

## 6. MulmoTerminal との関係

- MulmoTerminal が無くても動きます。GitHub の Issue・PR から、掲示板・パーティの状態・受け渡しの演出までを出します
- MulmoTerminal のグリッドで、設定に書いたフォルダのセッションを開いていると、「いま作業中」「許可待ち」が数秒の遅れで加わります。社長がセッションに指示を出したときは、王様が呼びかけます
- そのためには、司令塔と各部門の AI を別々のフォルダで起動し、そのフォルダを設定に文字列で完全に一致させて書きます。別のフォルダで起動したセッションは映りません。起動したあと、セッションの中で worktree に移るのは構いません（映らないときは [setup.md の「いま作業中」「許可待ち」が出ない](setup.md#いま作業中許可待ちが出ない)）
- collector は MulmoTerminal のファイル（`~/.mulmoterminal/dev-terminal-cwds.json` と `activity-state.json`）を読むだけで、hooks は足しません
- それらのファイルには、会社以外のセッションも載っています。collector は設定のフォルダに完全に一致する行だけを残し、ほかの行は読んだ直後に捨てます。保存もログもしません

## 7. キャラの絵を差し替える

- 絵は `assets/sprites/<id>.png` です（id は `kaname`・`minori`・`hibiki`・`hirame`・`sasae`・`takumi`・`musubi`・`yukihiro`）。透過 PNG で、80×80 のコマを横に 8 つ並べます（640×80）。足元はコマの下端の中央に置きます
- コマの意味: 0 正面、1 右向き、2・3 右向きの歩き、4 両手を上げる（受け取った物を掲げる）、5 正面で抱える（物を運ぶ・机で作業する）、6 右向きで抱える、7 座って寝る（暇が 30 分を過ぎたとき）。左向きは、右向きのコマを左右反転して描きます
- コマ 7 は省けます（7 コマ・560×80）。そのときは、寝ているあいだも正面のコマ 0 で描きます
- コマ 4〜7 は省けます（4 コマ・320×80）。そのときは、運ぶ・掲げる物をコマ 0〜3 の絵に重ねて描きます。机での作業は、上下に揺れて表します
- コマ 4〜6 で物を持たせる位置は、いまの絵の手の位置を測った値です（`apps/web/src/render/hands.ts` の `MEASURED`）。手の位置が違う絵にすると、物がずれて見えます
- **絵を差し替えたら、開いているタブを再読み込みしてください。** 開発サーバーの絵の URL には内容のハッシュが付かないので、同じタブでは古い絵が使われ続けます。タイルや小物の絵も同じです
- 絵の出所とライセンスは [`assets/README.md`](../assets/README.md) に書きます。実在のゲームの素材は使わないでください

## 8. データの扱い

- collector は、取ったデータを `apps/web/.data/snapshot.json`（git の対象外、パーミッション 0600）に書きます。`apps/web/public/` には置かず、ビルドにも入りません
- 開発サーバーは `127.0.0.1` だけで待ち受けます（dev スクリプトの `--host 127.0.0.1` と `vite.config.ts`）。`--host 0.0.0.0` や値なしの `--host` など、ほかの待ち受け先を指定して LAN に出さないでください
- Issue の題名には、取引先の名前などが入りえます。画面やデータを公開しない、題名を外に出さない前提で作っています
- `npm run build` の成果物（`dist/`）は、ダミーのデータで作るもので、配布しません
- ブラウザの localStorage には、次のものだけを残し、題名は残しません。番号・状態・時刻、対象リポジトリを見分けるための短いハッシュ（リポジトリ名そのものではない）、音の設定、見せるモードの入り切りです。キーは `conect-guild:baseline`・`conect-guild:last-active`・`conect-guild:sound`・`conect-guild:mask` です
- **見せるモード**: 人に画面を見せるときは、画面の「取得のようす」のタブの「見せる」を押します。掲示板などのクエストの題名が `＊` の並び（4〜8 個）に伏せられ、「伏せ中」と出ます。「もどす」で戻ります。入り切りは `conect-guild:mask` に残り、次に開いたときも続きます。デモでは出ません
- 実データを消すときは `apps/web/.data/` を消し、同じタブの「基準を消す」でブラウザ側の基準も消します
