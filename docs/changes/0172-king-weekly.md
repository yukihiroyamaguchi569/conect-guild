# #172 週の記録のクリアの数に王様のクエストを入れる（2026-10-17）

- ナレーションの週の記録「この 1 しゅうかんで クエストを N こ クリアした！」の N は、画面が snapshot の `issues` のうち直近 7 日に閉じたものから数えていた（`app/narration.ts`）。王様のクエスト（ラベル「社長」）は collector の `splitPresidentIssues` で `issues` から外れ、`president.issues` には open のものしか入らないので、閉じた王様のクエストは N に入っていなかった
- `history` は全履歴を数えていて王様の Issue も入っているが、日時を持たないため、週の数には使えない（使うには `history` に日時を足すことになる）
- collector が直近 7 日に閉じた王様の Issue を `president.closed`（番号と閉じた日時だけ。題名なし）に入れ、画面が `issues` のクリアと合わせて数える（社長の判断）。部門の Issue と同じく、閉じた理由は問わない
- 同じ番号は 1 回だけ数える（`issues` と `president.closed` の両方にある、`issues` に 2 回ある。collector はどちらも書かないが、画面で守る。実装時の判断）
- `president.closed` は任意の項目にし、`schemaVersion` は上げない（古い collector の snapshot も読める。そのときは王様のクリアを数えない）
- `history`（opened・completed・merged）、経験値、ログの数、宝箱の数は変えていない
- DESIGN.md の 4.1「王様のクエスト（Issue #141）」、snapshot の形、4.9 に追記した
