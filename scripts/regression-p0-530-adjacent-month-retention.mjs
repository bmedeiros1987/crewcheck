import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-530-adjacent-month-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

const leg = (flightNumber, origin, destination, departureTime, arrivalTime) => ({
  flightNumber, origin, destination, departureTime, arrivalTime,
});

const flightDay = (date, pairingCode, dutyReport, legs) => ({
  date, type: 'FLIGHT', pairingCode, dutyReport, legs,
});

const offDay = (date, code = 'DO') => ({ date, type: code, pairingCode: code, isDayOff: true, legs: [] });

function augustRoster() {
  return {
    crewName: 'BRUNO SARAIVA', crewId: '04453812', base: 'BSB', year: 2026, month: 8, rawText: 'AUGUST PUBLICATION',
    days: [
      offDay('01/08/2026'),
      flightDay('29/08/2026', 'LA3953/290826', '13:25', [
        leg('LA3953', 'BSB', 'POA', '14:15', '16:55'),
        leg('LA3590', 'POA', 'CNF', '17:35', '19:45'),
        leg('LA3591', 'CNF', 'POA', '20:30', '22:45'),
      ]),
      flightDay('30/08/2026', 'AUG-30', '12:45', [
        leg('LA3149', 'POA', 'CGH', '13:15', '14:50'),
        leg('LA3102', 'CGH', 'GYN', '16:10', '17:50'),
        leg('LA3235', 'GYN', 'CGH', '18:45', '20:25'),
        leg('LA3226', 'CGH', 'GYN', '21:45', '23:25'),
      ]),
      flightDay('31/08/2026', 'AUG-31', '14:10', [
        leg('LA3543', 'GYN', 'GRU', '14:40', '16:20'),
        leg('LA4662', 'GRU', 'JOI', '17:45', '18:55'),
        leg('LA3137', 'JOI', 'GRU', '19:40', '20:50'),
        leg('LA3308', 'GRU', 'FLN', '22:40', '23:55'),
      ]),
      flightDay('01/09/2026', 'AUG-CARRY-OUT', '14:10', [
        leg('LA3737', 'FLN', 'BSB', '14:40', '16:55'),
        leg('LA4737', 'BSB', 'CGH', '18:05', '19:45'),
        leg('LA4546', 'CGH', 'BSB', '21:05', '22:50'),
      ]),
    ],
  };
}

function septemberRoster() {
  return {
    crewName: 'BRUNO SARAIVA', crewId: '04453812', base: 'BSB', year: 2026, month: 9, rawText: 'SEPTEMBER PUBLICATION',
    days: [
      flightDay('2026-08-29', 'SEP-CARRY-29', '13:25', [
        leg('LA3953', 'BSB', 'POA', '14:15', '16:55'),
        leg('LA3590', 'POA', 'CNF', '17:35', '19:45'),
        leg('LA3591', 'CNF', 'POA', '20:30', '22:45'),
      ]),
      flightDay('2026-08-30', 'SEP-CARRY-30', '12:45', [
        leg('LA3149', 'POA', 'CGH', '13:15', '14:50'),
        leg('LA3102', 'CGH', 'GYN', '16:10', '17:50'),
        leg('LA3235', 'GYN', 'CGH', '18:45', '20:25'),
        leg('LA3226', 'CGH', 'GYN', '21:45', '23:25'),
      ]),
      flightDay('2026-08-31', 'SEP-CARRY-31', '14:10', [
        leg('LA3543', 'GYN', 'GRU', '14:40', '16:20'),
        leg('LA4662', 'GRU', 'JOI', '17:45', '18:55'),
        leg('LA3137', 'JOI', 'GRU', '19:40', '20:50'),
        leg('LA3308', 'GRU', 'FLN', '22:40', '23:55'),
      ]),
      flightDay('2026-09-01', 'SEP-01', '14:10', [
        leg('LA3737', 'FLN', 'BSB', '14:40', '16:55'),
        leg('LA4737', 'BSB', 'CGH', '18:05', '19:45'),
        leg('LA4546', 'CGH', 'BSB', '21:05', '22:50'),
      ]),
      offDay('2026-09-02'),
      flightDay('2026-09-03', 'SEP-03', '13:45', [leg('LA4794', 'BSB', 'VIX', '14:30', '16:15')]),
      offDay('2026-09-30', 'VC'),
    ],
  };
}

