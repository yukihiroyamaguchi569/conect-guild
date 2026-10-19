# お試しの会社を作るのを簡単にする（Issue #221）

- `/guild-trial` で作るリポジトリと司令塔のフォルダの名前を、`<日付>-<4 文字>`（例: `20261019-35ed`）から `guild-trial` にした。同じ名前のリポジトリかフォルダが既にあれば `guild-trial-2`、`guild-trial-3` … と番号を足す。名前の存在確認の決まり（`Could not resolve to a Repository` のときだけ「無い」）は変えていない
- `/guild-trial` の最後で、スキルが `npm run dev:all` を sandbox の外でバックグラウンドに起動し、collector の `ok: issues=` の行が出るのを上限 120 秒で待ってから、「http://127.0.0.1:5273 を開いてください」とだけ伝えるようにした。5273 番が既に使われていたら、スキルは止めずに、止めて起動し直すよう伝える
- 部門のセッションの起動（MulmoTerminal で司令塔と部門を開く）は任意にした。お試しの Issue はセッションが無くても机に配られる
- `/guild-trial-cleanup` が `guild-trial` と `guild-trial-<番号>` の名前を見つけられるようにした。前の形 `<日付>-<4 文字>` で作ったものも片付けられる
- docs/setup.md の 1-2 と DESIGN.md の説明を合わせた。README の「架空の会社を作って試す」には名前や手順の記述が無いので変えていない
