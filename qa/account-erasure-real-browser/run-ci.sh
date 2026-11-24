#!/usr/bin/env bash
set -euo pipefail
qa_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
qa_root=$(mktemp -d)
trap 'rm -rf -- "$qa_root"' EXIT
product="$qa_root/prepared"
venv="$qa_root/venv"
mkdir "$product"
git init -q "$product"
candidate=43504832191cecdf19151f8f38b1f5c0277dc25f
expected_tree=1ed9292ee1a21e8768b2672abeb32db5d978678c
git -C "$product" fetch --no-tags --depth=1 https://github.com/bmedeiros1987/crewcheck.git "$candidate"
git -C "$product" checkout --quiet --detach "$candidate"
test "$(git -C "$product" rev-parse 'HEAD^{tree}')" = "$expected_tree"
printf 'Exact release candidate %s tree %s\n' "$candidate" "$expected_tree"
cp "$qa_dir"/{browser-client.py,qa-drafts.ts,run-browser-qa.mjs,source.json} "$qa_root/"

python3 -m venv "$venv"
"$venv/bin/python3" -m pip --disable-pip-version-check --no-input install playwright==1.62.0
qa_path="$venv/bin:$PATH"
mkdir "$qa_root/chrome-config" "$qa_root/chrome-cache"
browser_env=(env -i PATH="$qa_path" XDG_CONFIG_HOME="$qa_root/chrome-config" XDG_CACHE_HOME="$qa_root/chrome-cache")
"${browser_env[@]}" "$venv/bin/python3" "$qa_root/browser-client.py" --preflight
(
  cd "$product"
  env -i PATH="$qa_path" npm ci --no-audit --no-fund
  env -i PATH="$qa_path" node scripts/v139/apply.mjs
)
node --input-type=module - "$product" "$qa_dir/prepared-sha256.txt" <<'JS'
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const [product, manifest] = process.argv.slice(2);
for (const line of readFileSync(manifest,'utf8').trim().split('\n')) {
  const [hash, file] = line.split('  ');
  const actual = createHash('sha256').update(readFileSync(join(product,file))).digest('hex');
  assert.equal(actual,hash,file);
}
console.log('Prepared backend matches the exact release candidate fingerprints');
JS
(
  cd "$product"
  env -i PATH="$qa_path" SOURCE_VERSION="$candidate" node ./node_modules/vite/bin/vite.js build --outDir "$qa_root/dist"
)
docker pull mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902
test "$(docker image inspect mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902 --format '{{.Id}}')" = sha256:0f1a0ccadda3a1734d1db557e203ec58621d56fa248525016e85fe4f631311ec
failed=0
for entry in settings public; do
  printf 'Testing deletion entry %s\n' "$entry"
  "${browser_env[@]}" node --experimental-test-module-mocks "$qa_root/run-browser-qa.mjs" "$entry" || failed=1
done
exit "$failed"
