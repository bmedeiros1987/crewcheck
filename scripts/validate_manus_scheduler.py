from pathlib import Path
import sys

p = Path(sys.argv[1] if len(sys.argv) > 1 else '.github/workflows/manus-audit-scheduler.yml')
s = p.read_text()

required = [
    'name: Manus audit scheduler',
    "cron: '*/5 * * * *'",
    'workflow_dispatch:',
    'actions: write',
    'contents: read',
    'issues: read',
    'pull-requests: read',
    'cancel-in-progress: false',
    'for status in queued in_progress',
    'for PR_NUMBER in 605 626 627',
    'manus-github-audit.yml/runs?status=$status&per_page=1',
    '.user.login == "github-actions[bot]"',
    '[MANUS-AUDIT] MANUS: MERGE',
    '[MANUS-AUDIT] MANUS: BLOCKER',
    'actions/workflows/manus-github-audit.yml/dispatches',
    "'{ref:\"main\", inputs:{pr_number:$pr, expected_sha:$sha}}'",
    '--arg sha "$SHA"',
    'Dispatched Manus audit for PR #$PR_NUMBER at exact SHA $SHA.',
]
for fragment in required:
    assert fragment in s, f'missing required fragment: {fragment}'

for forbidden in [
    'contents: write',
    'issues: write',
    'pull-requests: write',
    'cancel-in-progress: true',
    'task.create',
    'task.confirmAction',
    'MANUS_API_KEY',
    'merge_pull_request',
    'git push',
]:
    assert forbidden not in s, f'forbidden fragment: {forbidden}'

assert s.index('for status in queued in_progress') < s.index('actions/workflows/manus-github-audit.yml/dispatches'), 'must check active bridge before dispatch'
assert s.index('.user.login == "github-actions[bot]"') < s.index('actions/workflows/manus-github-audit.yml/dispatches'), 'must check round-trip verdict before dispatch'
assert s.endswith('\n')
print('PASS: scheduler is read-only except Actions dispatch, skips active bridge runs and exact-SHA round-trip verdicts, and dispatches one tracked P0 at a time')
