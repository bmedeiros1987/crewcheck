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

// dbPool() precisa ser resolvido DENTRO do try (não antes dele): se dbPool()
// rejeitar/lançar antes do try, a função sai sem passar pelo finally e
// schedulerRunning fica travado em true para sempre, bloqueando todo ciclo
// seguinte até um restart. Ver teste comportamental abaixo, que força essa
// falha e prova que o bloqueio não acontece.
assert.ok(
  /const summary = \{[^}]*\};\s*\n(?:\s*\/\/[^\n]*\n)*\s*let db = null;\s*\n\s*try \{\s*\n\s*db = await dbPool\(\);\s*\n\s*if \(!db\) throw new Error/.test(runCycleBody),
  'db deve ser inicializado como null antes do try e resolvido (await dbPool()) somente dentro do try, para que uma rejeição também caia no finally',
);
assert.ok(
  /db = await dbPool\(\);\s*\n\s*if \(!db\) throw new Error\('Banco indisponível para notificações\.'\);\s*\n\s*await recordSchedulerHeartbeat\(db, \{ lastStartedAt: summary\.startedAt, lastFinishedAt: null \}\);/.test(runCycleBody),
  'heartbeat de início só deve ser gravado depois de confirmar que db existe (dentro do try)',
);
assert.ok(
  /finally \{[\s\S]*if \(db\) await recordSchedulerHeartbeat\(db, \{ lastFinishedAt: summary\.finishedAt, lastStatus: summary\.error \? 'error' : 'ok'/.test(runCycleBody),
  'fim do ciclo (sucesso ou falha) deve gravar heartbeat de término no finally, com status derivado de summary.error',
);
assert.ok(
  /finally \{\s*\n\s*summary\.finishedAt = new Date\(\)\.toISOString\(\);\s*\n\s*lastCycle = summary;\s*\n\s*schedulerRunning = false;/.test(runCycleBody),
  'finally deve sempre resetar schedulerRunning=false e publicar lastCycle, independentemente de dbPool() ter lançado',
);

// Teste comportamental (não apenas estático): executa o corpo REAL de
// runSchedulerCycle extraído do arquivo-fonte contra um dbPool() mockado que
// pode rejeitar, resolver null ou resolver um "banco" fake. Prova que uma
// falha em dbPool() não deixa schedulerRunning travado em true e que o ciclo
// seguinte não fica bloqueado.
const cycleTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-scheduler-cycle-'));
const cycleTempFile = path.join(cycleTempDir, 'run-scheduler-cycle.mjs');
try {
  const harness = `
export let schedulerRunning = false;
export let lastCycle = null;
export let dbPoolCalls = 0;
export let heartbeatCalls = [];
let dbPoolResult = 'reject';
export function setDbPoolResult(value) { dbPoolResult = value; }

async function dbPool() {
  dbPoolCalls += 1;
  if (dbPoolResult === 'reject') throw new Error('ECONNREFUSED simulado (dbPool indisponível)');
  return dbPoolResult;
}
async function ensureNotificationTable() {}
async function runCommuteMonitorCycle() { return { ok: true }; }
async function recordSchedulerHeartbeat(db, patch) { heartbeatCalls.push(patch); }
async function deliverJob() { return { ok: true }; }

${runCycleBody}

export { runSchedulerCycle };
`;
  fs.writeFileSync(cycleTempFile, harness, 'utf8');
  const mod = await import(pathToFileURL(cycleTempFile).href);

  // 1) dbPool() rejeita logo no início do ciclo.
  mod.setDbPoolResult('reject');
  await mod.runSchedulerCycle();
  assert.equal(mod.dbPoolCalls, 1, 'dbPool() deve ter sido chamado no primeiro ciclo');
  assert.equal(mod.schedulerRunning, false, 'após dbPool() rejeitar, schedulerRunning deve voltar a false (finally deve rodar mesmo com throw antes do try)');
  assert.ok(mod.lastCycle?.error, 'ciclo com dbPool() rejeitando deve registrar summary.error');
  assert.equal(mod.heartbeatCalls.length, 0, 'sem db resolvido, nenhum heartbeat (início ou fim) deve ser gravado');

  // 2) Um segundo ciclo, chamado logo em seguida, não pode ficar bloqueado
  // pelo schedulerRunning=true que o bug antigo deixava travado.
  mod.setDbPoolResult(null);
  await mod.runSchedulerCycle();
  assert.equal(mod.dbPoolCalls, 2, 'segundo ciclo não pode ser bloqueado: dbPool() deve ser chamado novamente');
  assert.equal(mod.schedulerRunning, false, 'segundo ciclo (banco indisponível) também deve liberar schedulerRunning=false ao final');
  assert.equal(mod.lastCycle?.error, 'Banco indisponível para notificações.', 'dbPool() resolvendo null deve preservar a mensagem original de banco indisponível');
  assert.equal(mod.heartbeatCalls.length, 0, 'db=null também não deve gravar heartbeat (mesma regra: só grava com db confirmado)');

  // 3) Terceiro ciclo com "banco" disponível: prova que a cadeia continua
  // funcionando após duas falhas seguidas e que o heartbeat de início/fim é
  // gravado somente quando db existe de fato.
  const fakeDb = { query: async () => [[]] };
  mod.setDbPoolResult(fakeDb);
  await mod.runSchedulerCycle();
  assert.equal(mod.dbPoolCalls, 3, 'terceiro ciclo também não pode ficar bloqueado pelos dois anteriores');
  assert.equal(mod.schedulerRunning, false, 'ciclo bem-sucedido deve terminar com schedulerRunning=false');
  assert.equal(mod.lastCycle?.error, undefined, 'ciclo bem-sucedido não deve registrar summary.error');
  assert.equal(mod.heartbeatCalls.length, 2, 'ciclo bem-sucedido deve gravar heartbeat de início e de fim (db existe)');
  assert.equal(mod.heartbeatCalls[0].lastFinishedAt, null, 'heartbeat de início deve marcar lastFinishedAt=null');
  assert.equal(mod.heartbeatCalls[1].lastStatus, 'ok', 'heartbeat de fim de ciclo bem-sucedido deve ter lastStatus=ok');

  console.log('runSchedulerCycle behavioral regression (dbPool reject/null/success não trava schedulerRunning): ok');
} finally {
  fs.rmSync(cycleTempDir, { recursive: true, force: true });
}

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
