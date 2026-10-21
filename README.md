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
- **お客さん**: 会社の外のセッションを、最大 2 人まで訪ねてくる客として描く

どう動くかは、画面で見てのお楽しみ。

## 試し方

試し方は 3 つあります。上から順に手間が増え、自分の仕事に近づきます。

1. [デモを見る](#1-デモを見る): 手元で画面を動かすだけ。GitHub も設定も要りません
2. [架空の会社を作って試す](#2-架空の会社を作って試す): Claude Code が架空の会社と Issue を作り、本物と同じ流れを試せます
3. [自分のチームで試す](#3-自分のチームで試す): 自分のリポジトリの Issue・PR を眺めます

### 1. デモを見る

Node.js 26.10 以上で:

```bash
git clone https://github.com/yukihiroyamaguchi569/conect-guild.git
cd conect-guild
npm ci --ignore-scripts
npm run dev
```

http://127.0.0.1:5273 を開くだけで、架空のクエストのデモが動きます（collector がまだデータを集めていないあいだの自動のデモ。音は「♪ 音を出す」で鳴ります）。collector も GitHub も要りません。

### 2. 架空の会社を作って試す

デモのあと、conect-guild の直下で Claude Code を起動し、`/guild-trial` を実行します。架空の会社（GitHub の private のリポジトリ、部門のフォルダ、手元の設定）を作り、架空の Issue で画面を試せます。これを修正して、自分の会社として使うこともできます。詳しくは [docs/trial.md](docs/trial.md)。

### 3. 自分のチームで試す

部門は 2〜6 にできます（司令塔 1・部門 2〜6・社長 1）。AI の会社（司令塔と部門のセッションで GitHub の Issue・PR を回す仕組み）があるかどうかで、道が分かれます。

- **もう回している**: [docs/setup.md](docs/setup.md) の手順で、conect-guild の直下で `/guild-setup` を実行して設定を作ります
- **まだ無い**: 上の「2. 架空の会社を作って試す」でお試しの会社を作り、気に入ったら `/guild-trial-graduate` で自分の会社にします（卒業。[docs/trial.md](docs/trial.md)）。一から自分で作るなら [docs/orchestration.md の 3 章](docs/orchestration.md#3-始め方)へ

## もっと知る

- 設計: [docs/DESIGN.md](docs/DESIGN.md)
- 変更履歴: [docs/changes/](docs/changes/)

## ライセンス

MIT
