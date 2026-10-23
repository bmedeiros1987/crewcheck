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
 assert.equal(workflow.split('node scripts/assert-mycrewcare-v3-ownership.mjs').length-1,2,'full auditor must remain raw + prepared');
 const broad="**/*[mM][yY][cC][rR][eE][wW][cC][aA][rR][eE]";
 assert.ok(workflow.includes(broad+"*'"));assert.ok(workflow.includes(broad+"*/**'"));
 for(const marker of ['UTC America/Sao_Paulo Pacific/Auckland','node scripts/assert-mycrewcare-v3-ownership.mjs','Complete canonical preparation','TypeScript','Web build',':app:compileDebugJavaWithJavac',':app:compileReleaseJavaWithJavac','scripts/assert-mycrewcare-debug-release.mjs --compiled'])assert.ok(workflow.includes(marker),marker);
 assert.equal(workflow.split('node scripts/assert-mycrewcare-v3-ownership.mjs').length-1,2);
 for(const name of ['scripts/ci/mcc-comparison.mjs','scripts/regression-mcc-comparison.mjs'])assert.ok(workflow.includes(`'${name}'`));
 assert.match(workflow,/- name: Resolve immutable MCC comparison \(fail closed\)\n        run: node scripts\/ci\/mcc-comparison.mjs/);
 assert.match(workflow,/- name: Classify MCC ownership scope without weakening the auditor/);
 assert.equal((workflow.match(/if: env\.CREWCHECK_MCC_FULL_AUDIT == 'true'/g)||[]).length,2,'raw/prepared ownership audit must share the same scope fence');
 assert.equal((workflow.match(/MCC effective Gradle contract (?:before|after) canonical preparation/g)||[]).length,2,'effective Gradle MCC contract must run raw and prepared');
 assert.match(workflow,/- name: MCC routing\/equivalence regressions \(always\)\n        run: node --test scripts\/regression-mcc-comparison\.mjs/,'equivalence regression must execute even when full MCC audit is skipped');
 assert.match(workflow,/- name: Counterprove Gradle-only tampering \(always\)\n        run: \|/,'effective Gradle counterproofs must execute outside the full-audit condition');
 assert.match(workflow,/- name: Prove Gradle-only delta is unrelated to MCC \(fail closed\)\n        if: env\.CREWCHECK_MCC_FULL_AUDIT != 'true'/,'Gradle-only path must prove its delta rather than bypass ownership');
 assert.ok(workflow.includes("- 'android-wrapper/app/build.gradle'"),'shared Gradle remains a discovery trigger for the equivalent gate');
 assert.match(workflow,/resolvedConfiguration\.resolvedArtifacts/,'effective dependency resolution must be inspected');
 assert.match(workflow,/buildTypes\.getByName\('debug'\)\.applicationIdSuffix/,'effective debug applicationIdSuffix must be inspected');
 assert.match(workflow,/resolutionStrategy\.force "androidx\.webkit:webkit:1\.16\.0"/,'forced dependency downgrade counterproof must execute');
 assert.match(workflow,/applicationIdSuffix "\.mcctest" decoy; effective override follows/,'comment decoy counterproof must be explicit');
 assert.match(workflow,/android\.buildTypes\.debug\.applicationIdSuffix = "\.shared"/,'late applicationIdSuffix override counterproof must execute');
 // Do not prohibit the independent PR1035 diagnostic APK branch condition.
 // Only comparison/ownership may not have an author-controlled opt-out.
 assert.doesNotMatch(fs.readFileSync(helper,'utf8'),/head_ref|labels|skip.ownership/);
 assert.doesNotMatch(workflow,/pull_request_target/);
});


test('scope routing keeps FCM-only Gradle changes out of the MCC ownership auditor but sends mixed MCC diffs into it',()=>{
 const classifier=workflow.match(/const isMccSignal = \(path\) => \(\n([\s\S]*?)\n          \);\n          const mccSignals/)?.[1];
 assert.ok(classifier,'workflow classifier must remain extractable for counterproofs');
 const isMccSignal=new Function('path',`return (${classifier});`);
 const fcmOnly=[
  'android-wrapper/app/build.gradle',
  'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java',
  'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckFirebaseMessagingService.java',
  'client/src/lib/androidPushLifecycle.ts',
  'docs/android-native-push-off-20261023.md',
 ];
 assert.equal(fcmOnly.some(isMccSignal),false,'#1218-style FCM-only diff must use the Gradle-equivalence path, not MCC ownership');
 for(const foreign of ['android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java','server.mjs','shared/unrelated.mjs']){
  const mixed=['shared/myCrewCareLogistics.mjs',foreign];
  assert.equal(mixed.some(isMccSignal),true,'real MCC change must force the full ownership auditor');
 }
 assert.equal(['android-wrapper/app/src/debug/AndroidManifest.xml'].some(isMccSignal),true,'MCC debug overlay must force the full ownership auditor');
});

