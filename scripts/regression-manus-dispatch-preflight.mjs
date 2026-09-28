import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const source = fs.readFileSync('.github/workflows/manus-github-audit.yml', 'utf8');
const scheduler = fs.readFileSync('.github/workflows/manus-audit-scheduler.yml', 'utf8');
assert.ok(scheduler.includes('--arg sha "$SHA"'));
assert.ok(scheduler.includes('{ref:"main", inputs:{pr_number:$pr, expected_sha:$sha}}'));
assert.ok(source.includes('RUN_REF: ${{ github.ref }}'));
const start = source.indexOf('          if [ "$EVENT_NAME" = "workflow_dispatch" ]; then');
assert.ok(start >= 0, 'dispatch must validate immutable SHA before model calls');
const end = source.indexOf('          test -n "$MANUS_GITHUB_CONNECTOR_ID"', start);
assert.ok(end > start);
const block = source.slice(start, end).replace(/^          /gm, '')
  .replaceAll('${{ github.repository }}', 'bmedeiros1987/crewcheck');
assert.ok(source.includes("if: steps.request.outputs.ready == 'true' && steps.request.outputs.recovery_task_id == ''"));
assert.ok(source.includes("if: steps.request.outputs.ready == 'true' && (steps.request.outputs.recovery_task_id != '' || steps.create.outputs.task_id != '')"));
assert.ok(source.includes('TASK_ID: ${{ steps.request.outputs.recovery_task_id || steps.create.outputs.task_id }}'));
const sha = 'a'.repeat(40), other = 'b'.repeat(40);
const base = {
  EVENT_NAME: 'workflow_dispatch', EXPECTED_SHA: sha, RECOVERY_TASK_ID: '', ACTOR: 'bmedeiros1987',
  RUN_SHA: sha, RUN_REF: 'refs/heads/candidate', SHA: sha,
  PR_STATE: 'open', HEAD_REPO: 'bmedeiros1987/crewcheck', GH_TOKEN: 'TEST-ONLY', PR_NUMBER: '682',
};
const cases = [
  ['matched', {}, true],
  ['owner recovery accepted', { RECOVERY_TASK_ID: 'Sej6bT6FZxJGv3ScjW7JAd' }, true],
  ['recovery rejects malformed id', { RECOVERY_TASK_ID: 'bad/task' }, false],
  ['recovery rejects untrusted actor', { RECOVERY_TASK_ID: 'Valid_Task-123', ACTOR: 'someone-else' }, false],
  ['trusted main audits pinned PR', { RUN_SHA: other, RUN_REF: 'refs/heads/main' }, true],
  ['main still rejects moved PR', { RUN_SHA: other, RUN_REF: 'refs/heads/main', SHA: other }, false],
  ['tag named main is not trusted main', { RUN_SHA: other, RUN_REF: 'refs/tags/main' }, false],
  ['missing', { EXPECTED_SHA: '' }, false],
  ['malformed', { EXPECTED_SHA: 'not-a-sha' }, false],
  ['execution moved', { RUN_SHA: other }, false],
  ['head moved', { SHA: other }, false],
  ['closed', { PR_STATE: 'closed' }, false],
  ['fork', { HEAD_REPO: 'untrusted/fork' }, false],
  ['comment path preserved', { EVENT_NAME: 'issue_comment', EXPECTED_SHA: '' }, true],
];
const bash = process.env.BASH_PATH || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manus-dispatch-test-'));
try {
  for (const [name, overrides, accepted] of cases) {
    // Execute the actual workflow gate; all HTTP/JSON commands are local stubs.
    const script = `set -euo pipefail\njq() { printf '{}'; }\ncurl() { echo COMMENT_POST; }\n${block}\nprintf 'ACCEPTED:%s\\n' "$SHA"\n`;
    const result = spawnSync(bash, ['--noprofile', '--norc'], { input: script, encoding: 'utf8', cwd: dir,
      env: { ...process.env, ...base, ...overrides } });
    assert.equal(result.status, 0, `${name}: ${result.error || result.stderr}`);
    assert.equal(result.stdout.includes(`ACCEPTED:${sha}`), accepted, name);
    assert.equal(result.stdout.includes('COMMENT_POST'), !accepted, name);
    if (!accepted) assert.match(result.stdout, /MANUS: STALE/, name);
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log(`PASS: ${cases.length} immutable dispatch/recovery preflight cases (no network/model calls)`);
