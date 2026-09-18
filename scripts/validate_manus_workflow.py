from pathlib import Path
import re
import sys

p = Path(sys.argv[1] if len(sys.argv) > 1 else '.github/workflows/manus-github-audit.yml')
s = p.read_text()
bootstrap_path = Path(sys.argv[2] if len(sys.argv) > 2 else '.github/workflows/manus-bridge-candidate-bootstrap.yml')
bootstrap = bootstrap_path.read_text() if bootstrap_path.exists() else ''

required = [
    'name: Manus audit bridge',
    'pull_request:',
    'issue_comment:',
    'types: [created]',
    'workflow_dispatch:',
    'pr_number:',
    'expected_sha:',
    'recovery_task_id:',
    "github.event.pull_request.number == 605",
    "github.event.pull_request.number == 626",
    "github.event.pull_request.number == 627",
    "github.event.comment.author_association == 'OWNER'",
    "github.event.comment.author_association == 'MEMBER'",
    "github.event.comment.author_association == 'COLLABORATOR'",
    "github.event.comment.body == '@manus'",
    "startsWith(github.event.comment.body, '@manus ')",
    'permissions:',
    'contents: read',
    'issues: write',
    'pull-requests: read',
    'checks: read',
    'group: ${{ github.workflow }}-pr-${{ github.event.pull_request.number || github.event.issue.number || inputs.pr_number }}',
    "cancel-in-progress: ${{ github.event_name != 'issue_comment'",
    'test -n "$MANUS_GITHUB_CONNECTOR_ID"',
    'connectors: [$connector_id]',
    '[[ "$SHA" =~ ^[0-9a-f]{40}$ ]]',
    'EXPECTED_SHA: ${{ inputs.expected_sha }}',
    'RECOVERY_TASK_ID: ${{ inputs.recovery_task_id }}',
    'ACTOR: ${{ github.actor }}',
    'RUN_SHA: ${{ github.sha }}',
    '[[ "$RECOVERY_TASK_ID" =~ ^[A-Za-z0-9_-]+$ ]]',
    '[ "$ACTOR" != "bmedeiros1987" ]',
    'echo "recovery_task_id=$RECOVERY_TASK_ID" >> "$GITHUB_OUTPUT"',
    "if: steps.request.outputs.ready == 'true' && steps.request.outputs.recovery_task_id == ''",
    "if: steps.request.outputs.ready == 'true' && (steps.request.outputs.recovery_task_id != '' || steps.create.outputs.task_id != '')",
    'TASK_ID: ${{ steps.request.outputs.recovery_task_id || steps.create.outputs.task_id }}',
    'share_visibility: "private"',
    'interactive_mode: false',
    'structured_output_schema:',
    'enum: ["MERGE", "BLOCKER"]',
    'https://api.manus.ai/v2/task.create',
    'https://api.manus.ai/v2/task.listMessages',
    'x-manus-api-key: $MANUS_API_KEY',
    'MANUS_API_KEY: ${{ secrets.MANUS_API_KEY }}',
    'PR_NUMBER: ${{ github.event.pull_request.number || github.event.issue.number || inputs.pr_number }}',
    'pulls/$PR_NUMBER',
    'issues/$PR_NUMBER/comments',
    '[MANUS-AUDIT] MANUS: MERGE',
    '[MANUS-AUDIT] MANUS: BLOCKER',
    '[MANUS-AUDIT] MANUS: BRIDGE_ERROR',
    '[MANUS-AUDIT] MANUS: STALE',
    'current_sha=',
    'test "$sha" = "$REQUESTED_SHA"',
    '[ "$current_sha" != "$REQUESTED_SHA" ]',
    'agent_status',
    'structured_output_result',
    'timeout waiting for structured Manus verdict',
    "--write-out '%{http_code}'",
    'MANUS_BODY_FILE="$(mktemp)"',
    'if [ "$http_code" = "404" ] && [ "$attempt" -le 12 ]; then',
    'Manus task not visible yet (404)',
    'if [ "$http_code" = "429" ] || [[ "$http_code" =~ ^5[0-9][0-9]$ ]]; then',
    'transient HTTP $http_code',
    'post_comment "$body" || echo "WARNING: could not publish Manus bridge error comment" >&2',
    'messages_type=',
    'Manus task messages not visible yet (null)',
    'task.listMessages messages remained null after 12 eventual-consistency attempts',
    'task.listMessages messages must be array or null',
]

for fragment in required:
    assert fragment in s, f'missing required fragment: {fragment}'

