import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real source functions without initializing the app or contacting APIs.
function sourceFunction(path, name) {
  const source = fs.readFileSync(path, 'utf8');
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let match;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) match = node.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(match, `${name} exists in ${path}`);
  return ts.transpileModule(match, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
const runtimePath = 'client/src/lib/crewcheckPremiumRuntime.ts';
const runtime = ['bridge', 'notify', 'scheduleNotification'].map(name => sourceFunction(runtimePath, name)).join('\n');
const feedback = sourceFunction('client/src/components/v14313/LifeConciergePanel.tsx', 'scheduleReminders');
let cases = 0;
function check(name, run) { run(); cases++; console.log(`PASS ${name}`); }
function setup({ permission = 'granted', supported = true, throws = false, native } = {}) {
  const timers = [], notifications = [], messages = [];
  function Notification(title, options) { notifications.push({ title, ...options }); }
  Notification.permission = permission;
  const window = { setTimeout(callback, delay) { if (throws) throw new Error('timer unavailable'); timers.push({ callback, delay }); return timers.length; }, ...(native ? { CrewCheckNative: native } : {}) };
  if (supported) window.Notification = Notification;
  const context = vm.createContext({ window, ...(supported ? { Notification } : {}), Date: { now: () => 1000 }, preferences: { remindersEnabled: true }, scheduleLifeRemindersForToday: () => 1, toast: { info: message => messages.push({ kind: 'info', message }), success: message => messages.push({ kind: 'success', message }) } });
  vm.runInContext(runtime + '\n' + feedback, context);
  return { context, timers, notifications, messages, schedule: epoch => context.scheduleNotification('Reminder', 'Body', epoch) };
}
for (const epoch of [NaN, Infinity, -Infinity, 1000 + 2147483648]) {
  check(`reject invalid/out-of-range epoch ${epoch}`, () => { const s = setup(); assert.equal(s.schedule(epoch), false); assert.equal(s.timers.length, 0); });
}
for (const delay of [1, 2147483647]) {
  check(`accept supported timer boundary ${delay}`, () => { const s = setup(); assert.equal(s.schedule(1000 + delay), true); assert.equal(s.timers.length, 1); assert.equal(s.timers[0].delay, delay); });
}
for (const epoch of [900, 1000]) {
  check(`expired timestamp ${epoch} cannot replay immediately`, () => { const s = setup(); assert.equal(s.schedule(epoch), false); assert.equal(s.timers.length, 0); });
  check(`expired timestamp ${epoch} never reaches native bridge`, () => { const s = setup({ native: { scheduleNotification() { throw new Error('expired bridge call'); } } }); assert.equal(s.schedule(epoch), false); });
}
for (const options of [{ permission: 'denied' }, { permission: 'default' }, { supported: false }, { throws: true }]) {
  check(`reject unavailable delivery/timer ${JSON.stringify(options)}`, () => { const s = setup(options); assert.equal(s.schedule(2000), false); assert.equal(s.timers.length, 0); });
}
check('notification created only when timer runs', () => { const s = setup(); s.schedule(2000); assert.equal(s.notifications.length, 0); s.timers[0].callback(); assert.equal(s.notifications.length, 1); });
check('permission revocation prevents notification at delivery', () => { const s = setup(); s.schedule(2000); s.context.Notification.permission = 'denied'; s.timers[0].callback(); assert.equal(s.notifications.length, 0); });
for (const result of [true, false]) {
  check(`native result ${result} remains authoritative with no browser timer`, () => {
    let received;
    const s = setup({ permission: 'denied', native: { scheduleNotification(...args) { received = args; return result; } } });
    assert.equal(s.schedule(1234.7), result); assert.deepEqual(received, ['Reminder', 'Body', '1235']); assert.equal(s.timers.length, 0);
  });
}
check('browser feedback explains tab lifetime without success toast', () => { const s = setup(); s.context.scheduleReminders(); assert.equal(s.messages[0].kind, 'info'); assert.match(s.messages[0].message, /nesta aba/); assert.match(s.messages[0].message, /não são um alarme em segundo plano/); assert.match(s.messages[0].message, /fechar ou recarregar/); });
check('zero scheduled is not reported as unnecessary', () => { const s = setup(); s.context.scheduleLifeRemindersForToday = () => 0; s.context.scheduleReminders(); assert.match(s.messages[0].message, /Nenhum lembrete foi programado/); assert.doesNotMatch(s.messages[0].message, /foi necessário/); });
check('missing permission feedback explains browser settings', () => { const s = setup({ permission: 'default' }); s.context.scheduleLifeRemindersForToday = () => 0; s.context.scheduleReminders(); assert.match(s.messages[0].message, /permitidas nas configurações do navegador/); });
check('disabled reminder feedback', () => { const s = setup(); s.context.preferences.remindersEnabled = false; s.context.scheduleLifeRemindersForToday = () => 0; s.context.scheduleReminders(); assert.match(s.messages[0].message, /Ative os lembretes/); });
check('native feedback retained', () => { const s = setup({ native: { scheduleNotification() { return true; } } }); s.context.scheduleReminders(); assert.equal(s.messages[0].kind, 'success'); assert.doesNotMatch(s.messages[0].message, /nesta aba/); });
console.log(JSON.stringify({ status: 'PASS', cases, scope: 'actual-source runtime and feedback; no real APIs or notifications' }));
