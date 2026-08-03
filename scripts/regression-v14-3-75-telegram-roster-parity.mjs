import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { jsPDF } from 'jspdf';
import { parsePdfOnServer } from '../server/rosterParser.mjs';

const header = 'Escala de Tripulante Convertida para padrao AIMS\nTripulante: TRIPULANTE TESTE -BP:00000000 -Base: BSB -01/08/2026 ate31/08/2026';
const visualColumns = [
  ['LA','3558','13:05','13:35','FOR','PHB','14:37','15:07','LA','3559','15:28','15:58','PHB','FOR','16:52','17:22','LA','4631','17:09','17:39','FOR','CGH','21:09','CNA','21:10','CGH','21:20','21:50'],
  ['LA','3108','12:10','12:40','CGH','BSB','14:25','14:55'],
  ['LA','3001','07:30','08:00','BSB','GRU','09:30','10:00','LA','3002','10:00','10:30','GRU','BSB','12:00','12:30'],
  ['LA','3003','07:30','08:00','BSB','CGH','09:30','10:00','LA','3004','10:00','10:30','CGH','BSB','12:00','12:30'],
  ['LA','3005','07:30','08:00','BSB','GIG','09:30','10:00','LA','3006','10:00','10:30','GIG','BSB','12:00','12:30'],
  ['LA','3007','07:30','08:00','BSB','CWB','09:30','10:00','LA','3008','10:00','10:30','CWB','BSB','12:00','12:30'],
  ['MCK','08:00','BSB','12:00'],
  ['DO'],
  ['DO'],
  ['DO'],
];
const columnX = (index) => 55 + index * 70;

function buildSyntheticAimsPdf() {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [800, 1400], compress: false });
  doc.setFontSize(10);
  // jsPDF receives Y from the top while PDF.js exposes Y from the bottom.
  // Keep headers visually above the date markers and activity tokens below them
  // so parseServerAims sees the same geometry as a real AIMS page. The compact
  // X spacing intentionally keeps all ten test days inside even the shorter
  // physical page dimension exposed by different jsPDF/PDF.js orientations.
  doc.text('Escala de Tripulante Convertida para padrao AIMS', 25, 30);
  doc.text('Tripulante: TRIPULANTE TESTE -BP:00000000 -Base: BSB -01/08/2026 ate31/08/2026', 25, 50);
  visualColumns.forEach((tokens, index) => {
    const x = columnX(index);
    doc.text(`${String(index + 1).padStart(2, '0')}Aug`, x, 90);
    tokens.forEach((token, tokenIndex) => doc.text(String(token), x, 110 + tokenIndex * 14));
  });
  return Buffer.from(doc.output('arraybuffer'));
}

function buildClientVisualRows() {
  const items = [];
  visualColumns.forEach((tokens, index) => {
    const x = columnX(index);
    items.push({ str: `${String(index + 1).padStart(2, '0')}Aug`, x, y: 710, page: 1 });
    tokens.forEach((str, tokenIndex) => items.push({ str, x, y: 690 - tokenIndex * 14, page: 1 }));
  });
  return [{ page: 1, key: 710, text: '', items }];
}

function clientFullText() {
  return `${header}\n${visualColumns.map((tokens, index) => `${String(index + 1).padStart(2, '0')}Aug ${tokens.join(' ')}`).join('\n')}\nTimezone Brasilia (-3)`;
}

function operationalCore(roster) {
  return (roster?.days || [])
    .filter((day) => day?.date)
    .map((day) => ({
      date: day.date,
      type: day.type,
      pairingCode: day.pairingCode,
      dutyReport: day.dutyReport || null,
      dutyDebrief: day.dutyDebrief || null,
      legs: (day.legs || []).map((leg) => ({
        flightNumber: leg.flightNumber,
        origin: leg.origin,
        destination: leg.destination,
        departureTime: leg.departureTime,
        arrivalTime: leg.arrivalTime,
      })),
    }));
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-telegram-parity-'));
try {
  const pdfBytes = buildSyntheticAimsPdf();
  const serverParsed = await parsePdfOnServer({ filename: 'escala-paridade.pdf', dataBase64: pdfBytes.toString('base64') });
  const serverRoster = serverParsed.roster;

  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      lib: {
        entry: path.resolve('client/src/lib/aimsParser.ts'),
        formats: ['es'],
        fileName: () => 'aims-parser.mjs',
      },
      outDir,
      emptyOutDir: true,
      minify: false,
    },
  });
  const clientModule = await import(`${pathToFileURL(path.join(outDir, 'aims-parser.mjs')).href}?v=${Date.now()}`);
  const clientRoster = clientModule.parseAimsRoster(clientFullText(), buildClientVisualRows());

  const expectedDayOne = [
    { flightNumber: 'LA3558', origin: 'FOR', destination: 'PHB', departureTime: '13:35', arrivalTime: '14:37' },
    { flightNumber: 'LA3559', origin: 'PHB', destination: 'FOR', departureTime: '15:58', arrivalTime: '16:52' },
    { flightNumber: 'LA4631', origin: 'FOR', destination: 'CGH', departureTime: '17:39', arrivalTime: '21:09' },
  ];

  const clientCore = operationalCore(clientRoster);
  const serverCore = operationalCore(serverRoster);
  const clientDayOne = clientCore.find((day) => day.date === '01/08/2026' && day.legs.length)?.legs || [];
  const serverDayOne = serverCore.find((day) => day.date === '01/08/2026' && day.legs.length)?.legs || [];
  assert.deepEqual(clientDayOne, expectedDayOne, 'PWA/APK canônico deve preservar as três pernas de 01/08');
  assert.deepEqual(serverDayOne, expectedDayOne, 'Telegram/server deve preservar as mesmas três pernas de 01/08');
  assert.deepEqual(serverDayOne, clientDayOne, 'Telegram e PWA/APK devem concordar no núcleo operacional da jornada');
  assert.ok(!serverDayOne.some((leg) => leg.origin === 'CNA' || leg.destination === 'CNA'), 'CNA nunca pode ser interpretado como aeroporto pelo servidor');

  const clientMck = clientCore.find((day) => day.date === '07/08/2026' && day.pairingCode === 'MCK');
  const serverMck = serverCore.find((day) => day.date === '07/08/2026' && day.pairingCode === 'MCK');
  assert.equal(clientMck?.type, 'CRM', 'cliente deve manter MCK como atividade de solo');
  assert.equal(
    serverMck?.type,
    'CRM',
    `Telegram/server deve manter MCK como atividade de solo. Dia 07 recebido: ${JSON.stringify(serverCore.filter((day) => day.date === '07/08/2026'))}`,
  );

  const serverSecond = serverCore.find((day) => day.date === '02/08/2026' && day.legs.length);
  assert.deepEqual(serverSecond?.legs, [{ flightNumber: 'LA3108', origin: 'CGH', destination: 'BSB', departureTime: '12:40', arrivalTime: '14:25' }]);

  console.log('[v14.3.75] OK — Telegram/server e PWA/APK concordam em FOR-PHB, PHB-FOR, FOR-CGH; CNA não vira aeroporto e MCK permanece atividade de solo.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
