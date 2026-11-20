import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {vacationForecast} from '../shared/financialVacationForecast.mjs';
const plan={ownerId:'fiction-A',revision:2,acquisition:{start:'2030-02-01',end:'2031-01-31'},periods:[{id:'first',startDate:'2031-07-01',days:15},{id:'second',startDate:'2031-12-20',days:15}]};
const source={kind:'manual_scenario',itemId:'remuneration',id:'synthetic-receipt',revision:1,reviewed:true};
const evidence={ownerId:plan.ownerId,planRevision:2,acquisition:{...plan.acquisition},earnings:[{id:'average',component:'total',source,amountMinor:600000,basis:'monthly_average',periodId:'first'},{id:'average-second',component:'total',source:{...source,id:'synthetic-second-concession'},amountMinor:600000,basis:'monthly_average',periodId:'second'}],deductions:plan.periods.flatMap(p=>['retention','consigned','advance'].map(kind=>({id:p.id+kind,component:'total',source:{...source,itemId:p.id+kind},amountMinor:0,periodId:p.id,kind}))),earningsComplete:true,deductionsComplete:true};
const run=(p=plan,e=evidence,ownerId='fiction-A')=>vacationForecast({ownerId,plan:p,evidence:e,lawApplicable:true});
assert.equal(run().periods[0].earningsMinor,300000);
assert.equal(run().periods[0].thirdMinor,100000);
assert.equal(run().periods[0].grossMinor,400000);
assert.equal(run().periods[0].netMinor,400000);
assert.equal(run().periods[1].deadlineDate,'2031-12-18');
assert.equal(run({...plan,periods:[{id:'first',startDate:'2031-07-01',days:30}]},{...evidence,earnings:[evidence.earnings[0]]}).periods[0].grossMinor,800000);
const proportional={...evidence,earnings:[{id:'period',component:'total',source,amountMinor:300000,basis:'period_amount',periodId:'first'}],earningsComplete:false};
assert.equal(run(plan,proportional).periods[0].knownSubtotalMinor,400000,'already proportional must not be halved again');
assert.equal(run(plan,proportional).periods[0].grossMinor,null);
assert.equal(run(plan,proportional).periods[1].knownSubtotalMinor,null,'absence is not zero');
assert.equal(run(plan,{...evidence,earnings:[]}).periods[0].grossMinor,null);
assert.equal(run(plan,{...evidence,earnings:[{...evidence.earnings[0],amountMinor:0}]}).periods[0].grossMinor,0);
const deductions=[{id:'tax',component:'total',source:{...source,itemId:'tax'},periodId:'first',kind:'retention',amountMinor:20000},{id:'loan',component:'total',source:{...source,itemId:'loan'},periodId:'first',kind:'consigned',amountMinor:30000},{id:'advance',component:'total',source:{...source,itemId:'advance'},periodId:'first',kind:'advance',amountMinor:100000}];
assert.equal(run(plan,{...evidence,deductions}).periods[0].netMinor,250000);
assert.equal(run(plan,{...evidence,deductions}).periods[0].grossMinor,400000,'consigned/advance do not reduce earnings or tax base');
assert.equal(run(plan,{...evidence,deductionsComplete:false}).periods[0].netMinor,null);
for(const bad of [{...evidence,ownerId:'fiction-B'},{...evidence,planRevision:1},{...evidence,acquisition:{...evidence.acquisition,end:'2031-02-28'}},{...evidence,earnings:[null]},{...evidence,earnings:[{...evidence.earnings[0],source:{...source,reviewed:false}}]},{...evidence,earnings:[{...evidence.earnings[0],amountMinor:-1}]}])assert.equal(run(plan,bad).periods[0]?.grossMinor??null,null);
assert.equal(run(plan,{...evidence,deductions:[...deductions,deductions[2]]}).periods[0].grossMinor,400000,'invalid deductions preserve valid earnings');
assert.equal(run(plan,{...evidence,deductions:[...deductions,deductions[2]]}).periods[0].netMinor,null);
assert.equal(vacationForecast({ownerId:'fiction-A',plan,evidence,lawApplicable:false}).periods[0].knownSubtotalMinor,null);
assert.equal(vacationForecast({ownerId:'fiction-A',plan,evidence,lawApplicable:false}).periods[0].deadlineDate,null);
assert.equal(run(plan,{...evidence,earnings:[{...evidence.earnings[0],amountMinor:NaN}]}).periods[0].knownSubtotalMinor,null);
assert.equal(run(plan,{...evidence,earnings:[...evidence.earnings,evidence.earnings[0]]}).periods[0].knownSubtotalMinor,null,'same evidence identity cannot be counted twice');
assert.equal(run(plan,evidence,'fiction-B').periods.length,0);
for(const periods of [[{id:'x',startDate:'2031-07-01',days:20}],[plan.periods[0],{...plan.periods[1],startDate:'2031-07-10'}]])assert.equal(run({...plan,periods}).periods.length,0);
assert.equal(run({...plan,periods:[{id:'first',startDate:null,days:15}]},{...evidence,earnings:[evidence.earnings[0]]}).periods[0].deadlineDate,null);
const original=JSON.stringify({plan,evidence});run();assert.equal(JSON.stringify({plan,evidence}),original);

assert.equal(run(plan,{...evidence,earnings:[evidence.earnings[0]]}).periods[1].knownSubtotalMinor,null,'one concession cannot silently supply another');
console.log('PASS vacation forecast: synthetic 30/15+15, proportional versus monthly, sourced acquisition, partial/zero, deductions/advance, isolation/revision, overlap and deadline; no persistence or network');

