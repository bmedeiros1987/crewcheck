import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareConciergeCanonicalBridge } from '../p1-concierge-journey/bridge.mjs';
import { profile, leg, day, snapshot } from '../fixtures/concierge-duty-facts/synthetic.mjs';
prepareConciergeCanonicalBridge();
const { buildDutyFacts } = await import('../../server/concierge/duty-facts.mjs');
const { normalizeRosterDays } = await import('../../server/concierge/generated/canonicalRoster.mjs');
const read = (days = [day()], extra = {}) => buildDutyFacts({ profile, snapshot: snapshot(days), accessAllowed: true, ...extra });

test('real canonical measurement; full dates, source and snapshot limits; immutable input', () => {
  const input = snapshot(); const before = JSON.stringify(input);
  const result = read(undefined, { snapshot: input });
  assert.equal(result.items[0].minutes, 400);
  assert.match(result.summary, /6h40/); assert.match(result.summary, /10\/10\/2032/);
  assert.match(result.summary, /Atualização do snapshot/); assert.match(result.summary, /Correspondência com a escala ativa não comprovada/);
  assert.match(result.basis, /fuso original do documento não comprovado/);
  assert.match(result.summary, /conformidade: indeterminados/);
  assert.equal(JSON.stringify(input), before);
  assert(!result.summary.includes(profile.email)); assert(!result.basis.includes(profile.accessKeyHash));
});
for (const tz of ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']) test(`device timezone ${tz} does not change instants, labels or duration`, () => {
  const old = process.env.TZ;
  try { process.env.TZ = 'UTC'; const expected = read(); process.env.TZ = tz; assert.deepEqual(read(), expected); }
  finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});
