import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const metrics = ['redirect302', 'continuityA', 'isolationB', 'redirect307', 'redirect308',
  'clearAOnly', 'viewStorage', 'cancelLate', 'timeoutLate', 'finalCleanup'];
const profileHash = '312dafaa37429c5b509d5098e83ac331d2333530e6199f618fca9e3d01894ec6';
export function verify(text, exitCode) {
  const lines = text.replaceAll('\r', '').split('\n');
  const entries = lines.filter(line => line.startsWith('INSTRUMENTATION_RESULT: ')).map(line => {
    const pair = line.slice('INSTRUMENTATION_RESULT: '.length), split = pair.indexOf('=');
    assert.ok(split > 0, 'malformed result');
    return [pair.slice(0, split), pair.slice(split + 1)];
  });
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, 'duplicate result key');
  const result = Object.fromEntries(entries);
  assert.equal(exitCode, 0, 'instrument process failed/timed out');
  assert.deepEqual(lines.filter(line => line.startsWith('INSTRUMENTATION_CODE: ')), ['INSTRUMENTATION_CODE: -1'], 'missing/non-success terminal code');
  assert.ok(!lines.some(line => /^(INSTRUMENTATION_FAILED|INSTRUMENTATION_ABORTED|INSTRUMENTATION_STATUS: Error)/.test(line)), 'instrumentation reported failure');
  assert.equal(result.result, 'PASS: synthetic real-Profile browser mechanics only');
  assert.equal(result.terminal, 'PASSED');
  assert.equal(result.stage, 'timeout-late-browser-and-cleanup');
  assert.equal(result.profileSourceSha256, profileHash);
  assert.match(result.webview ?? '', /^[A-Za-z0-9_.]+\/[A-Za-z0-9_.-]+$/);
  assert.match(result.androidApi ?? '', /^\d+$/); assert.ok(Number(result.androidApi) >= 26);
  assert.match(result.checks ?? '', /^\d+$/); assert.ok(Number(result.checks) > 0);
  for (const metric of metrics) assert.equal(result[metric], 'PASS', `metric ${metric}`);
  return Object.fromEntries(['result', 'terminal', 'stage', 'androidApi', 'webview', 'checks', 'profileSourceSha256', ...metrics].map(key => [key, result[key]]));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = readFileSync(process.argv[2], 'utf8');
  // No raw logs/HTTP/cookies/credentials are published, even on failure.
  const allowed = new Set(['result', 'terminal', 'stage', 'androidApi', 'webview', 'checks', 'profileSourceSha256', ...metrics]);
  for (const line of text.replaceAll('\r', '').split('\n')) {
    const match = /^INSTRUMENTATION_RESULT: ([A-Za-z0-9]+)=([A-Za-z0-9_.:/ -]{1,180})$/.exec(line);
    if (match && allowed.has(match[1])) console.log(`${match[1]}=${match[2]}`);
  }
  try { verify(text, Number(process.argv[3])); console.log('PASS: all synthetic lab metrics; real MyCrewCare login NOT_EXECUTED'); }
  catch { console.error('FAIL: incomplete/failed synthetic instrumentation; no real-login claim'); process.exitCode = 1; }
}
