# #82 開発サーバーの 127.0.0.1 固定を、設定ファイルを読めなかったときにも守る（2026-10-13）

- 原因: ルートの `dev` は `npm run dev -w apps/web` で、`npm run dev -- --port 5214 --strictPort` と打つと、中の npm が `--port`・`--strictPort` を自分の設定として吸い取り、vite には `5214` だけが届いた。vite はそれを root のフォルダと受け取り、そこに `vite.config.ts` が無いので設定を読まずに既定の `localhost`（`[::1]:5173`）で待ち受けた。loopback なので LAN には出ていないが、`server.host` の固定が設定ファイルを読めたときにしか効いていなかった
- `apps/web/package.json` の dev を `vite --host 127.0.0.1` にした。設定ファイルを読めなくても、コマンドラインの指定で 127.0.0.1 に固まる。`vite.config.ts` の `server.host` はそのまま残す（E2E の webServer は `npx vite` を直接呼ぶため、こちらで守る）
- ルートの dev を `npm run dev -w apps/web --` にし、`npm run dev -- --port X` の引数が npm ではなく vite に届くようにした。`npm run dev:all` は引数なしで呼ぶので影響しない
- 両方の dev スクリプトと `server.host` を `apps/web/dev-host.test.ts` で守る。docs/setup.md の「困ったとき」にポートの変え方を 1 行足した。関係する章: 2 章の 4、5 章
