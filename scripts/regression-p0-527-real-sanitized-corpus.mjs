import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const corpus = JSON.parse(fs.readFileSync('scripts/fixtures/p0-527/aims-real-sanitized-aug2026.json','utf8'));
const parserSource = fs.readFileSync('server/rosterParser.mjs','utf8');
assert.ok(parserSource.includes('function parseAimsTokensIntoEventsV3('), 'parser AIMS v3 ausente');

const tmp = path.join(os.tmpdir(), 'crewcheck-p0-527-' + process.pid + '.mjs');
fs.writeFileSync(tmp, parserSource + '\nexport { parseAimsTokensIntoEventsV3 };\n', 'utf8');
const { parseAimsTokensIntoEventsV3 } = await import(pathToFileURL(tmp).href + '?v=' + Date.now());
fs.unlinkSync(tmp);

const passCases = corpus.cases.filter((item) => item.status === 'PASS');
assert.ok(passCases.length >= 3, 'corpus precisa manter pelo menos 3 casos reais sanitizados PASS');

for (const item of passCases) {
  const events = parseAimsTokensIntoEventsV3(item.tokens, item.month, item.year);
  assert.equal(events.length, item.expected.events, item.id + ': quantidade de jornadas/eventos');
  const event = events[0];
  assert.equal(event.dutyReport, item.expected.dutyReport, item.id + ': APZ/dutyReport');
  assert.equal(event.legs.length, item.expected.legs, item.id + ': pernas');
  assert.equal(event.legs[0]?.flightNumber, item.expected.firstFlight, item.id + ': primeiro voo');
  if (item.expected.firstDeparture) assert.equal(event.legs[0]?.departureTime, item.expected.firstDeparture, item.id + ': primeira partida');
  if (item.expected.firstArrival) assert.equal(event.legs[0]?.arrivalTime, item.expected.firstArrival, item.id + ': primeira chegada');
  assert.equal(event.legs.at(-1)?.flightNumber, item.expected.lastFlight, item.id + ': último voo');
  assert.equal(event.legs.at(-1)?.arrivalTime, item.expected.lastArrival, item.id + ': última chegada');
  if (item.expected.noBogusCnaLeg) {
    assert.ok(!event.legs.some((leg) => leg.origin === leg.destination && !leg.flightNumber), item.id + ': CNA não pode virar perna falsa');
  }
}

const la3730 = passCases.find((x) => x.id.includes('la3730'));
assert.equal(la3730.expected.dutyReport, '09:25');
assert.notEqual(la3730.expected.dutyReport, '08:29', 'boundary anterior nunca pode virar APZ');
const la3246 = passCases.find((x) => x.id.includes('la3246'));
assert.equal(la3246.expected.dutyReport, '23:03');
assert.notEqual(la3246.expected.dutyReport, la3246.expected.firstDeparture, 'APZ nunca pode cair para STD');

const crewtopia = corpus.matrix.find((x) => x.source === 'CrewTopia JSON');
assert.equal(crewtopia.coverage, 'NOT_COVERED', 'ausência de adapter CrewTopia deve permanecer explícita, nunca PASS fabricado');
assert.ok(corpus.cases.some((x) => x.status === 'REVIEW'), 'ambiguidade real precisa permanecer REVIEW');

console.log('OK P0 #527 real sanitized AIMS corpus', { pass: passCases.length, review: corpus.cases.filter(x=>x.status==='REVIEW').length });
