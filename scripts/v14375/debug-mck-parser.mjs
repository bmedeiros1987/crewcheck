import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { jsPDF } from 'jspdf';

const parserPath = 'server/rosterParser.mjs';
const source = fs.readFileSync(parserPath, 'utf8');
const debugPath = 'server/.v14375-debug-parser.mjs';
let debugSource = source.replace(
  'export { parsePdfOnServer };',
  'export { parsePdfOnServer, parseAimsTokensIntoEventsV3, parseServerAims, finalizeServerDays, parseServerHeader, parseAimsDateMarkerServer };',
);
const rosterLine = " const roster = isAims ? parseServerAims(fullText, pages) : parseServerRosterReport(fullText, pages, filename);";
if (!debugSource.includes(rosterLine)) throw new Error('Não consegui instrumentar parsePdfOnServer.');
debugSource = debugSource.replace(
  rosterLine,
  `${rosterLine}\n if (String(filename || '').includes('mck-debug')) console.log('[v14.3.75:mck-inside-parsePdf]', JSON.stringify({ pages, fullText, isAims, preFinalizeDays: roster.days }));`,
);
if (debugSource === source) throw new Error('Não consegui expor helpers internos do parser.');
fs.writeFileSync(debugPath, debugSource, 'utf8');

try {
  const parser = await import(`${pathToFileURL(path.resolve(debugPath)).href}?v=${Date.now()}`);
  const headerLine = 'Tripulante: TRIPULANTE TESTE -BP:00000000 -Base: BSB -01/08/2026 ate31/08/2026';
  const fullText = `Escala de Tripulante Convertida para padrao AIMS\n${headerLine}\n07Aug\nMCK\n08:00\nBSB\n12:00`;
  const items = [
    { str: 'Escala de Tripulante Convertida para padrao AIMS', x: 25, y: 770, page: 1 },
    { str: headerLine, x: 25, y: 750, page: 1 },
    { str: '07Aug', x: 100, y: 710, page: 1 },
    { str: 'MCK', x: 100, y: 690, page: 1 },
    { str: '08:00', x: 100, y: 676, page: 1 },
    { str: 'BSB', x: 100, y: 662, page: 1 },
    { str: '12:00', x: 100, y: 648, page: 1 },
  ];

  const header = parser.parseServerHeader(fullText);
  const marker = parser.parseAimsDateMarkerServer('07Aug', header.month, header.year);
  const direct = parser.parseAimsTokensIntoEventsV3(['MCK','08:00','BSB','12:00'], 7, 8, 2026, 'BSB');
  const aims = parser.parseServerAims(fullText, [{ pageNo: 1, items }]);
  const finalized = parser.finalizeServerDays(aims.days, aims.month, aims.year, aims.base);
  console.log('[v14.3.75:mck-stages]', JSON.stringify({ now: new Date().toISOString(), header, marker, direct, aimsDays: aims.days, finalized }));

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [800, 1400], compress: false });
  doc.setFontSize(10);
  doc.text('Escala de Tripulante Convertida para padrao AIMS', 25, 30);
  doc.text(headerLine, 25, 50);
  doc.text('07Aug', 100, 90);
  ['MCK','08:00','BSB','12:00'].forEach((token, index) => doc.text(token, 100, 110 + index * 14));
  const bytes = Buffer.from(doc.output('arraybuffer'));
  const parsedPdf = await parser.parsePdfOnServer({ filename: 'mck-debug.pdf', dataBase64: bytes.toString('base64') });
  console.log('[v14.3.75:mck-debug-parsePdfOnServer]', JSON.stringify({ roster: parsedPdf.roster, diagnostics: parsedPdf.diagnostics }));
} finally {
  try { fs.unlinkSync(debugPath); } catch {}
}
