import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const base = '5dd82be0caf8ef1133b9399b0c1af8bb4436a585';
const root = process.cwd();
const stage = process.env.V1414_STAGE || fileURLToPath(new URL('./v1414/apply.mjs', import.meta.url));
const preparedRoot = process.env.V1414_PREPARED_ROOT || root;
const runtimePath = 'server/telegram-fast-ack.mjs', homePath = 'client/src/pages/Home.tsx';
const raw = Object.fromEntries([runtimePath, homePath].map(file => [file, execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' })]));
const modern = Object.fromEntries([runtimePath, homePath].map(file => [file, fs.readFileSync(path.join(preparedRoot, file), 'utf8')]));
const original = execFileSync('git', ['show', `${base}:scripts/v1414/apply.mjs`], { encoding: 'utf8' });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v1414-test-'));
const originalStage = path.join(temp, 'original.mjs');fs.writeFileSync(originalStage, original);
let count = 0;
function run(input, script = stage, repeat = 1) {
  const dir = path.join(temp, String(count++));
  for (const [file, text] of Object.entries(input)) { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); }
  let result;
  for (let i = 0; i < repeat; i++) { result = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', timeout: 20000 }); if (result.status !== 0) break; }
  const files = Object.fromEntries(Object.keys(input).map(file => [file, fs.readFileSync(path.join(dir, file), 'utf8')]));
  return { ...result, files };
}
const success = result => assert.equal(result.status, 0, result.stderr);
const functions = source => parse(source, { sourceType: 'module' }).program.body.filter(node => node.type === 'FunctionDeclaration');
try {
  const expected = run(raw, originalStage); success(expected);
  const cold = run(raw); success(cold);
  assert.deepEqual(cold.files, expected.files, 'cold byte parity with historical stage');
  const repeated = run(raw, stage, 2); success(repeated);
  assert.deepEqual(repeated.files, cold.files, 'second stage invocation is byte stable');
  const ready = run(modern, stage, 2); success(ready);
  assert.deepEqual(ready.files, modern, 'modern delivery, schedule, Home and monitor remain byte identical');
  for (const node of functions(raw[runtimePath]).filter(node => !['deliverJob', 'scheduleJob'].includes(node.id.name))) {
    const next = functions(cold.files[runtimePath]).find(candidate => candidate.id.name === node.id.name);
    assert.ok(next, 'preserved helper ' + node.id.name);
    assert.equal(cold.files[runtimePath].slice(next.start, next.end), raw[runtimePath].slice(node.start, node.end));
  }
  console.log('PASS cold parity, repeated legacy, repeated modern, all adjacent helper bytes');
  for (const [file, text] of Object.entries(cold.files)) parse(text, { sourceType: 'module', plugins: file.endsWith('.tsx') ? ['typescript', 'jsx'] : [] });
  const decoy = '/* async function deliverJob(job) { synthetic }\nfunction wakeupChannelLabel(channel: string): string { synthetic }\nfunction serverChannel() { synthetic }\nconst RUNTIME_VERSION = \'synthetic\';\nimport { sendTelegram, callTelegram } from \'./v139/delivery.mjs\'; */\n';
  const commented = Object.fromEntries(Object.entries(raw).map(([file, text]) => [file, decoy + text]));
  const commentedResult = run(commented); success(commentedResult);
  assert.deepEqual(commentedResult.files, Object.fromEntries(Object.entries(cold.files).map(([file, text]) => [file, decoy + text])), 'comment decoys do not capture a replacement');
  const modernComments = Object.fromEntries(Object.entries(modern).map(([file, text]) => [file, decoy + text]));
  const commentsReady = run(modernComments); success(commentsReady); assert.deepEqual(commentsReady.files, modernComments);
  console.log('PASS syntax and comment decoys in cold/modern trees');
  const innerDecoy = "/* <option value=\"telegram\">Somente Telegram</option><option value=\"telegram-call\">Ligação via Telegram</option><option value=\"phone-call\">Ligação telefônica Premium</option><option value=\"both\">Ligação telefônica + Telegram</option> (channel === 'phone-call' || channel === 'both') */";
  const withInnerDecoy = text => text.replace('function WakeupView({ event }: { event: ZeroLeg }) {', 'function WakeupView({ event }: { event: ZeroLeg }) {' + innerDecoy);
  const innerResult = run({ ...raw, [homePath]: withInnerDecoy(raw[homePath]) }); success(innerResult);
  assert.deepEqual(innerResult.files, { ...cold.files, [homePath]: withInnerDecoy(cold.files[homePath]) }, 'literal replacements ignore comment tokens inside WakeupView');
  const singleNewline = { ...raw, [runtimePath]: raw[runtimePath].replace('\n\nfunction commuteRouteKey', '\nfunction commuteRouteKey') };
  const narrow = run(singleNewline, stage, 2); success(narrow); assert.deepEqual(narrow.files, cold.files, 'one-newline boundary cannot consume helpers');

  const negatives = [
    ['missing monitor', runtimePath, text => { const node=functions(text).find(n=>n.id.name==='runCommuteMonitorCycle');return text.slice(0,node.start)+text.slice(node.end); }],
    ['missing commute helper', runtimePath, text => { const node=functions(text).find(n=>n.id.name==='commuteRouteKey');return text.slice(0,node.start)+text.slice(node.end); }],
    ['string delivery only', runtimePath, text => { const node=functions(text).find(n=>n.id.name==='deliverJob');return text.slice(0,node.start)+'const syntheticDelivery='+JSON.stringify(text.slice(node.start,node.end))+';'+text.slice(node.end); }],
    ['template delivery only', runtimePath, text => { const node=functions(text).find(n=>n.id.name==='deliverJob'); const body=text.slice(node.start,node.end);assert.ok(!body.includes('`') && !body.includes('${'));return text.slice(0,node.start)+'const syntheticDelivery = `'+body+'`;'+text.slice(node.end); }],
    ['dead branch delivery only', runtimePath, text => { const node=functions(text).find(n=>n.id.name==='deliverJob');return text.slice(0,node.start)+'if(false) { '+text.slice(node.start,node.end)+' }'+text.slice(node.end); }],

    ['missing consent preparation', runtimePath, text => text.replace('const spoken = await prepareScheduledWakeup(job, { getPool: dbPool });', '')],
    ['consent failure bypass', runtimePath, text => text.replace('if (!spoken.ok) return spoken;', '')],
    ['locale removed', runtimePath, text => text.replace('spoken.locale ? { locale: spoken.locale } : {}', '{}')],
    ['Telegram locale removed', runtimePath, text => text.replace('job.telegram_username, job.message, callOptions', 'job.telegram_username, job.message')],
    ['phone locale removed', runtimePath, text => text.replace('job.phone, job.message, callOptions', 'job.phone, job.message')],
    ['wrong consent module', runtimePath, text => text.replace("from './wakeup-spoken-program.mjs'", "from './synthetic-wrong-module.mjs'")],
    ['wrong schedule module', runtimePath, text => text.replace("from './notification-job-safety.mjs'", "from './synthetic-wrong-module.mjs'")],
    ['shadow consent import', runtimePath, text => text.replace('import { prepareScheduledWakeup,', 'import { prepareScheduledWakeup as unusedPreparation,') + '\nconst prepareScheduledWakeup = () => ({ok:true});\n'],
    ['local shadow', runtimePath, text => text.replace('async function deliverJob(job) {', 'async function deliverJob(job) { const prepareScheduledWakeup = () => ({ok:true});')],
    ['ambient shadow', runtimePath, text => text + '\nconst String = () => "synthetic";\n'],
    ['early return', runtimePath, text => text.replace('async function deliverJob(job) {', 'async function deliverJob(job) { return {};')],
    ['generator', runtimePath, text => text.replace('async function deliverJob(job)', 'async function* deliverJob(job)')],
    ['nested delivery only', runtimePath, text => { const node = functions(text).find(n => n.id.name === 'deliverJob');return text.slice(0,node.start)+'function uncalled() {\n'+text.slice(node.start,node.end)+'\n}\n'+text.slice(node.end); }],
    ['commented delivery only', runtimePath, text => { const node = functions(text).find(n => n.id.name === 'deliverJob');return text.slice(0,node.start)+'/*'+text.slice(node.start,node.end)+'*/'+text.slice(node.end); }],
    ['missing safe scheduler', runtimePath, text => text.replace('return safeScheduleJob({ req, res, identity, readJson, dbPool, ensureNotificationTable, linkedTelegramRecord, sendJson });', 'return {};')],
    ['mixed legacy scheduler', runtimePath, text => {const node=functions(text).find(n=>n.id.name==='scheduleJob'), legacy=functions(expected.files[runtimePath]).find(n=>n.id.name==='scheduleJob');return text.slice(0,node.start)+expected.files[runtimePath].slice(legacy.start,legacy.end)+text.slice(node.end);}],
    ['missing Home opt-in', homePath, text => text.replace('const spokenProgram=spokenConsent.selected;', 'const spokenProgram=undefined;')],
    ['wrong Home consent module', homePath, text => text.replace("from '@/components/notifications/useWakeupSpokenConsent'", "from '@/synthetic-wrong-module'")],
    ['type-only Home consent import', homePath, text => text.replace('import {useWakeupSpokenConsent}', 'import {type useWakeupSpokenConsent}')],
    ['wrong Home React hooks module', homePath, text => text.replaceAll("from 'react'", "from 'synthetic-wrong-module'")],
    ['wrong Home account module', homePath, text => text.replaceAll("from '@/lib/authClient'", "from '@/synthetic-wrong-module'")],
    ['wrong Home plan module', homePath, text => text.replace("from '@shared/wakeupPlan.mjs'", "from '@shared/synthetic-wrong-module.mjs'")],
    ['wrong Home channel component', homePath, text => text.replace("from '@/components/notifications/WakeupChannelSelection'", "from '@/synthetic-wrong-module'")],
    ['Home consent local shadow', homePath, text => text.replace('const spokenProgram=spokenConsent.selected;', 'const useWakeupSpokenConsent=()=>({}); const spokenProgram=spokenConsent.selected;')],
    ['Home label incomplete', homePath, text => text.replace("both: 'Telegram + ligação VoIP',", '')],
    ['unknown cold writer', runtimePath, () => raw[runtimePath].replace("provider: 'both'", "provider: 'synthetic'")],
  ];
  for (const [label, file, mutate] of negatives) {
    const input = { ...modern, [file]: mutate(modern[file]) };
    assert.ok(input[file] !== modern[file], 'negative actually mutates: ' + label);
    const result = run(input);
    assert.notEqual(result.status, 0, 'must reject ' + label);
    assert.deepEqual(result.files, input, 'must reject before either write: ' + label);
    console.log('PASS reject ' + label);
  }
  // Rejection in Home must also precede a pending cold server transformation.
  const mixed = { ...raw, [homePath]: modern[homePath].replace('const spokenProgram=spokenConsent.selected;', 'const spokenProgram=undefined;') };
  const rejected = run(mixed); assert.notEqual(rejected.status, 0); assert.deepEqual(rejected.files, mixed);
  console.log(`PASS ${negatives.length + 1} rejected synthetic cases; no runtime imports or network executed`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
