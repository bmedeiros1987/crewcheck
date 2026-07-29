export const BRUNO_VOICE_ID_V14348 = 'pNZa0DWwl4bXevTwyjr0';

export const GENERIC_VOICE_ENV_KEYS_V14348 = Object.freeze([
  'ELEVENLABS_VOICE_ID',
  'ELEVENLABS_TTS_VOICE_ID',
  'CREWCHECK_ELEVENLABS_VOICE_ID',
  'CREWCHECK_ELEVENLABS_TTS_VOICE_ID',
  'ELEVENLABS_DEFAULT_VOICE_ID',
  'ELEVENLABS_VOICE',
  'TTS_VOICE_ID',
]);

export const BRUNO_VOICE_ENV_KEYS_V14348 = Object.freeze([
  'ELEVENLABS_BRUNO_VOICE_ID',
  'CREWCHECK_BRUNO_VOICE_ID',
  'ELEVENLABS_TTS_VOICE_ID',
  'CREWCHECK_ELEVENLABS_TTS_VOICE_ID',
  'TTS_VOICE_ID',
  ...GENERIC_VOICE_ENV_KEYS_V14348.filter((name) => ![
    'ELEVENLABS_TTS_VOICE_ID',
    'CREWCHECK_ELEVENLABS_TTS_VOICE_ID',
    'TTS_VOICE_ID',
  ].includes(name)),
]);

export const DANIEL_VOICE_ENV_KEYS_V14348 = Object.freeze([
  'ELEVENLABS_DANIEL_VOICE_ID',
  'CREWCHECK_DANIEL_VOICE_ID',
  ...GENERIC_VOICE_ENV_KEYS_V14348.filter((name) => ![
    'ELEVENLABS_TTS_VOICE_ID',
    'CREWCHECK_ELEVENLABS_TTS_VOICE_ID',
    'TTS_VOICE_ID',
  ].includes(name)),
]);

const DANIEL_DISABLED_VALUES = new Set(['0', 'false', 'no', 'nao', 'não', 'off', 'disabled']);

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function profileCandidate(input) {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object') return '';
  for (const key of ['voiceProfile', 'speaker', 'persona', 'profile']) {
    if (String(input[key] ?? '').trim()) return input[key];
  }
  return '';
}

function envEntry(env, names) {
  for (const name of names) {
    const raw = typeof env === 'function' ? env(name) : env?.[name];
    const value = String(raw ?? '').trim();
    if (value) return { voiceId: value, sourceEnv: name };
  }
  return { voiceId: '', sourceEnv: '' };
}

function resolved(profile, entry) {
  const voiceId = String(entry?.voiceId ?? '').trim();
  return {
    profile,
    voiceId,
    sourceEnv: String(entry?.sourceEnv ?? ''),
    configured: Boolean(voiceId),
  };
}

function resolveBruno(env) {
  const configured = envEntry(env, BRUNO_VOICE_ENV_KEYS_V14348);
  if (configured.voiceId) return resolved('bruno', configured);
  return resolved('bruno', { voiceId: BRUNO_VOICE_ID_V14348, sourceEnv: '' });
}

function resolveDaniel(env) {
  if (danielExplicitlyDisabled(env)) return resolved('daniel', { voiceId: '', sourceEnv: '' });
  const candidate = resolved('daniel', envEntry(env, DANIEL_VOICE_ENV_KEYS_V14348));
  if (!candidate.configured) return candidate;
  const dedicated = ['ELEVENLABS_DANIEL_VOICE_ID', 'CREWCHECK_DANIEL_VOICE_ID'].includes(candidate.sourceEnv);
  if (!dedicated && candidate.voiceId === resolveBruno(env).voiceId) {
    return resolved('daniel', { voiceId: '', sourceEnv: '' });
  }
  return candidate;
}

function resolveDefault(env) {
  if (!danielExplicitlyDisabled(env)) {
    const dedicatedDaniel = envEntry(env, ['ELEVENLABS_DANIEL_VOICE_ID', 'CREWCHECK_DANIEL_VOICE_ID']);
    if (dedicatedDaniel.voiceId) return resolved('default', dedicatedDaniel);
  }
  const configured = envEntry(env, GENERIC_VOICE_ENV_KEYS_V14348);
  if (configured.voiceId) return resolved('default', configured);
  const bruno = resolveBruno(env);
  return resolved('default', { voiceId: bruno.voiceId, sourceEnv: bruno.sourceEnv });
}

function danielExplicitlyDisabled(env) {
  const raw = typeof env === 'function'
    ? env('CREWCHECK_ALLOW_DANIEL_VOICE')
    : env?.CREWCHECK_ALLOW_DANIEL_VOICE;
  const value = String(raw ?? '').trim();
  return Boolean(value) && DANIEL_DISABLED_VALUES.has(normalizeText(value));
}

export function normalizeElevenLabsVoiceProfileV14348(input) {
  const normalized = normalizeText(profileCandidate(input));
  if (['bruno', 'titular'].includes(normalized)) return 'bruno';
  if (normalized === 'daniel') return 'daniel';
  return 'default';
}

export function resolveElevenLabsVoiceV14348(input = 'default', env = process.env) {
  const profile = normalizeElevenLabsVoiceProfileV14348(input);
  if (profile === 'bruno') return resolveBruno(env);
  if (profile === 'daniel') return resolveDaniel(env);
  return resolveDefault(env);
}

export function elevenLabsVoiceIdForProfileV14348(input = 'default', env = process.env) {
  return resolveElevenLabsVoiceV14348(input, env).voiceId;
}

export function elevenLabsVoiceSourceEnvForProfileV14348(input = 'default', env = process.env) {
  return resolveElevenLabsVoiceV14348(input, env).sourceEnv;
}

export function publicElevenLabsVoiceCatalogV14348(env = process.env) {
  const options = [
    { id: 'default', label: 'Padrão do CrewCheck' },
    { id: 'bruno', label: 'Bruno' },
  ];
  const daniel = resolveDaniel(env);
  const bruno = resolveBruno(env);
  if (
    !danielExplicitlyDisabled(env)
    && daniel.configured
    && daniel.voiceId !== bruno.voiceId
  ) {
    options.push({ id: 'daniel', label: 'Daniel' });
  }
  return options;
}
