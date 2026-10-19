import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
const root=process.env.CREWLIFE_WEAR_SOURCE_ROOT;
const expected=process.env.CREWLIFE_WEAR_EXPECTED_HEAD;
assert(root&&expected,'Pinned Wear source root and full expected SHA required');
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),expected);
const receiverNames=['CrewLifeFence.java','CrewLifeSnapshot.java','WatchContract.java'];
for(const name of receiverNames){
 const relative='android-wrapper/wear/src/main/java/com/crewcheck/watch/'+name;
 assert(fs.readFileSync(path.join(root,relative)).equals(execFileSync('git',['-C',root,'show',expected+':'+relative])),name+' differs from pinned receiver');
}
const inputs=['MainActivity.java','CrewLifeV2Phone.java','CrewLifeV2Journal.java','CrewLifeSyncWork.java','CrewCheckWatchSyncService.java'].map(n=>'android-wrapper/app/src/main/java/com/crewcheck/app/'+n)
 .concat(['android-wrapper/app/src/crewlifeLoopTest/java/com/crewcheck/app/CrewLifeAckContinuationTest.java','android-wrapper/app/src/crewlifeLoopTest/java/com/crewcheck/watch/CrewLifeLoopTestPeer.java','android-wrapper/app/build.gradle']);
const hashes=Object.fromEntries(inputs.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const result=spawnSync(process.env.CREWLIFE_GRADLE||'gradle',['-p','android-wrapper','--no-daemon','--console=plain','-PcrewLifeReceiverRoot='+path.resolve(root),':app:testReleaseUnitTest','--tests','com.crewcheck.app.CrewLifeAckContinuationTest'],{stdio:'inherit',timeout:600000});
assert.equal(result.status,0,'Real Android broadcast/paused-looper continuation tests failed');
for(const p of inputs)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),hashes[p],p+' changed during test');
const xml=fs.readFileSync('android-wrapper/app/build/test-results/testReleaseUnitTest/TEST-com.crewcheck.app.CrewLifeAckContinuationTest.xml','utf8');
assert.match(xml,/<testsuite\b[^>]*tests="14"/);
assert.match(xml,/<testsuite\b[^>]*failures="0"/);
assert.match(xml,/<testsuite\b[^>]*errors="0"/);
assert.match(xml,/<testsuite\b[^>]*skipped="0"/);
console.log(JSON.stringify({status:'PASS',tests:14,wear:expected,scope:'actual Android broadcast registration/delivery, production receiver/service/native source and ACK handling; real paused main looper drained to no pending tasks; GMS/provider/peer disk synthetic, no physical/vendor proof',sourceSha256:hashes}));
