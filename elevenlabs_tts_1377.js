// CrewCheck v14.3.21 — ElevenLabs TTS pt-BR natural e contextual.
// ElevenLabs permanece como TTS principal. A voz do titular é o padrão;
// Daniel continua disponível como alternativa explícita.
const CREWCHECK_BRUNO_VOICE_ID = 'hYLzOVviGWJgnkfQyCeO';

const CREWCHECK_AIRPORT_SPEECH_NAMES = Object.freeze({
  BSB: 'Brasília', SBBR: 'Brasília',
  GRU: 'São Paulo, aeroporto de Guarulhos', SBGR: 'São Paulo, aeroporto de Guarulhos',
  CGH: 'São Paulo, aeroporto de Congonhas', SBSP: 'São Paulo, aeroporto de Congonhas',
  GIG: 'Rio de Janeiro, aeroporto do Galeão', SBGL: 'Rio de Janeiro, aeroporto do Galeão',
  SDU: 'Rio de Janeiro, aeroporto Santos Dumont', SBRJ: 'Rio de Janeiro, aeroporto Santos Dumont',
  CNF: 'Belo Horizonte, aeroporto de Confins', SBCF: 'Belo Horizonte, aeroporto de Confins',
  FLN: 'Florianópolis', SBFL: 'Florianópolis',
  POA: 'Porto Alegre', SBPA: 'Porto Alegre',
  CWB: 'Curitiba', SBCT: 'Curitiba',
  MAB: 'Marabá', SBMA: 'Marabá',
  BEL: 'Belém', SBBE: 'Belém',
  MAO: 'Manaus', SBEG: 'Manaus',
  FOR: 'Fortaleza', SBFZ: 'Fortaleza',
  REC: 'Recife', SBRF: 'Recife',
  SSA: 'Salvador', SBSV: 'Salvador',
  SLZ: 'São Luís', SBSL: 'São Luís',
  NAT: 'Natal', SBNT: 'Natal',
  VIX: 'Vitória', SBVT: 'Vitória',
  GYN: 'Goiânia', SBGO: 'Goiânia',
  CGB: 'Cuiabá', SBCY: 'Cuiabá',
  CGR: 'Campo Grande', SBCG: 'Campo Grande',
  MCZ: 'Maceió', SBMO: 'Maceió',
  AJU: 'Aracaju', SBAR: 'Aracaju',
  JPA: 'João Pessoa', SBJP: 'João Pessoa',
  THE: 'Teresina', SBTE: 'Teresina',
  PMW: 'Palmas', SBPJ: 'Palmas',
  BVB: 'Boa Vista', SBBV: 'Boa Vista',
  PVH: 'Porto Velho', SBPV: 'Porto Velho',
  RBR: 'Rio Branco', SBRB: 'Rio Branco',
  MCP: 'Macapá', SBMQ: 'Macapá',
});

// Apelidos privados e afetivos. Nunca substituem o nome oficial em contexto
// operacional, regulatório, jurídico, de segurança, emergência ou documento.
const CREWCHECK_AIRPORT_CASUAL_ALIASES = Object.freeze({
  GRU: 'Bagulhos, Guarulhos', SBGR: 'Bagulhos, Guarulhos',
  CNF: 'Conflitos, Confins', SBCF: 'Conflitos, Confins',
  CGH: 'Cegonhas, Congonhas', SBSP: 'Cegonhas, Congonhas',
  GIG: 'Galinhão, Galeão', SBGL: 'Galinhão, Galeão',
  FLN: 'Floripa, Florianópolis', SBFL: 'Floripa, Florianópolis',
});

const CREWCHECK_FORMAL_CONTEXTS = new Set([
  'operational', 'regulatory', 'legal', 'safety', 'emergency', 'document',
  'radar', 'weather', 'metar', 'taf', 'compliance', 'incident', 'report',
]);

