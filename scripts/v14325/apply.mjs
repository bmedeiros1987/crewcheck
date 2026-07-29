import fs from 'node:fs';

const BRUNO_VOICE_ID = 'pNZa0DWwl4bXevTwyjr0';

function patch(path) {
  if (!fs.existsSync(path)) return;
  let source = fs.readFileSync(path, 'utf8');
  const before = source;

  source = source.replace(
    /function elevenLabsVoiceId\(options = \{\}\) \{[\s\S]*?\n\}/,
    `function elevenLabsVoiceId(options = {}) {
  // Bruno é a voz padrão real do CrewCheck. Variáveis genéricas antigas não podem
  // sobrescrever silenciosamente a voz do titular.
  const explicitProfile = String(options.voiceProfile || '').trim().toLowerCase();
  const allowDaniel = explicitProfile === 'daniel' && String(process.env.CREWCHECK_ALLOW_DANIEL_VOICE || 'false').toLowerCase() === 'true';
  if (allowDaniel) return envAny(['ELEVENLABS_DANIEL_VOICE_ID', 'CREWCHECK_DANIEL_VOICE_ID']);
  if (options.voiceId && String(options.voiceId).trim() !== envAny(['ELEVENLABS_DANIEL_VOICE_ID', 'CREWCHECK_DANIEL_VOICE_ID'])) return String(options.voiceId).trim();
  return envAny(['CREWCHECK_BRUNO_VOICE_ID', 'ELEVENLABS_BRUNO_VOICE_ID']) || '${BRUNO_VOICE_ID}';
}`,
  );

  source = source.replace(
    /voiceProfile:\s*voiceId === CREWCHECK_BRUNO_VOICE_ID \? 'bruno' : 'custom'/g,
    `voiceProfile: voiceId === CREWCHECK_BRUNO_VOICE_ID ? 'bruno' : 'custom'`,
  );

  if (source !== before) fs.writeFileSync(path, source, 'utf8');
}

patch('elevenlabs_tts_1377.js');
patch('server.mjs');

console.log('[v14.3.25] Voz Bruno fixada como padrão; Daniel somente por solicitação explícita e autorizada.');