for (const endpoint of ['dutyReport', 'dutyDebrief']) for (const source of ['estimated', 'unknown', 'absent']) test(`${endpoint} ${source} never becomes a measured duration`, () => {
  const result = read([day({ [endpoint + 'Source']: source })]);
  assert.equal(result.items[0].minutes, null); assert.match(result.summary, /Duração pendente/);
  assert(!result.summary.includes('0h00')); assert(!result.summary.includes('6h40'));
});
for (const endpoint of ['dutyReport', 'dutyDebrief']) test(`missing ${endpoint} stays unknown, never midnight`, () => {
  const result = read([day({ [endpoint]: null, [endpoint + 'Source']: 'absent' })]);
  assert.equal(result.items[0].minutes, null); assert(!result.summary.includes('00:00'));
});
test('explicit +2 boundary cannot be collapsed into a measured +0/+1 day', () => {
  const result = read([day({ dutyDebrief: '14:05(+2)' })]);
  assert.equal(result.items[0].minutes, null);
  assert.match(result.summary, /Deslocamento de data publicado não comprovado/);
  assert.match(result.basis, /14:05\(\+2\)/);
});
test('explicit +2 flight markers that disagree with canonical instants are pending', () => {
  const result = read([day({ legs: [leg({ departureTime: '08:20(+2)', arrivalTime: '13:35(+2)' })] })]);
  assert.equal(result.items[0].minutes, null);
});
test('canonical multiple civil days retain complete dates without boolean truncation', () => {
  const days = [day(), day({ date: '12/10/2032', dayNumber: 12, legs: [leg({ flightNumber: 'QA0002' })] })];
  const result = read(days);
  assert.equal(result.items.filter(x => x.kind === 'duty').length, 2);
  assert.match(result.summary, /12\/10\/2032/);
  const interval = result.items.find(x => x.kind === 'interval');
  assert(interval); assert.equal(interval.minutes, 2480);
});
test('unknown or estimated previous release cannot establish a rest interval', () => {
  const result = read([day({ dutyDebriefSource: 'estimated' }), day({ date: '12/10/2032', legs: [leg({ flightNumber: 'QA0002' })] })]);
  assert.equal(result.items.filter(x => x.kind === 'interval').length, 0);
});
test('intermediate standby availability blocks a claimed free rest interval', () => {
  const result = read([day(), day({ date: '11/10/2032', type: 'HSB', pairingCode: 'HSB', legs: [], dutyReport: '10:00', dutyDebrief: '18:00' }), day({ date: '12/10/2032', legs: [leg({ flightNumber: 'QA0002' })] })]);
  assert.equal(result.items.filter(x => x.kind === 'interval').length, 0);
});
test('malformed leg is unavailable instead of falling back to a clock or throwing', () => {
  const result = read([day({ legs: [null] })]);
  assert.equal(result.items.length, 0); assert.match(result.summary, /[Ee]strutura.*incompleta/);
});
test('standby code variant cannot create free time before or after availability', () => {
  const result = read([day(), day({ date: '11/10/2032', type: 'HSBE', pairingCode: 'HSBE', legs: [], dutyReport: '10:00', dutyDebrief: '18:00' }), day({ date: '12/10/2032' })]);
  assert.equal(result.items.filter(x => x.kind === 'interval').length, 0);
});
test('duplicate source days do not double count the same canonical journey', () => {
  assert.equal(read([day(), day()]).items.filter(x => x.kind === 'duty').length, 1);
  assert.equal(read([day(), day()]).items[0].minutes, 400);
});
test('duplicate source boundaries with conflicting provenance are not silently selected', () => {
  const result = read([day(), day({ dutyDebriefSource: 'estimated' })]);
  assert.equal(result.items.length, 0); assert.match(result.summary, /duplicados.*conflitantes/);
});
test('arrival and release conflicts are rejected in every published/estimated permutation', () => {
  const published = day(), estimated = day({ dutyDebrief: '15:05', dutyDebriefSource: 'estimated', legs: [leg({ arrivalTime: '13:36' })] });
  for (const days of [[published, estimated], [estimated, published], [published, published, estimated], [estimated, published, published]]) {
    const result = read(days); assert.equal(result.state, 'incomplete'); assert.equal(result.items.length, 0);
    assert.match(result.summary, /duplicados.*conflitantes/); assert(!result.summary.includes('6h40'));
    assert(!result.basis.includes('Extremos publicados comprovados'));
  }
});
test('same occurrence with conflicting arrival alone is never selected by source order', () => {
  const first = day(), second = day({ legs: [leg({ arrivalTime: '13:36' })] });
  for (const days of [[first, second], [second, first]]) assert.equal(read(days).items.length, 0);
});
test('same date/flight/route with changed departure is unproved rather than a new authoritative occurrence', () => {
  const a = day(), b = day({ legs: [leg({ departureTime: '08:21' })] });
  for (const days of [[a, b], [b, a]]) assert.equal(read(days).items.length, 0);
});
test('conflicting repeated occurrence inside one row is rejected before physical selection', () => {
  const result = read([day({ legs: [leg(), leg({ arrivalTime: '13:36' })] })]);
  assert.equal(result.items.length, 0); assert.match(result.summary, /duplicados.*conflitantes/);
});
test('legitimate identical duplicate remains measured in either source order', () => {
  const a = day(), b = structuredClone(a);
  for (const days of [[a, b], [b, a]]) { const result = read(days); assert.equal(result.state, 'available'); assert.equal(result.items.length, 1); assert.equal(result.items[0].minutes, 400); }
});
test('missing flight clock and invalid published date never expose fallback duration', () => {
  assert.equal(read([day({ legs: [leg({ arrivalTime: '' })] })]).items[0].minutes, null);
  assert.equal(read([day({ date: '31/02/2032' })]).items.length, 0);
});
test('old snapshot remains explicitly historical and updatedAt is not an import timestamp', () => {
  const result = read(undefined, { snapshot: snapshot(undefined, { updatedAt: '2020-01-01T12:00:00Z' }) });
  assert.match(result.summary, /01\/01\/2020/); assert.match(result.summary, /não comprovada/);
  assert.match(result.basis, /não comprova nova importação/);
  assert.equal(read(undefined, { snapshot: snapshot(undefined, { updatedAt: 'invalid' }) }).updatedAt, null);
});
test('snapshot revision changes with roster; callback signature also changes with metadata', () => {
  const original = read(); const changed = read([day({ dutyDebrief: '15:05' })]);
  assert.notEqual(original.revision, changed.revision); assert.notEqual(original.signature, changed.signature);
  const metadata = read(undefined, { snapshot: snapshot(undefined, { updatedAt: '2032-10-12T12:00:00Z' }) });
  assert.equal(original.revision, metadata.revision); assert.notEqual(original.signature, metadata.signature);
});
test('foreign owner/chat, denied access and absent snapshot expose no facts', () => {
  for (const extra of [{ accessAllowed: false }, { snapshot: null }, { snapshot: snapshot(undefined, { email: 'other@example.invalid' }) }, { snapshot: snapshot(undefined, { chatId: '456' }) }]) {
    const result = read(undefined, extra); assert.equal(result.items.length, 0); assert.equal(result.signature, null); assert(!result.summary.includes('07:25'));
  }
});
test('bounded summary and foundation retain essential warning at maximum supported roster size', () => {
  const result = read(Array.from({ length: 370 }, () => day()));
  assert(result.summary.length < 3900); assert(result.basis.length < 3900);
  assert.match(result.basis, /não há limite, irregularidade, extensão permitida ou autorização operacional/);
});
test('bounded pages cover all records and keep one snapshot signature', () => {
  const days = [10, 12, 14, 16].map(n => day({ date: `${n}/10/2032` }));
  const first = read(days), second = read(days, { page: 1 }), last = read(days, { page: 99 });
  assert.equal(first.pageCount, 3); assert.equal(second.page, 1); assert.equal(last.page, 2);
  assert.equal(first.signature, second.signature); assert.match(second.summary, /Página 2\/3/);
  assert.match(second.basis, /14:05/); assert(first.summary.length < 3900); assert(second.summary.length < 3900);
});
test('ISO date is explicitly refused before canonical day-1 fallback', () => {
  const result = read([day({ date: '2032-10-10' })]);
  assert.equal(result.state, 'incomplete'); assert.equal(result.items.length, 0);
  assert.match(result.summary, /DD\/MM\/AAAA/); assert(!result.summary.includes('6h40'));
  assert(!result.summary.includes('01/10/2032'));
});
test('complete published DD/MM/YYYY is accepted without normalizing the source', () => {
  const input = snapshot([day({ date: '10/10/2032', dayNumber: 10 })]);
  const before = JSON.stringify(input); const result = read(undefined, { snapshot: input });
  assert.equal(result.items[0].date, '2032-10-10'); assert.equal(result.items[0].minutes, 400);
  assert.match(result.summary, /10\/10\/2032, 07:25/); assert.equal(JSON.stringify(input), before);
});
test('unproved alternate publication formats are explicit pending, never inferred', () => {
  for (const date of ['10-OCT-2032', '10/10', '10/10/32']) {
    const result = read([day({ date })]); assert.equal(result.items.length, 0); assert.match(result.summary, /DD\/MM\/AAAA/);
  }
});
test('invalid civil dates never roll forward through Date normalization', () => {
  for (const date of ['31/02/2032', '29/02/2031', '00/10/2032', '10/13/2032', '2032-02-30', '10/10/0032']) {
    const result = read([day({ date })]); assert.equal(result.items.length, 0); assert.equal(result.state, 'incomplete');
  }
});
test('conflicting original date and normalized numeric components are rejected', () => {
  for (const extra of [{ dayNumber: 1 }, { month: 11 }, { year: 2033 }]) {
    const input = snapshot([day(extra)]), before = JSON.stringify(input);
    const result = read(undefined, { snapshot: input }); assert.equal(result.items.length, 0);
    assert.match(result.summary, /conflitante/); assert.equal(JSON.stringify(input), before);
  }
});
for (const [before, after, firstMonth, nextMonth, firstYear, nextYear] of [
  ['30/11/2032', '01/12/2032', 11, 12, 2032, 2032],
  ['31/12/2032', '01/01/2033', 12, 1, 2032, 2033],
]) test(`published overnight ${before} → ${after} retains month/year and measured duration`, () => {
  const first = day({ date: before, month: firstMonth, year: firstYear, dutyReport: '22:15', dutyDebrief: '23:55', legs: [leg({ departureTime: '23:10', arrivalTime: '23:55' })] });
  const second = day({ date: after, month: nextMonth, year: nextYear, dutyReport: '00:45', dutyDebrief: '02:40', legs: [leg({ flightNumber: 'QA0002', origin: 'GRU', destination: 'BSB', departureTime: '00:45', arrivalTime: '02:10' })] });
  const result = read([first, second]); const duty = result.items.find(item => item.kind === 'duty');
  assert.equal(duty.minutes, 265); assert.match(result.summary, new RegExp(before)); assert.match(result.summary, new RegExp(after));
});
test('exact independent-review fixture: official positive, refused ISO and both duplicate orders', () => {
  const original = { date: '10/10/2032', type: 'VOO', pairingCode: 'SYN', base: 'BSB', dutyReport: '07:25', dutyDebrief: '14:05', dutyReportSource: 'published', dutyDebriefSource: 'published',
    legs: [{ flightNumber: 'QA0001', origin: 'BSB', destination: 'GRU', departureTime: '08:20', arrivalTime: '13:35', workType: 'OP' }] };
  const positive = read([original]); assert.equal(positive.items[0].minutes, 400); assert.equal(positive.items[0].date, '2032-10-10');
  const iso = read([{ ...original, date: '2032-10-10' }]); assert.equal(iso.state, 'incomplete'); assert.equal(iso.items.length, 0); assert(!iso.summary.includes('01/10/2032'));
  const conflicting = { ...original, dutyDebrief: '15:05', dutyDebriefSource: 'estimated', legs: [{ ...original.legs[0], arrivalTime: '13:36' }] };
  for (const days of [[original, conflicting], [conflicting, original]]) {
    const result = read(days); assert.equal(result.state, 'incomplete'); assert(result.items.every(item => item.minutes === null));
    assert(!result.basis.includes('Extremos publicados comprovados'));
  }
});
test('previously normalized duplicates retain all preserved conflicting provenance', () => {
  const published = day(), estimated = day({ dutyDebrief: '15:05', dutyDebriefSource: 'estimated', legs: [leg({ arrivalTime: '13:36' })] });
  for (const days of [[published, estimated], [estimated, published]]) {
    const input = snapshot(days); input.roster = normalizeRosterDays(input.roster);
    assert.equal(input.roster.days[0].publishedClockEvidence.records.length, 2);
    const result = read(undefined, { snapshot: input }); assert.equal(result.state, 'incomplete'); assert.equal(result.items.length, 0);
    assert(!result.basis.includes('Extremos publicados comprovados'));
  }
});
test('normalized identical duplicates preserve the available positive measurement', () => {
  const input = snapshot([day(), day()]); input.roster = normalizeRosterDays(input.roster);
  const result = read(undefined, { snapshot: input }); assert.equal(result.state, 'available'); assert.equal(result.items[0].minutes, 400);
});
test('preserved arrival conflict alone is not erased by physical leg selection', () => {
  const input = snapshot([day(), day({ legs: [leg({ arrivalTime: '13:36' })] })]); input.roster = normalizeRosterDays(input.roster);
  assert.equal(read(undefined, { snapshot: input }).items.length, 0);
});

