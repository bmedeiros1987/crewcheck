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
    "github.event.pull_request.number == 583",
    "github.event.issue.number == 583",
    "github.event.comment.author_association == 'OWNER'",
    "github.event.comment.author_association == 'COLLABORATOR'",
    "github.event.comment.body == '@manus'",
    "startsWith(github.event.comment.body, '@manus ')",
    'permissions:',
    'contents: read',
    'issues: read',
    'pull-requests: read',
    'checks: read',
    'group: ${{ github.workflow }}-pr-583',
    'cancel-in-progress: true',
    'test -n "$MANUS_GITHUB_CONNECTOR_ID"',
    'connectors: [$connector_id]',
    '[[ "$SHA" =~ ^[0-9a-f]{40}$ ]]',
    'share_visibility: "private"',
    'interactive_mode: false',
    'https://api.manus.ai/v2/task.create',
    'x-manus-api-key: $MANUS_API_KEY',
    'MANUS_API_KEY: ${{ secrets.MANUS_API_KEY }}',
]

for fragment in required:
    assert fragment in s, f'missing required fragment: {fragment}'

for forbidden in [
    'contents: write',
    'pull-requests: write',
    'issues: write',
    'git push',
    'gh pr comment',
    'pull_request_review:',
    'github.event.after',
    'connectors: (if $connector_id',
    'if .message.connectors == []',
]:
    assert forbidden not in s, f'forbidden fragment: {forbidden}'

concurrency_group = re.search(r'^\s*group:\s*(.+)$', s, re.MULTILINE)
assert concurrency_group, 'missing concurrency group'
assert 'sha' not in concurrency_group.group(1).lower(), 'concurrency group must not contain SHA'

assert s.endswith('\n'), 'workflow must end with a newline'
print('PASS: default-branch-safe triggers, authorized @manus command, stable concurrency, exact SHA guard, explicit GitHub connector, private task, and no-write invariants')