function canonicalDate(value) {
  const raw = String(value || '');
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return raw;
}

function countDate(roster, iso) {
  return (roster.days || []).filter((day) => canonicalDate(day.date) === iso).length;
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
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'bruno-e2e', email: 'bruno@example.test' }));

  const moduleUrl = `${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`;
  const database = await import(moduleUrl);
  assert.equal(typeof database.openRosterDisplayWindow, 'function', 'P0 #530: janela visual multi-competência ainda não existe');

  const compliance = { score: 100, alerts: [] };
  const august = augustRoster();
  const september = septemberRoster();

  // Ordem real 1: Agosto -> Setembro. Setembro é a competência operacional,
  // mas Agosto inteiro deve continuar navegável na Escala.
  await database.saveRosterAnalysis({ roster: august, compliance, gym: [], sourceFileName: 'agosto.pdf' });
  await database.saveRosterAnalysis({ roster: september, compliance, gym: [], sourceFileName: 'setembro.pdf' });
  const septemberWindow = await database.openRosterDisplayWindow(september);
  assert.equal(septemberWindow.year, 2026);
  assert.equal(septemberWindow.month, 9, 'janela visual não pode trocar a competência operacional primária');
  assert.equal(countDate(septemberWindow, '2026-08-01'), 1, 'importar Setembro não pode apagar o início de Agosto');
  assert.equal(countDate(septemberWindow, '2026-08-29'), 1, 'carry-in 29/08 deve ser deduplicado');
  assert.equal(countDate(septemberWindow, '2026-08-30'), 1, 'carry-in 30/08 deve ser deduplicado');
  assert.equal(countDate(septemberWindow, '2026-08-31'), 1, 'carry-in 31/08 deve ser deduplicado');
  assert.equal(countDate(septemberWindow, '2026-09-01'), 1, 'carry-out/carry-in 01/09 deve ser deduplicado');
  assert.equal(countDate(septemberWindow, '2026-09-30'), 1, 'fim de Setembro deve permanecer disponível');

  // Ordem real 2: Setembro -> Agosto. Reimportar Agosto não pode apagar Setembro.
  localStorage.clear();
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'bruno-e2e', email: 'bruno@example.test' }));
  await database.saveRosterAnalysis({ roster: september, compliance, gym: [], sourceFileName: 'setembro.pdf' });
  await database.saveRosterAnalysis({ roster: august, compliance, gym: [], sourceFileName: 'agosto.pdf' });
  const augustWindow = await database.openRosterDisplayWindow(august);
  assert.equal(augustWindow.year, 2026);
  assert.equal(augustWindow.month, 8, 'janela visual não pode trocar a competência operacional primária');
  assert.equal(countDate(augustWindow, '2026-08-01'), 1, 'início de Agosto deve permanecer disponível');
  assert.equal(countDate(augustWindow, '2026-08-29'), 1, '29/08 não pode duplicar na ordem reversa');
  assert.equal(countDate(augustWindow, '2026-09-01'), 1, '01/09 não pode duplicar na ordem reversa');
  assert.equal(countDate(augustWindow, '2026-09-30'), 1, 'reimportar Agosto não pode apagar Setembro');

  // A separação operacional/visual é parte do contrato: Cockpit segue usando events
  // do bundle ativo; apenas a Escala usa rosterEvents derivados da janela visual.
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  assert.match(home, /openRosterDisplayWindow/);
  assert.match(home, /const rosterEvents = useMemo\(\(\) => buildLegs\(rosterWindow\)/);
  assert.match(home, /view === 'cockpit'[\s\S]{0,900}events=\{events\}/, 'Cockpit deve continuar preso ao roster operacional ativo');
  assert.match(home, /view === 'roster'[\s\S]{0,900}events=\{rosterEvents\}/, 'Escala deve usar a janela visual multi-competência');
  assert.match(home, /finance=\{financeSnapshot\(bundle\.roster\)\}/, 'finanças devem continuar usando só a competência operacional ativa');

  console.log('[p0-530-adjacent-month] PASS — Agosto e Setembro coexistem na Escala nas duas ordens de importação, sem contaminar consumidores operacionais.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
