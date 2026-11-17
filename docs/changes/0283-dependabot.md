# #283 Dependabot で依存の更新と脆弱性を確かめる（2026-11-18）

- `.github/dependabot.yml` を足した。npm（root の lockfile。ワークスペースもここで扱う）を毎週月曜 9:00（Asia/Tokyo）に確かめる
- 公開から 7 日未満の版は使わない決まりに合わせ、`cooldown` の `default-days` を 7 にした。cooldown は版の更新だけに効き、脆弱性の更新（security updates）には効かない（GitHub の仕様）
- minor と patch は 1 本の PR にまとめ、major は個別の PR にする。開いたままにできる版の更新の PR は 5 本まで（脆弱性の更新の PR には別の上限がある）。コミットの prefix は `chore`
- Dependabot alerts はリポジトリの設定でオンにした（司令塔）。Dependabot security updates（自動で脆弱性の更新の PR を出す）は、cooldown が効かず 7 日未満の版を入れうるので、オフのままにする（社長の判断）。知らせが来たら手で直す
- Dependabot の PR は、PR 本文の決まり（User Prompt・マージの順番）と `docs/changes/` のファイルの例外とした（社長の判断）。マージ前に CI の結果と、推移依存のインストールスクリプトが増えていないかを確かめる。CLAUDE.md の「Git」の次に書いた
- CI のワークフローは変えていない。GitHub Actions の版の更新（`github-actions` のエコシステム）は頼まれていないので足していない