bootstrap_required = [
    "github.actor == 'bmedeiros1987'",
    "github.event.pull_request.user.login == 'bmedeiros1987'",
    'github.event.pull_request.head.repo.full_name == github.repository',
    'github.event.pull_request.draft == false',
    '--arg expected_sha "$HEAD_SHA"',
    'inputs:{pr_number:$pr, expected_sha:$expected_sha}',
]
for fragment in bootstrap_required:
    assert fragment in bootstrap, f'missing bootstrap trust/exact-SHA fragment: {fragment}'

for forbidden in [
    'contents: write',
    'pull-requests: write',
    'git push',
    'gh pr comment',
    'pull_request_review:',
    'github.event.after',
    'connectors: (if $connector_id',
    'if .message.connectors == []',
    'task.confirmAction',
    'cancel-in-progress: true',
]:
    assert forbidden not in s, f'forbidden fragment: {forbidden}'

# Guard the YAML shape itself. Shell/comment text inside a `run: |` block must
# never accidentally dedent to column 0, otherwise GitHub rejects the workflow.
allowed_top_level = ('name:', 'on:', 'permissions:', 'concurrency:', 'jobs:')
for lineno, line in enumerate(s.splitlines(), 1):
    if not line or line.startswith((' ', '\t', '#')):
        continue
    assert line.startswith(allowed_top_level), f'unexpected top-level YAML line {lineno}: {line}'

concurrency_group = re.search(r'^\s*group:\s*(.+)$', s, re.MULTILINE)
assert concurrency_group, 'missing concurrency group'
assert 'sha' not in concurrency_group.group(1).lower(), 'concurrency group must not contain SHA'
assert "github.ref != 'refs/heads/main'" in concurrency_group.group(1), 'candidate workflow_dispatch must use a concurrency namespace isolated from default-branch main'

cancel_line = re.search(r'^\s*cancel-in-progress:\s*(.+)$', s, re.MULTILINE)
assert cancel_line, 'missing cancel-in-progress policy'
cancel_policy = cancel_line.group(1)
for fragment in [
    "github.event_name != 'issue_comment'",
    "github.event.issue.pull_request",
    "github.event.comment.author_association == 'OWNER'",
    "github.event.comment.author_association == 'MEMBER'",
    "github.event.comment.author_association == 'COLLABORATOR'",
    "github.event.comment.body == '@manus'",
    "startsWith(github.event.comment.body, '@manus ')",
]:
    assert fragment in cancel_policy, f'cancel policy missing authorization guard: {fragment}'

assert 'for attempt in $(seq 1 80)' in s, 'polling loop must be bounded'
assert 'timeout-minutes: 30' in s, 'job must have a hard timeout'
assert s.index('EXPECTED_SHA: ${{ inputs.expected_sha }}') < s.index('MANUS_API_KEY: ${{ secrets.MANUS_API_KEY }}'), 'immutable expected SHA must be available before Manus secret use'
assert s.index('RECOVERY_TASK_ID: ${{ inputs.recovery_task_id }}') < s.index('MANUS_API_KEY: ${{ secrets.MANUS_API_KEY }}'), 'recovery task must be validated before Manus secret use'
assert s.index('RUN_SHA: ${{ github.sha }}') < s.index('MANUS_API_KEY: ${{ secrets.MANUS_API_KEY }}'), 'workflow execution SHA must be available before Manus secret use'
assert s.index('https://api.manus.ai/v2/task.create') < s.index('https://api.manus.ai/v2/task.listMessages'), 'polling must happen after task creation in the normal path'
assert s.index('current_sha=') < s.index('[MANUS-AUDIT] MANUS: MERGE'), 'exact-SHA revalidation must happen before publishing a merge verdict'
assert s.index('if [ "$http_code" = "404" ]') < s.index('task.listMessages returned HTTP'), 'eventual-consistency 404 must be retried before hard failure'
assert s.index('messages_type=') < s.index('.messages[] | select'), 'messages shape must be validated before any .messages[] iteration'
assert s.endswith('\n'), 'workflow must end with a newline'
print('PASS: authorized Manus trigger, trusted review-ready self-bootstrap actor, immutable expected-SHA gate before model call, owner-only recovery of an existing task without duplicate creation, candidate/main concurrency isolation, cancellation isolation, private async task, bounded polling, 404/messages:null eventual-consistency retry, malformed messages fail-closed, transient transport retry, structured verdict, exact-SHA revalidation, YAML top-level integrity, and GitHub round-trip comment publishing')
