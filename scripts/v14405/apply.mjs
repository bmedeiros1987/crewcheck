import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14405] Ancora nao encontrada: ${label}`);
  return source.replace(before, after);
}

const serverPath = 'server.mjs';
const serverBefore = fs.readFileSync(serverPath, 'utf8');
let serverAfter = replaceOnce(
  serverBefore,
  `import { buildInfobipEnglishFallbackRequest, buildInfobipTtsRequest, infobipConfiguration, infobipProviderErrorDetail, infobipPublicStatus, infobipRejectedUnsupportedLanguage } from './server/v1396/infobip.mjs';`,
  `import { buildInfobipEnglishFallbackRequest, buildInfobipTtsRequest, infobipConfiguration, infobipProviderErrorDetail, infobipPublicStatus, infobipRejectedUnsupportedLanguage } from './server/v1396/infobip.mjs';
import { infobipElevenLabsAudioEnabled, startInfobipElevenLabsCall } from './server/v14405/infobip-elevenlabs.mjs';`,
  'import ElevenLabs para Infobip',
);
serverAfter = replaceOnce(
  serverAfter,
  `  let result = await fetchVoiceProvider(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  }, 18_000);
  let usedConfiguredVoice = Boolean(request.body?.messages?.[0]?.voice);`,
  `  let usedElevenLabsAudio = false;
  let result = null;
  if (infobipElevenLabsAudioEnabled()) {
    const privateCall = await startInfobipElevenLabsCall(phone, cleanVoiceCallText(text) || 'Despertador CrewCheck. Abra o aplicativo agora.');
    if (privateCall.ok) { result = privateCall; usedElevenLabsAudio = true; }
  }
  if (!result?.ok) {
    result = await fetchVoiceProvider(request.url, {
      method: 'POST', headers: request.headers, body: JSON.stringify(request.body),
    }, 18_000);
  }
  let usedConfiguredVoice = Boolean(request.body?.messages?.[0]?.voice);`,
  'upload privado e chamada ElevenLabs',
);
serverAfter = replaceOnce(
  serverAfter,
  `  if (result.ok && !usedConfiguredVoice) message = 'Ligação Premium iniciada pela Infobip com a voz padrão compatível.';`,
  `  if (result.ok && usedElevenLabsAudio) message = 'Ligação Premium iniciada pela Infobip com voz ElevenLabs em português.';
  else if (result.ok && !usedConfiguredVoice) message = 'Ligação Premium iniciada pela Infobip com a voz padrão compatível.';`,
  'mensagem de sucesso ElevenLabs',
);
if (serverAfter !== serverBefore) fs.writeFileSync(serverPath, serverAfter, 'utf8');

const fastPath = 'server/telegram-fast-ack.mjs';
const fastBefore = fs.readFileSync(fastPath, 'utf8');
let fastAfter = replaceOnce(
  fastBefore,
  `import { buildInfobipEnglishFallbackRequest, buildInfobipTtsRequest, infobipPublicStatus, infobipRejectedUnsupportedLanguage } from './v1396/infobip.mjs';`,
  `import { buildInfobipEnglishFallbackRequest, buildInfobipTtsRequest, infobipPublicStatus, infobipRejectedUnsupportedLanguage } from './v1396/infobip.mjs';
import { handleInfobipCallsEvent, infobipElevenLabsAudioEnabled, startInfobipElevenLabsCall } from './v14405/infobip-elevenlabs.mjs';`,
  'import ElevenLabs no scheduler',
);
fastAfter = replaceOnce(
  fastAfter,
  `  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);`,
  `  if (infobipElevenLabsAudioEnabled()) {
    const privateCall = await startInfobipElevenLabsCall(phone, message);
    if (privateCall.ok) return privateCall;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);`,
  'audio ElevenLabs no scheduler',
);
fastAfter = replaceOnce(
  fastAfter,
  `    try {
      if (path === '/api/notifications/runtime-health') return runtimeHealth(req, res);`,
  `    try {
      if (path === '/api/voice/infobip-calls-events' && req.method === 'POST') {
        const event = await readJson(req);
        handleInfobipCallsEvent(event).catch(() => null);
        return sendJson(res, 200, { ok: true });
      }
      if (path === '/api/notifications/runtime-health') return runtimeHealth(req, res);`,
  'webhook de eventos Calls API',
);
if (fastAfter !== fastBefore) fs.writeFileSync(fastPath, fastAfter, 'utf8');

console.log('[v14405] ElevenLabs conectado à Infobip por upload privado na Calls API.');
