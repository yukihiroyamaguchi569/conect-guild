# 自分のチームで試す

GitHub の Issue・PR で仕事を回しているチームなら、自分のリポジトリをギルド画面で眺められます。設定ファイルを 1 つ作れば動きます。画面は手元のブラウザで見るもので、どこにも公開しません。

この文書は、AI の会社（司令塔と部門のセッションで GitHub の Issue・PR を回す仕組み）をもう回している人向けです。まだ無いなら、[trial.md](trial.md) でお試しの会社を作り、気に入ったら `/guild-trial-graduate` で自分の会社に卒業させます。一から自分で作るなら [orchestration.md の 3 章](orchestration.md#3-始め方)へ進んでください。

お試しの会社を作ったことがあるなら、先に `/guild-trial-cleanup` で片付けるか、卒業させてください。お試しの手元の設定（`guild.settings.local.json`）が残っていて、`/guild-setup` はそれを出発点にします。

デモを見るだけなら README の「[デモを見る](../README.md#1-デモを見る)」へ。設定の細かな説明は [settings.md](settings.md) にあります。

## 1. 使える条件

次のものを用意します。

- **部門が 2〜6 あること。** 登場するのは司令塔 1・部門 2〜6・社長 1 です。1 つや 7 つ以上では、設定の検証で止まります
- **Issue に部門のラベルを付けること。** 巻物の担当は、このラベルで決まります。ラベルの無い Issue は司令塔の受付に置かれます
- **PR を Issue に結ぶこと。** PR の本文に `Closes #番号` を書きます（題名や本文の `#番号` でも結べます）。または、部門の接頭辞で始まるブランチ名（例: `accounting/12-monthly-report`）にします。どちらも無い PR は「担当不明」として受付に置かれます
- **Node.js 26.10 以上。**
- **GitHub CLI（`gh`）で対象のリポジトリを読めること。** collector は `gh` の認証をそのまま使います。会社のリポジトリの直下で Claude Code に `gh issue list` を実行させ、一覧が出れば足ります。出なければ [3 章](#gh-issue-list-が動かない)を見てください
- **司令塔と部門のセッションを並べて開ける端末アプリ。** 4 部門なら 5 つのセッションです。[MulmoTerminal](https://github.com/receptron/mulmoterminal) を勧めます。cmux などほかの端末アプリでも、Issue・PR の表示は動きます
- 「いま作業中」「許可待ち」などのセッションの状態と、王様の呼びかけは、MulmoTerminal のときだけ出ます。そのためには、設定に書いたフォルダとまったく同じフォルダで、各セッションを起動します（[settings.md の 6 章](settings.md#6-mulmoterminal-との関係)）
- Codex などほかのエージェントでも、Issue・PR の表示は動きます。`/guild-setup` とセッションの状態の表示は、Claude Code 向けに作っています

司令塔と部門の AI を GitHub でどう回すかは [orchestration.md](orchestration.md) にあります。これから始めるなら、先にそちらを読んでください。

## 2. 設定して使う

まず conect-guild を clone して、依存を入れます。README の「デモを見る」で済ませていれば要りません。以降のコマンドは conect-guild の直下で実行します。

```bash
git clone https://github.com/yukihiroyamaguchi569/conect-guild.git
cd conect-guild
npm ci --ignore-scripts
```

### 2-1. `gh` で対象のリポジトリを読めるようにする

**やること**

```bash
gh auth login               # まだなら。済んでいれば要りません
gh auth status              # ログインしているアカウントを確かめる
gh repo view <owner/name>   # 眺めたいリポジトリ（例: your-name/my-company）
```

**確かめること**

- `gh repo view` がリポジトリの説明を表示すること。エラーになるなら、そのアカウントでは読めません。読めるアカウントで `gh auth login` し直します

### 2-2. `/guild-setup` で設定を作る

**やること**

1. conect-guild の直下で Claude Code を起動し、`/guild-setup` を実行します。「guild の設定を作って」と頼んでも使われます
2. スキルに聞かれる 2 つに答えます
   - あなたの会社の GitHub リポジトリ（conect-guild 自身ではありません）
   - 司令塔のフォルダ
3. スキルが確認の表を見せます。違うところだけ直してください
   - 部門（ラベル・フォルダ・接頭辞）は、司令塔の `CLAUDE.md` の部門の表から読みます。表の形は [orchestration.md の 4 章](orchestration.md#4-司令塔の-claudemd-の雛形)のとおりです。読めないときは、雛形の 4 部門が入ります
   - ラベルがリポジトリに無ければ、警告に出ます
4. OK と答えると、`guild.settings.local.json` が書かれます。OK と答えない限り書きません
5. 書けたら 2-3 に進みます

ほかの書き方と、追加の設定は [settings.md](settings.md) にあります。

- 手で書く: [settings.md の 1 章](settings.md#1-手で書く)
- 道具（`npm run settings:write`）で書く: [settings.md の 2 章](settings.md#2-道具で書くnpm-run-settingswrite)
- お客さん（会社の外の AI のセッション）を足す: [settings.md の 3 章](settings.md#3-お客さんを足す任意)
- 王様のクエスト（`president`）は手でだけ書けます: [settings.md の 1 章の表](settings.md#項目)

**確かめること**

- 設定は、collector と画面の起動時に検証します。間違いがあると、2-3 で起動したときに悪い項目を出して止まります（[3 章](#設定の検証で止まる)）

### 2-3. collector と画面を起動する

collector は、画面に出すデータを集める手元のプログラムです。

- GitHub の Issue・PR を 60 秒ごとに `gh` で読みます
- MulmoTerminal のセッションの状態を 5 秒ごとに読みます
- 集めたものを手元のファイル（`apps/web/.data/snapshot.json`）に書きます

画面はこのファイルを読んで描きます。ブラウザから GitHub に問い合わせることはありません。

**やること**

```bash
npm run dev:all   # collector と開発サーバーを一緒に起動する。Ctrl-C で両方止まる
```

行頭の `[collect]` が collector、`[web]` が開発サーバーの出力です。どちらかが止まると、もう片方も止まります。

**確かめること**

起動から数秒で、次のような行が出ます（4 部門の例）。

```text
[collect] [collector] settings: guild.settings.local.json
[web]   ➜  Local:   http://127.0.0.1:5273/
[collect] [collector] 2026-10-12T01:23:45.678Z ok: issues=12 prs=8 president=2 history: opened=40 completed=31 merged=27
[collect] [collector] 2026-10-12T01:23:45.690Z sessions=5 ok
```

- `settings:` の行が `guild.settings.local.json` であること。`guild.settings.json` と出たら、手元のファイルが無いか、名前か置き場所（リポジトリ直下）が違います
- `ok:` の行が出ること。`failed:` の行が出たら [3 章](#3-困ったとき)へ進みます
- MulmoTerminal を使うなら、`sessions=5 ok` のように、部門の数に 1 を足した数が出ること

各行の意味は [settings.md の 4 章](settings.md#4-collector-の出力を読む)にあります。

### 2-4. 画面が自分のリポジトリに切り替わるのを確かめる

**やること**

ブラウザで http://127.0.0.1:5273 を開きます。デモを開いたままなら、そのままで構いません。

**確かめること**

- 「デモ表示中」の帯が消え、掲示板に自分のリポジトリの Issue が並ぶこと。最初の収集が終われば、再読み込みしなくても 5 秒ほどで切り替わります
- 巻物が部門の机に配られていること。ラベルの無い Issue は受付に置かれます

これで準備は終わりです。

## 3. 困ったとき

### 画面の帯に「collector が失敗しています」と出る

collector は動いていますが、データを集められていません。collector の出力（行頭が `[collect]`）に `failed:` で始まる行があります。帯の（　）の中は、その種類を短くしたものです。ブラウザのコンソールにも、同じ内容が警告として 1 回出ます。

| 帯の（　） | ログの種類 | どうするか |
|---|---|---|
| 認証・取得 | `failed: gh-failed` | `gh` で GitHub から読めていません。下の「`gh-failed` が出る」へ |
| データの検証 | `failed: validation-failed` | 読んだデータの形が想定と違いました。次の取得で直ることがあります。続くなら [conect-guild の Issue](https://github.com/yukihiroyamaguchi569/conect-guild/issues) で知らせてください |
| ファイルの書き込み | `failed: write-failed` | `apps/web/.data/` に書けません。フォルダの権限や空き容量を確かめます |
| 想定外のエラー | `failed: unexpected` | collector を起動し直します。続くなら conect-guild の Issue で知らせてください |

ログには件数・時刻・種類だけを出し、題名やリポジトリ名は出しません。collector は 60 秒ごとに試し直します。原因を直せば、止めなくても本物の画面に切り替わります。

### `failed: gh-failed` が出る

すぐ下に「次にやること: …」の行が続きます。設定の `repo` を、`gh` でログインしているアカウントで読めるか確かめます。読んだ設定ファイルは、起動時の `settings:` の行に出ています。

```bash
gh auth status                 # gh にログインしているか
gh repo view <owner/name>      # repo に書いたリポジトリを読めるか
```

読めなければ、`repo` を読めるリポジトリに書き換えるか、読めるアカウントで `gh auth login` します。`repo` を書き換えたら、collector を起動し直します。設定は起動時に読むためです。

### `gh issue list` が動かない

1 章の確かめ方で、一覧が出なかったときです。

- **証明書のエラー（`x509` など）が出る**: Claude Code の sandbox の中では、`gh` が証明書を確かめられません。`~/.claude/settings.json` の sandbox の `excludedCommands` に `"gh *"` を入れると、`gh` で始まるコマンドが sandbox の外で動きます（[公式の説明](https://code.claude.com/docs/en/sandboxing.md)）
- **ログインしていない**（`gh auth status` がエラーになる）: `gh auth login` でログインします

`excludedCommands` が効くのは、`gh` を単独で実行したときだけです。`cd … && gh …` のような形や、`npm run …` の中から呼ばれる `gh` は sandbox の中に残り、同じエラーになります。

### 画面の帯に失敗が出る（手元の設定が無いとき）

起動時の `settings:` の行が `guild.settings.json` なら、手元の設定がまだありません。既定の設定は作者の会社のリポジトリを読みにいくので、`failed: gh-failed` と失敗の帯が出ます。お試しの会社を片付けたあとも同じです。デモだけなら `npm run dev`、お試しなら [trial.md](trial.md)、自分の会社なら [2 章](#2-設定して使う)へ進みます。

### 帯が「デモ表示中（架空のデータ）。データを集めると…」のまま変わらない

collector が動いていないか、止まっています。`npm run dev:all` か `npm run collect` で動かします。5 分より前に止まった collector の失敗は、帯に出しません。

### 画面の帯に「部門のラベルがリポジトリにありません」と出る

設定の `departments[].label` のうち、リポジトリに同じ名前のラベルが無いものがあります。その部門の Issue は、部門の机に配られず受付に置かれます。帯には部門のラベルと、設定の何番目か（`departments[n]`。0 から数えます）が出ます。collector の出力にも `labels missing 1/4: departments[1] のラベルがリポジトリに無い` のような行と、「次にやること: …」の行が出ます。ログにはラベル名を出しません。

collector は起動時と 10 分ごとに、リポジトリのラベル名を `gh` で読んで設定と比べます。1 文字でも違えば別の名前です。大文字と小文字、前後の空白、全角と半角も区別します。まずリポジトリのラベル名を確かめます。

```bash
gh label list --repo <owner/name> --limit 1000
```

| 見つかったこと | 直し方 |
|---|---|
| 設定の名前のラベルが無い | `gh label create "<設定のラベル>" --repo <owner/name>` で作る |
| 似た名前のラベルがある（`Accounting` と `accounting` など） | `gh label edit "<今のラベル>" --name "<設定のラベル>" --repo <owner/name>` で GitHub 側の名前を変える（付いている Issue はそのまま新しい名前になる）か、設定の `label` を GitHub の名前に書き換える |

GitHub 側を直したなら、10 分以内の次の照合で帯が消えます。設定を書き換えたなら、`npm run dev:all` を起動し直します。起動し直すと、すぐに照合します。

ラベルを読めなかったとき（ログに `labels unknown: gh-failed` など）は、「無い」とは扱いません。帯は最後に読めたときのままです。collector を止めて 5 分たつと、帯は消えます。

### 画面の帯に「部門の設定が入れ替わっているかもしれません」と出る

ある部門の接頭辞の PR が、続けて別の部門のラベルの Issue に結び付いています。たとえば、広報と企画の接頭辞が設定で入れ替わっているときに出ます。帯には部門のラベルと `departments[n]` が出ます。互いに相手のラベルに結び付いていれば「互いに相手の」、片方だけならその向きを出します。collector の出力にも `mixups suspected: departments[1] と departments[2] が入れ替わっているかもしれない（…）` のような件数付きの行と、「次にやること: …」の行が出ます。ログにはラベル名・題名・ブランチ名を出しません。

collector は 60 秒ごとに、直近 30 日にマージした PR で確かめます。数えるのは、接頭辞で部門が決まり、結び付いた Issue の部門ラベルがちょうど 1 つの PR です。部門 i の接頭辞の PR のうち、別の 1 部門 j のラベルのものが 3 件以上で、かつ半分を超えると帯が出ます。

| 確かめること | 直し方 |
|---|---|
| 設定の `branchPrefixes` の `department` が、その接頭辞のブランチを作る部門のラベルになっているか | 入れ替わっていれば `department` を直す |
| 部門のフォルダ（`sessionDir`）の `CLAUDE.md` が、その部門のラベルと接頭辞を使うように書いているか | 書き違いがあれば `CLAUDE.md` を直す |

設定を書き換えたなら、`npm run dev:all` を起動し直します。最初の取得で確かめ直します。`CLAUDE.md` を直したときや、部門をまたぐ仕事が続いただけのときは、その PR のマージが 30 日より前になると帯が消えます。

ラベルが無いときの帯（上の節）があれば、そちらを先に出します。GitHub を読めなかったときは最後に読めたときのままで、collector を止めて 5 分たつと帯は消えます。

### 設定の検証で止まる

collector は `[collector] guild.settings.local.json is invalid:`（読んだファイルの名前）に続けて、悪い項目を `✖` と `→ at <項目>` の組で出して止まります。開発サーバーも同じものを出して止まります。よく出るもの:

| メッセージ | 直し方 |
|---|---|
| `2 or 3 or 4 or 5 or 6 departments (#18)` | `departments` を 2〜6 にする |
| `missing`（`members.<id>`） | 部門の `member` に書いたメンバー（または `kaname`・`yukihiro`）を `members` に足す |
| `not a department label`（`branchPrefixes[n].department`） | `department` を `departments` のどれかの `label` と同じ文字にする |
| `~, ~/... or /... without a trailing / or surrounding spaces` | フォルダの末尾の `/` と前後の空白を消す |
| `label ... twice`・`member ... twice`・`session dir ... twice` | 部門どうしで重なっているラベル・担当・フォルダを別々にする |
| `owner/name`（`repo`） | `repo` を `owner/name` の形にする |

JSON として読めないときは、`guild.settings.local.json を JSON として読めません（3 行 1 列）` のように位置を出して止まります。その位置か、すぐ手前を直します。`"` の付け忘れ、最後の要素の後ろの `,`、コメントなどが原因です。

`guild.settings.local.ts は読まなくなりました。…` と出たら、古い形の設定が残っています。[settings.md の 1 章](settings.md#1-手で書く)のとおり `guild.settings.local.json` を作り、`guild.settings.local.ts` を消します。

`~/x` と `/Users/<名前>/x` のように、書き方が違っても同じフォルダを指すものがあると、collector だけが `guild.settings.json is invalid: two session dirs point to the same directory` と出して止まります。読んだのが `guild.settings.local.json` でも、この文言です。別々のフォルダにします。

### 「いま作業中」「許可待ち」が出ない

MulmoTerminal のセッションのフォルダが、設定と文字列で完全に一致しているかを確かめます。

- 設定に書いたフォルダそのもので、MulmoTerminal のグリッドのセルを開いて起動していること。子のフォルダや worktree で起動したセッションは映りません。起動したあと、セッションの中で worktree に移るのは構いません
- 設定のフォルダの末尾に `/` が無いこと（付けると設定の検証で止まります）
- グリッドのセル以外で開いたセッション（ふつうのターミナルの `claude` など）は映りません
- collector の `sessions=` の数が、開いているセッションの数と合っているか見ます。`sessions=0 ok` なら、どのセッションも設定のフォルダと一致していません
- `sessions unavailable: ...` なら、MulmoTerminal のファイルを読めていません（`missing` はファイルが無い）。MulmoTerminal を一度起動すると作られます

すぐ終わった作業は、5 秒ごとの読み取りの間に終わって映らないことがあります。

### ポートを変えたい

`npm run dev -- --port 5191` のように渡します（`--` の後ろが vite に渡ります）。待ち受けは `127.0.0.1` のままです。`--host` は渡さないでください。dev スクリプトの `--host 127.0.0.1` を上書きしてしまいます。

### 部門の数を変えたい

部門は 2〜6 にできます。部門の数に合わせて、部屋の机の並び（間取り）とパーティの窓の行が変わります。

- `/guild-setup` か `npm run settings:write` なら、入力の `departments` を新しい数だけ並べます（[settings.md の 2 章](settings.md#2-道具で書くnpm-run-settingswrite)）。増えた部門の担当は道具が決めます
- 手で書くときは、`departments` と `branchPrefixes` を合わせて直します（[settings.md の 1 章](settings.md#部門の数を変えるとき)）
- お客さんがいるときは、5 部門で 1 人まで、6 部門では 0 人にします（[settings.md の 3 章](settings.md#3-お客さんを足す任意)）
- 書き換えたら `npm run dev:all` を起動し直します。部門とメンバーの対応が変わると、レベルの基準を取り直し、その回はレベルアップを出しません
