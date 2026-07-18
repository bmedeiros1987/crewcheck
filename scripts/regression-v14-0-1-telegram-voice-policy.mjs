import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('./v139/apply.mjs');
const server = fs.readFileSync('server.mjs', 'utf8');

assert.match(server, /function telegramVoiceReplyPolicy\(/, 'Política central de respostas de voz deve existir.');
assert.match(server, /location-dependent-command/, 'Hospitais, farmácias, academias e diretórios devem ficar em texto.');
assert.match(server, /needs-location/, 'Pedidos que dependem da localização devem ficar em texto.');
assert.match(server, /no-useful-answer/, 'Falhas, comandos não compreendidos e escala ausente devem ficar em texto.');
assert.match(server, /long-reply/, 'Respostas longas devem ficar em texto.');
assert.match(server, /TELEGRAM_CONCIERGE_MAX_VOICE_CHARS/, 'Limite de tamanho de áudio deve ser configurável.');
assert.match(server, /if \(!policy\.allowed\) return false;/, 'TTS não deve ser chamado quando a política bloquear áudio.');
assert.match(server, /showHumanRecordingAction\(chatId, 1\)/, 'Áudio permitido deve usar apenas uma ação curta de gravação.');
assert.match(server, /conciseVoiceOnly: true/, 'Diagnóstico deve declarar voz concisa.');
assert.match(server, /locationDirectoriesTextOnly: true/, 'Diagnóstico deve declarar diretórios apenas em texto.');

console.log('CrewCheck v14.0.1 Telegram voice policy OK.');
