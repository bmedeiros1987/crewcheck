from pathlib import Path
import re
import sys

p = Path(sys.argv[1] if len(sys.argv) > 1 else '.github/workflows/manus-github-audit.yml')
s = p.read_text()

required = [
    'name: Manus audit bridge',
    'pull_request:',
    'issue_comment:',
    'types: [created]',
    'workflow_dispatch:',
    'pr_number:',
    "github.event.pull_request.number == 605",
    "github.event.pull_request.number == 626",
    "github.event.pull_request.number == 627",
    "github.event.comment.author_association == 'OWNER'",
    "github.event.comment.author_association == 'COLLABORATOR'",
    "github.event.comment.body == '@manus'",
    "startsWith(github.event.comment.body, '@manus ')",
    'permissions:',
    'contents: read',
    'issues: write',
    'pull-requests: read',
    'checks: read',
    'group: ${{ github.workflow }}-pr-${{ github.event.pull_request.number || github.event.issue.number || inputs.pr_number }}',
    'cancel-in-progress: true',
    'test -n "$MANUS_GITHUB_CONNECTOR_ID"',
    'connectors: [$connector_id]',
    '[[ "$SHA" =~ ^[0-9a-f]{40}$ ]]',
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
]

for fragment in required:
    assert fragment in s, f'missing required fragment: {fragment}'

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
]:
    assert forbidden not in s, f'forbidden fragment: {forbidden}'

concurrency_group = re.search(r'^\s*group:\s*(.+)$', s, re.MULTILINE)
assert concurrency_group, 'missing concurrency group'
assert 'sha' not in concurrency_group.group(1).lower(), 'concurrency group must not contain SHA'

assert 'for attempt in $(seq 1 80)' in s, 'polling loop must be bounded'
assert 'timeout-minutes: 30' in s, 'job must have a hard timeout'
assert s.index('https://api.manus.ai/v2/task.create') < s.index('https://api.manus.ai/v2/task.listMessages'), 'polling must happen after task creation'
assert s.index('current_sha=') < s.index('[MANUS-AUDIT] MANUS: MERGE'), 'exact-SHA revalidation must happen before publishing a merge verdict'
assert s.endswith('\n'), 'workflow must end with a newline'
print('PASS: authorized Manus trigger, private async task, bounded polling, structured verdict, fail-closed waiting/error handling, exact-SHA revalidation, and GitHub round-trip comment publishing')
