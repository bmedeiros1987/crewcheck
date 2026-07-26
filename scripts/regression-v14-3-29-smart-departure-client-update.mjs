import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const applyPath = path.join(root, 'scripts/v14329/apply.mjs');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
assert.ok(chain.includes("await import('../v14329/apply.mjs');"), 'v14.3.29 deve estar no fim da preparação canônica');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14329-'));
const write = (relative, content) => {
  const target = path.join(tempDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
};

write('client/src/pages/Home.tsx', `const DEFAULT_VERSION = '14.3.19';
const CREWCHECK_UI_CORE_NOTE = 'legado';
const storage = { get() { return ''; }, set() {} };
function smartDepartureEstimate(margin: number) {
  const travelMinutes = 35;
  const marginMinutes = Math.max(0, Math.min(180, Number.isFinite(Number(margin)) ? Math.round(Number(margin)) : 35));
  const leadMinutes = Math.max(45, travelMinutes + marginMinutes);
  return { leadMinutes, marginMinutes };
}
function Departure() {
  const [margin, setMargin] = useState(() => Number(storage.get('crewcheck_departure_margin', '35')) || 35);
  function chooseMargin(next: number) { setMargin(next); storage.set('crewcheck_departure_margin', String(next)); }
  return <section><p>A saída nunca fica igual à apresentação: mesmo sem resposta do trânsito, o CrewCheck usa uma estimativa protegida e mantém pelo menos 45 minutos de antecedência total.</p><div>{[15, 25, 35, 45].map((value) => <button key={value}>{value}</button>)}</div></section>;
}
`);
write('client/src/App.tsx', "localStorage.setItem('crewcheck_last_loaded_version', '14.3.19');\n");
write('client/src/pages/AuthPage.tsx', "const value = localStorage.getItem('crewcheck_last_loaded_version', '14.3.19');\nexport const view = <main data-version=\"14.3.19\"/>;\n");
write('client/index.html', `<!doctype html>
<html data-crewcheck-release="14.3.28"><head><meta name="crewcheck-release" content="14.3.28" /><link rel="manifest" href="/manifest.json?v=14328"/><script>var key='crewcheck-cache-reset-14-3-28';</script></head><body><div id="root"></div><script id="crewcheck-auto-update-v14328">navigator.serviceWorker.register('/sw.js?v=14328', { updateViaCache: 'none' });</script></body></html>
`);
write('client/public/sw.js', `const CACHE_NAME = 'crewcheck-v14.3.28-shell';
const RUNTIME_CACHE = 'crewcheck-v14.3.28-runtime';
self.addEventListener('message', (event) => { if (event.data === 'SKIP_WAITING') event.waitUntil(self.skipWaiting()); });
`);

try {
  const first = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr || first.stdout || 'primeira execução v14.3.29 falhou');

  const home = fs.readFileSync(path.join(tempDir, 'client/src/pages/Home.tsx'), 'utf8');
  assert.ok(home.includes("const DEFAULT_VERSION = '14.3.29';"), 'versão web visível não foi atualizada');
  assert.ok(home.includes("crewcheck_departure_margin_v14329_migrated"), 'migração de margem ausente');
  assert.ok(home.includes('const allowed = [15, 20, 25, 30, 40, 60];'), 'opções canônicas de margem ausentes');
  assert.ok(home.includes('Math.max(15, Math.min(60'), 'margem deve ficar entre 15 e 60 minutos');
  assert.ok(home.includes('const leadMinutes = travelMinutes + marginMinutes;'), 'cálculo deve somar deslocamento e margem sem piso oculto');
  assert.ok(!home.includes('Math.max(45, travelMinutes + marginMinutes)'), 'piso oculto de 45 minutos não pode permanecer');
  assert.ok(home.includes('O padrão é 15 minutos antes da apresentação.'), 'explicação da chegada padrão ausente');
  assert.ok(home.includes('{[15, 20, 25, 30, 40, 60].map'), 'seletor de margem não foi ampliado');

  const app = fs.readFileSync(path.join(tempDir, 'client/src/App.tsx'), 'utf8');
  const auth = fs.readFileSync(path.join(tempDir, 'client/src/pages/AuthPage.tsx'), 'utf8');
  assert.ok(app.includes("crewcheck_last_loaded_version', '14.3.29'"), 'App deve registrar a versão web atual');
  assert.ok(auth.includes('data-version="14.3.29"'), 'Auth deve expor a versão web atual');

  const index = fs.readFileSync(path.join(tempDir, 'client/index.html'), 'utf8');
  assert.ok(index.includes('data-crewcheck-release="14.3.29"'), 'release do HTML ausente');
  assert.ok(index.includes('content="14.3.29"'), 'meta release ausente');
  assert.ok(index.includes('crewcheck-cache-reset-14-3-29'), 'chave de limpeza não foi rotacionada');
  assert.ok(index.includes('manifest.json?v=14329'), 'manifest não foi versionado');
  assert.ok(index.includes('crewcheck-auto-update-v14329'), 'registro automático não foi versionado');
  assert.ok(index.includes("/sw.js?v=14329"), 'service worker não foi versionado');
  assert.equal((index.match(/crewcheck-release-watch-v14329/g) || []).length, 1, 'watch de release deve existir uma vez');
  assert.ok(index.includes("fetch('/release.json?ts=' + Date.now()"), 'watch deve consultar release.json sem cache');
  assert.ok(index.includes('window.setInterval(checkRelease, 300000)'), 'watch periódico de cinco minutos ausente');

  const watchMatch = index.match(/<script id="crewcheck-release-watch-v14329">([\s\S]*?)<\/script>/);
  assert.ok(watchMatch, 'script de atualização não localizado');
  assert.doesNotThrow(() => new Function(watchMatch[1]), 'script de atualização deve ter sintaxe JavaScript válida');

  const sw = fs.readFileSync(path.join(tempDir, 'client/public/sw.js'), 'utf8');
  assert.ok(sw.includes("crewcheck-v14.3.29-shell"), 'cache shell não foi rotacionado');
  assert.ok(sw.includes("crewcheck-v14.3.29-runtime"), 'cache runtime não foi rotacionado');
  assert.ok(sw.includes('SKIP_WAITING'), 'service worker deve continuar aceitando ativação imediata');

  const release = JSON.parse(fs.readFileSync(path.join(tempDir, 'client/public/release.json'), 'utf8'));
  assert.deepEqual(release, { version: '14.3.29', channel: 'web', updatePolicy: 'automatic' });

  const snapshot = [home, app, auth, index, sw, JSON.stringify(release)].join('\n---\n');
  const second = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda execução v14.3.29 falhou');
  const secondSnapshot = [
    fs.readFileSync(path.join(tempDir, 'client/src/pages/Home.tsx'), 'utf8'),
    fs.readFileSync(path.join(tempDir, 'client/src/App.tsx'), 'utf8'),
    fs.readFileSync(path.join(tempDir, 'client/src/pages/AuthPage.tsx'), 'utf8'),
    fs.readFileSync(path.join(tempDir, 'client/index.html'), 'utf8'),
    fs.readFileSync(path.join(tempDir, 'client/public/sw.js'), 'utf8'),
    JSON.stringify(JSON.parse(fs.readFileSync(path.join(tempDir, 'client/public/release.json'), 'utf8'))),
  ].join('\n---\n');
  assert.equal(secondSnapshot, snapshot, 'v14.3.29 deve ser idempotente');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('v14.3.29 smart departure and automatic client update regression: OK');
