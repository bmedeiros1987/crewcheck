import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { parsePdfOnServer } from '../server/rosterParser.mjs';

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14381-date-anchor-'));
const clientEntry = path.join(root, 'client/src/lib/pdfParser.ts');
const serverSource = fs.readFileSync(path.join(root, 'server/rosterParser.mjs'), 'utf8');

const item = (str, x, y) => ({ str, x, y, page: 1 });
const column = (x, cells) => cells.map(([str, y]) => item(str, x, y));
const rawItems = [
  ...column(79.46, [['Updated Date', 1111.65], ['Updated By', 1026.38], ['Pairing/Activity', 139.71], ['Date', 40]]),
  ...column(346.46, [['01-Aug-2026 19.46', 1098], ['90000001', 1018], ['18:25', 681], ['BSB 18:25', 566], ['BSB 13:30', 491], ['13:30', 233], ['ASB', 123], ['03-Aug-2026', 38]]),
  ...column(538.46, [['03-Aug-2026 03.30', 1098], ['90000002', 1018], ['31R', 878], ['07:50', 778], ['03:05', 735], ['GRU 05:45', 566], ['THE 02:40', 491], ['OP', 406], ['LA3197', 291], ['02:05', 233], ['10-Aug-2026', 38]]),
  ...column(562.46, [['03-Aug-2026 03.30', 1098], ['90000002', 1018], ['328', 878], ['02:15', 735], ['08:55', 681], ['CGB 08:25', 566], ['GRU 07:10', 491], ['OP', 406], ['LA3638', 291]]),
  ...column(586.46, [['03-Aug-2026 03.30', 1098], ['90000002', 1018], ['31R', 878], ['08:20', 778], ['01:40', 735], ['BSB 07:05', 566], ['CGB 04:25', 491], ['OP', 406], ['LA3895', 291], ['03:50', 233], ['11-Aug-2026', 38]]),
  ...column(610.46, [['03-Aug-2026 03.30', 1098], ['90000002', 1018], ['39R', 878], ['01:40', 735], ['GIG 10:10', 566], ['BSB 08:30', 491], ['OP', 406], ['LA3728', 291]]),
  ...column(634.46, [['03-Aug-2026 03.30', 1098], ['90000002', 1018], ['39R', 878], ['01:50', 735], ['13:10', 681], ['BSB 12:40', 566], ['GIG 10:50', 491], ['OP', 406], ['LA3027', 291]]),
];

function visualRow(x) {
  // O Jasper rotacionado é escolhido em direção ascendente: a primeira perna
  // traz Date e as continuações trazem apenas Updated Date no extremo oposto.
  const items = rawItems.filter((entry) => Math.abs(entry.x - x) < 1).sort((a, b) => a.y - b.y);
  return { page: 1, key: x, items, text: items.map((entry) => entry.str).join(' ') };
}

const rows = [79.46, 346.46, 538.46, 562.46, 586.46, 610.46, 634.46].map(visualRow);
const pages = [{ pageNo: 1, items: rawItems }];

function leg(flightNumber, origin, destination, departureTime, arrivalTime) {
  const [departureHour, departureMinute] = departureTime.split(':').map(Number);
  const [arrivalHour, arrivalMinute] = arrivalTime.split(':').map(Number);
  const minutes = ((arrivalHour * 60 + arrivalMinute) - (departureHour * 60 + departureMinute) + 1440) % 1440;
  return { flightNumber, origin, destination, departureTime, arrivalTime, workType: 'OP', duration: minutes / 60, isNextDay: arrivalTime < departureTime };
}

function rosterDay(date, type, pairingCode, dutyReport, dutyDebrief, legs = []) {
  const [dayNumber, month, year] = date.split('/').map(Number);
  return {
    date,
    dayOfWeek: '',
    dayNumber,
    month,
    year,
    type,
    pairingCode,
    dutyReport,
    dutyDebrief,
    legs,
    dutyHours: null,
    flyingHours: legs.reduce((sum, entry) => sum + entry.duration, 0),
    isNextDay: false,
    hotel: null,
    base: 'BSB',
    rawText: '',
  };
}

