#!/usr/bin/env bash
# 配信するファイルだけを dist/ に集める。
# 静的ホスティングは置かれたものをそのまま配るため、
# 除外ではなく「載せるものを列挙する」方式にしている。
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/dist"

rm -rf "$out"
mkdir -p "$out"

cp "$root/index.html" "$root/robots.txt" "$out/"
cp -r "$root/styles"  "$out/styles"
cp -r "$root/scripts" "$out/scripts"
mkdir -p "$out/assets"
cp -r "$root/assets/images" "$out/assets/images"

echo "built dist/:"
find "$out" -type f | sed "s|$out|  dist|" | sort
