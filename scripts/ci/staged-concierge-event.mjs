import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const commit = (value, label) => {
  assert.match(value ?? '', /^[a-f0-9]{40}$/, `Invalid ${label}`);
  assert.notEqual(value, '0'.repeat(40), `Empty ${label}`);
  return value;
};
export function resolveConciergeEvent({eventName, event, githubSha, repository}) {
  assert(repository && event?.repository?.full_name === repository, 'Event repository mismatch');
  if (eventName === 'pull_request') {
    assert.equal(event.pull_request?.base?.repo?.full_name, repository, 'PR base repository mismatch');
    return {kind: 'pull_request', checkoutSha: commit(event.pull_request?.head?.sha, 'PR head'),
      baseSha: commit(event.pull_request?.base?.sha, 'PR base'), composition: 'event-base'};
  }
  assert.equal(eventName, 'push', 'Unsupported CI event');
  assert.equal(event.ref, 'refs/heads/main', 'Unsupported push branch');
  assert.notEqual(event.deleted, true, 'Deleted push cannot build');
  const after = commit(event.after, 'push after');
  assert.equal(after, commit(githubSha, 'GitHub push SHA'), 'Push SHA mismatch');
  // A main push already contains its published target. Never merge an old before
  // commit back into a forced push or substitute a historical fixed main.
  return {kind: 'push', checkoutSha: after, baseSha: after, composition: 'already-contained-main'};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = resolveConciergeEvent({eventName: process.env.GITHUB_EVENT_NAME,
    event: JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    githubSha: process.env.GITHUB_SHA, repository: process.env.GITHUB_REPOSITORY});
  assert(process.env.GITHUB_OUTPUT, 'GitHub output destination required');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `head=${plan.checkoutSha}\nbase=${plan.baseSha}\nkind=${plan.kind}\n`);
  console.log(JSON.stringify(plan));
}
