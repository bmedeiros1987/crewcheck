// Structured cause of an allowance waiting on the owner's ACT declaration, end to end on the real
// resolver and the actual Home calculator (raw or prepared sources), synthetic and offline:
//  - resolveSharedAllowanceSlot tags only ACT-declaration pendings (missing / revoked / expired /
//    invalid / unavailable); reasons are unchanged; an account value (manual, explicit zero) or an
//    applicable declaration carries no cause, so it never asks for a redundant ACT;
//  - calculatePerDiem carries the cause on meal and taxi pending items of the period, so the
//    Diárias screen can show the notice for this period only; a declaration for another month
//    leaves this month pending; pending stays without amount, explicit zero stays 0.
// Counterproof (recorded in the PR): before a4099a89 (#1271) the same input without declaration
// fell back to the ACT table (109,44, source "act"); now it is pending. Mutants must fail by assertion.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const data = new Map(); let throwOnJournal = false;
globalThis.localStorage = { getItem: k => { if (throwOnJournal && String(k).startsWith('crewcheck_financial_act_applicability_v1:')) throw Error('synthetic storage failure'); return data.get(k) ?? null; }, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
globalThis.window = new EventTarget();
const LIBS = ['financialActApplicability', 'sharedAllowanceResolution', 'latamAllowanceCatalog', 'financialStatementLearning', 'financialAmounts', 'financialJourneyGrouping', 'financialIntervalEvidence', 'compensationPolicy', 'financialForecastPeriods', 'financialHistoryPeriods', 'financialRules', 'financialSettingStore'];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-pending-cause-'));
let counter = 0;

async function load(overrides = {}) {
  const out = path.join(dir, `libs-${counter++}.mjs`);
  await build({
    stdin: { contents: LIBS.filter(name => fs.existsSync(`client/src/lib/${name}.ts`)).map((name, index) => `export * as m${index} from './client/src/lib/${name}';`).join('\n'), resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { '@': path.resolve('client/src'), '@shared': path.resolve('shared') },
    plugins: [{ name: 'mutant', setup(b) { b.onLoad({ filter: /client[\\/]src[\\/]lib[\\/].*\.ts$/ }, args => {
      let contents = fs.readFileSync(args.path, 'utf8');
      for (const [from, to] of overrides[path.basename(args.path)] || []) { assert(contents.includes(from), `mutant anchor present: ${from.slice(0, 60)}`); contents = contents.replace(from, to); }
      return { loader: 'ts', contents };
    }); } }],
  });
  const libs = Object.assign({}, ...Object.values(await import(pathToFileURL(out).href)));
  // Actual Home functions (raw or prepared), with the same narrow environment as the existing callers test.
  let home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  for (const [from, to] of overrides['Home.tsx'] || []) { assert(home.includes(from), `mutant anchor present: ${from.slice(0, 60)}`); home = home.replace(from, to); }
  const ast = ts.createSourceFile('Home.tsx', home, 99, true, ts.ScriptKind.TSX);
  const names = ['perDiemConfig', 'calculatePerDiem', 'readOptionalNumberSetting', 'moneyBRL', 'moneyCurrency'];
  const fns = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
  assert.ok(['perDiemConfig', 'calculatePerDiem', 'readOptionalNumberSetting'].every(name => fns.some(n => n.name.text === name)), 'actual Home functions found');
  const context = vm.createContext({ ...libs, storage: { get: (key, fallback = '') => libs.isFinancialSetting(key) ? libs.readFinancialSetting(key, fallback) : (data.get(key) ?? fallback) }, readNumberSetting: () => 0, loadAirportPerDiemOverrides: () => ({}),
    isOperationalEvent: () => true, financialEventCode: e => e.day.type, eventStartDateTime: e => new Date(e.start), eventEndDateTime: e => new Date(e.end), dateChip: d => d.toISOString().slice(0, 10) });
  vm.runInContext(ts.transpileModule(fns.map(n => n.getText(ast)).join('\n') + '\nglobalThis.subject={calculatePerDiem};', { compilerOptions: { target: 99 } }).outputText, context);
  return { libs, calculate: context.subject.calculatePerDiem };
}

async function suite({ libs, calculate }) {
  data.clear(); throwOnJournal = false;
  const owner = 'synthetic-act-cause';
  data.set('crewcheck_auth_user', JSON.stringify({ id: owner, role: 'user' })); data.set('crewcheck_auth_token', 'synthetic-token');
  const key = libs.financialActStorageKey(owner);
  const plan = (history, change) => libs.planFinancialActChange(history, history.revision, change);
  const empty = { schema: 1, ownerId: owner, revision: 0, events: [] };
  const apply = (from, through = '2027-11-30') => ({ from, through, active: true, employer: 'TAM_LINHAS_AEREAS_SA', role: 'cabin', coverage: 'clause_1_2_included' });
  const setJournal = history => data.set(key, JSON.stringify(history));
  const slot = (date = '2026-10-20', owned = null) => libs.resolveSharedAllowanceSlot({ category: 'domestic', slot: 'mainMeal', date, context: libs.readFinancialActApplicability(), owned });
  const manualKey = 'crewcheck_financial_settings_v1:' + encodeURIComponent(owner) + ':crewcheck_perdiem_rate_domestic';

  // Resolver: cause per declaration state, reasons unchanged.
  let s = slot();
  assert.deepEqual([s.kind, s.value, s.actCause], ['pending', null, 'act_missing'], 'no declaration: pending with cause');
  assert.equal(s.reason, 'Empresa e ACT não confirmados para esta data. Confirme a aplicação financeira uma vez para o período.', 'reason unchanged');
  setJournal(plan(empty, apply('2026-01-01')));
  s = slot();
  assert.equal(s.kind, 'forecast', 'applicable declaration'); assert.equal(s.actCause, undefined, 'applicable: no cause');
  const revoked = plan(plan(empty, apply('2026-01-01')), { from: '2026-10-01', through: '2027-11-30', active: false });
  setJournal(revoked); s = slot();
  assert.deepEqual([s.kind, s.actCause, s.reason], ['pending', 'act_revoked', 'Aplicação financeira do ACT revogada para esta data.'], 'revoked');
  setJournal(plan(empty, apply('2026-01-01', '2026-09-30'))); s = slot();
  assert.deepEqual([s.kind, s.actCause, s.reason], ['pending', 'act_expired', 'Declaração financeira de ACT fora do período confirmado.'], 'expired');
  setJournal(plan(empty, apply('2026-11-01'))); s = slot();
  assert.deepEqual([s.kind, s.actCause], ['pending', 'act_missing'], 'declaration for another month leaves this month pending');
  data.set(key, '{corrupt'); s = slot();
  assert.deepEqual([s.kind, s.actCause, s.reason], ['pending', 'act_invalid', 'Declaração financeira de ACT inválida; dados preservados para revisão.'], 'invalid');
  data.delete(key); throwOnJournal = true; s = slot(); throwOnJournal = false;
  assert.deepEqual([s.kind, s.actCause, s.reason], ['pending', 'act_unavailable', 'Declaração financeira de ACT indisponível neste dispositivo; dados preservados.'], 'storage error');
  for (const value of [120, 0]) {
    s = slot('2026-10-20', { value, source: 'manual', description: 'synthetic manual', version: 'synthetic' });
    assert.deepEqual([s.kind, s.value, s.actCause], ['forecast', value, undefined], `account value ${value}: no redundant ACT`);
  }

  // Actual Home calculator: the cause reaches the period's pending items (meal and taxi).
  data.delete(key);
  const event = (date, start = '08:00', end = '17:00') => ({ id: 'synthetic-' + date + start, kind: 'duty', origin: 'GRU', destination: 'GRU', start: date + 'T' + start + ':00-03:00', end: date + 'T' + end + ':00-03:00', day: { type: 'ASB', dutyReport: start, dutyDebrief: end, dutyReportSource: 'published', dutyDebriefSource: 'published' } });
  const run = (start, end) => calculate([event('2026-10-20', start, end)], { year: 2026, month: 10, days: [], base: 'GRU' }, new Date('2026-10-20T15:00:00Z'));
  let result = run('11:00', '11:15');
  const meal = result.unclassifiedItems.filter(item => item.pendingKind === 'allowance_reference');
  assert.ok(meal.length > 0 && meal.every(item => item.actCause === 'act_missing' && item.iso === '2026-10-20'), 'meal pending carries the cause and its date');
  assert.equal(result.rows.length, 0); assert.equal(result.monthly, null, 'pending is never a numeric total');
  result = run('04:10', '12:00');
  const taxi = result.unclassifiedItems.filter(item => item.pendingKind === 'taxi_rate');
  assert.ok(taxi.length === 1 && taxi[0].actCause === 'act_missing', 'taxi waiting on the declaration carries the cause');
  data.set(manualKey, '0');
  result = run('11:00', '11:15');
  assert.ok(result.rows.length > 0 && result.rows.every(row => row.value === 0), 'explicit manual zero stays 0');
  assert.equal(result.unclassifiedItems.filter(item => item.actCause).length, 0, 'manual zero: nothing waits on the declaration');
  data.delete(manualKey);
  setJournal(plan(empty, apply('2026-01-01')));
  result = run('11:00', '11:15');
  assert.ok(result.rows.length > 0 && result.unclassifiedItems.filter(item => item.actCause).length === 0, 'valid declaration: no cause left');
}

await suite(await load());
const MUTANTS = {
  'resolver drops the cause': { 'sharedAllowanceResolution.ts': [['return { ...pending(reason), actCause };', 'return pending(reason);']] },
  'revoked reported as missing': { 'sharedAllowanceResolution.ts': [[": selection?.state === 'revoked' ? 'act_revoked'", ": selection?.state === 'revoked' ? 'act_missing'"]] },
  'cause on an account value': { 'sharedAllowanceResolution.ts': [["return { kind: 'forecast', value: roundCurrencyAmount(args.owned.value), currency: inspection.currency,", "return { actCause: 'act_missing', kind: 'forecast', value: roundCurrencyAmount(args.owned.value), currency: inspection.currency,"]] },
  'meal cause not propagated': { 'Home.tsx': [["reason: selected.reason, ...(selected.actCause ? { actCause: selected.actCause } : {}) });\n      if (selected.reference?.state", "reason: selected.reason });\n      if (selected.reference?.state"]] },
  'taxi cause not propagated': { 'Home.tsx': [["' · Tarifa de táxi para o período pendente. ' + selected.reason, ...(selected.actCause ? { actCause: selected.actCause } : {}) });", "' · Tarifa de táxi para o período pendente. ' + selected.reason });"]] },
};
let killed = 0;
for (const [name, overrides] of Object.entries(MUTANTS)) {
  let failure = null;
  try { await suite(await load(overrides)); } catch (error) { failure = error; }
  assert.ok(failure instanceof assert.AssertionError && !/mutant anchor present/.test(failure.message), `mutant "${name}" must be killed by an assertion (${failure?.message || 'survived'})`);
  killed++;
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`PASS ACT pending cause (real resolver + actual Home calculator): missing/revoked/expired/other-month/invalid/storage-error tagged with unchanged reasons; account value (incl. explicit 0) and valid declaration carry no cause; meal and taxi pending items carry it with their date; pending never numeric, zero stays 0; ${killed} mutants killed.`);
