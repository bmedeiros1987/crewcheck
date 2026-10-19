import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareConciergeCanonicalBridge } from '../p1-concierge-journey/bridge.mjs';
import { profile, leg, day, snapshot } from '../fixtures/concierge-duty-facts/synthetic.mjs';
prepareConciergeCanonicalBridge();
const { buildDutyFacts } = await import('../../server/concierge/duty-facts.mjs');
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
  assert.equal(result.items.length, 0); assert.match(result.summary, /estrutura.*incompletas/);
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
