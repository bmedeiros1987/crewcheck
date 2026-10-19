import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const sha = (value, label) => {
  assert.match(value ?? '', /^[a-f0-9]{40}$/, `Invalid ${label}`);
  assert.notEqual(value, '0'.repeat(40), `Empty ${label}`);
  return value;
};
const git = (args, cwd) => execFileSync('git', args, {cwd, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
export function resolveMccComparison({eventName, event, githubSha, repository}) {
  assert(repository && event?.repository?.full_name === repository, 'Event repository mismatch');
  const checkoutSha = sha(githubSha, 'checkout SHA');
  let baseSha, headSha;
  if (eventName === 'pull_request') {
    assert.equal(event.pull_request?.base?.repo?.full_name, repository, 'PR base repository mismatch');
    baseSha = sha(event.pull_request?.base?.sha, 'PR base SHA');
    headSha = sha(event.pull_request?.head?.sha, 'PR head SHA');
  } else {
    assert.equal(eventName, 'workflow_dispatch', 'Unsupported MCC event');
    assert.equal(event.ref, 'refs/heads/main', 'Manual comparison requires checked main');
    baseSha = sha(event.inputs?.base_sha, 'manual base SHA');
    headSha = sha(event.inputs?.head_sha, 'manual head SHA');
    assert.equal(headSha, checkoutSha, 'Manual head must match checked main');
  }
  assert.notEqual(baseSha, headSha, 'Empty comparison is not an ownership audit');
  return {baseSha, headSha, checkoutSha};
}
export function mccChangedPaths({baseSha, headSha, checkoutSha}, cwd = '.') {
  for (const [label, value] of Object.entries({baseSha,headSha,checkoutSha})) {
    sha(value,label);
    assert.equal(git(['rev-parse','--verify',`${value}^{commit}`],cwd), value, `${label} is not the exact commit`);
  }
  assert.equal(git(['rev-parse','HEAD'],cwd), checkoutSha, 'Checkout SHA mismatch');
  assert.notEqual(baseSha,headSha,'Empty comparison is not an ownership audit');
  if (checkoutSha !== headSha) {
    const parents = git(['show','-s','--format=%P',checkoutSha],cwd).split(' ');
    assert.deepEqual(parents,[baseSha,headSha],'Ambiguous merge composition: expected event base and head parents');
    // Parent names alone do not prove the merge result contains their composition.
    const expectedTree = git(['merge-tree','--write-tree',baseSha,headSha],cwd);
    assert.match(expectedTree,/^[a-f0-9]{40}$/,'Unresolved merge composition');
    assert.equal(git(['rev-parse',`${checkoutSha}^{tree}`],cwd),expectedTree,'Merge tree differs from event composition');
  }
  const bases = git(['merge-base','--all',baseSha,headSha],cwd).split('\n');
  assert.equal(bases.length,1,'Ambiguous merge base');
  sha(bases[0],'merge base');
  assert.notEqual(bases[0],headSha,'Head already contained by base: empty or reversed comparison');
  // --no-renames preserves both old and new paths. NUL delimiters preserve unusual names.
  const paths = execFileSync('git',['diff','--no-renames','--name-only','-z',bases[0],headSha,'--'],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\0').filter(Boolean);
  assert.ok(paths.length,'No changed paths to audit');
  for (const ref of [bases[0],headSha]) {
    const entries=execFileSync('git',['ls-tree','-r','-z',ref],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\0').filter(Boolean);
    for (const entry of entries) {
      const tab=entry.indexOf('\t'), name=entry.slice(tab+1), mode=entry.slice(0,6);
      if (paths.includes(name)) assert.ok(['100644','100755'].includes(mode),`Non-regular ownership path: ${name} (${mode})`);
    }
  }
  return paths;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan=resolveMccComparison({eventName:process.env.GITHUB_EVENT_NAME,event:JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),githubSha:process.env.GITHUB_SHA,repository:process.env.GITHUB_REPOSITORY});
  const changed=mccChangedPaths(plan);
  assert(process.env.GITHUB_ENV,'GitHub environment output required');
  fs.appendFileSync(process.env.GITHUB_ENV,`CREWCHECK_MCC_BASE_SHA=${plan.baseSha}\nCREWCHECK_MCC_HEAD_SHA=${plan.headSha}\nCREWCHECK_MCC_CHECKOUT_SHA=${plan.checkoutSha}\n`);
  console.log(JSON.stringify({...plan,changed}));
}
