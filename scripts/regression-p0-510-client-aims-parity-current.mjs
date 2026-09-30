import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checker = createChecker('P0 #510 — paridade cliente/servidor APZ x debriefing');
const { check } = checker;

const { load, cleanup } = loadClientModules({
  files: ['client/src/lib/rosterCodes.ts', 'client/src/lib/aimsParser.ts'],
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  prefix: 'crewcheck-client-510-current-',
  expose: {
    aimsParser: [
      'AIMS_HUMAN_AIRPORTS',
      'findAimsVisualFlightBlockEnd',
      'findAimsContinuationPrefixEnd',
      'parseAimsVisualColumnDays',
      'isAimsVisualStandaloneBoundaryToken',
      'isAimsHumanAirport',
      'isPlausibleAimsPresentationCandidate',
    ],
  },
});
const aims = load('aimsParser');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-server-510-parity-'));
let server;
try {
  const source = fs.readFileSync(path.join(ROOT, 'server/rosterParser.mjs'), 'utf8');
  const debug = source.replace(
    'export { parsePdfOnServer };',
    'export { parsePdfOnServer, markerProvenPresentation };',
  );
  assert.notEqual(debug, source, 'helper temporal do servidor não foi exposto para a regressão');
  const serverPath = path.join(tempDir, 'rosterParser.mjs');
  fs.writeFileSync(serverPath, debug, 'utf8');
  server = await import(`${pathToFileURL(serverPath).href}?v=${Date.now()}`);

  const context = {
    date: '15/08/2026',
    dayOfWeek: 'Sáb',
    dateObj: new Date(2026, 7, 15),
    base: 'BSB',
  };
  const parse = (tokens) => aims.parseAimsVisualColumnDays(tokens, { ...context, rawBlock: tokens.join(' ') });
  const flights = (days) => days.filter((day) => day.type === 'VOO' && (day.legs || []).length);
  const legs = (days) => flights(days).flatMap((day) => day.legs || []);
  const show = (days) => JSON.stringify(days.map((day) => ({
    date: day.date,
    type: day.type,
    report: day.dutyReport,
    debrief: day.dutyDebrief,
    pairing: day.pairingCode,
    legs: (day.legs || []).map((leg) => ({
      flight: leg.flightNumber,
      from: leg.origin,
      to: leg.destination,
      apz: leg.presentationTime,
      std: leg.departureTime,
      sta: leg.arrivalTime,
    })),
  })));

  // REC/CPT/LIS são aeroportos mesmo quando colidem com códigos de escala.
  for (const code of ['REC', 'CPT', 'LIS']) {
    check(`${code}: aeroporto colidente permanece estação dentro da perna aberta`,
      aims.isAimsHumanAirport(code, '') && aims.isAimsVisualStandaloneBoundaryToken(code));
    const tokens = ['LA', '9001', '10:00', 'GRU', code, '12:30', '(320)'];
    check(`${code}: não trunca bloco antes do destino`,
      aims.findAimsVisualFlightBlockEnd(tokens, 0) === tokens.length,
      JSON.stringify(tokens));
  }

  // Na continuação, somente a primeira estação pode ser a chegada costurada.
  check('REC como primeira estação de continuação é chegada, não boundary',
    aims.findAimsContinuationPrefixEnd(['(...)', 'REC', '02:35', '(320)', 'DO']) === 4);
  check('código colidente depois da chegada volta a ser boundary',
    aims.findAimsContinuationPrefixEnd(['(...)', 'GRU', '02:35', '(320)', 'REC', '14:00']) === 4);

  // A jornada anterior consome chegada + debriefing, nunca a APZ da jornada seguinte.
  check('terceiro relógio pós-chegada fica para a jornada nova',
    aims.findAimsContinuationPrefixEnd(['(...)', 'BEL', '00:15', '00:45', '15:05', 'LA', '8020', '15:35']) === 4);
  check('sem debrief publicado, relógio distante não é inventado como debrief',
    aims.findAimsContinuationPrefixEnd(['(...)', 'BEL', '00:15', '15:05', 'LA', '8020', '15:35']) === 3);

  // Blocker histórico da #538: duas jornadas na mesma coluna, sem stitching.
  {
    const tokens = ['LA', '3410', '20:30', '21:30', 'GRU', 'BEL', '00:15', '00:45', '15:05', 'LA', '8020', '15:35', 'BEL', 'GRU', '19:00', '(320)'];
    const days = parse(tokens);
    const fs = flights(days);
    const ls = legs(days);
    check('same-column produz duas jornadas, não uma jornada de ~23h', fs.length === 2, show(days));
    check('jornada anterior termina no debrief publicado 00:45',
      fs[0]?.dutyDebrief === '00:45' && ls[0]?.arrivalTime === '00:15', show(days));
    check('jornada seguinte preserva APZ 15:05 e STD 15:35',
      ls[1]?.presentationTime === '15:05' && ls[1]?.departureTime === '15:35' && ls[1]?.presentationTime !== ls[1]?.departureTime,
      show(days));
    check('segunda jornada começa na apresentação publicada', fs[1]?.dutyReport === '15:05', show(days));
  }

  // Contraprovas anti-vazamento.
  {
    const days = parse(['LA', '9001', '06:00', '06:45', 'GRU', 'BSB', '08:00', '08:20', 'LA', '9002', '09:10', 'BSB', 'GRU', '10:30', '(320)']);
    const ls = legs(days);
    check('debrief da primeira perna não vira APZ da segunda',
      ls.length === 2 && ls[0]?.presentationTime === '06:00' && ls[1]?.presentationTime === undefined && ls[1]?.departureTime === '09:10',
      show(days));
  }
  {
    const days = parse(['ASB', '08:00', '12:00', 'LA', '9003', '13:00', 'GRU', 'BSB', '15:00', '(320)']);
    const ls = legs(days);
    check('horário de ASB consumido não vira apresentação do voo',
      days.some((day) => day.type === 'ASB') && ls[0]?.presentationTime === undefined && ls[0]?.departureTime === '13:00',
      show(days));
  }

  // Leading clock só é APZ quando temporalmente plausível.
  {
    const good = legs(parse(['15:05', 'LA', '8020', '15:35', 'BEL', 'GRU', '19:00', '(320)']))[0];
    const implausible = legs(parse(['14:00', 'LA', '8020', '20:00', 'BEL', 'GRU', '22:00', '(320)']))[0];
    check('leading clock plausível vira APZ', good?.presentationTime === '15:05' && good?.departureTime === '15:35');
    check('leading clock 6h antes da STD não vira APZ', implausible?.presentationTime === undefined && implausible?.departureTime === '20:00');
  }

  // O cliente usa o mesmo discriminador temporal fail-closed já ratificado no servidor.
  for (const [arrival, candidate, departure] of [
    ['00:15', '15:05', '15:35'],
    ['00:15', '00:45', '15:35'],
    ['00:15', '14:00', '20:00'],
    ['23:30', '00:45', '01:15'],
    ['10:00', '13:30', '15:00'],
  ]) {
    const client = aims.isPlausibleAimsPresentationCandidate(arrival, candidate, departure);
    const backend = server.markerProvenPresentation(arrival, candidate, departure);
    check(`paridade temporal ${arrival} / ${candidate} / ${departure}`, client === backend,
      `client=${client} server=${backend}`);
  }
} finally {
  cleanup();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

process.exit(checker.report());
