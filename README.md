# conect-guild

[English](README.en.md)

AI だけで動く小さな会社を、レトロ RPG のギルド画面として眺めるアプリ。

作者の会社では、司令塔の AI（かなめ）が社長の依頼を GitHub Issue に分解し、部門ごとの Claude Code セッション（経理・広報・企画・総務）に渡して、PR で成果を受け取ります。conect-guild はその様子を、クエスト掲示板・パーティ・玉座の王様として描きます。

![デモモードの画面（架空のデータ）](assets/screenshots/demo-overview.png)

デモモード（架空のデータ）の画面。

| 会社 | ゲーム |
|---|---|
| GitHub Issue（部門ラベル付き） | クエストの巻物 |
| 部門セッション | パーティのメンバー |
| 司令塔（かなめ） | ギルドの受付 |
| 社長（ゆきひろ） | 玉座の王。承認待ちは「承認まち」の吹き出し |
| PR | 宝箱。マージで「最近の成果」に加わる |

## できること

- **ギルド画面**: GitHub の Issue・PR から、司令塔・部門（2〜6）・社長の仕事のようすを、レトロ RPG のギルドとして描く
- **パーティの状態**: 作業中・確認まち・承認まちなど。MulmoTerminal を使っていれば「いま作業中」「許可待ち」も出る
- **お客さん**: 会社の外のセッションを、最大 2 人まで訪ねてくる客として描く
- **見せるモード**: 人に画面を見せるとき、ボタン 1 つで Issue・PR の題名を伏せる
- **デモモード**: 架空のクエストで、設定なしに試せる

どう動くかは、画面で見てのお楽しみ。

部門は 2〜6 にできます（司令塔 1・部門 2〜6・社長 1）。自分のチームで使える条件は [docs/setup.md の「使える条件」](docs/setup.md#0-使える条件)にまとめています。

## デモモードで見る

Node.js 26.10 以上で:

```bash
git clone https://github.com/yukihiroyamaguchi569/conect-guild.git
cd conect-guild
npm ci --ignore-scripts
npm run dev
```

http://127.0.0.1:5273 を開くだけで、架空のクエストのデモが動きます（collector がまだデータを集めていないあいだの自動のデモ。音は「♪ 音を出す」で鳴ります）。collector も GitHub も要りません。

効果音つきで最初から見る・撮るときは http://127.0.0.1:5273/?demo=1 を開き（昼の部屋なら `?demo=1&hour=12`）、「▶ はじめる」を押します（画面の幅が狭いと押せないので、ウィンドウを広げます）。

## もっと知る

- 設計: [docs/DESIGN.md](docs/DESIGN.md)
- 自分のチームで使う（設定・収集・データの扱い）: [docs/setup.md](docs/setup.md)
- 設定ファイルを Claude Code に作らせる: conect-guild の直下で `/guild-setup`（[docs/setup.md の 2-2](docs/setup.md#2-2-設定ファイルを作って書き換える)）
- 架空の会社を作って試す: conect-guild の直下で `/guild-trial`（GitHub に private のリポジトリを作る。[docs/setup.md](docs/setup.md)）。片付けは `/guild-trial-cleanup`
- 司令塔と部門の AI を GitHub で回す流儀と CLAUDE.md の雛形: [docs/orchestration.md](docs/orchestration.md)
- 変更履歴: [docs/changes/](docs/changes/)

## ライセンス

MIT
