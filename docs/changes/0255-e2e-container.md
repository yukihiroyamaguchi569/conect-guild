# #255 e2e を Playwright 公式のコンテナで動かし、apt の遅さに左右されないようにする（2026-10-23）

- CI の e2e が 14〜15 分かかっていた。テスト本体は約 7 分のままで、延びたのは `npx playwright install --with-deps chromium`（13 秒から 7 分 10 秒）。ブラウザはキャッシュから戻っており、遅いのは OS の部品（フォント・ライブラリ）を Ubuntu のミラーから apt で取る部分だった
- e2e のジョブを Playwright 公式のコンテナ `mcr.microsoft.com/playwright:v1.63.0-noble` で動かす。ブラウザと OS の部品が入っているので、`playwright install` とブラウザのキャッシュの手順をなくした（Playwright の CI の文書もブラウザのキャッシュを勧めていない）
- `options: --user 1001` は Playwright の CI の文書の GitHub Actions の例のとおり（ランナーの利用者で動かし、checkout したファイルの持ち主と合わせる）。コンテナの Node は 24 なので、`setup-node` で `.nvmrc` の版を入れる手順は残した（実装時の判断）
- コンテナの版と lockfile の `@playwright/test` の版がずれたら、テストの前に失敗する手順を足した。コンテナが `/ms-playwright/.docker-info` に書く版と比べる（Playwright 自身がずれの案内に使うファイル）。Playwright の版を上げる PR で、コンテナの版の上げ忘れに気づくため
- Playwright の版を上げるときは、`e2e.yml` のコンテナの版も同じ PR で上げる
- 関係する章: 9 章（画面の E2E の項目）
