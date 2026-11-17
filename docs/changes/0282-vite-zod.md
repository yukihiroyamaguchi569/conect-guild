# #282 vite と zod を脆弱性の直った版に上げる（2026-11-18）

- `npm audit` で high が出ていた vite（8.3.2。launch-editor と開発サーバーの advisory、範囲 `>=8.3.0 <=8.3.2`）を 8.3.8 に、zod（4.6.5。GHSA-mrhx-c7xc-m3w5、範囲 `<4.6.6`）を 4.6.7 に上げた。指定は `^8.3.8`・`^4.6.7`
- 版は `npm install --ignore-scripts --before=2026-11-12` で npm に決めさせた。公開日は vite 8.3.8 が 2026-11-11、zod 4.6.7 が 2026-10-12 で、どちらも 7 日以上前
- vite に引きずられて rolldown（1.2.12 → 1.2.19）・postcss・nanoid・@oxc-project/types も上がった。いずれも公開から 7 日以上。wasm 用の省略可能な依存（`@rolldown/binding-wasm32-wasi` など）が lockfile に増えたが、macOS には入らない。インストールスクリプトを持つ依存は前後とも 0
- picomatch・minimatch 由来の advisory は残っている（この変更の対象外）
