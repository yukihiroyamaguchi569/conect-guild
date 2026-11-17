# #297 スクショだけを足した文書の PR でも E2E を飛ばす（2026-11-18）

- PR #296（文書とスクショだけ）で E2E が 4 本とも走った。E2E は Markdown だけの PR を飛ばす（Issue #229）が、スクショの PNG が入ると当たらなかった
- `assets/screenshots/` は README・docs に載せる画像で、アプリのコードからは読んでいないので、`.github/workflows/e2e.yml` の `paths-ignore` に足した。main へのマージ後はこれまでどおり走る
- verify（Markdown の書式の確かめを含む）と scoria はこれまでどおり走る
