import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const source = fs.readFileSync('server/telegram-fast-ack.mjs', 'utf8').replace(/\r\n/g, '\n');

// #335: o scheduler geral de notificações (runSchedulerCycle) só guardava
// lastCycle/schedulerRunning em variável de módulo - um restart/redeploy sempre
// resetava para null/false, tornando "nunca rodou desde este deploy" e "rodou bem
// por dias antes deste restart" indistinguíveis, o mesmo gap já corrigido para o
// monitor meteorológico crítico na PR #457 (recordWeatherMonitorHeartbeat/
// weatherMonitorHealthState em server.mjs).
const constMarker = 'const SCHEDULER_STALE_MS = Math.max(5 * 60_000, INTERVAL_MS * 6);';
assert.ok(source.includes(constMarker), 'SCHEDULER_STALE_MS não encontrada em server/telegram-fast-ack.mjs');

const startMarker = 'function schedulerHealthState(heartbeat, now = Date.now()) {';
const start = source.indexOf(startMarker);
assert.notEqual(start, -1, 'schedulerHealthState não encontrada (heartbeat ainda não implementado)');
const end = source.indexOf('\n}\n', start);
assert.notEqual(end, -1, 'fim de schedulerHealthState não localizado');
const fnSource = source.slice(start, end + 2);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-scheduler-heartbeat-'));
const tempFile = path.join(tempDir, 'scheduler-health-state.mjs');
try {
  const INTERVAL_MS_LINE = source.match(/const INTERVAL_MS = [^\n]+;/)[0];
  fs.writeFileSync(tempFile, `${INTERVAL_MS_LINE}\n${constMarker}\nexport ${fnSource}\n`, 'utf8');
  const { schedulerHealthState } = await import(pathToFileURL(tempFile).href);

  const now = Date.parse('2026-08-15T12:00:00Z');

  assert.equal(schedulerHealthState(null, now), 'never_run', 'sem heartbeat, o scheduler nunca deve aparecer como saudável');
  assert.equal(schedulerHealthState(undefined, now), 'never_run', 'heartbeat ausente (undefined) deve ser never_run');
  assert.equal(schedulerHealthState({}, now), 'never_run', 'heartbeat vazio (sem last_started_at) deve ser never_run');

  assert.equal(
    schedulerHealthState({ last_started_at: '2026-08-15T11:59:50Z', last_finished_at: null }, now),
    'running',
    'ciclo iniciado há pouco tempo sem last_finished_at deve estar em andamento',
  );

  assert.equal(
    schedulerHealthState({ last_started_at: '2026-08-15T11:00:00Z', last_finished_at: null }, now),
    'stuck',
    'ciclo iniciado muito antes do limite de execução esperado e nunca finalizado deve ser travado',
  );

  assert.equal(
    schedulerHealthState(
      { last_started_at: '2026-08-15T11:55:00Z', last_finished_at: '2026-08-15T11:55:30Z', last_status: 'ok' },
      now,
    ),
    'completed',
    'ciclo concluído com sucesso deve ser completed',
  );

  assert.equal(
    schedulerHealthState(
      { last_started_at: '2026-08-15T11:55:00Z', last_finished_at: '2026-08-15T11:55:30Z', last_status: 'error' },
      now,
    ),
    'last_failure',
    'ciclo concluído com erro deve ser last_failure, distinto de completed',
  );

  // Um novo ciclo iniciado (last_started_at mais recente que o last_finished_at
  // anterior) deve voltar a running mesmo que o ciclo anterior tenha sido bem-sucedido.
  assert.equal(
    schedulerHealthState(
      { last_started_at: '2026-08-15T11:59:50Z', last_finished_at: '2026-08-15T11:50:00Z', last_status: 'ok' },
      now,
    ),
    'running',
    'novo ciclo iniciado após o término do anterior deve voltar a running',
  );

  console.log('schedulerHealthState regression: ok');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Persistência sobrevive a restart/deploy: heartbeat gravado em tabela dedicada
// (crewcheck_scheduler_heartbeat), não em Map/variável de módulo isolada.
assert.ok(
  source.includes("CREATE TABLE IF NOT EXISTS crewcheck_scheduler_heartbeat"),
  'tabela dedicada de heartbeat do scheduler deve existir',
);

const runCycleStart = source.indexOf('async function runSchedulerCycle() {');
assert.notEqual(runCycleStart, -1, 'runSchedulerCycle não encontrada');
const runCycleEnd = source.indexOf('\n}\n', runCycleStart);
const runCycleBody = source.slice(runCycleStart, runCycleEnd + 2);

// dbPool() precisa ser resolvido ANTES do try/if(!db) throw, senão o heartbeat de
// início nunca é gravado quando o banco está indisponível logo no início do ciclo.
assert.ok(
  /const db = await dbPool\(\);\s*\n\s*if \(db\) await recordSchedulerHeartbeat\(db, \{ lastStartedAt: summary\.startedAt, lastFinishedAt: null \}\);\s*\n\s*try \{/.test(runCycleBody),
  'início do ciclo deve resolver dbPool() e gravar heartbeat de início antes do try/throw',
);
assert.ok(
  /finally \{[\s\S]*if \(db\) await recordSchedulerHeartbeat\(db, \{ lastFinishedAt: summary\.finishedAt, lastStatus: summary\.error \? 'error' : 'ok'/.test(runCycleBody),
  'fim do ciclo (sucesso ou falha) deve gravar heartbeat de término no finally, com status derivado de summary.error',
);

// Endpoint de leitura já existente (/api/notifications/runtime-health) precisa expor
// o estado persistido de forma aditiva, sem remover os campos em memória existentes
// (running/intervalMs/lastCycle) para não quebrar consumidores atuais.
const healthStart = source.indexOf('async function runtimeHealth(_req, res) {');
assert.notEqual(healthStart, -1, 'runtimeHealth não encontrada');
const healthEnd = source.indexOf('\n}\n', healthStart);
const healthBody = source.slice(healthStart, healthEnd + 2);

assert.ok(healthBody.includes('running: schedulerRunning'), 'campo em memória "running" deve continuar exposto (compatibilidade)');
assert.ok(healthBody.includes('lastCycle'), 'campo em memória "lastCycle" deve continuar exposto (compatibilidade)');
assert.ok(healthBody.includes('persistedState: schedulerHealthState(heartbeat)'), 'runtime-health deve expor persistedState calculado do heartbeat persistido');
assert.ok(healthBody.includes('persistedLastStartedAt'), 'runtime-health deve expor persistedLastStartedAt');
assert.ok(healthBody.includes('persistedLastFinishedAt'), 'runtime-health deve expor persistedLastFinishedAt');
assert.ok(healthBody.includes('persistedLastStatus'), 'runtime-health deve expor persistedLastStatus');

const routeRegistered = source.includes("if (path === '/api/notifications/runtime-health') return runtimeHealth(req, res);");
assert.equal(routeRegistered, true, 'rota /api/notifications/runtime-health deve continuar registrada (endpoint pré-existente, sem rota nova)');

console.log('Notification scheduler heartbeat/health regression: ok');
