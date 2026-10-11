import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolveConciergeEvent} from './ci/staged-concierge-event.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-event-base-'));
const repository = 'synthetic/crewcheck', eventRepository = {full_name: repository};
const workflow = fs.readFileSync('.github/workflows/concierge-journey-programs.yml', 'utf8');
assert.match(workflow, /base="\$\{\{ steps\.event\.outputs\.base \}\}"/, 'Actual workflow must use event base output');
assert.doesNotMatch(workflow, /(?:main|base)=[a-f0-9]{40}/, 'Permanent job cannot pin a historical base');
const helper = fileURLToPath(new URL('./ci/staged-concierge-event.mjs', import.meta.url));
const execute = context => {
  const eventPath = path.join(root, 'event.json'), output = path.join(root, 'output');
  fs.writeFileSync(eventPath, JSON.stringify(context.event)); fs.writeFileSync(output, '');
  const result = spawnSync(process.execPath, [helper], {cwd: root, encoding: 'utf8', env: {PATH: process.env.PATH,
    GITHUB_EVENT_NAME: context.eventName, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: output,
    GITHUB_REPOSITORY: context.repository, GITHUB_SHA: context.githubSha}});
  assert.equal(result.status, 0, result.stderr);
  return fs.readFileSync(output, 'utf8');
};
const git = args => {const r = spawnSync('git', args, {cwd: root, encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); return r.stdout.trim();};
const save = (file, bytes) => {fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), bytes); git(['add', '.']); git(['-c', 'user.name=Synthetic', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'synthetic fixture']); return git(['rev-parse', 'HEAD']);};
try {
  git(['init']); const baseA = save('server.mjs', 'export const baseline = true;');
  const head = save('scripts/head.mjs', 'export const feature = true;');
  git(['checkout', '--detach', baseA]);
  const baseB = save('server/advanced-base.mjs', 'export const advanced = true;');
  const pr = base => ({repository: eventRepository, pull_request: {head: {sha: head}, base: {sha: base, repo: eventRepository}}});
  const context = {eventName: 'pull_request', event: pr(baseB), githubSha: 'f'.repeat(40), repository};
  const plan = resolveConciergeEvent(context);
  assert.equal(plan.checkoutSha, head); assert.equal(plan.baseSha, baseB);
  assert.equal(execute(context), `head=${head}\nbase=${baseB}\nkind=pull_request\n`);
  const advancedTree = git(['merge-tree', '--write-tree', plan.checkoutSha, plan.baseSha]);
  assert.match(git(['ls-tree', '-r', '--name-only', advancedTree]), /server\/advanced-base\.mjs/);
  const stale = resolveConciergeEvent({...context, event: pr(baseA)});
  assert.doesNotMatch(git(['ls-tree', '-r', '--name-only', git(['merge-tree', '--write-tree', stale.checkoutSha, stale.baseSha])]), /advanced-base/, 'Old fixed base misses the advanced source');
  assert.throws(() => resolveConciergeEvent({...context, event: pr(undefined)}), /Invalid PR base/);
  assert.throws(() => resolveConciergeEvent({...context, event: {...pr(baseB), repository: {full_name: 'other/repo'}}}), /repository mismatch/);
  assert.throws(() => resolveConciergeEvent({...context, eventName: 'pull_request_target'}), /Unsupported CI event/);
  const push = {eventName: 'push', event: {repository: eventRepository, after: baseB, before: head, ref: 'refs/heads/main', deleted: false}, githubSha: baseB, repository};
  const pushed = resolveConciergeEvent(push);
  assert.equal(pushed.checkoutSha, baseB); assert.equal(pushed.baseSha, baseB);
  assert.equal(pushed.composition, 'already-contained-main');
  assert.equal(execute(push), `head=${baseB}\nbase=${baseB}\nkind=push\n`);
  assert.throws(() => resolveConciergeEvent({...push, githubSha: head}), /Push SHA mismatch/);
  assert.throws(() => resolveConciergeEvent({...push, event: {...push.event, deleted: true}}), /Deleted push/);
  assert.throws(() => resolveConciergeEvent({...push, event: {...push.event, ref: 'refs/heads/other'}}), /Unsupported push branch/);
  assert.throws(() => resolveConciergeEvent({...context, event: pr('0'.repeat(40))}), /Empty PR base/);
  console.log(JSON.stringify({status: 'PASS', advancedBaseIncluded: true, staleBaseCounterexample: true, explicitPrAndPush: true, invalidEventsRejected: true}));
} finally {fs.rmSync(root, {recursive: true, force: true});}