for(const reverse of [false,true])test(`ASB factual second block keeps its own APZ with partial duplicate reverse=${reverse}`,()=>{
 const first=leg({flightNumber:'QA-OWNER-1',origin:'BSB',destination:'GRU',departureTime:'08:00',arrivalTime:'09:00',presentationTime:undefined});
 const second=leg({flightNumber:'QA-OWNER-2',origin:'GRU',destination:'BSB',departureTime:'16:00',arrivalTime:'17:00',presentationTime:'15:00'});
 const full=day({type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyDebrief:'17:30',legs:[first,second]}),partial={...full,legs:[second]},days=reverse?[partial,full]:[full,partial],before=JSON.stringify(days),result=read(days);
 const own=result.items.filter(i=>i.kind==='duty'&&i.startLiteral==='15:00');assert(own.length);for(const item of own){assert.equal(item.start,Date.parse('2032-10-10T18:00:00Z'));assert.equal(item.minutes,150);}assert(!result.items.some(i=>i.minutes===870));assert.equal(JSON.stringify(days),before);
});
for(const explicit of [true,false])test(`ASB factual filtered row cannot acquire reserve03 explicit=${explicit}`,()=>{
 const raw=day({type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyDebrief:'19:30',legs:[
  leg({flightNumber:'QA-DROPPED',origin:'BSB',destination:'GRU',departureTime:'08:00',arrivalTime:'09:00',presentationTime:undefined}),
  leg({flightNumber:'QA-REINDEXED',origin:'CNF',destination:'SSA',departureTime:'16:00',arrivalTime:'17:00',presentationTime:explicit?'15:00':undefined}),
  leg({flightNumber:'QA-CONTINUATION',origin:'SSA',destination:'CNF',departureTime:'18:00',arrivalTime:'19:00',presentationTime:undefined}),
 ]});const result=read([raw]);assert.equal(result.items.length,1);assert.equal(result.items[0].start,explicit?Date.parse('2032-10-10T18:00:00Z'):null);assert.equal(result.items[0].minutes,explicit?270:null);assert(!result.summary.includes('16h30'));
});
for(const source of ['estimated','unknown',undefined])test(`ASB factual full duration remains pending with own APZ and row ${source}`,()=>{
 const raw=day({type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyReportSource:source,dutyDebrief:'09:30',legs:[leg({departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00'})]}),result=read([raw]);
 assert.equal(result.state,'incomplete');assert.equal(result.items[0].start,Date.parse('2032-10-10T10:00:00Z'));assert.equal(result.items[0].minutes,null);assert.match(result.summary,/Duração pendente/);assert(!result.summary.includes('6h30'));
});

for(const reverse of [false,true])test(`factual equivalent clock replicas never publish reserve00 reverse=${reverse}`,()=>{
 const early=leg({flightNumber:'QA-EARLY',origin:'CNF',destination:'GRU',departureTime:'04:00',arrivalTime:'05:00',presentationTime:undefined}),own=leg({flightNumber:'QA-CLOCK',origin:'GRU',destination:'BSB',departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00'});
 const full=day({type:'ASB',pairingCode:'ASB',dutyReport:'00:00',dutyDebrief:'09:30',legs:[early,own]}),partial={...full,legs:[{...own,departureTime:'8:00',arrivalTime:'9:00'}]},result=read(reverse?[partial,full]:[full,partial]);
 assert(!result.items.some(i=>i.minutes===570));assert(!result.items.some(i=>i.startLiteral==='07:00'&&i.start===Date.parse('2032-10-10T03:00:00Z')));
 // The factual adapter may reject differing literal duplicate records before
 // canonical measurement. It must never choose the earlier reserve by order.
 if(result.items.length)for(const item of result.items.filter(i=>i.startLiteral==='07:00')){assert.equal(item.start,Date.parse('2032-10-10T10:00:00Z'));assert.equal(item.minutes,150);}
});
for(const kind of ['earlier-block','estimated','missing-clock'])test(`factual nested evidence retains all uncertainty: ${kind}`,()=>{
 const own=leg({departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00'}),raw=day({type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyDebrief:'09:30',legs:[own]});
 const original={dutyReport:raw.dutyReport,dutyDebrief:raw.dutyDebrief,dutyReportSource:'published',dutyDebriefSource:'published',legs:[{departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00'}]};
 const child=kind==='earlier-block'?{...original,legs:[{departureTime:'04:00',arrivalTime:'05:00'},...original.legs]}:kind==='estimated'?{...original,dutyReportSource:'estimated'}:{...original,legs:[{...original.legs[0],arrivalTime:''}]};
 raw.publishedClockEvidence={...original,records:[{...original,records:[child]}]};const result=read([raw]);
 if(kind==='earlier-block'){assert.equal(result.items.length,1);assert.equal(result.items[0].start,Date.parse('2032-10-10T10:00:00Z'));assert.equal(result.items[0].minutes,150);}else{assert.equal(result.state,'incomplete');assert(!result.items.some(i=>i.minutes!==null));}
 assert(!result.items.some(i=>i.minutes===390));
});

for(const kind of ['estimated-container','earlier-container'])for(const order of ['alone','plain-first','preserved-first'])test(`normalized factual snapshot keeps incoming container: ${kind} ${order}`,()=>{
 const plain=day({type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyDebrief:'09:30',legs:[leg({departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00'})]});
 const leaf={dutyReport:'03:00',dutyDebrief:'09:30',dutyReportSource:'published',dutyDebriefSource:'published',legs:[{departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00'}]};
 const container=kind==='estimated-container'?{...leaf,dutyReportSource:'estimated',records:[leaf]}:{...leaf,legs:[{departureTime:'04:00',arrivalTime:'05:00'},...leaf.legs],records:[leaf]},preserved={...plain,publishedClockEvidence:container};
 const input=snapshot(order==='alone'?[preserved]:order==='plain-first'?[plain,preserved]:[preserved,plain]);input.roster=normalizeRosterDays(input.roster);const before=JSON.stringify(input),result=read(undefined,{snapshot:input});
 if(kind==='estimated-container'){assert.equal(result.state,'incomplete');assert.equal(result.items.length,0);}else{assert.equal(result.items.length,1);assert.equal(result.items[0].minutes,150);assert.equal(result.items[0].start,Date.parse('2032-10-10T10:00:00Z'));}assert(!result.items.some(i=>i.minutes===390));assert.equal(JSON.stringify(input),before);
});
for(const source of ['unknown','estimated',undefined])test(`factual later block is independent of previous report source ${source}`,()=>{
 const result=read([day({type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyReportSource:source,dutyDebrief:'19:30',legs:[
  leg({flightNumber:'QA-EARLY',origin:'BSB',destination:'GRU',departureTime:'08:00',arrivalTime:'09:00',presentationTime:undefined}),
  leg({flightNumber:'QA-LATER',origin:'CNF',destination:'SSA',departureTime:'16:00',arrivalTime:'17:00',presentationTime:'15:00'}),
  leg({flightNumber:'QA-LATER-END',origin:'SSA',destination:'CNF',departureTime:'18:00',arrivalTime:'19:00',presentationTime:undefined}),
 ]})]);assert.equal(result.items.length,1);assert.equal(result.items[0].minutes,270);assert.equal(result.items[0].start,Date.parse('2032-10-10T18:00:00Z'));assert.equal(result.items[0].end,Date.parse('2032-10-10T22:30:00Z'));
});
