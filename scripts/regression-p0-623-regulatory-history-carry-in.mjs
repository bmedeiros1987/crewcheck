import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-623-history-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

const pad2 = (value) => String(value).padStart(2, '0');
const civil = (year, month, day) => `${pad2(day)}/${pad2(month)}/${year}`;
const leg = (date, hours, aircraftType = 'A320') => ({
  date,
  type: 'FLIGHT',
  pairingCode: `PAIR-${date}`,
  dutyReport: '08:00',
  dutyDebrief: '10:00',
  legs: [{
    flightNumber: 'LA9000', origin: 'AAA', destination: 'BBB',
    departureTime: '08:00', arrivalTime: '10:00', duration: hours,
    aircraftType,
  }],
});
const off = (date) => ({ date, type: 'DO', pairingCode: 'DO', isDayOff: true, legs: [] });

function januaryRoster() {
  const days = [];
  for (let day = 1; day <= 31; day += 1) days.push(off(civil(2032, 1, day)));
  days[4] = leg(civil(2032, 1, 5), 50);
  return {
    crewName: 'TRIPULANTE TESTE', crewId: '00000000', base: 'BSB', rank: 'CCM',
    airline: 'LATAM', year: 2032, month: 1, rawText: 'A320', days,
  };
}

function februaryRoster() {
  const days = [];
  for (let day = 1; day <= 29; day += 1) days.push(off(civil(2032, 2, day)));
  days[0] = leg(civil(2032, 2, 1), 50);
  return {
    crewName: 'TRIPULANTE TESTE', crewId: '00000000', base: 'BSB', rank: 'CCM',
    airline: 'LATAM', year: 2032, month: 2, rawText: 'A320', days,
  };
}

const incomplete = (result) => result.alerts.some((alert) => /28 dias.*incompleta/i.test(String(alert.title || '')));
const violation = (result) => result.alerts.some((alert) => alert.title === 'Limite de 28 dias de horas de voo excedido' && alert.classification === 'confirmada');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
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
  localStorage.setItem('crewcheck_auth_token', 'test-token');
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-623', email: 'crew@example.test' }));

  const database = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);
  assert.equal(typeof database.recomputeComplianceWithRegulatoryHistory, 'function', '#623: recomputador regulatório histórico ainda não existe');

  const jan = januaryRoster();
  const feb = februaryRoster();
  const janSummary = {
    id: 'jan-id', checksum: 'jan-checksum', createdAt: '2032-01-31T12:00:00.000Z',
    crewName: jan.crewName, crewId: jan.crewId, base: jan.base, rank: jan.rank, airline: jan.airline,
    year: 2032, month: 1, sourceFileName: 'jan.pdf', score: 100, intensityScore: 0,
    alertsCount: 0, criticalAlertsCount: 0, isActive: false,
  };
  const febSummary = {
    id: 'feb-id', checksum: 'feb-checksum', createdAt: '2032-02-01T12:00:00.000Z',
    crewName: feb.crewName, crewId: feb.crewId, base: feb.base, rank: feb.rank, airline: feb.airline,
    year: 2032, month: 2, sourceFileName: 'feb.pdf', score: 100, intensityScore: 0,
    alertsCount: 0, criticalAlertsCount: 0, isActive: true,
  };

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('/api/rosters?')) return json({ ok: true, rosters: [febSummary, janSummary] });
    if (url.includes('/api/rosters/jan-id')) return json({ ok: true, data: { roster: jan, compliance: null, gym: [] } });
    return json({ ok: false }, 404);
  };
  const complete = await database.recomputeComplianceWithRegulatoryHistory(feb);
  assert.equal(complete.history.complete, true, 'competência anterior disponível e consulta de conta bem-sucedida deve completar a cobertura');
  assert.equal(complete.history.source, 'account', 'proveniência regulatória deve registrar consulta de conta');
  assert.equal(incomplete(complete.compliance), false, 'aviso de 28 dias incompleto deve desaparecer quando o carry-in está comprovado');
  assert.equal(violation(complete.compliance), true, '50h em janeiro + 50h em fevereiro deve confirmar 100h/28d no perfil NarrowBody');
  assert.equal(complete.compliance.metrics.totalFlightHours, 50, 'KPI da competência ativa deve continuar isolado em fevereiro');

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('/api/rosters?')) return json({ ok: true, rosters: [febSummary] });
    return json({ ok: false }, 404);
  };
  const absent = await database.recomputeComplianceWithRegulatoryHistory(feb);
  assert.equal(absent.history.complete, false, 'ausência confirmada da competência anterior deve manter fail-closed');
  assert.equal(absent.history.source, 'account', 'consulta bem-sucedida sem histórico continua sendo account, não network_error');
  assert.equal(incomplete(absent.compliance), true, 'ausência confirmada deve preservar o alerta de avaliação incompleta');

  globalThis.fetch = async () => json({ ok: false, message: 'offline' }, 503);
  const offline = await database.recomputeComplianceWithRegulatoryHistory(feb);
  assert.equal(offline.history.complete, false, 'falha de rede nunca pode declarar cobertura completa');
  assert.equal(offline.history.source, 'network_error', 'falha de rede deve ser distinguível de ausência real');
  assert.equal(incomplete(offline.compliance), true, 'fallback/offline deve manter avaliação incompleta');

  localStorage.removeItem('crewcheck_auth_token');
  const noToken = await database.recomputeComplianceWithRegulatoryHistory(feb);
  assert.equal(noToken.history.complete, false, 'ausência de token deve ser fail-closed');
  assert.equal(noToken.history.source, 'unauthenticated');
  assert.equal(incomplete(noToken.compliance), true);

  // End-to-end consumer contract: every active/imported/opened roster already flows
  // through bundle.roster, so Home must asynchronously refine ONLY bundle.compliance
  // from proven account history without swapping the roster or creating a loop.
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  assert.match(home, /recomputeComplianceWithRegulatoryHistory/,
    'Home deve importar o recomputador regulatório histórico');
  assert.match(home, /recomputeComplianceWithRegulatoryHistory\(primary\)/,
    'Home deve recomputar o bundle ativo quando a escala muda');
  assert.match(home, /setBundle\(\(current\) => current\.roster === primary \? \{ \.\.\.current, compliance: result\.compliance \} : current\)/,
    'Home deve atualizar somente compliance e preservar o roster operacional ativo');
  assert.match(home, /\}, \[bundle\.roster\]\);/,
    'recomputação deve reagir à troca de roster, não à troca de compliance');

  console.log('[p0-623-regulatory-history] PASS — carry-in regulatório distingue conta, ausência, rede e autenticação, preserva KPI ativo e alimenta a Home sem trocar o roster.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
