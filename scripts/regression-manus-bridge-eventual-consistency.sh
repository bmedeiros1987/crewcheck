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

# Execute the exact verdict-body assignments from the workflow. This protects
# the GitHub-facing round trip from shell-quoting regressions while testing the
# real source rather than a copied formatter.
merge_body_line="$(grep -F "BODY=\"\$(printf '[MANUS-AUDIT] MANUS: MERGE" "$workflow")"
blocker_body_line="$(grep -F "BODY=\"\$(printf '[MANUS-AUDIT] MANUS: BLOCKER" "$workflow")"
test -n "$merge_body_line"
test -n "$blocker_body_line"

REQUESTED_SHA=0123456789abcdef0123456789abcdef01234567
summary='A concise independent audit summary.'
BODY=''
eval "$merge_body_line"
expected_merge="$(printf '[MANUS-AUDIT] MANUS: MERGE — SHA %s\n\n%s' "$REQUESTED_SHA" "$summary")"
if [ "$BODY" != "$expected_merge" ]; then
  printf 'MERGE body mismatch\nEXPECTED:\n%s\nACTUAL:\n%s\n' "$expected_merge" "$BODY" >&2
  exit 1
fi

severity=P1
reproducer='run case with spaces'
expected='expected value'
actual='actual value'
root_cause='root cause with spaces'
eval "$blocker_body_line"
expected_blocker="$(printf '[MANUS-AUDIT] MANUS: BLOCKER — SHA %s\nSeverity: %s\n\nSummary: %s\n\nReproducer: %s\nExpected: %s\nActual: %s\nRoot cause: %s' "$REQUESTED_SHA" "$severity" "$summary" "$reproducer" "$expected" "$actual" "$root_cause")"
if [ "$BODY" != "$expected_blocker" ]; then
  printf 'BLOCKER body mismatch\nEXPECTED:\n%s\nACTUAL:\n%s\n' "$expected_blocker" "$BODY" >&2
  exit 1
fi

echo "PASS: Manus bridge retries 404/messages:null eventual consistency, rejects malformed messages before iteration, isolates unrelated comments from cancellation, retries transient HTTP failures, preserves root bridge errors, and renders exact readable MERGE/BLOCKER comments"
