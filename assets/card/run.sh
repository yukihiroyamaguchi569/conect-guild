#!/bin/bash
# Generates one card part with codex: run.sh <name> (the prompt is prompts/p-<name>.txt).
# The output and the log go to gen/ (not kept in the repository). gen/card-b.png, the design sheet
# of plan B (prompts/plan-b.txt), is passed as the reference for every part; the illustrations also
# get the members' sprites.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
G="$HERE/gen"
S="$HERE/../sprites"
n=$1
mkdir -p "$G"
cp "$HERE/prompts/p-$n.txt" "$G/"
imgs=(-i "$G/card-b.png")
case $n in
  ill-takumi|ill-musubi) imgs+=(-i "$S/source-sheet-new4.png" -i "$S/${n#ill-}.png");;
  ill-*) imgs+=(-i "$S/source-sheet.png" -i "$S/${n#ill-}.png");;
esac
codex exec --skip-git-repo-check -s workspace-write -C "$G" -o "$G/result-$n.txt" "${imgs[@]}" - < "$G/p-$n.txt" > "$G/log-$n.txt" 2>&1
echo "$n exit=$? $(ls -la "$G/$n.png" 2>&1)"
