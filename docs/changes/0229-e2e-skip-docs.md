# Markdown だけの PR では e2e を走らせない（Issue #229）

- ブラウザの E2E を `.github/workflows/ci.yml` から `e2e.yml` に分け、pull_request では変更が Markdown（`**/*.md`）だけなら走らせない（`paths-ignore`）。文書だけの PR で 7 分ほど待たなくてよくなる
- verify（format・lint・typecheck・test・build）はこれまでどおり全 PR で走る。main への push では e2e も必ず走る
- PR の画面の検査名は「CI / e2e」から「E2E / e2e」に変わる。ブランチ保護の必須の検査は設定されていない（2026-10-18 確認）。将来 e2e を必須にすると、走らなかった PR は待ちのままになる
