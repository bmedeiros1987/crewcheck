import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const preparedServerParser = fs.readFileSync('server/rosterParser.mjs', 'utf8');
const nextDayAssignment = 'day.isNextDay = Boolean(window.start && window.end && toMin(window.end) < toMin(window.start));';
assert.ok(
  (preparedServerParser.split(nextDayAssignment).length - 1) >= 2,
  'parser preparado precisa marcar virada de dia no caminho normal e no fallback MCK',
);

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-ground-next-day-'));
try {
  const debugParserPath = path.join(outDir, 'server-parser-debug.mjs');
  const debugSource = preparedServerParser.replace(
    'export { parsePdfOnServer };',
    'export { parsePdfOnServer, parseAimsTokensIntoEventsV3, parseServerAims };',
  );
  assert.notEqual(debugSource, preparedServerParser, 'não consegui expor helpers internos do parser');
  fs.writeFileSync(debugParserPath, debugSource, 'utf8');
  const parser = await import(`${pathToFileURL(debugParserPath).href}?v=${Date.now()}`);

  for (const code of ['MCK', 'RCFI']) {
    const parsed = parser.parseAimsTokensIntoEventsV3([code, '22:00', 'BSB', '02:00'], 7, 8, 2026, 'BSB');
    const activity = parsed.find((day) => day.pairingCode === code);
    assert.ok(activity, `${code} noturno precisa continuar reconhecido como atividade`);
    assert.equal(activity.type, 'CRM', `${code} precisa manter semântica de atividade de solo`);
    assert.equal(activity.dutyReport, '22:00');
    assert.equal(activity.dutyDebrief, '02:00');
    assert.equal(activity.isNextDay, true, `${code} 22:00-02:00 precisa marcar isNextDay`);
    assert.equal(activity.dutyHours, 4, `${code} 22:00-02:00 precisa durar 4h`);
  }

  const fallbackList = "['HSB','HSBE','ASB','CBF','EMER','MT','CRM','RCFI','MCK','MCK320','MCK_SS','NS','NSJ','IJ','DM'].includes(token)";
  const fallbackWithoutMck = "['HSB','HSBE','ASB','CBF','EMER','MT','CRM','RCFI','MCK320','MCK_SS','NS','NSJ','IJ','DM'].includes(token)";
  assert.ok(preparedServerParser.includes(fallbackList), 'lista preparada de atividades MCK não localizada');
  const forcedFallbackSource = preparedServerParser
    .replace(fallbackList, fallbackWithoutMck)
    .replace(
      'export { parsePdfOnServer };',
      'export { parsePdfOnServer, parseServerAims };',
    );
  const fallbackParserPath = path.join(outDir, 'server-parser-fallback-debug.mjs');
  fs.writeFileSync(fallbackParserPath, forcedFallbackSource, 'utf8');
  const fallbackParser = await import(`${pathToFileURL(fallbackParserPath).href}?v=${Date.now() + 1}`);

  const headerLine = 'Tripulante: TRIPULANTE TESTE -BP:00000000 -Base: BSB -01/08/2026 ate31/08/2026';
  const header = `Escala de Tripulante Convertida para padrao AIMS\n${headerLine}`;
  const fallbackRoster = fallbackParser.parseServerAims(header, [{
    pageNo: 1,
    items: [
      { str: 'Escala de Tripulante Convertida para padrao AIMS', x: 25, y: 770, page: 1 },
      { str: headerLine, x: 25, y: 750, page: 1 },
      { str: '07Aug', x: 100, y: 710, page: 1 },
      { str: 'MCK', x: 100, y: 690, page: 1 },
      { str: '22:00', x: 100, y: 676, page: 1 },
      { str: 'BSB', x: 100, y: 662, page: 1 },
      { str: '02:00', x: 100, y: 648, page: 1 },
    ],
  }]);
  const fallbackMck = fallbackRoster.days.find((day) => day.pairingCode === 'MCK');
  assert.ok(fallbackMck, 'fallback MCK precisa criar atividade quando o parser normal não a produz');
  assert.equal(fallbackMck.dutyReport, '22:00');
  assert.equal(fallbackMck.dutyDebrief, '02:00');
  assert.equal(fallbackMck.isNextDay, true, 'fallback MCK 22:00-02:00 precisa marcar isNextDay');
  assert.equal(fallbackMck.dutyHours, 4, 'fallback MCK 22:00-02:00 precisa durar 4h');

  console.log('[v14.3.76] OK — MCK/RCFI noturnos e fallback MCK preservam isNextDay sem alterar regulamentação.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