test('actual Gradle-only proof executes the workflow code and fails closed on unproven deltas',()=>{
 const body=workflow.match(/\/\/ mcc-gradle-delta-proof:js:start\n([\s\S]*?)\n          \/\/ mcc-gradle-delta-proof:js:end/)?.[1];
 assert.ok(body,'Gradle-only proof body must remain extractable from the workflow');
 const script=body.replace(/^          /gm,'');
 const run=(mutate)=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcc-gradle-delta-proof-'));
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  try{
   git(['init','-q']);
   git(['config','user.name','Synthetic Gate Test']);
   git(['config','user.email','synthetic@example.invalid']);
   fs.mkdirSync(path.join(root,'android-wrapper/app'),{recursive:true});
   const file=path.join(root,'android-wrapper/app/build.gradle');
   fs.writeFileSync(file,"dependencies {\n    implementation 'androidx.webkit:webkit:1.17.1'\n}\n");
   git(['add','.']);git(['commit','-qm','base']);const base=git(['rev-parse','HEAD']);
   mutate(file);
   git(['add','.']);git(['commit','-qm','head']);const head=git(['rev-parse','HEAD']);
   return spawnSync(process.execPath,['--input-type=module','--eval',script],{
    cwd:root,encoding:'utf8',env:{...process.env,CREWCHECK_MCC_BASE_SHA:base,CREWCHECK_MCC_HEAD_SHA:head},
   });
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 };
 let result=run(file=>fs.appendFileSync(file,"    implementation 'com.google.firebase:firebase-messaging:25.1.3'\n"));
 assert.equal(result.status,0,result.stderr);
 result=run(file=>fs.appendFileSync(file,"configurations.configureEach { resolutionStrategy.force 'androidx.webkit:webkit:1.16.0' }\n"));
 assert.notEqual(result.status,0,'resolutionStrategy.force must fail the no-MCC Gradle proof');
 assert.match(result.stderr,/Unproven shared Gradle delta/);
 result=run(file=>fs.appendFileSync(file,'// applicationIdSuffix ".mcctest" decoy\nandroid.buildTypes.debug.applicationIdSuffix = ".shared"\n'));
 assert.notEqual(result.status,0,'comment decoy plus late applicationIdSuffix override must fail the no-MCC Gradle proof');
 assert.match(result.stderr,/Unproven shared Gradle delta/);
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

test('documented local invocation supplies explicit SHAs and fails closed',()=>fixture(({root,git,write,commit})=>{
 const doc=fs.readFileSync('docs/mycrewcare-v3-persistent-session.md','utf8');
 const command=doc.match(/<!-- mcc-local-command:start -->\s*```sh\n([\s\S]*?)```\s*<!-- mcc-local-command:end -->/)?.[1];
 assert.ok(command,'Execute the documented shell block, not a copied command');
 // Exercise the unchanged real path auditor in a synthetic repository, as in the
 // existing ownership fixtures. Full source/lifecycle invariants run separately.
 write('scripts/assert-mycrewcare-v3-ownership.mjs',`import assert from 'node:assert/strict';\nimport {mccChangedPaths} from ${JSON.stringify(new URL('./ci/mcc-comparison.mjs',import.meta.url).href)};\n${gate}\nconsole.log('LOCAL_PATH_AUDIT_PASS');\n`);
 write('docs/mycrewcare-v3-persistent-session.md','synthetic baseline');const base=commit();
 write('docs/mycrewcare-v3-persistent-session.md','synthetic reviewed change');const head=commit();
 const values={MCC_REVIEW_BASE_SHA:base,MCC_REVIEW_HEAD_SHA:head,MCC_REVIEW_CHECKOUT_SHA:head};
 const run=(changes={})=>spawnSync('/bin/sh',['-c',command],{cwd:root,encoding:'utf8',env:{PATH:path.dirname(process.execPath)+path.delimiter+(process.env.PATH||''),...values,...changes}});
 let result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/LOCAL_PATH_AUDIT_PASS/);
 for(const key of Object.keys(values)) { result=run({[key]:''});assert.notEqual(result.status,0);assert.match(result.stderr,/Informe o SHA completo/);assert.doesNotMatch(result.stdout,/LOCAL_PATH_AUDIT_PASS/); }
 for(const [changes,message] of [
  [{MCC_REVIEW_HEAD_SHA:'short'},/Invalid headSha/],
  [{MCC_REVIEW_BASE_SHA:head},/Empty comparison/],
  [{MCC_REVIEW_BASE_SHA:'f'.repeat(40)},/Command failed|fatal/],
  [{MCC_REVIEW_CHECKOUT_SHA:base},/Checkout SHA mismatch/],
 ]) { result=run(changes);assert.notEqual(result.status,0);assert.match(result.stderr,message);assert.doesNotMatch(result.stdout,/LOCAL_PATH_AUDIT_PASS/); }
 write('client/src/pages/Home.tsx','synthetic forbidden writer');const mixed=commit();result=run({MCC_REVIEW_HEAD_SHA:mixed,MCC_REVIEW_CHECKOUT_SHA:mixed});assert.notEqual(result.status,0);assert.match(result.stderr,/outside its isolated/);
 fs.renameSync(path.join(root,'.git'),path.join(root,'.git-unavailable'));result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/Command failed|fatal/);assert.doesNotMatch(result.stdout,/LOCAL_PATH_AUDIT_PASS/);
}));
