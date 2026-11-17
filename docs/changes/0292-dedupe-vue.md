# #292 npm dedupe で vue を 1 つにそろえる（2026-11-18）

- PR #291（Dependabot）のあと、lockfile に vue が 2 つ入っていた（直下の node_modules に 3.5.43、apps/web/node_modules に 3.5.45）。直下の 3.5.43 は @vitejs/plugin-vue の peer を満たすために残っていて、SFC のコンパイラ（@vue/compiler-sfc 3.5.43）と実行時の vue（3.5.45）の版がずれていた
- `npm dedupe --package-lock-only --ignore-scripts --before=2026-11-11` で 3.5.45 にそろえた。`--before` を付けないと新しすぎる版（@babel 7.29.14 など）も入るので付けた。変わるのは lockfile にもう入っていた版の間の置き場所だけで、新しい版は入らない
