import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server.mjs', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/components/v1393/weather.css', 'utf8');

assert.match(server, /api-redemet\.decea\.mil\.br\/mensagens\/metar/, 'A integração REDEMET deve permanecer no servidor.');
assert.match(server, /REDEMET_API_KEY/, 'A chave REDEMET deve ser lida somente por variável de ambiente.');
assert.doesNotMatch(home, /REDEMET_API_KEY/, 'A chave REDEMET não pode chegar ao cliente.');
assert.match(server, /airports/, 'A API deve aceitar origem e destino na mesma consulta.');
assert.match(server, /decodeMetarPtBr/, 'METAR precisa de leitura decodificada.');
assert.match(server, /decodeTafPtBr/, 'TAF precisa de leitura decodificada.');
assert.match(server, /cooldownMinutes:\s*90/, 'A política deve manter cooldown antispam.');
assert.match(server, /recoveryNotifications:\s*false/, 'Melhoras não devem gerar notificação.');
assert.match(server, /CREWCHECK_SCHEDULER_SECRET/, 'O monitor automático deve exigir segredo.');
assert.match(server, /CREWCHECK_WEATHER_MONITOR_ENABLED/, 'O monitor interno deve ser explicitamente ativado.');
assert.match(server, /\/alertameteo on/, 'O usuário deve controlar alertas pelo Telegram.');
assert.match(server, /cc_weather:/, 'O Telegram deve oferecer botões bruto e decodificado.');
assert.match(home, /Bruto/, 'A interface deve oferecer visualização bruta.');
assert.match(home, /Decodificado/, 'A interface deve oferecer visualização decodificada.');
assert.match(home, /type=all&view=/, 'A tela deve consultar METAR e TAF no formato escolhido.');
assert.match(css, /@media \(max-width: 520px\)/, 'A tela meteorológica deve ser responsiva.');

console.log('CrewCheck v13.9.3 REDEMET/weather regression OK');
