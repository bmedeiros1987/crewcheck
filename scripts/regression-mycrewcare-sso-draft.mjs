import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const fixture='scripts/fixtures/mycrewcare-sso-contract/';
test('sanitized observed facts never grant navigation or acquisition; route, method, phase negatives',()=>{
 const out=mkdtempSync(join(tmpdir(),'mcc-sso-draft-'));
 const java=process.env.JAVA_HOME ? join(process.env.JAVA_HOME,'bin/java') : 'java';
 try {
  execFileSync(java,['com.sun.tools.javac.Main','-source','17','-target','17','-d',out,fixture+'CrewCheckMyCrewCareSsoDraft.java',fixture+'SsoDraftHarness.java'],{stdio:'pipe'});
  const result=execFileSync(java,['-cp',out,'SsoDraftHarness'],{encoding:'utf8'});
  assert.match(result,/PASS inactive sanitized contract cases=40/);
 } finally {rmSync(out,{recursive:true,force:true});}
});
test('debug patch is an exact copy of inactive fixture; no installed source is changed',()=>{
 const src=readFileSync(fixture+'CrewCheckMyCrewCareSsoDraft.java','utf8');
 const patch=readFileSync(fixture+'debug-inactive.patch','utf8');
 const reconstructed=patch.split('\n').filter(x=>x.startsWith('+')&&!x.startsWith('+++')).map(x=>x.slice(1)).join('\n')+'\n';
 assert.equal(reconstructed,src);
 assert.match(patch,/android-wrapper\/app\/src\/debug\/java\/com\/crewcheck\/app\/CrewCheckMyCrewCareSsoDraft.java/);
 assert.doesNotMatch(src,/android\.|java\.net|WebView|CookieManager|loadUrl|evaluateJavascript|System\.out/);
});
