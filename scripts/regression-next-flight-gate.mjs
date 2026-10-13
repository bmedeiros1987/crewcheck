// Regressão simulada do próximo voo/portão no celular e no CrewWatch.
// Só fixtures sintéticas: nenhuma rede, credencial, Cirium, FlightAware ou relógio físico.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.env.NEXT_FLIGHT_GATE_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'next-flight-gate-'));
const entry = path.join(out, 'entry.ts');
fs.writeFileSync(entry, `
export { buildCanonicalRosterEvents } from ${JSON.stringify(path.join(root, 'client/src/lib/canonicalRoster.ts'))};
export * from ${JSON.stringify(path.join(root, 'client/src/lib/nextFlightGate.ts'))};
export { applyNextFlightToWatchSnapshot } from ${JSON.stringify(path.join(root, 'client/src/lib/nextFlightWatch.ts'))};
export { buildCrewCheckWatchSnapshot } from ${JSON.stringify(path.join(root, 'client/src/lib/watchContext.ts'))};
`);
await build({
  entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: path.join(out, 'bundle.mjs'),
  alias: { '@': path.join(root, 'client/src') }, logLevel: 'silent',
});
const m = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href);

const H = 60 * 60 * 1000;
const NOW = Date.parse('2026-10-11T22:00:00Z');
function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}
function flight(id, number, startIso, origin = 'GRU', destination = 'REC', extra = {}) {
  return { id, kind: 'flight', flightNumber: number, origin, destination, presentation: '18:20', departure: '19:05', arrival: '22:10',
    gate: 'A confirmar', status: '', date: new Date(startIso), canonical: { id: `c-${id}`, startDateTime: startIso, endDateTime: new Date(Date.parse(startIso) + 3 * H).toISOString() }, ...extra };
}

// 1. Seleção do próximo voo: ordem por instante absoluto, ignora atividade em solo e voo já partido.
{
  const departed = flight('a', 'LA3001', new Date(NOW - 2 * H).toISOString());
  const duty = { id: 'd', kind: 'duty', flightNumber: 'SBY', date: new Date(NOW + H), canonical: { startDateTime: new Date(NOW + H).toISOString() } };
  const later = flight('c', 'LA3003', new Date(NOW + 5 * H).toISOString());
  const sooner = flight('b', 'LA3002', new Date(NOW + 2 * H).toISOString());
  assert.equal(m.selectNextFlight([later, departed, duty, sooner], NOW)?.id, 'b');
  const delayed = flight('e', 'LA3005', new Date(NOW - 10 * 60_000).toISOString());
  assert.equal(m.selectNextFlight([later, delayed], NOW)?.id, 'e', 'voo atrasado ainda no portão continua sendo o próximo');
  assert.equal(m.selectNextFlight([departed, duty], NOW), null, 'sem voo futuro não inventa programação');
  assert.equal(m.selectNextFlight([{ ...sooner, placeholder: true }], NOW), null);
}

// 2. Virada de data: 23:50 e 00:40 locais seguem o instante absoluto, em qualquer fuso do processo.
{
  const beforeMidnight = flight('n1', 'LA3100', '2026-10-12T02:50:00Z');
  const afterMidnight = flight('n2', 'LA3102', '2026-10-12T03:40:00Z');
  assert.equal(m.selectNextFlight([afterMidnight, beforeMidnight], NOW)?.id, 'n1');
  const expected = '2026-10-11';
  assert.equal(m.flightOperationalDate(beforeMidnight), expected, 'data operacional BRT permanece estável na chave Radar');
}

const next = flight('x', 'LA3377', new Date(NOW + 3 * H).toISOString());
const radarBase = { ok: true, gate: '9', terminal: '1', status: 'Programado', departure: new Date(NOW + 3 * H).toISOString(), sourceOrigin: 'GRU', sourceDestination: 'REC', updatedAt: NOW - 5 * 60_000 };

