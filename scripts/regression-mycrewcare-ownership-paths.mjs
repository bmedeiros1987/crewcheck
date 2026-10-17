import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
const gateSource=readFileSync('scripts/assert-mycrewcare-v3-ownership.mjs','utf8');
// Execute the actual path gate, not a second copy of its allowlist or predicate.
const boundary=gateSource.indexOf('const portal = read(');
assert.ok(boundary>0);
const gate=gateSource.slice(0,boundary).replace(/^import .*;\n/gm,'');
const additions=[
 'docs/mycrewcare-concierge-wake-handoff-off.md',
 'docs/mycrewcare-partial-hotel-review-off.md',
 'docs/mycrewcare-snapshot-monotonic-review-off.md',
 'docs/mycrewcare-sso-contract-inactive.md',
 'scripts/fixtures/mycrewcare-sso-contract/AndroidManifest.synthetic.xml',
 'scripts/fixtures/mycrewcare-sso-contract/CrewCheckMyCrewCareSsoDraft.java',
 'scripts/fixtures/mycrewcare-sso-contract/RedirectInstrumentation.java',
 'scripts/fixtures/mycrewcare-sso-contract/SsoDraftHarness.java',
 'scripts/fixtures/mycrewcare-sso-contract/debug-inactive.patch',
 'scripts/regression-mycrewcare-consumer-boundary.mjs',
 'scripts/regression-mycrewcare-partial-hotel.mjs',
 'scripts/regression-mycrewcare-snapshot-monotonic.mjs',
 'scripts/regression-mycrewcare-sso-draft.mjs',
 'scripts/regression-mycrewcare-ownership-paths.mjs',
 'docs/mycrewcare-ci-composition-review-off.md',
];
function run(paths){
 const root=mkdtempSync(join(tmpdir(),'mcc-ownership-paths-'));
 const git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
 const commit=()=>git(['-c','user.name=Synthetic Gate Test','-c','user.email=synthetic@example.invalid','commit','-qm','synthetic fixture']);
 try {
  git(['init','-q']);writeFileSync(join(root,'baseline'),'synthetic');git(['add','.']);commit();git(['update-ref','refs/remotes/origin/main','HEAD']);
  for(const path of paths){const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,'synthetic');}
  git(['add','.']);commit();
  vm.runInNewContext(gate,{assert,execFileSync:(file,args,options)=>execFileSync(file,args,{...options,cwd:root})},{timeout:10000});
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('actual ownership gate accepts only the explicit contract/test additions',()=>run(additions));
for(const path of ['client/src/pages/Home.tsx','android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java','server.mjs','scripts/fixtures/mycrewcare-sso-contract/unreviewed.java','docs/mycrewcare-unreviewed.md','shared/unrelated.mjs'])
 test(`actual ownership gate rejects out-of-scope path ${path}`,()=>assert.throws(()=>run([...additions,path]),/outside its isolated Mobile Core slice/));
