# CI の push を main だけに絞る（Issue #209）

- `.github/workflows/ci.yml` の `push` を main だけにした。PR では pull_request の検査（verify・e2e）だけが走り、ブランチへの push で同じ検査が 2 回走らなくなる。main に入ったあとの検査は push で今までどおり走る（scoria.yml と同じ形）
- PR を作る前のブランチへの push では CI が走らない。途中で CI を見たいときは Draft の PR を作る
- ブランチ保護・ruleset の必須の検査は設定されていない（2026-10-18 に確認）ので、検査の名前が変わってもマージは止まらない
