import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-530-full-history-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

function roster(month, marker) {
  const day = String(Math.min(20, 4 + month)).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return {
    crewName: 'TRIPULANTE TESTE',
    crewId: '530HISTORY',
    base: 'BSB',
    year: 2026,
    month,
    rawText: marker,
    days: [{
      date: `2026-${mm}-${day}`,
      type: 'DO',
      pairingCode: `HIST-${mm}`,
      isDayOff: true,
      legs: [],
    }],
  };
}

function boundaryFlight(dutyReport) {
  return {
    date: '2026-07-01',
    type: 'VOO',
    pairingCode: 'BOUNDARY',
    dutyReport,
    dutyDebrief: '12:00',
    isDayOff: false,
    legs: [{
      flightNumber: 'LA1234',
      origin: 'BSB',
      destination: 'GRU',
      departureTime: '10:00',
      arrivalTime: '11:30',
    }],
  };
}

function monthsOf(rosterValue) {
  return Array.from(new Set((rosterValue.days || []).map((day) => {
    const raw = String(day.date || '');
    const iso = raw.match(/^(\d{4})-(\d{2})-/);
    if (iso) return `${iso[1]}-${iso[2]}`;
    const br = raw.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
    return br ? `${br[2]}-${String(Number(br[1])).padStart(2, '0')}` : '';
  }).filter(Boolean))).sort();
}

try {
  await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@shared': path.resolve('shared') } },
    build: {
      lib: { entry: path.resolve('client/src/lib/databaseClient.ts'), formats: ['es'], fileName: () => 'database-client.mjs' },
      outDir,
      emptyOutDir: true,
      minify: false,
    },
  });

  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { origin: 'https://crewcheck.test' }, dispatchEvent() {} };
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'history-e2e', email: 'history@example.test' }));

  const moduleUrl = `${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`;
  const database = await import(moduleUrl);
  const compliance = { score: 100, alerts: [] };

  const june = roster(6, 'JUNE ORIGINAL');
  const july = roster(7, 'JULY ORIGINAL');
  const august = roster(8, 'AUGUST ORIGINAL');
  const september = roster(9, 'SEPTEMBER ORIGINAL');

  // Boundary reproducer: June carries a stale July 1 copy while the exact July
  // competence has the corrected report time. The nominal competence must win.
  june.days.push(boundaryFlight('09:00'));
  july.days.push(boundaryFlight('09:30'));

  await database.saveRosterAnalysis({ roster: june, compliance, gym: [], sourceFileName: 'junho.pdf' });
  await database.saveRosterAnalysis({ roster: july, compliance, gym: [], sourceFileName: 'julho.pdf' });
  await database.saveRosterAnalysis({ roster: august, compliance, gym: [], sourceFileName: 'agosto.pdf' });
  await database.saveRosterAnalysis({ roster: september, compliance, gym: [], sourceFileName: 'setembro.pdf' });

  const initialWindow = await database.openRosterDisplayWindow(september);
  assert.deepEqual(monthsOf(initialWindow), ['2026-06', '2026-07', '2026-08', '2026-09'], 'junho-setembro devem coexistir na Escala antes da reimportação');
  const julyBoundary = (initialWindow.days || []).filter((day) => String(day.date) === '2026-07-01');
  assert.equal(julyBoundary.length, 1, 'a data limítrofe deve vir de uma única competência nominal');
  assert.equal(julyBoundary[0]?.dutyReport, '09:30', 'a publicação nominal de Julho deve vencer o carry-over obsoleto de Junho');

  // Reproducer real informado em 13/09/2026: reimportar Setembro não pode fazer Junho
  // desaparecer do seletor. A nova publicação deve substituir apenas Setembro.
  const septemberReimport = {
    ...roster(9, 'SEPTEMBER REIMPORT'),
    days: [{ date: '2026-09-21', type: 'VC', pairingCode: 'VC', isDayOff: true, legs: [] }],
  };
  await database.saveRosterAnalysis({ roster: septemberReimport, compliance, gym: [], sourceFileName: 'setembro-reimport.pdf' });
  const afterReimport = await database.openRosterDisplayWindow(septemberReimport);
  assert.deepEqual(monthsOf(afterReimport), ['2026-06', '2026-07', '2026-08', '2026-09'], 'reimportar Setembro não pode ocultar Junho ou Julho');
  assert.equal(afterReimport.year, 2026);
  assert.equal(afterReimport.month, 9, 'janela visual não pode trocar a competência operacional primária');
  assert.equal((afterReimport.days || []).filter((day) => String(day.date) === '2026-09-21').length, 1, 'reimportação deve materializar somente a publicação nova de Setembro');
  assert.equal((afterReimport.days || []).filter((day) => String(day.pairingCode) === 'HIST-06').length, 1, 'Junho deve permanecer navegável após reimportar Setembro');
  const julyBoundaryAfterReimport = (afterReimport.days || []).filter((day) => String(day.date) === '2026-07-01');
  assert.equal(julyBoundaryAfterReimport.length, 1, 'reimportar Setembro não pode reintroduzir carry-over obsoleto na fronteira Junho/Julho');
  assert.equal(julyBoundaryAfterReimport[0]?.dutyReport, '09:30', 'Julho nominal deve continuar soberano na fronteira após reimportação');

  const source = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
  assert.match(source, /P0_530_ADJACENT_MONTH_DISPLAY_WINDOW/);
  assert.match(source, /function newestDisplaySummaryByCompetence\(/);
  assert.match(source, /function displayDaysBeforeNominalMerge\(/);
  assert.match(source, /const retainedPrimaryDays = displayDaysBeforeNominalMerge\(primary, adjacent\);/);
  assert.match(source, /const historical = newestDisplaySummaryByCompetence\(sameCrew, primaryOrdinal\);/);

  console.log('[p1-530-full-history] PASS — histórico completo retido e competência nominal soberana nas datas de fronteira.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
