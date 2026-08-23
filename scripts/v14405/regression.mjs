import assert from 'node:assert/strict';
import { buildInfobipCallsRequest, createInfobipElevenLabsAudio, handleInfobipCallsEvent, infobipElevenLabsAudioEnabled, startInfobipElevenLabsCall } from '../../server/v14405/infobip-elevenlabs.mjs';

assert.equal(infobipElevenLabsAudioEnabled({}), true);
assert.equal(infobipElevenLabsAudioEnabled({ CREWCHECK_INFOBIP_USE_ELEVENLABS_AUDIO: 'false' }), false);
const calls = buildInfobipCallsRequest({
  environment: { INFOBIP_API_KEY: 'test', INFOBIP_BASE_URL: 'https://example.api.infobip.com', INFOBIP_PHONE_FROM: '+16728742360' },
  phone: '+5561996071663',
});
assert.equal(calls.uploadUrl, 'https://example.api.infobip.com/calls/1/file/upload');
assert.equal(calls.callUrl, 'https://example.api.infobip.com/calls/1/calls');
assert.equal(calls.body.callsConfigurationId, 'crewcheck-elevenlabs');
assert.deepEqual(calls.body.endpoint, { type: 'PHONE', phoneNumber: '5561996071663' });
assert.equal(calls.body.from, '16728742360');

const generated = await createInfobipElevenLabsAudio('Despertador em português.', {
  environment: { ELEVENLABS_API_KEY: 'sk_test_key', ELEVENLABS_TTS_VOICE_ID: 'voice-test' },
  fetchImpl: async () => new Response(new Uint8Array([73, 68, 51, 4]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
});
assert.equal(generated.ok, true);
assert.ok(Buffer.isBuffer(generated.buffer));
assert.equal('audioFileUrl' in generated, false);
assert.deepEqual(await handleInfobipCallsEvent({ type: 'CALL_ESTABLISHED', callId: 'unknown' }, { fetchImpl: async () => new Response() }), { ok: true, handled: 0 });

const requests = [];
const environment = {
  INFOBIP_API_KEY: 'test', INFOBIP_BASE_URL: 'https://example.api.infobip.com', INFOBIP_PHONE_FROM: '+16728742360',
  ELEVENLABS_API_KEY: 'sk_test_key', ELEVENLABS_TTS_VOICE_ID: 'voice-test',
};
const fetchImpl = async (url, options = {}) => {
  requests.push({ url: String(url), options });
  if (String(url).includes('api.elevenlabs.io')) return new Response(new Uint8Array([73, 68, 51, 4]), { status: 200 });
  if (String(url).endsWith('/file/upload')) return Response.json({ fileId: 'private-file-1' }, { status: 200 });
  if (String(url).endsWith('/calls/1/calls')) return Response.json({ id: 'call-1' }, { status: 200 });
  return Response.json({ status: 'IN_PROGRESS' }, { status: 200 });
};
const started = await startInfobipElevenLabsCall('+5561996071663', 'Hora de acordar.', { environment, fetchImpl });
assert.equal(started.ok, true);
assert.equal(requests[1].options.body instanceof FormData, true);
assert.equal(requests[1].options.headers['content-type'], undefined);
assert.deepEqual(await handleInfobipCallsEvent({ type: 'CALL_ESTABLISHED', callId: 'call-1' }, { fetchImpl }), { ok: true, handled: 1 });
assert.match(requests.at(-1).url, /\/calls\/1\/calls\/call-1\/play$/);
assert.deepEqual(JSON.parse(requests.at(-1).options.body), { loopCount: 1, content: { type: 'FILE', fileId: 'private-file-1' } });
assert.deepEqual(await handleInfobipCallsEvent({ type: 'PLAY_FINISHED', callId: 'call-1' }, { fetchImpl }), { ok: true, handled: 1 });
assert.match(requests.at(-1).url, /\/calls\/1\/calls\/call-1\/hangup$/);
console.log('[v14405] regressao de upload privado ok');