const initialDays = [
  rosterDay('03/08/2026', 'ASB', 'ASB', '13:30', '18:25'),
  rosterDay('10/08/2026', 'VOO', 'LA3197', '02:05', '08:55', [
    leg('LA3197', 'THE', 'GRU', '02:40', '05:45'),
    leg('LA3638', 'GRU', 'CGB', '07:10', '08:25'),
  ]),
  rosterDay('11/08/2026', 'VOO', 'LA3895', '03:50', '13:10', [
    leg('LA3895', 'CGB', 'BSB', '04:25', '07:05'),
    leg('LA3728', 'BSB', 'GIG', '08:30', '10:10'),
    leg('LA3027', 'GIG', 'BSB', '10:50', '12:40'),
  ]),
];

const flightsOn = (days, date) => days.filter((day) => day.date === date).flatMap((day) => day.legs || []).map((entry) => entry.flightNumber);

try {
  await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [{
      name: 'expose-v14381-date-anchor',
      transform(code, id) {
        if (!id.endsWith('/client/src/lib/pdfParser.ts')) return null;
        return { code: `${code}\nexport { visualRosterPageDateAxes, visualRosterOperationalDateToken, rescueFlightsFromVisualRows };\n`, map: null };
      },
    }],
    build: {
      lib: { entry: clientEntry, formats: ['es'], fileName: () => 'client-date-anchor.mjs' },
      outDir: tempDir,
      emptyOutDir: false,
      minify: false,
    },
  });
  const client = await import(`${pathToFileURL(path.join(tempDir, 'client-date-anchor.mjs')).href}?v=${Date.now()}`);
  const clientAxes = client.visualRosterPageDateAxes(rows);
  assert.equal(client.visualRosterOperationalDateToken(rows[4], clientAxes), '11-Aug-2026', 'cliente deve escolher Date, não Updated Date, na primeira perna de 11/08');
  assert.equal(client.visualRosterOperationalDateToken(rows[5], clientAxes), null, 'cliente não pode tratar Updated Date isolada da continuação como nova data operacional');

  const clientDays = client.rescueFlightsFromVisualRows(structuredClone(initialDays), rows, 8, 2026, 'BSB');
  assert.deepEqual(flightsOn(clientDays, '03/08/2026'), [], 'cliente: 03/08 deve continuar somente ASB');
  assert.deepEqual(flightsOn(clientDays, '10/08/2026'), ['LA3197', 'LA3638'], 'cliente: continuação de 10/08 deve permanecer em 10/08');
  assert.deepEqual(flightsOn(clientDays, '11/08/2026'), ['LA3895', 'LA3728', 'LA3027'], 'cliente: LA3728/LA3027 devem permanecer em 11/08 sem duplicação');

  const exposedServer = serverSource.replace(
    'export { parsePdfOnServer };',
    'export { parsePdfOnServer, buildServerVisualRows, serverVisualPageDateAxes, serverVisualOperationalDateToken, rescueServerFlightsFromVisualPages };',
  );
  assert.notEqual(exposedServer, serverSource, 'não foi possível expor o fallback visual do servidor');
  const serverPath = path.join(tempDir, 'server-date-anchor.mjs');
  fs.writeFileSync(serverPath, exposedServer, 'utf8');
  const server = await import(`${pathToFileURL(serverPath).href}?v=${Date.now()}`);
  const serverAxes = server.serverVisualPageDateAxes(pages);
  const serverRows = server.buildServerVisualRows(pages);
  const serverFirst11 = serverRows.find((row) => /LA3895/.test(row.text));
  const serverContinuation11 = serverRows.find((row) => /LA3728/.test(row.text));
  assert.equal(server.serverVisualOperationalDateToken(serverFirst11, serverAxes), '11-Aug-2026', 'servidor deve escolher Date, não Updated Date, em 11/08');
  assert.equal(server.serverVisualOperationalDateToken(serverContinuation11, serverAxes), null, 'servidor não pode reancorar continuação pela Updated Date');

  const serverDays = server.rescueServerFlightsFromVisualPages(structuredClone(initialDays), pages, 8, 2026, 'BSB');
  assert.deepEqual(flightsOn(serverDays, '03/08/2026'), [], 'servidor: 03/08 deve continuar somente ASB');
  assert.deepEqual(flightsOn(serverDays, '10/08/2026'), ['LA3197', 'LA3638'], 'servidor: continuação de 10/08 deve permanecer em 10/08');
  assert.deepEqual(flightsOn(serverDays, '11/08/2026'), ['LA3895', 'LA3728', 'LA3027'], 'servidor: LA3728/LA3027 devem permanecer em 11/08 sem duplicação');

  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      lib: { entry: path.join(root, 'client/src/lib/complianceEngine.ts'), formats: ['es'], fileName: () => 'compliance.mjs' },
      outDir: tempDir,
      emptyOutDir: false,
      minify: false,
    },
  });
  const complianceModule = await import(`${pathToFileURL(path.join(tempDir, 'compliance.mjs')).href}?v=${Date.now()}`);
  const continuityMarker = rosterDay('10/08/2026', 'PERNOITE_CONTINUIDADE', 'PERNOITE ENTRE JORNADAS', '08:55', '03:50');
  continuityMarker.dutyHours = 18.92;
  continuityMarker.isNextDay = true;
  continuityMarker.continuityInferred = true;
  const continuityCompliance = complianceModule.analyzeCompliance({
    crewName: 'Tripulante Teste', crewId: '90000000', base: 'BSB', rank: 'CCM', airline: 'LATAM', month: 8, year: 2026,
    rawText: '', totals: {}, days: [structuredClone(initialDays[1]), continuityMarker, structuredClone(initialDays[2])],
  });
  const continuityAlertText = continuityCompliance.alerts.map((alert) => `${alert.title} ${alert.description || ''}`).join('\n');
  assert.doesNotMatch(continuityAlertText, /repouso calculado de 0\.0h/i, 'continuidade sintética é estadia, não uma jornada que termina na apresentação seguinte');

  const officialPdfPath = String(process.env.CREWCHECK_OFFICIAL_ROSTER_PDF || '').trim();
  if (officialPdfPath) {
    const bytes = fs.readFileSync(officialPdfPath);
    const fileName = path.basename(officialPdfPath);
    const clientRoster = await client.parsePDF(new File([bytes], fileName, { type: 'application/pdf' }));
    const serverResult = await parsePdfOnServer({ filename: fileName, dataBase64: bytes.toString('base64') });
    for (const [channel, roster] of [['cliente', clientRoster], ['servidor', serverResult.roster]]) {
      assert.deepEqual(flightsOn(roster.days, '01/08/2026'), ['LA3558', 'LA3559', 'LA4631'], 'PDF oficial: 01/08 deve conter LA3558/LA3559/LA4631');
      assert.deepEqual(flightsOn(roster.days, '02/08/2026'), ['LA3108'], 'PDF oficial: 02/08 deve conter somente LA3108');
      assert.deepEqual(flightsOn(roster.days, '03/08/2026'), [], 'PDF oficial: 03/08 não pode conter voo antes do ASB');
      assert.equal(roster.days.some((day) => day.date === '03/08/2026' && String(day.type || day.pairingCode).toUpperCase().includes('ASB')), true, 'PDF oficial: 03/08 deve preservar ASB');
      assert.deepEqual(flightsOn(roster.days, '11/08/2026'), ['LA3895', 'LA3728', 'LA3027'], 'PDF oficial: 11/08 deve conter as três pernas uma única vez');
      const compliance = complianceModule.analyzeCompliance(roster);
      const alertText = compliance.alerts.map((alert) => `${alert.title} ${alert.description || ''}`).join('\n');
      assert.equal(compliance.metrics.totalFlightHours, 64.4, `alertas (${channel}): horas OP de agosto devem permanecer em 64,4h`);
      assert.equal(compliance.alerts.length, 1, `alertas (${channel}): somente o achado real de solo pode permanecer`);
      assert.equal(compliance.alerts[0]?.title, 'Tempo em solo entre etapas acima do limite ACT', `alertas (${channel}): o único alerta deve ser o solo de GRU`);
      assert.match(alertText, /31\/07\/2026: 182 min em GRU/, `alertas (${channel}): o achado real de 182 min deve continuar visível`);
    }
  }

  console.log(`[v14.3.81] Date venceu Updated Date no cliente/servidor; 03/08 ficou somente ASB${officialPdfPath ? ' e o PDF oficial passou no gate completo' : ''}.`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
