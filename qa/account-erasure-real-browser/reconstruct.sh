#!/usr/bin/env bash
set -euo pipefail

qa_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
product="$1"
expected='f647641b21280e5ef313bfc12a7abef1d27258a0'
foundation='c2a822a7385a9e8c887f0a4f831a3953fc20fc62'
mapfile -t refs < "$qa_dir/source-refs.txt"
test "${#refs[@]}" -eq 4
for sha in "${refs[@]}"; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]]
  git -C "$product" cat-file -e "$sha^{commit}"
done
git -C "$product" read-tree --reset "${refs[0]}"
git -C "$product" update-index --index-info < "$qa_dir/source-index.tsv"
test "$(git -C "$product" write-tree)" = "$foundation"
git -C "$product" checkout-index --index --all --force
git -C "$product" -c apply.ignoreWhitespace=no apply --index --binary --unidiff-zero "$qa_dir/source-overlay.patch"
test "$(git -C "$product" write-tree)" = "$expected"
git -C "$product" diff --quiet
printf 'Raw product tree %s\n' "$expected"
