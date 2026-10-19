import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('client/src/lib/crewcheckPremiumRuntime.ts', 'utf8');
const file = ts.createSourceFile('runtime.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = ['bridge', 'notify', 'scheduleNotification'];
const functions = file.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(file));
assert.equal(functions.length, names.length);
const code = ts.transpileModule(functions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let cases = 0;
function run(native, permission = 'granted') {
  const timers = [];
  function Notification() { throw new Error('No real notification may be constructed'); }
  Notification.permission = permission;
  const window = { ...(native ? { CrewCheckNative: native } : {}), setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; } };
  const context = vm.createContext({ window, Notification, Date: { now: () => 1000 } });
  vm.runInContext(code, context);
  return { accepted: context.scheduleNotification('Synthetic reminder', 'Synthetic body', 2000), timers };
}
const thrown = run({ scheduleNotification() { throw new Error('Synthetic native bridge failure'); } });
assert.equal(thrown.accepted, false, 'native bridge failure must not be reported as an accepted Android alarm');
assert.equal(thrown.timers.length, 0, 'native bridge failure must not silently create a page-only timer'); cases++;
for (const value of [true, false, undefined, null, 'true', 1, {}, Promise.resolve(true)]) {
  const result = run({ scheduleNotification() { return value; } });
  assert.equal(result.accepted, value === true, 'only the native boolean receipt authorizes accepted scheduling');
  assert.equal(result.timers.length, 0); cases++;
}
const browser = run(null);
assert.equal(browser.accepted, true); assert.equal(browser.timers.length, 1); cases++;
const denied = run(null, 'denied');
assert.equal(denied.accepted, false); assert.equal(denied.timers.length, 0); cases++;
console.log(`PASS ${cases} actual-source native reminder receipt cases; bridge errors/nonboolean receipts cannot become browser timers; plain-browser behavior retained; synthetic only, no sends`);
