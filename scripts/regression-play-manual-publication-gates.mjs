import assert from 'node:assert/strict';
import fs from 'node:fs';

const policies = [
  { path: '.github/workflows/android.yml', job: 'publish-internal-drafts', input: 'publish_internal_drafts' },
  { path: '.github/workflows/crewlife-companion-play.yml', job: 'publish-internal', input: 'publish_internal' },
  { path: '.github/workflows/crewwatch-play-internal.yml', job: 'publish-wear-internal', input: 'publish_internal' },
];

function publishCondition(source, job) {
  const marker = '\n  ' + job + ':\n';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'publish job not found: ' + job);
  const tail = source.slice(start + marker.length);
  const match = tail.match(/\n    if:\s*([^\n]+)/);
  assert.ok(match, 'publish condition not found: ' + job);
  return match[1].trim();
}

for (const policy of policies) {
  const source = fs.readFileSync(policy.path, 'utf8');
  const condition = publishCondition(source, policy.job);
  assert.match(condition, /github\.ref == 'refs\/heads\/main'/, policy.job + ' must remain main-only');
  assert.match(condition, /github\.event_name == 'workflow_dispatch'/, policy.job + ' must require explicit workflow dispatch');
  assert.ok(condition.includes('inputs.' + policy.input), policy.job + ' must require explicit publish input');
  assert.doesNotMatch(condition, /github\.event_name == 'push'/, policy.job + ' must never publish on a main push');

  const inputStart = source.indexOf(policy.input + ':');
  assert.ok(inputStart >= 0, 'workflow_dispatch input missing: ' + policy.input);
  const inputSlice = source.slice(inputStart, inputStart + 260);
  assert.match(inputSlice, /default:\s*false/, policy.input + ' must default to false');
}

console.log('PASS: all Google Play internal publishers require explicit manual dispatch');

// Version allocation itself opens temporary Play edits: never run it on web push/PR.
const android = fs.readFileSync('.github/workflows/android.yml', 'utf8');
const allocationCondition = "github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'";
function assertAllocationGuard(condition) {
  assert.equal(condition, allocationCondition, 'Play version allocation must remain main-only and manual-only');
}
for (const step of ['Install Play API client for version allocation', 'Allocate live Play version codes']) {
  const start = android.indexOf('      - name: ' + step + '\n');
  assert.ok(start >= 0, 'allocation step missing: ' + step);
  const tail = android.slice(start).split('\n      - ', 1)[0];
  const condition = tail.match(/\n        if: ([^\n]+)/)?.[1];
  assertAllocationGuard(condition);
  const evaluate = new Function('github', 'return (' + condition + ');');
  for (const ref of ['refs/heads/main', 'refs/heads/test']) {
    for (const event_name of ['push', 'pull_request', 'workflow_dispatch']) {
      assert.equal(evaluate({ ref, event_name }), ref === 'refs/heads/main' && event_name === 'workflow_dispatch');
    }
  }
}
assert.throws(() => assertAllocationGuard("github.ref == 'refs/heads/main'"));
assert.throws(() => assertAllocationGuard("github.event_name == 'workflow_dispatch'"));
console.log('PASS: Play allocator excluded from push/PR; manual main allocation preserved');