const {outputFiles} = await build({
  entryPoints: [fileURLToPath(new URL('../client/src/lib/vacationRosterWindows.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const {vacationRosterWindows} = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
const forecastOwner = 'fiction-A';
const february = '2032-02';
const march = '2032-03';
const day = (date, type = 'VC', pairingCode = '', fields = {}) => ({
  date, type, pairingCode, legs: [], dutyReport: null, dutyDebrief: null, ...fields,
});
const publication = (competence, days, overrides = {}) => ({
  ownerId: forecastOwner,
  competence,
  isCurrent: () => true,
  roster: {
    year: Number(competence.slice(0, 4)), month: Number(competence.slice(5)),
    crewId: 'SYNTHETIC-ONLY', crewName: 'Synthetic crew', base: '', rank: '', rawText: '', days,
  },
  ...overrides,
});
const selected = (start = '2032-02-01', end = '2032-02-29') => ({valid: true, start, end, kind: 'custom'});
const firstHalf = {month: february, half: 1};
const secondHalf = {month: february, half: 2};
const nextMonth = {month: march, half: 1};
const observe = (sources, range = selected(), ownerId = forecastOwner) => vacationRosterWindows(sources, range, ownerId);
const clear = windows => ({windows, ambiguous: false});
const disputed = {windows: [], ambiguous: true};

for (const vacation of [
  day('15/02/2032'), day('15/02/2032', 'DO', 'VC'), day('15/02/2032', 'FÉRIAS'),
]) {
  assert.deepEqual(observe([publication(february, [vacation])]), clear([firstHalf]));
}

const crossing = publication(february, [day('16/02/2032'), day('15/02/2032')]);
assert.deepEqual(observe([crossing]), clear([firstHalf, secondHalf]), 'a partial source proves only the observed civil fortnights, in order');
assert.deepEqual(observe([crossing], selected('2032-02-15', '2032-02-15')), clear([firstHalf]));
assert.deepEqual(observe([crossing], selected('2032-02-16', '2032-02-16')), clear([secondHalf]));

const monthEdge = publication(february, [day('29/02/2032'), day('01/03/2032')]);
const acrossMonths = selected('2032-02-29', '2032-03-01');
assert.deepEqual(observe([monthEdge], acrossMonths), clear([secondHalf]), 'a carry row does not establish the adjacent nominal month');
assert.deepEqual(observe([publication(march, [day('01/03/2032')]), monthEdge], acrossMonths), clear([secondHalf, nextMonth]));

const vacation = day('15/02/2032', 'DO', 'VC');
const conflicting = day('15/02/2032', 'DO', 'OFF');
for (const days of [[vacation, conflicting], [conflicting, vacation]]) {
  assert.deepEqual(observe([publication(february, days)]), disputed, 'competing codes cannot be resolved by row order');
}
const v1 = publication(february, [vacation]);
const v2 = publication(february, [conflicting]);
for (const sources of [[v1, v2], [v2, v1]]) {
  assert.deepEqual(observe(sources), disputed, 'competing current publications cannot be resolved by source order');
}
assert.deepEqual(observe([publication(february, [vacation, {...vacation}])]), clear([firstHalf]), 'an identical day row does not earn a second hint');
assert.deepEqual(observe([v1, {...v1}]), clear([firstHalf]), 'the same published roster supplied twice does not create a competing revision');

for (const nonVacation of [
  day('15/02/2032', 'ASB', 'VC'),
  day('15/02/2032', 'FOLGA', 'VC'),
  day('15/02/2032', 'OTHER', 'VC'),
  day('15/02/2032', '', 'VC'),
  day('15/02/2032', 'OTHER', '', {title: 'Férias', rawText: 'VC'}),
  day('15/02/2032', 'VC', '', {continuityInferred: true}),
  day('15/02/2032', 'VC', '', {placeholder: true}),
  day('30/02/2032'),
  day('12/02'),
]) {
  assert.deepEqual(observe([publication(february, [nonVacation])]).windows, [], `invalid or unsubstantiated vacation row: ${JSON.stringify(nonVacation)}`);
}

assert.deepEqual(observe([]), clear([]));
assert.deepEqual(observe([publication(february, [])]), clear([]));
assert.deepEqual(observe([v1], {...selected(), valid: false}).windows, []);
assert.deepEqual(observe([v1], selected('2032-02-30', '2032-03-01')).windows, []);
assert.deepEqual(observe([v1], selected('2032-02-16', '2032-02-15')).windows, []);
assert.deepEqual(observe([v1], selected(), 'fiction-B').windows, []);
assert.deepEqual(observe([{...v1, competence: march}]).windows, [], 'the source and its embedded roster must agree on competence');
assert.deepEqual(observe([{...v1, isCurrent: () => false}]).windows, [], 'obsolete publication or session cannot supply a hint');
assert.deepEqual(observe([v1, {...v2, isCurrent: () => false}]), clear([firstHalf]), 'an obsolete revision cannot override the current source');

const immutable = [publication(february, [day('16/02/2032'), day('15/02/2032')])];
const immutableRange = selected();
const before = JSON.stringify({immutable, immutableRange});
observe(immutable, immutableRange);
assert.equal(JSON.stringify({immutable, immutableRange}), before, 'reading observations leaves the roster and selection unchanged');
console.log('PASS vacation roster windows: explicit published codes, civil fortnights, nominal month coverage, ambiguity, owner/current revision and immutable inputs');
