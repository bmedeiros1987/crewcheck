import fs from 'node:fs';

const VERSION = '14.4.08';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const TAG = '[v14408]';
const replyWrapper = fs.readFileSync('scripts/v14408/reply-wrapper.snippet', 'utf8').trim();

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`${TAG} Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertAfterRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`${TAG} Âncora ausente: ${label}`);
  return source.replace(anchor, `${anchor}\n${value.trimEnd()}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${TAG} Bloco ausente: ${label}`);
  return source.replace(before, after);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`${TAG} Função ausente: ${label}. start=${start} end=${end}`);
  const current = source.slice(start, end).trimEnd();
  if (current === replacement.trimEnd()) return source;
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

function replaceVoiceSettingsInFunction(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`${TAG} TTS não localizado: ${label}. start=${start} end=${end}`);
  const block = source.slice(start, end);
  if (block.includes('voice_settings: conciergeElevenLabsVoiceSettingsV14408(process.env),')) return source;
  const pattern = /voice_settings:\s*\{[\s\S]*?use_speaker_boost:[^\n]+\n\s*\},/;
  if (!pattern.test(block)) throw new Error(`${TAG} voice_settings não localizado em ${label}`);
  const patched = block.replace(pattern, 'voice_settings: conciergeElevenLabsVoiceSettingsV14408(process.env),');
  return `${source.slice(0, start)}${patched}${source.slice(end)}`;
}

function patchServer(source) {
  let next = source;
  const humanImport = `import {
  conciergeElevenLabsVoiceSettingsV14408,
  conciergeHumanizeReplyV14408,
  conciergeVoiceScriptV14408,
} from './server/v14408/concierge-human.mjs';`;
  next = insertAfterRequired(
    next,
    "} from './server/v14354/concierge-language.mjs';",
    humanImport,
    'import da camada humana do Concierge',
  );

  next = replaceBetween(
    next,
    'async function buildTelegramConciergeReply(',
    'async function buildTelegramConciergeReplyCore(',
    replyWrapper,
    'wrapper contextual do Concierge',
  );

  next = replaceVoiceSettingsInFunction(
    next,
    'async function generateElevenLabsSpeech(',
    'async function sendTelegramTtsAudio(',
    'gerador ElevenLabs principal',
  );

  next = replaceRequired(
    next,
    '  const finalReply = premiumVoiceText(replyText);',
    '  const finalReply = premiumVoiceText(conciergeVoiceScriptV14408(replyText, transcript));',
    'roteiro humano antes do TTS',
  );

  if (!next.includes("form.append('no_verbatim', 'true');")) {
    next = replaceRequired(
      next,
      "  form.append('language_code', 'por');",
      "  form.append('language_code', 'por');\n  form.append('tag_audio_events', 'false');\n  form.append('diarize', 'false');\n  form.append('no_verbatim', 'true');",
      'STT pt-BR limpo',
    );
  }

  next = next.replace(
    /(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g,
    `$1'${VERSION}'`,
  );

  if (!next.includes('conciergeHumanizeReplyV14408(finalized, text)')) throw new Error(`${TAG} humanização final não foi ligada.`);
  if (!next.includes('conciergeSemanticInputContextV14338(text, currentSnapshot)')) throw new Error(`${TAG} contexto semântico não foi restaurado.`);
  if (!next.includes("form.append('no_verbatim', 'true');")) throw new Error(`${TAG} Scribe v2 continua verbatim.`);
  if (!next.includes('voice_settings: conciergeElevenLabsVoiceSettingsV14408(process.env),')) throw new Error(`${TAG} perfil de voz natural não foi ligado.`);
  if (!new RegExp(`url\\.pathname === '/api/release'[^\\r\\n]*version\\s*:\\s*'${VERSION.replace(/\./g, '\\.')}'`).test(next)) throw new Error(`${TAG} /api/release não acompanha a versão.`);
  if (!new RegExp(`url\\.pathname === '/api/health'[^\\r\\n]*version\\s*:\\s*'${VERSION.replace(/\./g, '\\.')}'`).test(next)) throw new Error(`${TAG} /api/health não acompanha a versão.`);
  return next;
}

function patchInfobip(source) {
  let next = insertAfterRequired(
    source,
    "import { resolveElevenLabsVoiceV14348 } from '../v14348/elevenlabs-voice-policy.mjs';",
    "import { conciergeElevenLabsVoiceSettingsV14408 } from '../v14408/concierge-human.mjs';",
    'política de voz natural na Infobip',
  );
  const start = next.indexOf('export async function createInfobipElevenLabsAudio(');
  const end = start >= 0 ? next.indexOf('export async function startInfobipElevenLabsCall(', start) : -1;
  if (start < 0 || end < 0) throw new Error(`${TAG} createInfobipElevenLabsAudio não localizado.`);
  const block = next.slice(start, end);
  if (!block.includes('voice_settings: conciergeElevenLabsVoiceSettingsV14408(environment),')) {
    const pattern = /voice_settings:\s*\{[\s\S]*?use_speaker_boost:[^\n]+\n\s*\},/;
    if (!pattern.test(block)) throw new Error(`${TAG} voice_settings da Infobip não localizado.`);
    const patched = block.replace(pattern, 'voice_settings: conciergeElevenLabsVoiceSettingsV14408(environment),');
    next = `${next.slice(0, start)}${patched}${next.slice(end)}`;
  }
  return next;
}

function patchLegacyTts(source) {
  let next = source;
  const oldSettings = `    voice_settings: {
      stability: Number(process.env.ELEVENLABS_STABILITY || process.env.CREWCHECK_ELEVENLABS_STABILITY || 0.38),
      similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY_BOOST || process.env.CREWCHECK_ELEVENLABS_SIMILARITY_BOOST || 0.84),
      style: Number(process.env.ELEVENLABS_STYLE || process.env.CREWCHECK_ELEVENLABS_STYLE || 0.28),
      use_speaker_boost: String(process.env.ELEVENLABS_SPEAKER_BOOST || process.env.CREWCHECK_ELEVENLABS_SPEAKER_BOOST || 'true').toLowerCase() !== 'false',
    },`;
  const newSettings = `    voice_settings: {
      stability: Number(process.env.ELEVENLABS_STABILITY || process.env.CREWCHECK_ELEVENLABS_STABILITY || 0.52),
      similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY_BOOST || process.env.CREWCHECK_ELEVENLABS_SIMILARITY_BOOST || 0.76),
      style: Number(process.env.ELEVENLABS_STYLE || process.env.CREWCHECK_ELEVENLABS_STYLE || 0),
      use_speaker_boost: String(process.env.ELEVENLABS_SPEAKER_BOOST || process.env.CREWCHECK_ELEVENLABS_SPEAKER_BOOST || 'true').toLowerCase() !== 'false',
      speed: Number(process.env.ELEVENLABS_SPEED || process.env.CREWCHECK_ELEVENLABS_SPEED || 0.98),
    },`;
  if (next.includes(oldSettings)) next = next.replace(oldSettings, newSettings);
  if (!next.includes('speed: Number(process.env.ELEVENLABS_SPEED') && !next.includes('0.98')) {
    throw new Error(`${TAG} TTS legado não recebeu velocidade natural.`);
  }
  return next;
}

update('server.mjs', patchServer);
update('server/v14405/infobip-elevenlabs.mjs', patchInfobip);
update('elevenlabs_tts_1377.js', patchLegacyTts);

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Concierge contextual restaurado, texto humano e voz ElevenLabs estável';`)
  .replace('Converse normalmente', 'Converse de verdade')
  .replace('Você não precisa decorar comandos. Pergunte como falaria com um colega: o Concierge identifica data, voo, aeroporto e assunto, mantendo somente um contexto operacional curto para entender continuações.', 'Pergunte como falaria com alguém da operação. O Concierge mantém o contexto da conversa, entende continuações curtas e responde sem despejar linguagem técnica desnecessária.')
  .replace('Faça uma pergunta completa ou use os botões apenas como atalhos. Perguntas relacionadas podem continuar com frases curtas, como “e o portão?” ou “e depois?”.', 'Pergunte do seu jeito. Depois, continue com frases curtas como “e o portão?”, “e depois?” ou “que horas preciso sair?”.'), { optional: true });

update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`), { optional: true });
update('client/src/lib/crewcheckPremiumRuntime.ts', (source) => source.replace(/version:\s*'14\.\d+\.\d+'/, `version: '${VERSION}'`), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/var currentRelease = '[^']+';/g, `currentRelease = '${VERSION}';`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'Concierge com contexto curto restaurado, respostas mais naturais, transcrição pt-BR limpa e voz ElevenLabs ajustada para estabilidade.',
}, null, 2)}\n`, { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - live contextual concierge with natural pt-BR voice`;
  data.scripts ||= {};
  data.scripts['regression:v14.4.08:concierge-human-voice'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-4-08-concierge-human-voice.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140408')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

console.log(`${TAG} CrewCheck ${VERSION}: contexto semântico restaurado, texto humano e voz ElevenLabs estabilizada.`);
