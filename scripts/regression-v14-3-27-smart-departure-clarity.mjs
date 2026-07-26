import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const applyPath = path.join(root, 'scripts/v14327/apply.mjs');
const css = fs.readFileSync(path.join(root, 'client/src/components/v14327/smart-departure-clarity.css'), 'utf8');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');

assert.ok(css.includes('.cz-depart-when'), 'layout da data ausente');
assert.ok(css.includes('.cz-depart-detail'), 'layout sem sobreposição ausente');
assert.ok(chain.includes("await import('../v14327/apply.mjs');"), 'patch não conectado à preparação');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14327-'));
const homeDir = path.join(tempDir, 'client/src/pages');
const homePath = path.join(homeDir, 'Home.tsx');
fs.mkdirSync(homeDir, { recursive: true });

const fixture = `import '@/components/v1406/premium-layout.css';

type SmartDepartureEstimate = { source: 'live' | 'cached' | 'estimated' };
function routeDurationMinutes(route: unknown) { return Number(route || 0); }
function saveDepartureTravelMinutes(_event: unknown, _minutes: number) {}
function readDepartureTravelMinutes(_event: unknown) { return 45; }
function defaultDepartureTravelMinutes() { return 60; }
function smartDepartureEstimate(event: unknown, route: unknown, margin: number) {
  const liveMinutes = routeDurationMinutes(route);
  if (liveMinutes > 0) saveDepartureTravelMinutes(event, liveMinutes);
  const cachedMinutes = readDepartureTravelMinutes(event);
  const travelMinutes = liveMinutes || cachedMinutes || defaultDepartureTravelMinutes();
  const source: SmartDepartureEstimate['source'] = liveMinutes ? 'live' : cachedMinutes ? 'cached' : 'estimated';
  return { source, travelMinutes, leaveDate: new Date(), leaveLabel: '10:00', travelLabel: '45 min', marginMinutes: margin, presentationLabel: '11:20' };
}
function Departure({ event }: { event: any }) {
  const route = null;
  const margin = 35;
  const originLabel = 'Hotel';
  const modeLabel = 'Automático';
  const routePending = false;
  const estimate = smartDepartureEstimate(event, route, margin);
  const liveMinutes = routeDurationMinutes(route);
  const statusLabel = liveMinutes ? 'TRÂNSITO ATUALIZADO' : routePending ? 'CALCULANDO TRÂNSITO' : 'ESTIMATIVA PROTEGIDA';
  return <section className="cz-departure" data-departure-v1406="true">
    <article className="cz-depart-hero"><header className="cz-depart-hero-head"><span>SAÍDA PREVISTA</span><em>{statusLabel}</em></header><small>variação histórica</small><strong className="cz-depart-time">{estimate.leaveLabel}</strong><h2>{originLabel} → {event.origin}</h2><p>{modeLabel} · {estimate.travelLabel}</p></article>
    <div className="cz-depart-kpis">
      <div>
        <Navigation/>
        <span>Sair às</span>
        <strong>{estimate.leaveLabel}</strong>
      </div>
    </div>
  </section>;
}
function MonthlyMapView() { return null; }
`;

try {
  fs.writeFileSync(homePath, fixture, 'utf8');

  const first = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr || first.stdout || 'primeira execução falhou');

  const prepared = fs.readFileSync(homePath, 'utf8');
  assert.ok(prepared.includes("import '@/components/v14327/smart-departure-clarity.css';"), 'CSS v14.3.27 não importado');
  assert.ok(prepared.includes('rawLiveMinutes >= 5 && rawLiveMinutes <= 300'), 'limite de rota incompatível ausente');
  assert.ok(prepared.includes("weekday: 'long'"), 'dia da saída ausente');
  assert.equal((prepared.match(/className="cz-depart-when"/g) || []).length, 1, 'hero novo deve existir uma vez');
  assert.equal((prepared.match(/className="cz-depart-detail"/g) || []).length, 1, 'detalhes separados devem existir uma vez');
  assert.ok(prepared.includes('className="cz-depart-warning"'), 'aviso de rota incompatível ausente');
  assert.ok(prepared.includes('<span>Sair em {leaveDayLabel}</span><strong>{estimate.leaveLabel}</strong>'), 'KPI com data ausente');
  assert.ok(prepared.includes('data-departure-v1406="true" data-departure-v14327="true"'), 'marcador da versão ausente');
  assert.ok(prepared.includes('function MonthlyMapView()'), 'função seguinte não pode ser removida');
  assert.ok(!prepared.includes('variação histórica'), 'hero legado deve ser substituído por estrutura canônica');

  const second = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda execução falhou');
  assert.equal(fs.readFileSync(homePath, 'utf8'), prepared, 'patch v14.3.27 deve ser idempotente');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('v14.3.27 structural smart departure regression: OK');
