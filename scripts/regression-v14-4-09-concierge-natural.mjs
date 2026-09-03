import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  conciergeNaturalReplyV14409,
  conciergeVoiceScriptV14409,
  conciergeVoiceSettingsV14409,
  conciergeVoiceProfileV14409,
  CONCIERGE_MAX_SPOKEN_CHARS_V14409,
} from '../server/v14409/concierge-natural.mjs';

const sample = [
  'Apresentação',
  'LA3730 · segunda-feira 17/08/2026',
  'Você se apresenta às 09:25 em BSB.',
  'Término publicado: 15:40.',
  'Confirme sempre a escala oficial antes da programação.',
  'Se quiser, eu continuo daí e calculo a saída ou mostro o que vem depois.',
].join('\n');

const natural = conciergeNaturalReplyV14409(sample, 'que horas é minha apresentação?');
assert.ok(natural.startsWith('Sua apresentação é às 09:25 em BSB.'), `resposta deve começar pelo dado pedido: ${natural}`);
assert.ok(natural.includes('LA3730'), 'contexto do voo deve ser preservado');
assert.ok(natural.includes('O término publicado é 15:40.'), 'término publicado deve ser preservado');
assert.equal((natural.match(/vale a escala oficial/gi) || []).length, 1, 'aviso oficial deve aparecer uma única vez');
assert.doesNotMatch(natural, /Se quiser, eu|Posso continuar|Posso cruzar/i, 'resposta não pode terminar em frase enlatada');
assert.doesNotMatch(natural, /^Apresentação$/m, 'heading redundante deve ser removido');

const rawMetar = 'METAR SBBR 251700Z 09008KT CAVOK 27/12 Q1017';
assert.equal(conciergeNaturalReplyV14409(rawMetar, '/metar SBBR raw'), rawMetar, 'METAR raw deve permanecer byte-a-byte igual');

const voice = conciergeVoiceScriptV14409([
  natural,
  'Fonte oficial: https://example.com/fonte',
].join('\n'), 'que horas é minha apresentação?');
assert.ok(voice.includes('Sua apresentação é às 09:25 em BSB.'), 'voz deve começar pelo fato operacional');
assert.ok(!voice.includes('https://'), 'voz não deve ler URL');
assert.ok(!voice.includes('Fonte oficial'), 'voz não deve ler metadado de fonte');
assert.ok(voice.includes('Se a escala mudar, vale a oficial.'), 'voz deve manter ressalva operacional curta');
assert.ok(voice.length <= CONCIERGE_MAX_SPOKEN_CHARS_V14409 + 45, 'áudio deve ser curto');

assert.equal(conciergeVoiceProfileV14409('qual o portão do meu voo?'), 'operational');
assert.equal(conciergeVoiceProfileV14409('o voo foi cancelado e estou com alerta'), 'alert');
assert.equal(conciergeVoiceProfileV14409('me conta algo rápido'), 'conversation');

const conversationSettings = conciergeVoiceSettingsV14409('me conta algo rápido', {});
const operationalSettings = conciergeVoiceSettingsV14409('qual o portão do meu voo?', {});
const alertSettings = conciergeVoiceSettingsV14409('voo cancelado, alerta', {});
assert.equal(conversationSettings.stability, 0.40);
assert.equal(conversationSettings.style, 0.08);
assert.equal(operationalSettings.stability, 0.47);
assert.equal(operationalSettings.speed, 0.97);
assert.equal(alertSettings.stability, 0.57);
assert.equal(alertSettings.speed, 0.95);
assert.equal(conciergeVoiceSettingsV14409('qual o portão?', { CREWCHECK_ELEVENLABS_STABILITY: '0.61' }).stability, 0.61, 'env deve continuar tendo precedência');

const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');
const infobip = fs.readFileSync('server/v14405/infobip-elevenlabs.mjs', 'utf8');
const release = JSON.parse(fs.readFileSync('client/public/release.json', 'utf8'));
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.ok(chain.includes("await import('../v14409/apply.mjs');"), 'v14.4.09 deve estar na preparação canônica');
assert.ok(server.includes("from './server/v14409/concierge-natural.mjs';"), 'servidor deve importar o renderizador natural');
assert.ok(server.includes('conciergeNaturalReplyV14409(finalized, text)'), 'resposta final deve usar v14.4.09');
assert.ok(server.includes('conciergeVoiceScriptV14409(replyText, transcript)'), 'TTS deve usar roteiro v14.4.09');
assert.ok(server.includes('conciergeVoiceSettingsV14409(finalText, process.env)'), 'TTS deve usar prosódia adaptativa');
assert.ok(infobip.includes('conciergeVoiceSettingsV14409(finalText, environment)'), 'Infobip deve usar a mesma prosódia adaptativa');
assert.equal(release.version, '14.4.09');
assert.equal(packageJson.version, '14.4.09');
assert.match(server, /url\.pathname === '\/api\/release'[^\r\n]*version\s*:\s*'14\.4\.09'/);
assert.match(server, /url\.pathname === '\/api\/health'[^\r\n]*version\s*:\s*'14\.4\.09'/);

console.log('[v14.4.09] Concierge natural: answer-first, sem frases enlatadas, voz curta e prosódia adaptativa validados.');
