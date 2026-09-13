#!/usr/bin/env bash
set -euo pipefail

workflow="${1:-.github/workflows/manus-github-audit.yml}"
validator="${2:-scripts/validate_manus_workflow.py}"

python3 "$validator" "$workflow"

grep -Fq "if [ \"$http_code\" = \"404\" ] && [ \"$attempt\" -le 12 ]; then" "$workflow"
grep -Fq "post_comment \"$body\" || echo \"WARNING: could not publish Manus bridge error comment\" >&2" "$workflow"
grep -Fq "if [ \"$http_code\" = \"429\" ] || [[ \"$http_code\" =~ ^5[0-9][0-9]$ ]]; then" "$workflow"

echo "PASS: Manus bridge retries eventual-consistency 404, transient HTTP failures, and preserves root bridge errors when GitHub comment publication is rate-limited"
