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
  process.env.TZ = process.env.BREAKFAST_DEVICE_TZ || 'America/Sao_Paulo';
  const roster = { year: 2032, month: 10, base: 'BSB' };
  const instant = clock => `2032-10-05T${clock}:00-03:00`;
  const flight = (id, origin, destination, departure, arrival, report='04:05') => ({ ...event(id,instant(departure),instant(arrival),report), origin, destination, day:{type:'VOO',dutyReport:report}, canonical:{kind:'flight',journeyId:'SYN-DUTY',startDateTime:instant(departure),endDateTime:instant(arrival)} });
  const run = events => context.calculate(events, roster, new Date('2032-10-06T12:00:00-03:00'));
  const evidence = [];
  const check = (name, events, expected, evidenceId) => {
    const r = run(events), coffee = Array.from(r.rows).filter(x=>x.label==='Café');
    assert.equal(coffee.length,expected?1:0,name);
    if(expected) { assert.equal(coffee[0].value,25); assert.match(coffee[0].source,/Critério operacional informado pelo usuário/); assert.match(coffee[0].source,/sem homologação ACT/); if(evidenceId)assert.equal(coffee[0].eventId,evidenceId); }
    evidence.push({name,coffee:coffee.map(x=>({eventId:x.eventId,iso:x.iso,value:x.value})),synthetic:true});
  };
  check('base presentation in breakfast window',[flight('SYN-APZ','BSB','JPA','08:20','10:35','07:25')],true);
  check('outside base presentation and late base arrival',[flight('SYN-LATE','JPA','BSB','05:00','10:10')],false);
  check('outside base all morning',[flight('SYN-OUTSIDE','JPA','GRU','05:00','07:00')],false);
  check('base departure before breakfast',[flight('SYN-EARLY','BSB','GRU','04:50','06:00','04:05')],false);
  for(const [clock,expected] of [['04:59',false],['05:00',true],['07:05',true],['07:12',true],['08:00',true],['08:01',false],['10:10',false]])check('base arrival '+clock,[flight('SYN-ARRIVAL','JPA','BSB','03:00',clock,'02:05')],expected);
  const intermediate = flight('SYN-INTERMEDIATE','JPA','BSB','05:00','07:20');
  const onward = flight('SYN-ONWARD','BSB','GRU','08:15','10:10');
  check('intermediate arrival at base',[intermediate,onward],true,'SYN-INTERMEDIATE');
  check('duplicate canonical flight identity',[intermediate,{...intermediate,id:'SYN-DUPLICATE'},onward],true,'SYN-INTERMEDIATE');
  const reserve = (id,origin,type) => ({...event(id,instant('04:10'),instant('10:10'),'04:10','duty',origin),day:{type},origin,destination:origin});
  check('ASB physically at base',[reserve('SYN-ASB','BSB','ASB')],true);
  check('ASB outside base',[reserve('SYN-ASB-OTHER','JPA','ASB')],false);
  check('HSB is not physical base presence',[reserve('SYN-HSB','BSB','HSB')],false);
  check('ASB and flight breakfast dedup',[reserve('SYN-ASB','BSB','ASB'),flight('SYN-FLIGHT','BSB','GRU','06:30','08:30','05:35')],true);
  const hotel = flight('SYN-HOTEL','JPA','BSB','05:00','07:05');hotel.day.breakfastIncluded=true;check('hotel breakfast not paid twice',[hotel],false);
  fs.mkdirSync('artifacts/breakfast-base-presence',{recursive:true});fs.writeFileSync('artifacts/breakfast-base-presence/report.json',JSON.stringify({synthetic:true,evidence},null,2));
  console.log('PASS actual Home breakfast caller:18 reported-rule scenarios, base/time evidence, intermediate arrival, ASB/HSB, inclusive boundaries and dedup; clock-invariance reviewed separately');
} finally { modules.cleanup(); }
