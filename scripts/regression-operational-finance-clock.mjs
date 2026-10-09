import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const modules = loadClientModules({ files: ['client/src/lib/compensationPolicy.ts', 'client/src/lib/financialJourneyGrouping.ts', 'client/src/lib/financialForecastPeriods.ts', 'client/src/lib/financialAmounts.ts'], prefix: 'synthetic-operational-clock-' });
try {
  const policy = modules.load('compensationPolicy');
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  const ast = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['eventStartDateTime', 'eventEndDateTime', 'calculatePerDiem'];
  const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
  assert.equal(functions.length, names.length);
  const context = vm.createContext({ ...policy, ...modules.load('financialJourneyGrouping'), ...modules.load('financialForecastPeriods'), ...modules.load('financialAmounts'),
    perDiemConfig: () => ({ rates: { domestic: { mainMeal: 100, currency: 'BRL', label: 'SYNTHETIC' }, foreign: { mainMeal: 20, currency: 'USD', label: 'SYNTHETIC' } }, domesticBreakfast: 25, domesticMainMealSource: 'synthetic', domesticBreakfastSource: 'synthetic', breakfastPercent: .25, exchangeRates: { BRL: 1 }, source: 'SYNTHETIC — not a tariff', act: { version: 'SYNTHETIC' } }),
    loadAirportPerDiemOverrides: () => ({}), resolvePerDiemRule: origin => ({ rateKey: origin === 'INT' ? 'foreign' : 'domestic', airport: origin, reason: 'synthetic fixture' }),
    isOperationalEvent: () => true, financialEventCode: e => e.day.type, readOptionalNumberSetting: () => null,
    dateChip: d => d.toISOString().slice(0, 10), moneyCurrency: (v, c) => `${c} ${v}`,
  });
  vm.runInContext(ts.transpileModule(functions.map(n => n.getText(ast)).join('\n') + '\nglobalThis.calculate=calculatePerDiem;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const event = (id, start, end, report, kind = 'flight', origin = 'BSB') => ({ id, kind, origin, destination: 'BSB', presentation: report, day: { date: '05/10/2032', type: kind === 'flight' ? 'VOO' : 'ASB', dutyReport: report }, canonical: { kind, journeyId: id, startDateTime: start, endDateTime: end } });
  const roster = { year: 2032, month: 10, base: 'BSB' };
  const now = new Date('2032-10-08T00:30:00-03:00');
  const evidence = [];
  let expected;
  for (const timezone of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo']) {
    process.env.TZ = timezone;
    const run = events => context.calculate(events, roster, now);
    const reserve = event('SYN-ASB', '2032-10-09T04:10:00-03:00', '2032-10-09T10:10:00-03:00', '04:10', 'duty');
    const r = run([reserve]);
    assert.deepEqual(Array.from(r.rows, x => x.label), ['Café']);
    assert.equal(r.monthly, 25);
    const night = event('SYN-NIGHT', '2032-10-05T00:13:00-03:00', '2032-10-05T07:05:00-03:00', '23:18');
    const n = run([night]);
    assert.equal(n.rows.find(x => x.label === 'Ceia').iso, '2032-10-05');
    assert.ok(n.rows.every(x => x.calculationStart === '2032-10-05T02:18:00.000Z'));
    assert.ok(n.rows.every(x => x.source.includes('BRT (UTC-03)')));
    assert.equal(run([night, { ...night, id: 'SYN-DUPLICATE' }]).rows.length, n.rows.length);
    for (const bad of [{ ...night, presentation: '', day: {} }, { ...night, presentation: '99:99', day: {} }, { ...night, canonical: { ...night.canonical, endDateTime: '2032-10-04T01:00:00-03:00' } }]) {
      const pending = run([bad]);
      assert.equal(pending.rows.length, 0);
      assert.equal(pending.monthly, null);
      assert.equal(pending.monthlySummary.state, 'unclassified');
      assert.match(pending.unclassifiedItems[0].reason, /Intervalo operacional incompleto/);
      assert.equal(pending.currencySummary, 'Não calculável');
    }
    const foreign = run([event('SYN-USD', '2032-10-05T11:00:00-03:00', '2032-10-05T11:30:00-03:00', '10:05', 'flight', 'INT')]);
    assert.equal(foreign.rows[0].currency, 'USD');
    assert.equal(foreign.rows[0].value, 20);
    assert.equal(foreign.monthly, null);
    assert.deepEqual(Array.from(foreign.pendingCurrencies), ['USD']);
    const result = { timezone, reserve: r.rows.map(x => ({ iso: x.iso, label: x.label, value: x.value })), night: n.rows.map(x => ({ iso: x.iso, label: x.label, value: x.value, start: x.calculationStart })), cycle: [r.cycle.start.toISOString(), r.cycle.end.toISOString(), r.periods.previous.payment.toISOString()] };
    if (expected) assert.deepEqual({ ...result, timezone: null }, expected);
    else expected = { ...result, timezone: null };
    evidence.push(result);
  }
  assert.equal(policy.rosterPresentationBeforeDeparture(new Date('2032-10-05T00:05:00-03:00'), '23:18').toISOString(), '2032-10-05T02:18:00.000Z');
  assert.equal(policy.rosterPresentationBeforeDeparture(new Date('2032-10-05T12:00:00-03:00'), '01:00'), null);
  fs.mkdirSync('artifacts/operational-finance-clock', { recursive: true });
  fs.writeFileSync('artifacts/operational-finance-clock/report.json', JSON.stringify({ synthetic: true, evidence }, null, 2));
  console.log('PASS actual Home financial caller: BRT across 3 device timezones, midnight APZ, cycle, dedup, native currency and incomplete intervals');
} finally { modules.cleanup(); }
