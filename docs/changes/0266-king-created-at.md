# #266 王様の Issue に開いた日時（createdAt）を足す（2026-11-08）

- クエストのカード（#267）で王様のクエストにもレア度（開いてからの日数）を出すため、snapshot の `president.issues` に `createdAt` を足した。collector は Issue の一覧ですでに持っている値を残すだけで、取得は増やしていない
- `createdAt` は任意の項目にし、`schemaVersion` は上げなかった。`president`（#141）・`president.closed`（#172）と同じく、古い collector の snapshot も読めるようにするため（実装時の判断）。collector はいつも書く。検証は部門の Issue の `createdAt` と同じ ISO 8601
- デモの台本と E2E の架空の snapshot にも `createdAt` を足した。画面のふるまいは変えていない
