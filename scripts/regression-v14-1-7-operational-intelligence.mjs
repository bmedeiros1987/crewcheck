import fs from 'node:fs';

function source(path) {
  if (!fs.existsSync(path)) throw new Error(`Arquivo obrigatório ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(path, pattern, description) {
  const value = source(path);
  if (!pattern.test(value)) throw new Error(`${description} (${path})`);
}

expect('render.yaml', /startCommand:\s*npm start/, 'Render precisa iniciar o runtime completo');
expect('server.mjs', /import '\.\/server\/telegram-fast-ack\.mjs';/, 'Servidor precisa importar o runtime como proteção adicional');
expect('server.mjs', /processTelegramUpdate[\s\S]+queued: true/, 'Webhook do Telegram precisa confirmar antes do processamento');
expect('server.mjs', /tomtomRoutePreview[\s\S]+trafficDelayInSeconds/, 'Rota precisa consultar trânsito TomTom ao vivo');
expect('server\/telegram-fast-ack.mjs', /crewcheck_commute_monitors/, 'Runtime precisa persistir monitores de deslocamento');
expect('server\/telegram-fast-ack.mjs', /\/api\/commute\/monitor/, 'Runtime precisa expor o registro do monitor');
expect('server\/telegram-fast-ack.mjs', /const RUNTIME_VERSION = '14\.1\.7-operational-intelligence'/, 'Runtime precisa publicar a versão operacional atual');
expect('server\/telegram-fast-ack.mjs', /async function runCommuteMonitorCycle\(db\)[\s\S]+summary\.commute = await runCommuteMonitorCycle\(db\)/, 'Monitor de deslocamento precisa manter definição e chamada');
expect('scripts\/v1414\/apply.mjs', /function commuteRouteKey\|async function runSchedulerCycle/, 'Patch do despertador não pode apagar helpers de deslocamento posteriores');
expect('client\/src\/pages\/Home.tsx', /Planejador de Saída/, 'Nome intuitivo precisa aparecer na interface');
expect('client\/src\/pages\/Home.tsx', /setInterval\(refresh, 60_000\)/, 'Rota aberta precisa atualizar a cada minuto');
expect('client\/src\/pages\/Home.tsx', /Leitura fácil/, 'Meteorologia precisa abrir em linguagem acessível');
expect('client\/src\/main.tsx', /v1417\/operational-intelligence\.css/, 'Correção visual precisa carregar por último');
expect('client\/src\/components\/v1417\/operational-intelligence.css', /var\(--cc-text\)[\s\S]+var\(--cc-surface\)/, 'Cores da meteorologia precisam usar os tokens do tema');

console.log('CrewCheck v14.1.7 operational intelligence regression: OK');
