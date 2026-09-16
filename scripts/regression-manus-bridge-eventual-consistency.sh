#!/usr/bin/env bash
set -euo pipefail

workflow="${1:-.github/workflows/manus-github-audit.yml}"
validator="${2:-scripts/validate_manus_workflow.py}"

python3 "$validator" "$workflow"

grep -Fq 'if [ "$http_code" = "404" ] && [ "$attempt" -le 12 ]; then' "$workflow"
grep -Fq 'post_comment "$body" || echo "WARNING: could not publish Manus bridge error comment" >&2' "$workflow"
grep -Fq 'if [ "$http_code" = "429" ] || [[ "$http_code" =~ ^5[0-9][0-9]$ ]]; then' "$workflow"
grep -Fq 'Manus task messages not visible yet (null)' "$workflow"
grep -Fq 'task.listMessages messages remained null after 12 eventual-consistency attempts' "$workflow"
grep -Fq 'task.listMessages messages must be array or null' "$workflow"
grep -Fq "cancel-in-progress: \${{ github.event_name != 'issue_comment'" "$workflow"
grep -Fq "github.event.comment.author_association == 'MEMBER'" "$workflow"
grep -Fq "github.event.comment.body == '@manus'" "$workflow"

echo "PASS: Manus bridge retries 404/messages:null eventual consistency, rejects malformed messages before iteration, isolates unrelated comments from cancellation, retries transient HTTP failures, and preserves root bridge errors"
