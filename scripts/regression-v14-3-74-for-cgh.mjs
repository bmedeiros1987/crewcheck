import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-for-cgh-'));
try {
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

  const parserModule = await import(`${pathToFileURL(path.join(outDir, 'aims-parser.mjs')).href}?v=${Date.now()}`);
  const { parseAimsRoster } = parserModule;
  assert.equal(typeof parseAimsRoster, 'function', 'parseAimsRoster precisa estar disponível no bundle de regressão');

  const fullText = `Escala de Tripulante Convertida para padrão AIMS
Tripulante: TRIPULANTE TESTE -BP:00000000 -Base: BSB -01/08/2026 até31/08/2026
01Aug Fri LA 3558 13:05 13:35 FOR PHB 14:37 15:07 LA 3559 15:28 15:58 PHB FOR 16:52 17:22 LA 4631 17:09 17:39 FOR CGH 21:09 CNA 21:10 CGH 21:20 21:50
02Aug Sat LA 3108 12:10 12:40 CGH BSB 14:25 14:55
03Aug Sun LA 3001 07:30 08:00 BSB GRU 09:30 10:00 LA 3002 10:00 10:30 GRU BSB 12:00 12:30
04Aug Mon LA 3003 07:30 08:00 BSB CGH 09:30 10:00 LA 3004 10:00 10:30 CGH BSB 12:00 12:30
05Aug Tue LA 3005 07:30 08:00 BSB GIG 09:30 10:00 LA 3006 10:00 10:30 GIG BSB 12:00 12:30
06Aug Wed LA 3007 07:30 08:00 BSB CWB 09:30 10:00 LA 3008 10:00 10:30 CWB BSB 12:00 12:30
07Aug Thu DO
08Aug Fri DO
09Aug Sat DO
10Aug Sun DO
Timezone Brasília (-3)
`;

  const visualColumns = [
    ['LA','3558','13:05','13:35','FOR','PHB','14:37','15:07','LA','3559','15:28','15:58','PHB','FOR','16:52','17:22'],
    ['LA','3108','12:10','12:40','CGH','BSB','14:25','14:55'],
    ['LA','3001','07:30','08:00','BSB','GRU','09:30','10:00','LA','3002','10:00','10:30','GRU','BSB','12:00','12:30'],
    ['LA','3003','07:30','08:00','BSB','CGH','09:30','10:00','LA','3004','10:00','10:30','CGH','BSB','12:00','12:30'],
    ['LA','3005','07:30','08:00','BSB','GIG','09:30','10:00','LA','3006','10:00','10:30','GIG','BSB','12:00','12:30'],
    ['LA','3007','07:30','08:00','BSB','CWB','09:30','10:00','LA','3008','10:00','10:30','CWB','BSB','12:00','12:30'],
    ['DO'],
    ['DO'],
    ['DO'],
    ['DO'],
  ];

  const items = [];
  visualColumns.forEach((tokens, index) => {
    const day = index + 1;
    const x = 120 + index * 120;
    items.push({ str: `${String(day).padStart(2, '0')}Aug`, x, y: 1000, page: 1 });
    tokens.forEach((str, tokenIndex) => items.push({ str, x, y: 990 - tokenIndex * 4, page: 1 }));
  });
  const visualRows = [{ page: 1, key: 1000, text: '', items }];

  const roster = parseAimsRoster(fullText, visualRows);
  const augustFirst = (roster.days || []).filter((day) => day.date === '01/08/2026' && day.type === 'VOO');
  const legs = augustFirst.flatMap((day) => day.legs || []);

  assert.equal(augustFirst.length, 1, `01/08 deve permanecer uma única jornada física; obtido ${augustFirst.length}`);
  assert.deepEqual(legs.map((leg) => leg.flightNumber), ['LA3558', 'LA3559', 'LA4631'], 'as três pernas do dia 1 devem permanecer na mesma jornada');
  assert.deepEqual(legs.map((leg) => `${leg.origin}-${leg.destination}`), ['FOR-PHB', 'PHB-FOR', 'FOR-CGH']);

  const third = legs[2];
  assert.equal(third?.departureTime, '17:39', 'LA4631 deve sair de FOR às 17:39');
  assert.equal(third?.arrivalTime, '21:09', 'LA4631 deve chegar a CGH às 21:09');
  assert.ok(!legs.some((leg) => leg.origin === 'CNA' || leg.destination === 'CNA'), 'CNA é atividade/cancelamento e nunca pode virar aeroporto');

  const augustSecond = (roster.days || []).find((day) => day.date === '02/08/2026' && (day.legs || []).some((leg) => leg.flightNumber === 'LA3108'));
  assert.ok(augustSecond, 'o retorno CGH-BSB do dia seguinte deve permanecer íntegro');
  assert.deepEqual(augustSecond.legs.map((leg) => `${leg.flightNumber}:${leg.origin}-${leg.destination}`), ['LA3108:CGH-BSB']);

  console.log('[v14.3.74] OK — 01/08 preserva LA3558 FOR-PHB + LA3559 PHB-FOR + LA4631 FOR-CGH na mesma jornada; CNA não contamina a rota.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
