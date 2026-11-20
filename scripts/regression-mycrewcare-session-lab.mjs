import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {metrics, verify} from './fixtures/mycrewcare-sso-contract/verify-instrumentation.mjs';

const fixture = 'scripts/fixtures/mycrewcare-sso-contract/';
const read = path => readFileSync(path, 'utf8');
const profile = 'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareProfile.java';
const digest = '312dafaa37429c5b509d5098e83ac331d2333530e6199f618fca9e3d01894ec6';
const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java') : 'java';
function helpers(mutate = {}) {
  const out = mkdtempSync(join(tmpdir(), 'mcc-session-lab-'));
  try {
    const files = ['LabTerminalGate.java', 'LoopbackFixture.java', 'LabHostHarness.java'].map(name => {
      const file = join(out, name), original = read(fixture + name);
      writeFileSync(file, mutate[name] ? mutate[name](original) : original);
      return file;
    });
    execFileSync(java, ['com.sun.tools.javac.Main', '-source', '17', '-target', '17', '-d', out, ...files], {stdio: 'pipe'});
    return execFileSync(java, ['-cp', out, 'lab.mcc.LabHostHarness'], {encoding: 'utf8', stdio: 'pipe'});
  } finally { rmSync(out, {recursive: true, force: true}); }
}
test('actual lab HTTP peer and terminal latch: 25 JVM assertions, not Android evidence', () => {
  assert.match(helpers(), /PASS 25 JVM helper assertions; Android\/Profile browser execution NOT performed/);
});
test('counterproof: premature PASS before cleanup is detected', () => {
  assert.throws(() => helpers({'LabTerminalGate.java': source => {
    assert.match(source, / \|\| !cleanupComplete/);
    return source.replace(' || !cleanupComplete', '');
  }}), /Command failed/);
});
test('counterproof: bypassing actual HTTP cookie comparison is detected', () => {
  assert.throws(() => helpers({'LoopbackFixture.java': source => {
    const check = 'check(exchange.cookie.equals(headers.getOrDefault("cookie", "")), "profile-cookie");';
    assert.ok(source.includes(check));
    return source.replace(check, '/* injected cookie-check bypass */');
  }}), /Command failed/);
});
test('lab build compiles hash-pinned original Profile and no production wiring', () => {
  assert.equal(createHash('sha256').update(readFileSync(profile)).digest('hex'), digest);
  const build = read(fixture + 'build.gradle');
  assert.match(build, /\.\.\/\.\.\/\.\.\/android-wrapper\/app\/src\/main\/java/);
  assert.ok(build.includes(digest));
  assert.match(build, /inputs\.file\(profileSource\)/);
  assert.match(build, /actual != expectedProfileSha256/);
  assert.match(build, /dependsOn 'verifyProductionProfile'/);
  assert.match(build, /applicationId 'lab\.mcc\.syntheticprofile'/);
  assert.match(build, /androidx\.webkit:webkit:1\.17\.1/);
  assert.match(build, /withBuildType\('release'\).*variant\.enable = false/);
  assert.doesNotMatch(build, /CREWCHECK_.*(?:PASSWORD|KEY)|signingConfig|project\(':app'\)/);
  const includes = build.match(/java\.includes = \[([\s\S]*?)\]/)?.[1];
  assert.deepEqual([...includes.matchAll(/'([^']+)'/g)].map(match => match[1]), [
    'RedirectInstrumentation.java', 'LabActivity.java', 'LabTerminalGate.java', 'LoopbackFixture.java',
    'com/crewcheck/app/CrewCheckMyCrewCareProfile.java',
  ]);
  const manifest = read(fixture + 'AndroidManifest.synthetic.xml');
  assert.match(manifest, /targetPackage="lab\.mcc\.syntheticprofile"/);
  assert.match(manifest, /LabActivity" android:exported="false"/);
  assert.doesNotMatch(manifest, /BROWSABLE|LAUNCHER|usesCleartextTraffic="true"/);
  assert.match(read(fixture + 'res/xml/loopback_network_security.xml'), /<base-config cleartextTrafficPermitted="false"\/>/);
  assert.match(read(fixture + 'res/xml/loopback_network_security.xml'), /includeSubdomains="false">127\.0\.0\.1</);
  assert.doesNotMatch(read('android-wrapper/settings.gradle') + read('android-wrapper/app/build.gradle') + read('android-wrapper/app/src/main/AndroidManifest.xml'), /lab\.mcc|syntheticprofile|mycrewcare-sso-contract/);
});
test('instrumentation calls real Profile and lets browser own POST redirects', () => {
  const source = read(fixture + 'RedirectInstrumentation.java');
  assert.match(source, /import com\.crewcheck\.app\.CrewCheckMyCrewCareProfile;/);
  assert.match(source, /profiles\.create\(activity, account\)/);
  assert.match(source, /profiles\.clear\(activity, account,/);
  assert.doesNotMatch(source, /new WebView\(|CookieManager\.[a-zA-Z]|setCookie\(|addJavascriptInterface|shouldOverrideUrlLoading/);
  assert.equal([...source.matchAll(/\.loadUrl\(/g)].length, 1);
  assert.match(source, /sessionStorage\.getItem/);
  assert.doesNotMatch(source, /getCookie\(|sessionStorage\.setItem\([^)]*result|document\.cookie/);
  assert.match(source, /server\.close\(\);[\s\S]*server\.assertDrained\(\)/);
  assert.match(source, /suite\.cleanupComplete\(now\(\), cleaned\)/);
  assert.doesNotMatch(source, /https:\/\/|apicrewcare|apihotels|microsoftonline/);
});

function passingEvidence() {
  return [
    'INSTRUMENTATION_RESULT: result=PASS: synthetic real-Profile browser mechanics only',
    'INSTRUMENTATION_RESULT: terminal=PASSED',
    'INSTRUMENTATION_RESULT: stage=timeout-late-browser-and-cleanup',
    'INSTRUMENTATION_RESULT: webview=com.android.webview/150.0.0.0',
    'INSTRUMENTATION_RESULT: androidApi=36',
    'INSTRUMENTATION_RESULT: checks=70',
    `INSTRUMENTATION_RESULT: profileSourceSha256=${digest}`,
    ...metrics.map(metric => `INSTRUMENTATION_RESULT: ${metric}=PASS`),
    'INSTRUMENTATION_CODE: -1', '',
  ].join('\n');
}
test('result verifier accepts only complete synthetic evidence (parser fixture, not execution)', () => {
  assert.equal(verify(passingEvidence(), 0).terminal, 'PASSED');
  assert.equal(verify(passingEvidence().replaceAll('\n', '\r\n'), 0).androidApi, '36');
  const source = read(fixture + 'RedirectInstrumentation.java');
  for (const metric of metrics) assert.ok(source.includes(`result.putString("${metric}", "PASS")`), metric);
});
test('result verifier rejects process success without instrument/cleanup/metric success', () => {
  for (const [evidence, status] of [
    ['', 0], ['BUILD SUCCESSFUL', 0], [passingEvidence(), 124],
    [passingEvidence().replace('INSTRUMENTATION_CODE: -1', 'INSTRUMENTATION_CODE: 0'), 0],
    [passingEvidence() + 'INSTRUMENTATION_CODE: -1\n', 0],
    [passingEvidence() + 'INSTRUMENTATION_RESULT: terminal=PASSED\n', 0],
    [passingEvidence() + 'INSTRUMENTATION_FAILED: crashed\n', 0],
    [passingEvidence().replace(digest, '0'.repeat(64)), 0],
    ...metrics.flatMap(metric => ['FAIL', 'NOT_EXECUTED', ''].map(state => [passingEvidence().replace(`${metric}=PASS`, `${metric}=${state}`), 0])),
  ]) assert.throws(() => verify(evidence, status));
});
test('runner is isolated, license-refusing and non-publishing; syntax only locally', () => {
  const script = read(fixture + 'run-instrumentation.sh');
  execFileSync('bash', ['-n', fixture + 'run-instrumentation.sh']);
  const executable = script.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
  assert.doesNotMatch(executable, /\bsudo\b|\bchmod\b|\bchown\b|\bsysctl\b|\biptables\b|\bufw\b|\byes\b|--licenses|adb connect|adb pair|curl |wget /);
  assert.match(executable, /unshare --user --map-root-user --net/);
  assert.match(executable, /ip -o link show \| wc -l/);
  assert.match(executable, /readlink \/proc\/self\/ns\/net/);
  assert.match(executable, /-r \/dev\/kvm && -w \/dev\/kvm/);
  assert.match(executable, /sdkmanager.*<\/dev\/null/);
  assert.match(executable, /cmp -s "\$WORK\/licenses.before" "\$WORK\/licenses.after"/);
  assert.match(executable, /-Pandroid.builder.sdkDownload=false assembleDebug/);
  assert.match(executable, /ADB_SERVER_SOCKET='tcp:127.0.0.1:5037'/);
  assert.match(executable, /trap cleanup EXIT/);
  assert.match(executable, /uninstall "\$PACKAGE"/);
  assert.match(executable, /rm -rf -- "\$WORK"/);
  assert.match(executable, /-no-snapshot -wipe-data -accel on/);
  const job = read('.github/workflows/mycrewcare-v3-persistence.yml').split('  synthetic-instrumentation:')[1]
    .split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
  assert.match(job, /needs: validate/);
  assert.match(job, /repository.private == false/);
  assert.match(job, /runs-on: ubuntu-24.04/);
  assert.match(job, /persist-credentials: false/);
  assert.match(job, /cache-disabled: true/);
  assert.doesNotMatch(job, /secrets|permissions|sudo|upload-artifact|setup-android|larger|self-hosted|continue-on-error/);
  assert.ok(job.indexOf('run-instrumentation.sh preflight') < job.indexOf('actions/setup-java'));
});