// 3. Portão de embarque ≠ posição da aeronave ≠ portão de outro trecho/dia.
{
  const ok = m.resolveNextFlightGate({ event: next, radar: radarBase, now: NOW });
  assert.equal(ok.gate, '9'); assert.equal(ok.gateSource, 'radar'); assert.equal(ok.terminal, '1'); assert.equal(ok.stale, false);
  for (const position of ['POS 12', 'STAND 5', 'Box 3', 'POS12', 'posição 4']) {
    const r = m.resolveNextFlightGate({ event: next, radar: { ...radarBase, gate: position }, now: NOW });
    assert.equal(r.gate, '', `posição "${position}" não pode virar portão`);
    assert.equal(r.radarRejected, 'position');
  }
  const previousLeg = m.resolveNextFlightGate({ event: next, radar: { ...radarBase, gate: '11', sourceOrigin: 'REC', sourceDestination: 'GRU' }, now: NOW });
  assert.equal(previousLeg.gate, ''); assert.equal(previousLeg.radarRejected, 'other-segment');
  const otherDay = m.resolveNextFlightGate({ event: next, radar: { ...radarBase, gate: '15', departure: new Date(NOW + 3 * H - 24 * H).toISOString() }, now: NOW });
  assert.equal(otherDay.gate, ''); assert.equal(otherDay.radarRejected, 'other-day', 'ocorrência do dia anterior é recusada');
  const notOk = m.resolveNextFlightGate({ event: next, radar: { ...radarBase, ok: false }, now: NOW });
  assert.equal(notOk.gate, '');
  assert.deepEqual(m.normalizeBoardingGate('Portão 24'), { gate: '24', remote: false, position: false });
  assert.equal(m.normalizeBoardingGate('A confirmar').gate, '');
  assert.equal(m.normalizeBoardingGate('—').gate, '');
}

// 4. Dado ausente e dado antigo.
{
  const missing = m.resolveNextFlightGate({ event: next, radar: null, now: NOW });
  assert.equal(missing.gate, ''); assert.equal(missing.gateSource, null); assert.equal(m.gateDisplay(missing), 'Não informado');
  assert.equal(missing.status, '', 'status ausente não é inventado');
  const stale = m.resolveNextFlightGate({ event: next, radar: { ...radarBase, updatedAt: NOW - 45 * 60_000 }, now: NOW });
  assert.equal(stale.gate, '9'); assert.equal(stale.stale, true, 'Radar com mais de 30 min fica desatualizado');
  const future = m.resolveNextFlightGate({ event: next, radar: { ...radarBase, updatedAt: NOW + 10 * 60_000 }, now: NOW });
  assert.equal(future.stale, true, 'carimbo futuro não conta como atualizado');
}

// 5. Mudança de aeronave/portão e janela de alerta (descanso).
{
  const before = m.resolveNextFlightGate({ event: next, radar: radarBase, now: NOW });
  const after = m.resolveNextFlightGate({ event: next, radar: { ...radarBase, gate: '12', registration: 'PR-XYZ', aircraft: 'A321' }, now: NOW });
  assert.notEqual(before.gate, after.gate);
  assert.equal(m.gateChangeAlertAllowed(Date.parse(next.canonical.startDateTime), NOW), true, 'dentro da janela operacional vibra');
  assert.equal(m.gateChangeAlertAllowed(NOW + 20 * H, NOW), false, 'longe do voo é período de descanso: sem notificação');
  assert.equal(m.gateChangeAlertAllowed(NOW - 2 * H, NOW), false);
  assert.equal(m.gateChangeAlertAllowed(NaN, NOW), false);
}

