# #271 クエストのカードにクエストごとの絵を出す（1 本目: 返すプラグインと表示）（2026-11-08）

- スキル `/guild-card-art`（2 本目）が `apps/web/.data/cards/<Issue 番号>.png` に描いた絵を、カードの窓に出すようにした。無いときは今までどおり担当メンバーの絵
- 開発時だけの Vite プラグイン `vite-plugin-cards.ts` が `/cards/index.json`（番号と更新時刻）と `/cards/<番号>.png` を no-store で返す。数字の名前の普通のファイルだけを返し、シンボリックリンク・フォルダ・ほかのパスは 404。ファイルは `O_NOFOLLOW` で開く
- 画面は本番の画面でカードを開くたびに一覧を読み直す（デモでは読まない）。読めない・一覧に無い・絵が壊れているときはメンバーの絵に戻す。決め方は純粋関数 `taskPictureOf`
- e2e は `cardServer` フィクスチャが架空の絵（`assets/concept/rpg-company-ui.png`）を返し、開発サーバーの `.data` を読まない。一覧が 500 のときに Chrome が自分で出す「Failed to load resource」の 1 行だけは、そのテストの中で確かめて外す
- CLAUDE.md の「実データの置き場所」に `.data/cards/` の 1 行を足した
