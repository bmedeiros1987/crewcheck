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