function elevenLabsApiKey() {
  return envAny(['ELEVENLABS_API_KEY', 'CREWCHECK_ELEVENLABS_API_KEY', 'ELEVENLABS_TTS_API_KEY']);
}
function elevenLabsVoiceId(options = {}) {
  const requestedProfile = String(options.voiceProfile || process.env.CREWCHECK_CONCIERGE_VOICE_PROFILE || 'bruno').trim().toLowerCase();
  if (requestedProfile === 'daniel') {
    return envAny(['ELEVENLABS_DANIEL_VOICE_ID', 'CREWCHECK_DANIEL_VOICE_ID', 'ELEVENLABS_VOICE_ID']);
  }
  if (options.voiceId) return String(options.voiceId).trim();
  return envAny(['CREWCHECK_BRUNO_VOICE_ID', 'ELEVENLABS_BRUNO_VOICE_ID']) || CREWCHECK_BRUNO_VOICE_ID;
}
function elevenLabsModelId() {
  return envAny(['ELEVENLABS_MODEL_ID', 'CREWCHECK_ELEVENLABS_MODEL_ID']) || 'eleven_multilingual_v2';
}
function elevenLabsOutputFormat() {
  return envAny(['ELEVENLABS_OUTPUT_FORMAT', 'CREWCHECK_ELEVENLABS_OUTPUT_FORMAT']) || 'mp3_44100_128';
}
function elevenLabsTtsConfigured(options = {}) {
  return Boolean(elevenLabsApiKey() && elevenLabsVoiceId(options));
}
function requestedCasualAirportAliases(options = {}) {
  if (typeof options.casualAirportAliases === 'boolean') return options.casualAirportAliases;
  return String(process.env.CREWCHECK_CONCIERGE_CASUAL_AIRPORT_ALIASES || 'false').toLowerCase() === 'true';
}
function hasFormalOrSensitiveContext(value = '', options = {}) {
  const context = String(options.context || '').trim().toLowerCase();
  if (CREWCHECK_FORMAL_CONTEXTS.has(context)) return true;
  return /\b(rbac|act|cct|regulamenta[cç][aã]o|irregularidade|limite|jornada|repouso legal|acidente|incidente|emerg[eê]ncia|cancelado|desvio|interdi[cç][aã]o|relat[oó]rio|documento|mor|asr|port[aã]o|terminal|metar|taf)\b/i.test(String(value || ''));
}
function airportSpeechMap(value = '', options = {}) {
  return requestedCasualAirportAliases(options) && !hasFormalOrSensitiveContext(value, options)
    ? { ...CREWCHECK_AIRPORT_SPEECH_NAMES, ...CREWCHECK_AIRPORT_CASUAL_ALIASES }
    : CREWCHECK_AIRPORT_SPEECH_NAMES;
}
function expandAirportCodesForSpeech(value = '', options = {}) {
  const map = airportSpeechMap(value, options);
  return String(value || '').replace(/\b([A-Z]{3,4})\b/g, (code) => map[code] || code);
}
function naturalBrazilianPortugueseForSpeech(value = '', options = {}) {
  return expandAirportCodesForSpeech(value, options)
    .replace(/\bvc\b/gi, 'você')
    .replace(/\bpq\b/gi, 'porque')
    .replace(/\bqdo\b/gi, 'quando')
    .replace(/\bq hrs?\b/gi, 'que horas')
    .replace(/\bp\/\b/gi, 'para')
    .replace(/\bhrs?\b/gi, 'horas')
    .replace(/\bmin\b/gi, 'minutos')
    .replace(/\bRES\b/g, 'Reserva')
    .replace(/\bHSB\b/g, 'Sobreaviso')
    .replace(/\bPS\b/g, 'passageiro')
    .replace(/\b(?:DO|DOF|DOP|OFF)\b/g, 'folga');
}
function cleanTtsText(value = '', options = {}) {
  return naturalBrazilianPortugueseForSpeech(value, options)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 1800);
}
async function generateElevenLabsSpeech(text, options = {}) {
  const apiKey = elevenLabsApiKey();
  const voiceId = elevenLabsVoiceId(options);
  const finalText = cleanTtsText(text, options);
  if (!apiKey || !voiceId) return { ok: false, configured: false, message: 'ElevenLabs aguardando API key e voz.' };
  if (!finalText) return { ok: false, configured: true, message: 'Texto vazio para gerar áudio.' };

  const outputFormat = elevenLabsOutputFormat();
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
  const body = {
    text: finalText,
    model_id: String(options.modelId || elevenLabsModelId()),
    language_code: 'pt',
    voice_settings: {
      stability: Number(process.env.ELEVENLABS_STABILITY || process.env.CREWCHECK_ELEVENLABS_STABILITY || 0.38),
      similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY_BOOST || process.env.CREWCHECK_ELEVENLABS_SIMILARITY_BOOST || 0.84),
      style: Number(process.env.ELEVENLABS_STYLE || process.env.CREWCHECK_ELEVENLABS_STYLE || 0.28),
      use_speaker_boost: String(process.env.ELEVENLABS_SPEAKER_BOOST || process.env.CREWCHECK_ELEVENLABS_SPEAKER_BOOST || 'true').toLowerCase() !== 'false',
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { accept: 'audio/mpeg', 'content-type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let message = 'ElevenLabs não gerou áudio agora.';
      const raw = await response.text().catch(() => '');
      try { const parsed = JSON.parse(raw); message = parsed?.detail?.message || parsed?.message || message; } catch {}
      return { ok: false, configured: true, status: response.status, message };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return { ok: false, configured: true, message: 'ElevenLabs retornou áudio vazio.' };
    return { ok: true, configured: true, buffer, contentType: 'audio/mpeg', outputFormat, modelId: body.model_id, voiceId, message: 'Áudio ElevenLabs gerado.' };
  } catch {
    return { ok: false, configured: true, message: 'Não consegui conectar ao ElevenLabs agora.' };
  }
}
async function sendTelegramAudioBuffer(chatId, buffer, filename = 'crewcheck-audio.mp3', caption = '') {
  const url = telegramApiUrl('sendAudio');
  if (!url) return { ok: false, configured: false, message: 'Telegram aguardando configuração.' };
  if (!chatId) return { ok: false, configured: true, message: 'Chat do Telegram não configurado.' };
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', String(caption).slice(0, 900));
    form.append('audio', new Blob([buffer], { type: 'audio/mpeg' }), filename);
    const response = await fetch(url, { method: 'POST', body: form });
    const payload = await response.json().catch(() => ({}));
    return { ok: Boolean(response.ok && payload.ok !== false), configured: true, status: response.status, data: payload, message: response.ok ? 'Áudio enviado.' : 'Áudio não entregue agora.' };
  } catch {
    return { ok: false, configured: true, message: 'Áudio não entregue agora.' };
  }
}
async function sendTelegramTtsAudio(chatId, text, options = {}) {
  const finalText = cleanTtsText(text, options);
  if (!elevenLabsTtsConfigured(options)) return { ok: false, configured: false, message: 'ElevenLabs aguardando configuração.' };
  const generated = await generateElevenLabsSpeech(finalText, options);
  if (!generated.ok) return generated;
  const sent = await sendTelegramAudioBuffer(chatId, generated.buffer, options.filename || 'crewcheck-elevenlabs.mp3', options.caption || 'CrewCheck Concierge');
  return { ...sent, provider: 'elevenlabs', tts: { ok: generated.ok, outputFormat: generated.outputFormat, modelId: generated.modelId, voiceId: generated.voiceId } };
}
async function handleTtsHealth(req, res) {
  const voiceId = elevenLabsVoiceId();
  return sendJson(res, 200, {
    ok: elevenLabsTtsConfigured(), configured: elevenLabsTtsConfigured(), provider: 'elevenlabs',
    model: elevenLabsTtsConfigured() ? elevenLabsModelId() : '', voiceConfigured: Boolean(voiceId),
    voiceProfile: voiceId === CREWCHECK_BRUNO_VOICE_ID ? 'bruno' : 'custom', keyConfigured: Boolean(elevenLabsApiKey()),
    casualAirportAliases: requestedCasualAirportAliases(),
    outputFormat: elevenLabsOutputFormat(),
    message: elevenLabsTtsConfigured() ? 'ElevenLabs TTS configurado em português brasileiro.' : 'ElevenLabs aguardando ELEVENLABS_API_KEY.',
  });
}
async function handleTtsSpeak(req, res) {
  if (req.method !== 'POST') return handleTtsHealth(req, res);
  const payload = await readJsonBody(req, 300000);
  const options = {
    voiceId: payload.voiceId,
    voiceProfile: payload.voiceProfile,
    modelId: payload.modelId,
    context: payload.context,
    casualAirportAliases: payload.casualAirportAliases,
  };
  const text = cleanTtsText(payload.text || payload.message || '', options);
  if (!text) return sendJson(res, 400, { ok: false, message: 'Texto vazio.' });
  const result = await generateElevenLabsSpeech(text, options);
  if (!result.ok) return sendJson(res, result.configured === false ? 200 : 502, { ok: false, configured: result.configured, provider: 'elevenlabs', message: result.message });
  return sendJson(res, 200, { ok: true, configured: true, provider: 'elevenlabs', contentType: result.contentType, outputFormat: result.outputFormat, voiceId: result.voiceId, audioBase64: result.buffer.toString('base64'), message: 'Áudio gerado com ElevenLabs.' });
}
