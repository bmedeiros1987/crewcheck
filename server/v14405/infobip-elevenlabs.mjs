import { resolveElevenLabsVoiceV14348 } from '../v14348/elevenlabs-voice-policy.mjs';
import { infobipConfiguration, normalizeInfobipEndpoint } from '../v1396/infobip.mjs';

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const CALL_JOB_TTL_MS = 30 * 60 * 1000;
const callJobs = new Map();

function envValue(environment, names) {
  for (const name of names) {
    const value = String(environment?.[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function cleanText(value = '') {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 900);
}

function cleanupCallJobs(now = Date.now()) {
  for (const [callId, job] of callJobs) {
    if (!job || job.createdAt + CALL_JOB_TTL_MS <= now) callJobs.delete(callId);
  }
}

function callsHeaders(configuration, json = true) {
  return {
    authorization: `App ${configuration.apiKey}`,
    accept: 'application/json',
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}

async function responsePayload(response) {
  const raw = await response.text().catch(() => '');
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch {}
  return { raw, payload };
}

export function infobipElevenLabsAudioEnabled(environment = process.env) {
  return String(environment?.CREWCHECK_INFOBIP_USE_ELEVENLABS_AUDIO || 'true').trim().toLowerCase() !== 'false';
}

export function buildInfobipCallsRequest({ environment = process.env, phone = '' } = {}) {
  const configuration = infobipConfiguration(environment);
  const destination = normalizeInfobipEndpoint(phone || environment.CREWCHECK_ADMIN_PHONE || '');
  const callsConfigurationId = envValue(environment, ['INFOBIP_CALLS_CONFIGURATION_ID', 'CREWCHECK_INFOBIP_CALLS_CONFIGURATION_ID']) || 'crewcheck-elevenlabs';
  if (!configuration.configured || !/^\d{8,15}$/.test(destination)) {
    return { ok: false, configured: configuration.configured, provider: 'infobip-elevenlabs', message: 'Infobip Calls API ou telefone incompleto.' };
  }
  return {
    ok: true,
    configured: true,
    provider: 'infobip-elevenlabs',
    uploadUrl: `${configuration.baseUrl}/calls/1/file/upload`,
    callUrl: `${configuration.baseUrl}/calls/1/calls`,
    headers: callsHeaders(configuration),
    uploadHeaders: callsHeaders(configuration, false),
    body: {
      callsConfigurationId,
      endpoint: { type: 'PHONE', phoneNumber: destination },
      from: configuration.from,
      connectTimeout: 30,
    },
  };
}

export async function createInfobipElevenLabsAudio(text, { environment = process.env, fetchImpl = fetch } = {}) {
  if (!infobipElevenLabsAudioEnabled(environment)) return { ok: false, configured: false, message: 'Áudio ElevenLabs desativado para Infobip.' };
  const apiKey = envValue(environment, ['ELEVENLABS_API_KEY', 'CREWCHECK_ELEVENLABS_API_KEY', 'ELEVENLABS_TTS_API_KEY']);
  const voice = resolveElevenLabsVoiceV14348('default', environment);
  const finalText = cleanText(text);
  if (!apiKey || !voice.voiceId) return { ok: false, configured: false, message: 'ElevenLabs aguardando chave e voz.' };
  if (!finalText) return { ok: false, configured: true, message: 'Texto vazio para o áudio da ligação.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { accept: 'audio/mpeg', 'content-type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({
        text: finalText,
        model_id: envValue(environment, ['ELEVENLABS_TTS_MODEL', 'ELEVENLABS_MODEL_ID', 'CREWCHECK_ELEVENLABS_TTS_MODEL']) || 'eleven_multilingual_v2',
        voice_settings: {
          stability: Number(envValue(environment, ['ELEVENLABS_TTS_STABILITY', 'ELEVENLABS_STABILITY']) || 0.48),
          similarity_boost: Number(envValue(environment, ['ELEVENLABS_TTS_SIMILARITY_BOOST', 'ELEVENLABS_SIMILARITY_BOOST']) || 0.78),
          style: Number(envValue(environment, ['ELEVENLABS_TTS_STYLE', 'ELEVENLABS_STYLE']) || 0.18),
          use_speaker_boost: String(envValue(environment, ['ELEVENLABS_TTS_SPEAKER_BOOST', 'ELEVENLABS_SPEAKER_BOOST']) || 'true').toLowerCase() !== 'false',
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, configured: true, status: response.status, message: 'ElevenLabs não gerou o áudio da ligação agora.' };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_AUDIO_BYTES) return { ok: false, configured: true, message: 'O áudio ElevenLabs ficou vazio ou acima de 4 MB.' };
    return { ok: true, configured: true, buffer, provider: 'elevenlabs', voiceProfile: voice.profile, message: 'Áudio ElevenLabs preparado.' };
  } catch {
    return { ok: false, configured: true, message: 'ElevenLabs não respondeu para gerar a ligação.' };
  } finally {
    clearTimeout(timer);
  }
}

export async function startInfobipElevenLabsCall(phone, text, { environment = process.env, fetchImpl = fetch } = {}) {
  const request = buildInfobipCallsRequest({ environment, phone });
  if (!request.ok) return request;
  const audio = await createInfobipElevenLabsAudio(text, { environment, fetchImpl });
  if (!audio.ok) return { ...audio, provider: 'infobip-elevenlabs' };

  try {
    const form = new FormData();
    form.append('file', new Blob([audio.buffer], { type: 'audio/mpeg' }), 'crewcheck-alarm.mp3');
    const uploadResponse = await fetchImpl(request.uploadUrl, { method: 'POST', headers: request.uploadHeaders, body: form });
    const upload = await responsePayload(uploadResponse);
    const fileId = String(upload.payload?.fileId || upload.payload?.id || '').trim();
    if (!uploadResponse.ok || !fileId) return { ok: false, configured: true, provider: 'infobip-elevenlabs', status: uploadResponse.status, message: 'A Infobip não aceitou o áudio privado.' };

    const callResponse = await fetchImpl(request.callUrl, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) });
    const created = await responsePayload(callResponse);
    const callId = String(created.payload?.callId || created.payload?.id || '').trim();
    if (!callResponse.ok || !callId) return { ok: false, configured: true, provider: 'infobip-elevenlabs', status: callResponse.status, message: 'A Infobip não iniciou a chamada com o áudio privado.' };
    cleanupCallJobs();
    callJobs.set(callId, { baseUrl: new URL(request.callUrl).origin, headers: request.headers, fileId, createdAt: Date.now(), playing: false });
    return { ok: true, configured: true, provider: 'infobip-elevenlabs', status: callResponse.status, message: 'Ligação Premium iniciada pela Infobip com voz ElevenLabs em português.' };
  } catch (error) {
    return { ok: false, configured: true, provider: 'infobip-elevenlabs', message: error?.name === 'AbortError' ? 'Tempo limite na integração de voz.' : 'A integração ElevenLabs e Infobip não respondeu agora.' };
  }
}

function eventList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.events)) return payload.events;
  return payload && typeof payload === 'object' ? [payload] : [];
}

