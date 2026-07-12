// CrewCheck v13.7.7 — ElevenLabs TTS Restore.
// ElevenLabs volta a ser o TTS principal. STT continua separado.
function elevenLabsApiKey() {
  return envAny(['ELEVENLABS_API_KEY', 'CREWCHECK_ELEVENLABS_API_KEY', 'ELEVENLABS_TTS_API_KEY']);
}
function elevenLabsVoiceId() {
  return envAny(['ELEVENLABS_VOICE_ID', 'CREWCHECK_ELEVENLABS_VOICE_ID', 'ELEVENLABS_DEFAULT_VOICE_ID']);
}
function elevenLabsModelId() {
  return envAny(['ELEVENLABS_MODEL_ID', 'CREWCHECK_ELEVENLABS_MODEL_ID']) || 'eleven_multilingual_v2';
}
function elevenLabsOutputFormat() {
  return envAny(['ELEVENLABS_OUTPUT_FORMAT', 'CREWCHECK_ELEVENLABS_OUTPUT_FORMAT']) || 'mp3_44100_128';
}
function elevenLabsTtsConfigured() {
  return Boolean(elevenLabsApiKey() && elevenLabsVoiceId());
}
function cleanTtsText(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 1800);
}
async function generateElevenLabsSpeech(text, options = {}) {
  const apiKey = elevenLabsApiKey();
  const voiceId = String(options.voiceId || elevenLabsVoiceId() || '').trim();
  const finalText = cleanTtsText(text);
  if (!apiKey || !voiceId) {
    return { ok: false, configured: false, message: 'ElevenLabs aguardando API key e voz.' };
  }
  if (!finalText) return { ok: false, configured: true, message: 'Texto vazio para gerar áudio.' };

  const outputFormat = elevenLabsOutputFormat();
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
  const body = {
    text: finalText,
    model_id: String(options.modelId || elevenLabsModelId()),
    voice_settings: {
      stability: Number(process.env.ELEVENLABS_STABILITY || process.env.CREWCHECK_ELEVENLABS_STABILITY || 0.48),
      similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY_BOOST || process.env.CREWCHECK_ELEVENLABS_SIMILARITY_BOOST || 0.78),
      style: Number(process.env.ELEVENLABS_STYLE || process.env.CREWCHECK_ELEVENLABS_STYLE || 0.18),
      use_speaker_boost: String(process.env.ELEVENLABS_SPEAKER_BOOST || process.env.CREWCHECK_ELEVENLABS_SPEAKER_BOOST || 'true').toLowerCase() !== 'false',
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'audio/mpeg',
        'content-type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let message = 'ElevenLabs não gerou áudio agora.';
      const raw = await response.text().catch(() => '');
      try {
        const parsed = JSON.parse(raw);
        message = parsed?.detail?.message || parsed?.message || message;
      } catch {}
      return { ok: false, configured: true, status: response.status, message };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return { ok: false, configured: true, message: 'ElevenLabs retornou áudio vazio.' };
    return { ok: true, configured: true, buffer, contentType: 'audio/mpeg', outputFormat, modelId: body.model_id, message: 'Áudio ElevenLabs gerado.' };
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
  const finalText = cleanTtsText(text);
  if (!elevenLabsTtsConfigured()) return { ok: false, configured: false, message: 'ElevenLabs aguardando configuração.' };
  const generated = await generateElevenLabsSpeech(finalText, options);
  if (!generated.ok) return generated;
  const sent = await sendTelegramAudioBuffer(chatId, generated.buffer, options.filename || 'crewcheck-elevenlabs.mp3', options.caption || 'CrewCheck Concierge');
  return { ...sent, provider: 'elevenlabs', tts: { ok: generated.ok, outputFormat: generated.outputFormat, modelId: generated.modelId } };
}
async function handleTtsHealth(req, res) {
  return sendJson(res, 200, {
    ok: elevenLabsTtsConfigured(),
    configured: elevenLabsTtsConfigured(),
    provider: 'elevenlabs',
    model: elevenLabsTtsConfigured() ? elevenLabsModelId() : '',
    voiceConfigured: Boolean(elevenLabsVoiceId()),
    keyConfigured: Boolean(elevenLabsApiKey()),
    outputFormat: elevenLabsOutputFormat(),
    message: elevenLabsTtsConfigured() ? 'ElevenLabs TTS configurado.' : 'ElevenLabs aguardando ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID.',
  });
}
async function handleTtsSpeak(req, res) {
  if (req.method !== 'POST') return handleTtsHealth(req, res);
  const payload = await readJsonBody(req, 300000);
  const text = cleanTtsText(payload.text || payload.message || '');
  if (!text) return sendJson(res, 400, { ok: false, message: 'Texto vazio.' });
  const result = await generateElevenLabsSpeech(text, {
    voiceId: payload.voiceId,
    modelId: payload.modelId,
  });
  if (!result.ok) return sendJson(res, result.configured === false ? 200 : 502, { ok: false, configured: result.configured, provider: 'elevenlabs', message: result.message });
  return sendJson(res, 200, {
    ok: true,
    configured: true,
    provider: 'elevenlabs',
    contentType: result.contentType,
    outputFormat: result.outputFormat,
    audioBase64: result.buffer.toString('base64'),
    message: 'Áudio gerado com ElevenLabs.',
  });
}