// 6. Ajuste manual: voo + data, autoria/horário, divergência visível sem substituição silenciosa.
{
  const storage = memoryStorage();
  const bad = m.writeManualGate(storage, 'conta-a', next, { gate: 'POS 7', author: 'Ana' }, NOW);
  assert.equal(bad.ok, false, 'posição da aeronave não é aceita como portão manual');
  const saved = m.writeManualGate(storage, 'conta-a', next, { gate: ' 24 ', terminal: 'T2', author: 'Ana Souza' }, NOW);
  assert.equal(saved.ok, true);
  const manual = m.readManualGate(storage, 'conta-a', next);
  assert.equal(manual.gate, '24'); assert.equal(manual.terminal, '2'); assert.equal(manual.author, 'Ana Souza'); assert.equal(manual.setAtEpochMs, NOW);
  assert.equal(manual.flight, 'LA3377'); assert.equal(manual.date, m.flightOperationalDate(next));
  const resolved = m.resolveNextFlightGate({ event: next, radar: radarBase, manual, now: NOW });
  assert.equal(resolved.gate, '24', 'manual permanece'); assert.equal(resolved.gateSource, 'manual');
  assert.deepEqual(resolved.divergence, { manualGate: '24', sourceGate: '9', source: 'radar' });
  const sameFlightOtherDay = flight('y', 'LA3377', new Date(NOW + 27 * H).toISOString());
  assert.equal(m.readManualGate(storage, 'conta-a', sameFlightOtherDay), null, 'portão manual não vaza para o mesmo voo em outra data');
  m.writeManualGate(storage, 'conta-a', next, { gate: '', author: 'Ana' }, NOW);
  assert.equal(m.readManualGate(storage, 'conta-a', next), null, 'remoção explícita');
}

// 6b. Identidade do portão manual usa a data publicada, independente do fuso do aparelho.
{
  const storage = memoryStorage();
  const published = { ...next, canonical: { ...next.canonical, date: '2026-10-11' } };
  assert.equal(m.manualGateIdentity(published), 'LA3377|2026-10-11|GRU|REC');
  m.writeManualGate(storage, 'conta-a', published, { gate: '5', author: 'Ana' }, NOW);
  assert.equal(m.readManualGate(storage, 'conta-a', published)?.date, '2026-10-11');
}

// 7. Troca de conta: portão manual pertence à conta.
{
  const storage = memoryStorage();
  m.writeManualGate(storage, m.manualGateAccountKey({ id: 'u-1' }), next, { gate: '30', author: 'A' }, NOW);
  assert.equal(m.readManualGate(storage, m.manualGateAccountKey({ id: 'u-1' }), next)?.gate, '30');
  assert.equal(m.readManualGate(storage, m.manualGateAccountKey({ id: 'u-2' }), next), null);
  assert.equal(m.readManualGate(storage, m.manualGateAccountKey(null), next), null);
}

// 8. Cache Radar: mesma chave do FlightDeck; outro voo/data/trecho é ignorado.
{
  const storage = memoryStorage();
  const key = m.radarSnapshotStorageKey(next);
  assert.equal(key, `CREWCHECK_RADAR_V2:X:LA3377:GRU:REC`, 'mesma chave já usada pelo FlightDeck');
  storage.setItem(key, JSON.stringify({ ...radarBase, flight: 'LA3377', operationalDate: m.flightOperationalDate(next), origin: 'GRU', destination: 'REC' }));
  assert.equal(m.readCachedRadarForFlight(storage, next, NOW)?.gate, '9');
  storage.setItem(key, JSON.stringify({ ...radarBase, flight: 'LA3377', operationalDate: '2026-01-01', origin: 'GRU', destination: 'REC' }));
  assert.equal(m.readCachedRadarForFlight(storage, next, NOW), null);
}