async function postCallAction(job, callId, action, body, fetchImpl) {
  return fetchImpl(`${job.baseUrl}/calls/1/calls/${encodeURIComponent(callId)}/${action}`, {
    method: 'POST', headers: job.headers, body: JSON.stringify(body || {}),
  });
}

export async function handleInfobipCallsEvent(payload, { fetchImpl = fetch } = {}) {
  cleanupCallJobs();
  let handled = 0;
  for (const event of eventList(payload)) {
    const callId = String(event?.callId || event?.properties?.callId || '').trim();
    const type = String(event?.type || '').trim().toUpperCase();
    const job = callJobs.get(callId);
    if (!job) continue;
    handled += 1;
    if (type === 'CALL_ESTABLISHED' && !job.playing) {
      job.playing = true;
      const response = await postCallAction(job, callId, 'play', { loopCount: 1, content: { type: 'FILE', fileId: job.fileId } }, fetchImpl);
      if (!response.ok) callJobs.delete(callId);
    } else if (type === 'PLAY_FINISHED') {
      await postCallAction(job, callId, 'hangup', {}, fetchImpl).catch(() => null);
      callJobs.delete(callId);
    } else if (['CALL_FAILED', 'CALL_FINISHED'].includes(type) || (type === 'ERROR' && job.playing)) {
      callJobs.delete(callId);
    }
  }
  return { ok: true, handled };
}
