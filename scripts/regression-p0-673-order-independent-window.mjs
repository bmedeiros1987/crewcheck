import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');

assert.match(databaseSource, /export async function openRosterDisplayWindow\(primary: CrewRoster\)/, 'P0 #673: janela histórica multi-competência ausente');
assert.match(home, /const \[rosterWindow, setRosterWindow\] = useState<CrewRoster>/, 'P0 #673: estado da janela histórica ausente');

const refreshStart = home.indexOf('const refreshRosterWindow = () => {');
assert.ok(refreshStart >= 0, 'P0 #673: refresh da janela histórica ausente');
const refreshSlice = home.slice(refreshStart, refreshStart + 1800);
const openStart = home.indexOf('void openRosterDisplayWindow(primary)', refreshStart);
assert.ok(openStart > refreshStart, 'P0 #673: materialização histórica assíncrona ausente');
const preOpenSlice = home.slice(refreshStart, openStart);

// Real-device lifecycle guard: do not eagerly collapse a complete display window
// while a newer async materialization is still running, and never let an older
// response win after a later request has started.
assert.match(home, /const rosterWindowRequestRef = useRef\(0\)/, 'P0 #673: falta geração monotônica para impedir resultado stale');
assert.doesNotMatch(preOpenSlice, /setRosterWindow\(primary\);/, 'P0 #673: refresh não pode encolher a Escala antes de iniciar a materialização histórica');
assert.match(refreshSlice, /const requestId = \+\+rosterWindowRequestRef\.current/, 'P0 #673: refresh sem request id monotônico');
assert.match(refreshSlice, /requestId === rosterWindowRequestRef\.current/, 'P0 #673: resultado assíncrono antigo ainda pode sobrescrever o mais novo');
assert.match(home, /saveRosterAnalysis\([\s\S]{0,500}\.finally\(\(\) => \{[\s\S]{0,500}crewcheck:roster-history-updated/, 'P0 #673: import não agenda refresh pós-persistência');

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

function makeRoster(month, marker) {
  const mm = String(month).padStart(2, '0');
  return {
    crewName: 'TRIPULANTE P0 673',
    crewId: 'P0673CREW',
    base: 'BSB',
    year: 2026,
    month,
    rawText: marker,
    days: [{
      date: `2026-${mm}-10`,
      type: 'DO',
      pairingCode: `P0673-${mm}-${marker}`,
      isDayOff: true,
      legs: [],
    }],
  };
}

function monthKey(value) {
  const raw = String(value || '');
  const iso = raw.match(/^(\d{4})-(\d{2})-/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const br = raw.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
  return br ? `${br[2]}-${String(Number(br[1])).padStart(2, '0')}` : '';
}

function monthsOf(roster) {
  return Array.from(new Set((roster.days || []).map((day) => monthKey(day.date)).filter(Boolean))).sort();
}

function semanticDays(roster, acceptedMonths) {
  return (roster.days || [])
    .filter((day) => acceptedMonths.includes(monthKey(day.date)))
    .map((day) => ({
      date: String(day.date || ''),
      type: String(day.type || ''),
      pairingCode: String(day.pairingCode || ''),
      dutyReport: String(day.dutyReport || ''),
      dutyDebrief: String(day.dutyDebrief || ''),
      legs: (day.legs || []).map((leg) => [leg.flightNumber, leg.origin, leg.destination, leg.departureTime, leg.arrivalTime]),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.pairingCode.localeCompare(b.pairingCode));
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-p0-673-'));
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
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'p0-673', email: 'p0-673@example.test' }));

  const moduleUrl = `${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`;
  const database = await import(moduleUrl);
  const compliance = { score: 100, alerts: [] };

  const feb = makeRoster(2, 'FEB-A');
  const mar = makeRoster(3, 'MAR-A');
  const sep = makeRoster(9, 'SEP-A');

  // Exact real-device sequence: February -> March must be coherent immediately.
  await database.saveRosterAnalysis({ roster: feb, compliance, gym: [], sourceFileName: 'fevereiro.pdf' });
  await database.saveRosterAnalysis({ roster: mar, compliance, gym: [], sourceFileName: 'marco.pdf' });
  const febMarImmediate = await database.openRosterDisplayWindow(mar);
  assert.deepEqual(monthsOf(febMarImmediate), ['2026-02', '2026-03'], 'Feb→Mar deve materializar histórico completo imediatamente, sem depender de importação futura');
  const febMarSignature = semanticDays(febMarImmediate, ['2026-02', '2026-03']);

  // Importing unrelated September may add September, but must not heal/change Feb/Mar.
  await database.saveRosterAnalysis({ roster: sep, compliance, gym: [], sourceFileName: 'setembro.pdf' });
  const afterSeptember = await database.openRosterDisplayWindow(sep);
  assert.deepEqual(monthsOf(afterSeptember), ['2026-02', '2026-03', '2026-09'], 'Setembro pode ser adicionado sem ocultar Fevereiro/Março');
  assert.deepEqual(
    semanticDays(afterSeptember, ['2026-02', '2026-03']),
    febMarSignature,
    'importar Setembro não pode alterar/curar retroativamente a materialização Feb/Mar',
  );

  // Same saved set, different import order: result must be deterministic.
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'p0-673', email: 'p0-673@example.test' }));
  await database.saveRosterAnalysis({ roster: mar, compliance, gym: [], sourceFileName: 'marco-random.pdf' });
  await database.saveRosterAnalysis({ roster: sep, compliance, gym: [], sourceFileName: 'setembro-random.pdf' });
  await database.saveRosterAnalysis({ roster: feb, compliance, gym: [], sourceFileName: 'fevereiro-random.pdf' });
  const randomOrderWindow = await database.openRosterDisplayWindow(sep);
  assert.deepEqual(monthsOf(randomOrderWindow), ['2026-02', '2026-03', '2026-09'], 'ordem de importação não pode mudar competências visíveis');
  assert.deepEqual(
    semanticDays(randomOrderWindow, ['2026-02', '2026-03']),
    febMarSignature,
    'o mesmo conjunto Feb/Mar deve produzir a mesma janela semântica em ordem aleatória',
  );

  // Reimport replaces only its own nominal competence; the rest of history remains.
  const marReimport = makeRoster(3, 'MAR-B');
  await database.saveRosterAnalysis({ roster: marReimport, compliance, gym: [], sourceFileName: 'marco-reimport.pdf' });
  const afterReimport = await database.openRosterDisplayWindow(sep);
  assert.deepEqual(monthsOf(afterReimport), ['2026-02', '2026-03', '2026-09'], 'reimportar Março não pode remover Fevereiro/Setembro');
  assert.equal(semanticDays(afterReimport, ['2026-02']).length, 1, 'Fevereiro deve permanecer intacto após reimportar Março');
  const marchRows = semanticDays(afterReimport, ['2026-03']);
  assert.equal(marchRows.length, 1, 'deve existir uma única publicação nominal efetiva de Março');
  assert.match(marchRows[0].pairingCode, /MAR-B/, 'reimportação mais nova de Março deve substituir somente Março');

  console.log('[p0-673] PASS — lifecycle monotônico + reproducer Feb/Mar/Set + ordem aleatória/reimportação determinísticos.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