// 9. Consistência celular-relógio: o snapshot usa exatamente a decisão do card.
{
  const duty = { id: 'pres', kind: 'duty', flightNumber: 'APRES', origin: 'GRU', destination: 'GRU', presentation: '18:20', canonical: { id: 'c-pres', startDateTime: new Date(NOW + H).toISOString(), endDateTime: new Date(NOW + 2 * H).toISOString() } };
  const events = [duty, next];
  // Primário é o próprio voo.
  const infoPrimary = m.resolveNextFlightGate({ event: next, radar: radarBase, now: NOW });
  const snap = m.applyNextFlightToWatchSnapshot(m.buildCrewCheckWatchSnapshot([next], next, null, NOW, false), infoPrimary, { primaryEventId: next.id, nextFlightScheduleId: next.canonical.id });
  assert.equal(snap.gate, infoPrimary.gate); assert.equal(snap.currentFlight, 'LA3377');
  assert.equal(snap.schedule.find((item) => item.id === next.canonical.id)?.gate, '9');
  assert.ok(snap.validUntilEpochMs <= radarBase.updatedAt + m.RADAR_GATE_STALE_MS, 'validade nunca supera o Radar');
  assert.ok(snap.validUntilEpochMs >= snap.generatedAtEpochMs);
  // Primário é atividade em solo: o relógio ainda mostra o próximo voo com o mesmo portão.
  const infoManual = m.resolveNextFlightGate({ event: next, radar: radarBase, manual: { gate: '24', flight: 'LA3377', date: m.flightOperationalDate(next), origin: 'GRU', destination: 'REC', setAtEpochMs: NOW, author: 'Ana' }, now: NOW });
  const snap2 = m.applyNextFlightToWatchSnapshot(m.buildCrewCheckWatchSnapshot(events, duty, null, NOW, false), infoManual, { primaryEventId: duty.id, nextFlightScheduleId: next.canonical.id });
  assert.equal(snap2.nextFlight, 'LA3377');
  assert.match(snap2.nextDetail, /GRU → REC • P24/);
  assert.ok(snap2.nextDetail.length <= 64);
  // Portão ausente aparece como não informado, nunca como valor inventado.
  const snap3 = m.applyNextFlightToWatchSnapshot(m.buildCrewCheckWatchSnapshot(events, duty, null, NOW, false), m.resolveNextFlightGate({ event: next, now: NOW }), { primaryEventId: duty.id, nextFlightScheduleId: next.canonical.id });
  assert.match(snap3.nextDetail, /Portão não informado/);
  // Radar antigo deixa o relógio em "Dados antigos" (validade = geração).
  const staleInfo = m.resolveNextFlightGate({ event: next, radar: { ...radarBase, updatedAt: NOW - 50 * 60_000 }, now: NOW });
  const snap4 = m.applyNextFlightToWatchSnapshot(m.buildCrewCheckWatchSnapshot([next], next, null, NOW, false), staleInfo, { primaryEventId: next.id, nextFlightScheduleId: next.canonical.id });
  assert.equal(snap4.validUntilEpochMs, snap4.generatedAtEpochMs);
  assert.match(snap4.detail, /Radar desatualizado/);
  // Divergência também chega ao relógio.
  const snap5 = m.applyNextFlightToWatchSnapshot(m.buildCrewCheckWatchSnapshot([next], next, null, NOW, false), infoManual, { primaryEventId: next.id, nextFlightScheduleId: next.canonical.id });
  assert.equal(snap5.gate, '24'); assert.match(snap5.detail, /Fonte indica portão 9/);
}

