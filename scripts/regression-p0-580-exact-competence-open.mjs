import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-exact-competence-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

function roster(year, month, dates) {
  return {
    crewName: 'TRIPULANTE TESTE',
    crewId: '00000000',
    base: 'BSB',
    year,
    month,
    days: dates.map((date) => ({ date, type: 'DO', isDayOff: true, legs: [] })),
  };
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
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-580', email: 'crew@example.test' }));

  const august = roster(2026, 8, Array.from({ length: 31 }, (_, index) => `${String(index + 1).padStart(2, '0')}/08/2026`));
  const september = roster(2026, 9, [
    '29/08/2026', '30/08/2026', '31/08/2026',
    ...Array.from({ length: 30 }, (_, index) => `${String(index + 1).padStart(2, '0')}/09/2026`),
  ]);

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/api/rosters/wrong-competence-id')) {
      return new Response(JSON.stringify({
        ok: true,
        data: { roster: september, compliance: { score: 100, alerts: [] }, gym: [] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === '/api/rosters/active') {
      return new Response(JSON.stringify({
        ok: true,
        roster: { id: 'september-id', year: 2026, month: 9, isActive: true },
        data: { roster: september, compliance: { score: 100, alerts: [] }, gym: [] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false, message: 'Histórico indisponível neste backend.' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  };

  const { openSavedRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

  await assert.rejects(
    () => openSavedRoster('august-id'),
    /histórico|competência|abrir|localizada/i,
    'abrir Agosto nunca pode cair silenciosamente na escala ativa de Setembro',
  );
  await assert.rejects(
    () => openSavedRoster('wrong-competence-id', { year: 2026, month: 8 }),
    /competência retornada não corresponde/i,
    'o payload de Setembro nunca pode satisfazer uma seleção nominal de Agosto',
  );

  assert.equal(august.days.length, 31, 'o oracle de Agosto deve representar a competência completa');
  assert.equal(september.days.filter((day) => /\/08\/2026$/.test(day.date)).length, 3, 'o oracle de Setembro deve conter carry-in de Agosto');
  assert.equal(september.days.filter((day) => /\/09\/2026$/.test(day.date)).length, 30, 'o oracle de Setembro deve manter a própria competência completa');

  const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
  const historyGenerator = fs.readFileSync('scripts/v14338/apply.mjs', 'utf8');
  const historyUiGenerator = fs.readFileSync('scripts/v14339/apply.mjs', 'utf8');
  const platformSource = fs.readFileSync('server/platform.mjs', 'utf8');
  assert.doesNotMatch(databaseSource, /Fallback premium:[\s\S]*?\/api\/rosters\/active/, 'abrir por ID não pode cair na escala ativa');
  assert.match(historyUiGenerator, /openSavedRoster\(item\.id, item\)/, 'a UI materializada deve informar a competência nominal selecionada');
  assert.match(historyUiGenerator, /toast\.error\(error instanceof Error \? error\.message : 'Não consegui abrir esta escala do histórico\.'\)/, 'a UI materializada deve expor o conflito de competência em vez de mascará-lo');
  assert.match(historyGenerator, /persistRosterHistoryLocally\(payload\)/, 'a preparação deve persistir cada publicação localmente por competência');
  assert.match(historyGenerator, /saveRosterAnalysis\(\{ roster, compliance: newCompliance, gym: newGym, sourceFileName: file\.name \}/, 'toda importação de PDF deve acionar o histórico local-first');
  assert.match(platformSource, /function rosterKey\(roster\)[\s\S]*roster\?\.year[\s\S]*roster\?\.month/, 'a chave remota deve usar ano/mês nominais da publicação');

  console.log('[p0-580-exact-competence] OK — falha de histórico não é mascarada pela competência ativa.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
