import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const serverSource = fs.readFileSync('server.mjs', 'utf8').replace(/\r\n/g, '\n');

// #335: Admin/health precisa distinguir worker nunca executado, ciclo em andamento,
// último ciclo concluído, ciclo travado e última falha. Antes deste patch, nada
// persistia quando um ciclo do monitor meteorológico começava/terminava - a única
// evidência de execução era a resposta HTTP efêmera do próprio disparo.
const constMarker = 'const WEATHER_MONITOR_STALE_MS = 40 * 60_000;';
assert.ok(serverSource.includes(constMarker), 'WEATHER_MONITOR_STALE_MS não encontrada em server.mjs');

const startMarker = 'function weatherMonitorHealthState(heartbeat, now = Date.now()) {';
const start = serverSource.indexOf(startMarker);
assert.notEqual(start, -1, 'weatherMonitorHealthState não encontrada em server.mjs (heartbeat ainda não implementado)');
const end = serverSource.indexOf('\n}\n', start);
assert.notEqual(end, -1, 'fim de weatherMonitorHealthState não localizado');
const fnSource = serverSource.slice(start, end + 2);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-weather-heartbeat-'));
const tempFile = path.join(tempDir, 'weather-monitor-health-state.mjs');
try {
  fs.writeFileSync(tempFile, `${constMarker}\nexport ${fnSource}\n`, 'utf8');
  const { weatherMonitorHealthState } = await import(pathToFileURL(tempFile).href);

  const now = Date.parse('2026-08-13T12:00:00Z');

  assert.equal(weatherMonitorHealthState(null, now), 'never_run', 'sem heartbeat, o worker nunca deve aparecer como saudável');
  assert.equal(weatherMonitorHealthState(undefined, now), 'never_run', 'heartbeat ausente (undefined) deve ser never_run');
  assert.equal(weatherMonitorHealthState({}, now), 'never_run', 'heartbeat vazio deve ser never_run');

  assert.equal(
    weatherMonitorHealthState({ lastStartedAt: '2026-08-13T11:59:00Z', lastFinishedAt: null }, now),
    'running',
    'ciclo iniciado há pouco tempo sem finishedAt deve estar em andamento',
  );

  assert.equal(
    weatherMonitorHealthState({ lastStartedAt: '2026-08-13T11:00:00Z', lastFinishedAt: null }, now),
    'stuck',
    'ciclo iniciado muito antes do limite de execução esperado e nunca finalizado deve ser travado',
  );

  assert.equal(
    weatherMonitorHealthState(
      { lastStartedAt: '2026-08-13T11:55:00Z', lastFinishedAt: '2026-08-13T11:55:30Z', lastStatus: 'ok' },
      now,
    ),
    'completed',
    'ciclo concluído com sucesso deve ser completed',
  );

  assert.equal(
    weatherMonitorHealthState(
      { lastStartedAt: '2026-08-13T11:55:00Z', lastFinishedAt: '2026-08-13T11:55:30Z', lastStatus: 'error' },
      now,
    ),
    'last_failure',
    'ciclo concluído com erro deve ser last_failure, distinto de completed',
  );

  // Um novo ciclo iniciado (lastStartedAt mais recente que o lastFinishedAt anterior)
  // deve voltar a running mesmo que o ciclo anterior tenha sido bem-sucedido.
  assert.equal(
    weatherMonitorHealthState(
      { lastStartedAt: '2026-08-13T11:59:50Z', lastFinishedAt: '2026-08-13T11:50:00Z', lastStatus: 'ok' },
      now,
    ),
    'running',
    'novo ciclo iniciado após o término do anterior deve voltar a running',
  );

  console.log('weatherMonitorHealthState regression: ok');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Persistência sobrevive a restart/deploy: o heartbeat usa o mesmo conciergeDbPut/Get
// já usado pelo estado de dedupe (crewcheck_telegram_state), não um Map em memória isolado.
assert.ok(
  serverSource.includes("await recordWeatherMonitorHeartbeat({ lastStartedAt: now.toISOString(), lastFinishedAt: null });"),
  'início do ciclo deve gravar heartbeat persistido antes de rodar',
);
assert.ok(
  serverSource.includes('const current = (await conciergeDbGet(WEATHER_MONITOR_HEARTBEAT_KEY)) || {};'),
  'heartbeat deve ser lido via conciergeDbGet (mesma persistência do dedupe), não de um Map local',
);
assert.ok(
  serverSource.includes('await conciergeDbPut(WEATHER_MONITOR_HEARTBEAT_KEY, { ...current, ...patch });'),
  'heartbeat deve ser gravado via conciergeDbPut (sobrevive a restart/deploy)',
);
assert.ok(
  /catch \(error\) \{\s*await recordWeatherMonitorHeartbeat\(\{ lastFinishedAt: new Date\(\)\.toISOString\(\), lastStatus: 'error' \}\);\s*throw error;/.test(serverSource),
  'falha no ciclo deve ficar registrada no heartbeat como last_status=error',
);

// Endpoint de leitura: somente rota autorizada, GET, sem efeito colateral (nunca dispara
// um ciclo) e sem dado sensível — roster, e-mail, localização, token/secret nunca aparecem.
const healthStart = serverSource.indexOf('async function handleCriticalWeatherMonitorHealth(req, res) {');
assert.notEqual(healthStart, -1, 'handleCriticalWeatherMonitorHealth deve existir');
const healthEnd = serverSource.indexOf('\n}\n', healthStart);
const healthBody = serverSource.slice(healthStart, healthEnd + 2);

assert.ok(healthBody.includes('weatherAlertSchedulerAuthorized(req)'), 'endpoint de health deve exigir o mesmo segredo de scheduler que o endpoint de execução');
assert.ok(healthBody.includes("String(req.method || '').toUpperCase() !== 'GET'"), 'endpoint de health deve aceitar somente GET');
assert.equal(healthBody.includes('runCriticalWeatherMonitor('), false, 'endpoint de health nunca deve disparar um ciclo (só leitura)');
for (const forbidden of ['roster', 'chatId', 'email', 'snapshot', 'location', 'password', 'req.headers']) {
  assert.equal(
    new RegExp(forbidden, 'i').test(healthBody),
    false,
    `endpoint de health não pode referenciar dado sensível: ${forbidden}`,
  );
}
// Nomear a variável de ambiente (para orientar configuração) é diferente de vazar o
// valor do segredo: garantir que o handler nunca ecoa o segredo recebido de volta.
assert.equal(/received|bearer/i.test(healthBody), false, 'endpoint de health não pode ecoar o segredo recebido');

const routeRegistered = serverSource.includes("if (url.pathname === '/api/telegram/weather-monitor/health') return handleCriticalWeatherMonitorHealth(req, res, url);");
assert.equal(routeRegistered, true, 'rota /api/telegram/weather-monitor/health deve estar registrada');

console.log('Weather monitor heartbeat/health regression: ok');
