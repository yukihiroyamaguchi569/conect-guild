# GitHub を使えるようにする

conect-guild は、GitHub の Issue・PR を `gh`（GitHub CLI）で読みます。GitHub のアカウントがない方、`gh` を使ったことがない方は、このページを上から順に進めてください。終わったら、来たページに戻ります。

先に Claude Code を入れておきます。3 と 4 で使います。入れ方は [Claude Code の公式の案内](https://code.claude.com/docs/en/setup)にあります。

## 1. GitHub のアカウントを作る

1. ブラウザで https://github.com/signup を開きます
2. 画面の案内に沿って、メールアドレス・パスワード・ユーザー名を入れます。ユーザー名は、あとでリポジトリの名前（`<ユーザー名>/<リポジトリ名>`）に使われます
3. 入れたメールアドレスに GitHub から確認のメールが届きます。書かれているコードを画面に入れるか、メールのリンクを開きます
4. GitHub にログインできれば、このステップは終わりです

## 2. `gh` を入れる

**Mac の場合**

1. 「ターミナル」アプリを開き、`brew --version` と打ちます。バージョンが出れば Homebrew が入っています
2. Homebrew が入っていれば、次を打ちます

   ```bash
   brew install gh
   ```

3. Homebrew が入っていなければ、https://cli.github.com を開き、案内に沿って入れます
4. `gh --version` と打ち、バージョンが出れば入っています

**Windows・Linux の場合**

https://cli.github.com の案内に沿って入れます。

## 3. `gh` でログインする

ブラウザでの確認が要るので、Claude に頼まず自分で打ちます。

1. Claude Code を起動し、次のように打ちます。先頭の `!` を付けると、Claude を通さずにコマンドがそのまま動きます

   ```text
   ! gh auth login
   ```

2. 質問が順に出るので、矢印キーで選んで Enter を押します。文言は `gh` の版によって少し違います
   - GitHub をどこで使うか → **GitHub.com**
   - Git の通信の方式 → **HTTPS**
   - Git の認証にも GitHub のログインを使うか → **Yes**（そのまま Enter）
   - ログインのしかた → **ブラウザでログインする**（Login with a web browser）
3. `XXXX-XXXX` のような 1 回限りのコードが表示されます。Enter を押すとブラウザが開くので、そのコードを入れて許可します。ブラウザが開かなければ、表示された URL を自分で開きます
4. Claude Code に戻り、ログインできたという表示が出れば終わりです

質問が出ずに止まるときは、Mac なら「ターミナル」アプリ、Windows・Linux ならふだん使う端末で `gh auth login` を打ち、同じように進めます。

## 4. ログインできたか確かめる

Claude Code に「`gh auth status` を実行して」と頼みます。`Logged in to github.com account <あなたのユーザー名>` のように、ログインしているアカウント名が出れば OK です。

## 5. 困ったとき

### 証明書のエラー（`x509` など）が出る

Claude Code の sandbox が `gh` の通信を止めています。Claude Code の設定の `excludedCommands` に `"gh *"` を入れ、`gh` を単独のコマンドで実行させると直ります。設定のしかたと注意は [setup.md の「`gh issue list` が動かない」](setup.md#gh-issue-list-が動かない)にあります。

### ログインしていないと出る

`gh auth status` がエラーになるときは、3 からやり直します。

## 6. 戻る

- お試しの会社を作るなら [trial.md](trial.md) の「用意するもの」へ
- 自分のチームで使うなら [setup.md の「1. 使える条件」](setup.md#1-使える条件)へ