// Construtor canônico real: DD/MM/YYYY publicado, sem substituí-lo por fixture ISO.
{
  const roster = { year:2032, month:10, base:'BSB', rank:'CC', airline:'LA', crewName:'SYNTHETIC', days:[{
    date:'11/10/2032', year:2032, month:10, type:'VOO', pairingCode:'QA', base:'BSB', dutyReport:'23:00', dutyDebrief:'02:30', dutyReportSource:'published', dutyDebriefSource:'published',
    legs:[{flightNumber:'QA3377',origin:'GRU',destination:'REC',departureTime:'23:50',arrivalTime:'02:00',duration:2+10/60,presentationTime:'23:00',workType:'OP',aircraftType:'SYNTHETIC'}],rawText:'SYNTHETIC ONLY',
  }] };
  const real = m.buildCanonicalRosterEvents(roster).find(item=>item.kind==='flight');
  assert.equal(real.date,'11/10/2032');
  const event = {...real,canonical:real,date:new Date(real.startDateTime),gate:'7'};
  const now = Date.parse(real.startDateTime)-10*60_000;
  const storage = memoryStorage();
  const radar = {...radarBase,flight:'QA3377',gate:'9',origin:'GRU',destination:'REC',sourceOrigin:'GRU',sourceDestination:'REC',departure:real.startDateTime,updatedAt:now-60_000,operationalDate:'2032-10-11'};
  const originalTZ=process.env.TZ;
  try {
    process.env.TZ='America/Sao_Paulo';
    assert.equal(m.writeManualGate(storage,'synthetic',event,{gate:'24',author:'Synthetic'},now).ok,true);
    storage.setItem(m.radarSnapshotStorageKey(event),JSON.stringify(radar));
    for(const zone of ['America/Sao_Paulo','UTC','Pacific/Auckland']) {
      process.env.TZ=zone;
      assert.equal(m.manualGateIdentity(event),'QA3377|2032-10-11|GRU|REC',zone);
      assert.equal(m.flightOperationalDate(event),'2032-10-11',zone);
      assert.equal(m.readManualGate(storage,'synthetic',event)?.gate,'24',zone);
      const cached=m.readCachedRadarForFlight(storage,event,now);
      assert.equal(cached?.gate,'9',zone);
      const info=m.resolveNextFlightGate({event,radar:cached,now});
      assert.equal(info.operationalDate,'2032-10-11');assert.equal(info.departure,'23:50');
      const watch=m.applyNextFlightToWatchSnapshot(m.buildCrewCheckWatchSnapshot([event],event,null,now,false),info,{primaryEventId:event.id,nextFlightScheduleId:real.id});
      assert.equal(watch.gate,info.gate);assert.equal(watch.schedule.find(item=>item.id===real.id)?.gate,info.gate);
    }
    assert.equal(m.flightPublishedDate({...event,canonical:{...real,date:'31/02/2032'}}),'','invalid published date fails closed');
    assert.equal(m.writeManualGate(storage,'synthetic',{...event,canonical:{...real,date:'31/02/2032'}},{gate:'12',author:'Synthetic'},now).ok,false);
    assert.equal(m.readCachedRadarForFlight(storage,{...event,canonical:{...real,date:'31/02/2032'}},now),null,'invalid date cannot accept cached source');
  } finally { if(originalTZ===undefined)delete process.env.TZ;else process.env.TZ=originalTZ; }
}

// 10. Contratos estáticos das superfícies.
{
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const preview = read('client/src/components/v1391/HomeRosterPreview.tsx');
  assert.match(preview, /<NextFlightGateCard events=\{events\}\/>/, 'card abaixo da Escala rápida');
  const card = read('client/src/components/nextflight/NextFlightGateCard.tsx');
  assert.doesNotMatch(card, /useMemo\(\(\) => selectNextFlight/, 'próximo voo é recalculado com o relógio, não memorizado');
  const home = read('client/src/pages/Home.tsx');
  assert.match(home, /applyNextFlightToWatchSnapshot\(base, gateInfo/, 'relógio usa a decisão do card');
  assert.match(home, /<ManualGateEditor event=\{event\}\/>/, 'portão manual no Radar');
  assert.match(home, /gateChangeAlertAllowed\(eventStartDateTime\(event\)\.getTime\(\)\) \? 'background' : 'never'/);
  assert.match(home, /sourceOrigin: payload\.origin/);
  const css = read('client/src/components/nextflight/next-flight-gate.css');
  assert.doesNotMatch(css, /#(f59e0b|fbbf24|facc15|eab308|fde047|fcd34d|d97706|ca8a04|ffc107|ffd60a|ff9f0a)|\b(amber|yellow|gold)\b/i, 'amarelo é reservado a alterações da escala');
  for (const file of ['client/src/lib/nextFlightGate.ts', 'client/src/lib/nextFlightWatch.ts', 'client/src/components/nextflight/NextFlightGateCard.tsx', 'client/src/components/nextflight/ManualGateEditor.tsx', 'client/src/components/nextflight/useNextFlightGate.ts']) {
    assert.doesNotMatch(read(file), /\bfetch\(|XMLHttpRequest|\/api\//, `${file} não pode consultar fontes pagas`);
  }
}

fs.rmSync(out, { recursive: true, force: true });
console.log(`[next-flight-gate] seleção, virada de data, portão/posição, ausente/antigo, manual, conta e celular-relógio OK (TZ=${process.env.TZ || 'local'})`);
