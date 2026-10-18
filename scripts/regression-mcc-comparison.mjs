import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolveMccComparison,mccChangedPaths} from './ci/mcc-comparison.mjs';
const repository='synthetic/crewcheck', repo={full_name:repository};
const gateSource=fs.readFileSync('scripts/assert-mycrewcare-v3-ownership.mjs','utf8');
const boundary=gateSource.indexOf('const portal = read(');
assert.ok(boundary>0);
const gate=gateSource.slice(0,boundary).replace(/^import .*;\n/gm,'');
const workflow=fs.readFileSync('.github/workflows/mycrewcare-v3-persistence.yml','utf8');
const helper=fileURLToPath(new URL('./ci/mcc-comparison.mjs',import.meta.url));
function fixture(run) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcc-pinned-'));
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const write=(name,body='synthetic')=>{const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,body);};
 const commit=()=>{git(['add','.']);git(['-c','user.name=Synthetic','-c','user.email=fixture@example.invalid','commit','-qm','synthetic']);return git(['rev-parse','HEAD']);};
 try {git(['init','-q']);write('baseline');const base=commit();return run({root,git,write,commit,base});}
 finally {fs.rmSync(root,{recursive:true,force:true});}
}
const event=(base,head)=>({repository:repo,pull_request:{base:{sha:base,repo},head:{sha:head}}});
const resolve=(base,head,checkout=head)=>resolveMccComparison({eventName:'pull_request',event:event(base,head),githubSha:checkout,repository});
function audit(plan,root){vm.runInNewContext(gate,{assert,process:{env:{CREWCHECK_MCC_BASE_SHA:plan.baseSha,CREWCHECK_MCC_HEAD_SHA:plan.headSha,CREWCHECK_MCC_CHECKOUT_SHA:plan.checkoutSha}},mccChangedPaths:p=>mccChangedPaths(p,root)},{timeout:10000});}
test('allowed MCC change works without origin/main; moving unrelated refs cannot alter comparison',()=>fixture(({root,git,write,commit,base})=>{
 write('shared/myCrewCareLogistics.mjs');const head=commit(),plan=resolve(base,head);
 assert.deepEqual(mccChangedPaths(plan,root),['shared/myCrewCareLogistics.mjs']);audit(plan,root);
 git(['update-ref','refs/remotes/origin/main',head]);assert.deepEqual(mccChangedPaths(plan,root),['shared/myCrewCareLogistics.mjs']);
}));
test('mixed MCC and shared dependency/MainActivity/Home/server remains rejected',()=>{
 for(const file of ['android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java','client/src/pages/Home.tsx','server.mjs','server/platform.mjs','scripts/v139/apply.mjs'])fixture(({root,write,commit,base})=>{
  write('shared/myCrewCareLogistics.mjs');write('android-wrapper/app/build.gradle');write(file);const head=commit();assert.throws(()=>audit(resolve(base,head),root),/outside its isolated/);
 });
});
test('shared dependency plus health MainActivity is not exempted',()=>fixture(({root,write,commit,base})=>{
 write('android-wrapper/app/build.gradle');write('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');const head=commit();assert.throws(()=>audit(resolve(base,head),root),/outside its isolated/);
}));
test('rename includes deleted old name and rejects unknown new name',()=>fixture(({root,git,write,commit})=>{
 write('shared/myCrewCareLogistics.mjs');const base=commit();git(['mv','shared/myCrewCareLogistics.mjs','shared/myCrewCareUnknown.mjs']);const head=commit(),plan=resolve(base,head);
 assert.deepEqual(mccChangedPaths(plan,root).sort(),['shared/myCrewCareLogistics.mjs','shared/myCrewCareUnknown.mjs']);assert.throws(()=>audit(plan,root),/outside its isolated/);
}));
test('deletion remains audited; deletion of unknown MCC path fails',()=>fixture(({root,git,write,commit})=>{
 write('shared/myCrewCareLogistics.mjs');write('shared/myCrewCareUnknown.mjs');const base=commit();git(['rm','shared/myCrewCareUnknown.mjs']);const head=commit(),plan=resolve(base,head);
 assert.deepEqual(mccChangedPaths(plan,root),['shared/myCrewCareUnknown.mjs']);assert.throws(()=>audit(plan,root),/outside its isolated/);
}));
test('symlink replacement at an allowed name fails',()=>fixture(({root,write,commit})=>{
 write('shared/myCrewCareLogistics.mjs');const base=commit();fs.unlinkSync(path.join(root,'shared/myCrewCareLogistics.mjs'));fs.symlinkSync('../baseline',path.join(root,'shared/myCrewCareLogistics.mjs'));const head=commit();assert.throws(()=>audit(resolve(base,head),root),/Non-regular/);
}));
test('git failure, missing object, missing SHA, reversed/empty comparison and checkout mismatch fail',()=>fixture(({root,git,write,commit,base})=>{
 write('shared/myCrewCareLogistics.mjs');const head=commit(),plan=resolve(base,head);
 assert.throws(()=>mccChangedPaths(plan,path.join(root,'missing')));
 assert.throws(()=>mccChangedPaths({...plan,baseSha:'f'.repeat(40)},root));
 assert.throws(()=>mccChangedPaths({...plan,baseSha:undefined},root),/Invalid/);
 assert.throws(()=>mccChangedPaths({...plan,baseSha:head},root),/Empty/);
 git(['checkout','--detach',base]);assert.throws(()=>mccChangedPaths(plan,root),/Checkout SHA mismatch/);
 assert.throws(()=>mccChangedPaths({baseSha:head,headSha:base,checkoutSha:base},root),/Head already contained/);
}));
test('merge composition is pinned; wrong base, extra parent or different tree fails',()=>fixture(({root,git,write,commit,base})=>{
 write('shared/myCrewCareLogistics.mjs');const head=commit();git(['checkout','--detach',base]);write('base-advance');const advanced=commit();
 const tree=git(['merge-tree','--write-tree',advanced,head]);
 const merge=(t,parents)=>execFileSync('git',['-c','user.name=Synthetic','-c','user.email=fixture@example.invalid','commit-tree',t,...parents.flatMap(p=>['-p',p]),'-m','synthetic merge'],{cwd:root,encoding:'utf8'}).trim();
 const merged=merge(tree,[advanced,head]);git(['checkout','--detach',merged]);assert.deepEqual(mccChangedPaths(resolve(advanced,head,merged),root),['shared/myCrewCareLogistics.mjs']);
 assert.throws(()=>mccChangedPaths(resolve(base,head,merged),root),/Ambiguous merge composition/);
 const bad=merge(git(['rev-parse',`${advanced}^{tree}`]),[advanced,head]);git(['checkout','--detach',bad]);assert.throws(()=>mccChangedPaths(resolve(advanced,head,bad),root),/Merge tree differs/);
 const extra=merge(tree,[advanced,head,base]);git(['checkout','--detach',extra]);assert.throws(()=>mccChangedPaths(resolve(advanced,head,extra),root),/Ambiguous merge composition/);
}));
test('resolver rejects ambiguous/unsupported events and malformed identities',()=>{
 const base='a'.repeat(40),head='b'.repeat(40),ctx={eventName:'pull_request',event:event(base,head),githubSha:head,repository};
 for(const change of [{eventName:'pull_request_target'},{eventName:'push'},{event:{...event(base,head),repository:{full_name:'wrong/repo'}}},{event:event(undefined,head)},{event:event(base,'0'.repeat(40))},{githubSha:'short'},{event:event(head,head)}])assert.throws(()=>resolveMccComparison({...ctx,...change}));
 assert.throws(()=>resolveMccComparison({...ctx,event:{...event(base,head),pull_request:{...event(base,head).pull_request,base:{sha:base,repo:{full_name:'wrong/repo'}}}}}),/repository mismatch/);
 const manual={eventName:'workflow_dispatch',event:{repository:repo,ref:'refs/heads/main',inputs:{base_sha:base,head_sha:head}},githubSha:head,repository};
 assert.deepEqual(resolveMccComparison(manual),{baseSha:base,headSha:head,checkoutSha:head});
 assert.throws(()=>resolveMccComparison({...manual,githubSha:base}),/Manual head/);
 assert.throws(()=>resolveMccComparison({...manual,event:{...manual.event,ref:'refs/heads/other'}}),/checked main/);
 assert.throws(()=>resolveMccComparison({...manual,event:{...manual.event,inputs:{}}}),/Invalid/);
});
test('actual CLI emits pinned plan and fails before emitting environment on Git error',()=>fixture(({root,write,commit,base})=>{
 write('shared/myCrewCareLogistics.mjs');const head=commit();const eventPath=path.join(root,'event.json'),output=path.join(root,'env');fs.writeFileSync(eventPath,JSON.stringify(event(base,head)));fs.writeFileSync(output,'');
 const env={PATH:process.env.PATH,GITHUB_EVENT_NAME:'pull_request',GITHUB_EVENT_PATH:eventPath,GITHUB_SHA:head,GITHUB_REPOSITORY:repository,GITHUB_ENV:output};
 let r=spawnSync(process.execPath,[helper],{cwd:root,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.match(fs.readFileSync(output,'utf8'),new RegExp(`CREWCHECK_MCC_BASE_SHA=${base}`));
 fs.writeFileSync(output,'');fs.writeFileSync(eventPath,JSON.stringify(event('f'.repeat(40),head)));r=spawnSync(process.execPath,[helper],{cwd:root,env,encoding:'utf8'});assert.notEqual(r.status,0);assert.equal(fs.readFileSync(output,'utf8'),'');
}));
test('workflow retains all gates and broad unknown namespace discovery',()=>{
 assert.match(workflow,/types: \[opened, synchronize, reopened, edited\]/);assert.match(workflow,/ref: \$\{\{ github.sha \}\}/);
 assert.match(workflow,/Resolve immutable MCC comparison/);assert.match(workflow,/node scripts\/ci\/mcc-comparison.mjs/);
 const broad="**/*[mM][yY][cC][rR][eE][wW][cC][aA][rR][eE]";
 assert.ok(workflow.includes(broad+"*'"));assert.ok(workflow.includes(broad+"*/**'"));
 for(const marker of ['UTC America/Sao_Paulo Pacific/Auckland','node scripts/assert-mycrewcare-v3-ownership.mjs','Complete canonical preparation','TypeScript','Web build',':app:compileDebugJavaWithJavac',':app:compileReleaseJavaWithJavac','scripts/assert-mycrewcare-debug-release.mjs --compiled'])assert.ok(workflow.includes(marker),marker);
 assert.equal(workflow.split('node scripts/assert-mycrewcare-v3-ownership.mjs').length-1,2);
 for(const name of ['scripts/ci/mcc-comparison.mjs','scripts/regression-mcc-comparison.mjs'])assert.ok(workflow.includes(`'${name}'`));
 assert.match(workflow,/- name: Resolve immutable MCC comparison \(fail closed\)\n        run: node scripts\/ci\/mcc-comparison.mjs/);
 // Do not prohibit the independent PR1035 diagnostic APK branch condition.
 // Only comparison/ownership may not have an author-controlled opt-out.
 assert.doesNotMatch(fs.readFileSync(helper,'utf8'),/head_ref|labels|skip.ownership/);
 assert.doesNotMatch(workflow,/pull_request_target/);
});

 test('criss-cross merge bases are rejected instead of selecting an arbitrary ancestor',()=>fixture(({root,git,write,commit,base})=>{
  write('left');const left=commit();git(['checkout','--detach',base]);write('right');const right=commit();
  const tree=git(['merge-tree','--write-tree',left,right]);
  const merge=parents=>execFileSync('git',['-c','user.name=Synthetic','-c','user.email=fixture@example.invalid','commit-tree',tree,...parents.flatMap(p=>['-p',p]),'-m','synthetic criss-cross'],{cwd:root,encoding:'utf8'}).trim();
  const a=merge([left,right]),b=merge([right,left]);git(['checkout','--detach',b]);assert.throws(()=>mccChangedPaths(resolve(a,b),root),/Ambiguous merge base/);
 }));
 test('unknown MCC namespace discovery covers new files and renamed destinations',()=>{
  // Evaluate the two broad Actions path patterns, including optional root directories.
  const patterns=[...workflow.matchAll(/^      - '([^']+)'/gm)].map(m=>m[1]).filter(p=>p.includes('[mM]'));
  const regex=p=>new RegExp('^'+p.replace(/\*\*\//g,'(?:.*/)?').replace(/\*\*/g,'.*').replace(/(?<![.])\*/g,'[^/]*')+'$');
  for(const name of ['shared/myCrewCareUnknown.mjs','scripts/fixtures/mycrewcare-sso-contract/unreviewed.java','android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareUnknown.java','docs/MYCREWCARE-new.md','client/src/components/mycrewcare/NewPanel.tsx'])assert.ok(patterns.some(p=>regex(p).test(name)),name);
 });
