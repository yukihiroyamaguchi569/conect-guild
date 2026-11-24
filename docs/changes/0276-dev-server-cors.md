# 開発サーバーの応答を、同じ機械の別のポートのページから読めないようにする（Issue #276）

- `apps/web/vite.config.ts` に `server.cors: false` を入れた。Vite の既定は `localhost`・`127.0.0.1` の別のポートの origin に `Access-Control-Allow-Origin` を返すので、この機械で動くほかの開発サーバーのページ（依存に悪意のあるコードが入ったものを含む）が、`/snapshot.json`（Issue の題名）や設定を含むモジュールを読めた。画面は自分の origin からしか読まないので、CORS のヘッダは要らない
- `/cards/` の Origin の確認（Issue #271）はそのまま残した
- 直す前は `Origin: http://127.0.0.1:5206` の問い合わせに `Access-Control-Allow-Origin: http://127.0.0.1:5206` が返り、直したあとは返らないことを curl で確かめた
- E2E（`apps/web/e2e/devServerCors.spec.ts`）で、自分のページからは読め、別のポート（お客さんの E2E のサーバー）のページからは読めないことを確かめる
- `docs/DESIGN.md` の 5 章に書いた
