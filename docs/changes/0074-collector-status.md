# #74 collector の失敗を画面の帯に出す（自動デモ中に collector が取れていないことが分かるように）（2026-10-12）

- #72 で、データのファイルが無いときは画面が自動のデモを流すようにしたが、collector が動いていても GitHub から取れない（`gh` 未ログイン、権限なし など）ときもファイルができないので、「まだ集めていない」と区別がつかず、失敗は collector のターミナルにしか出なかった。社長の判断「エラーはエラーとして分かるようにしたい。初回の画面はデモのままにし、collector の失敗を帯に出す」で、次のようにした（DESIGN.md 4.1・4.3・4.11）
- collector は、最後に GitHub を試した時刻・成功したか・失敗の種類だけを `apps/web/.data/collector-status.json`（0600、一時ファイル → rename）に書く。schema は `packages/snapshot` に置き、collector のエラーの種類（`CollectorErrorKind`）もこの schema から引くようにして一覧を 1 か所にした
  - GitHub は成功したが snapshot を書けない間も、画面には何も届かないので `write-failed` にした（実装時の判断）
  - ループでは中身が変わったときだけ書く。5 秒ごとに書き直すと、ディスクへの書き込みが無駄に増えるため（実装時の判断）
  - 同じ周期の snapshot を書いた後に書く。画面が「成功」を読んだのに snapshot がまだ無い、という順番を避けるため（実装時の判断）
- collector のログ: `failed: gh-failed` の次の行に「次にやること: guild.settings.ts（または guild.settings.local.ts）の repo を gh のアカウントで読めるか、gh repo view <owner/name> で確かめてください」を出す（メンターの提案 1、社長の判断）。ログにはリポジトリ名も出さない方針（件数・時刻・種類だけ）なので、`<owner/name>` は書いたまま出す（実装時の判断）
- 開発用の Vite プラグインが `/collector-status.json` を `/snapshot.json` と同じ決まり（`no-store`、無ければ 204）で返す
- 画面: 自動のデモの間だけ状態を読み、失敗していれば帯を「デモ表示中（架空のデータ）。collector が失敗しています（認証・取得）。ターミナルを確認してください」のように替える。種類は短い日本語にした（`gh-failed` 認証・取得、`validation-failed` データの検証、`write-failed` ファイルの書き込み、`unexpected` 想定外のエラー）。状態ファイルが無いときは今の帯のまま。本物の画面での表示（「情報が古い」など）は変えない
  - 5 分より古い失敗は出さない。collector は 1 分ごとに試すので、それより古いのは collector を止めた後で、「動かしていない」と同じ扱いにした（実装時の判断）
  - 状態を読み損ねたとき（HTTP エラー・壊れた JSON など）は、前に読んだ状態を残す。1 回の読み損ないで帯がちらつかないように（実装時の判断）
- ブラウザのコンソール: 自動のデモを始めたときに `console.info` で案内を 1 行、帯に出す失敗が変わったときだけ `console.warn` で帯と同じ文と種類を出す（メンターの提案 1 のうち画面の分。社長の判断で、#72 のコンソールにエラーを出さない決まりを保つため `console.error` にはしない）
- docs/setup.md に「困ったとき」を足し、帯に collector の失敗が出たときと `gh-failed` のときに `gh repo view` で確かめることを書いた
- 統合レビュー（gpt-6-sol）で「次にやることの行に `guild.settings.ts` というファイル名が入るのは、パスを出さない決まりに反する」と指摘されたが、リポジトリに固定で入っている設定ファイルの名前の案内で、利用者のパスや中身ではないので残した（司令塔の判断）。#76 で手元の `guild.settings.local.ts` があればそちらを使う形になるので、文言を「guild.settings.ts（または guild.settings.local.ts）の repo を…」にした
