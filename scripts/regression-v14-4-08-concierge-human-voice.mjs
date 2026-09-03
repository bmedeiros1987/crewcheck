import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CONCIERGE_COMPACT_ROSTER_NOTICE_V14408,
  conciergeElevenLabsVoiceSettingsV14408,
  conciergeHumanizeReplyV14408,
  conciergeVoiceScriptV14408,
} from '../server/v14408/concierge-human.mjs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.4.08] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

const defaults = conciergeElevenLabsVoiceSettingsV14408({});
assert.equal(defaults.stability, 0.52, 'estabilidade natural deve partir de 0.52');
assert.equal(defaults.similarity_boost, 0.76, 'similaridade não deve ficar agressivamente alta');
assert.equal(defaults.style, 0, 'style deve ficar em zero por padrão');
assert.equal(defaults.use_speaker_boost, true, 'speaker boost deve permanecer ativo');
assert.equal(defaults.speed, 0.98, 'voz deve ficar levemente mais calma sem distorção');
assert.equal(conciergeElevenLabsVoiceSettingsV14408({ ELEVENLABS_SPEED: '5' }).speed, 1.2, 'speed deve respeitar limite da API');

const human = conciergeHumanizeReplyV14408([
  'Próxima programação',
  'LA3730 · BSB → GRU · apresentação 09:25.',
  'Confirme sempre a escala oficial antes da programação.',
  'Nota leve: Guarulhos já conhece essa mala de longe.',
  'Confirme sempre a escala oficial e as comunicações da empresa. Em caso de divergência, a fonte oficial prevalece.',
].join('\n'), 'o que tenho hoje?');
assert.ok(human.includes('LA3730'), 'dado operacional foi perdido');
assert.ok(!human.includes('Nota leve:'), 'rótulo robótico de humor não deve aparecer');
assert.equal(human.split(CONCIERGE_COMPACT_ROSTER_NOTICE_V14408).length - 1, 1, 'aviso de escala deve aparecer uma única vez');
assert.ok(human.includes('continuo daí'), 'resposta natural deve oferecer continuação contextual');

const rawMetar = 'METAR SBBR 251600Z 09005KT CAVOK';
assert.equal(conciergeHumanizeReplyV14408(rawMetar, '/metar SBBR raw'), rawMetar, 'METAR raw não pode ser reescrito');

const voice = conciergeVoiceScriptV14408([
  'Academia disponível',
  'Bodytech · plano Silver+ · 24h',
  'Fonte oficial Wellhub: https://wellhub.com/pt-br/search/',
].join('\n'), 'tem academia no meu plano?');
assert.ok(voice.includes('Silver Plus'), 'sinal + deve virar fala natural');
assert.ok(voice.includes('vinte e quatro horas'), '24h deve virar fala natural');
assert.ok(!voice.includes('https://'), 'voz não deve ler URL');
assert.ok(!voice.includes('Fonte oficial'), 'voz não deve ler metadado de fonte');
assert.ok(voice.length <= 760, 'roteiro de voz ficou longo demais');

const chain = read('scripts/v139/apply.mjs');
const apply = read('scripts/v14408/apply.mjs');
const server = read('server.mjs');
const infobip = read('server/v14405/infobip-elevenlabs.mjs');
const legacyTts = read('elevenlabs_tts_1377.js');

assert.ok(chain.includes("await import('../v14408/apply.mjs');"), 'v14.4.08 não está na preparação canônica');
assert.ok(server.includes("from './server/v14408/concierge-human.mjs';"), 'camada humana não foi ligada ao servidor');
assert.ok(server.includes('conciergeSemanticInputContextV14338(text, currentSnapshot)'), 'contexto semântico curto não foi restaurado');
assert.ok(
  server.includes('conciergeHumanizeReplyV14408(finalized, text)') || server.includes('conciergeNaturalReplyV14409(finalized, text)'),
  'resposta final não passa pela camada humana ou por uma sucessora compatível',
);
assert.ok(server.includes("form.append('no_verbatim', 'true');"), 'Scribe v2 não está limpando hesitações');
assert.ok(server.includes("form.append('tag_audio_events', 'false');"), 'eventos de áudio continuam poluindo a transcrição');
assert.ok(
  server.includes('voice_settings: conciergeElevenLabsVoiceSettingsV14408(process.env),') || server.includes('voice_settings: conciergeVoiceSettingsV14409(finalText, process.env),'),
  'TTS principal não usa política natural ou sucessora compatível',
);
assert.ok(
  infobip.includes('voice_settings: conciergeElevenLabsVoiceSettingsV14408(environment),') || infobip.includes('voice_settings: conciergeVoiceSettingsV14409(finalText, environment),'),
  'Infobip não usa política natural ou sucessora compatível',
);
assert.ok(legacyTts.includes('speed: Number(process.env.ELEVENLABS_SPEED'), 'fonte TTS legada não guarda speed natural');
assert.ok(legacyTts.includes('|| 0.52)'), 'fonte TTS legada não guarda stability corrigida');
assert.ok(legacyTts.includes('|| 0.76)'), 'fonte TTS legada não guarda similarity corrigida');
assert.ok(legacyTts.includes('|| 0),'), 'fonte TTS legada não zera style');

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/financialRules.ts',
  'client/src/lib/complianceEngine.ts',
]) {
  assert.ok(!apply.includes(`update('${protectedPath}'`), `patch não pode tocar motor protegido: ${protectedPath}`);
}

console.log('[v14.4.08] OK — base humana preservada; sucessores compatíveis podem substituir o renderizador final e a política de voz.');
