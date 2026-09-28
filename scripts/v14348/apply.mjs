import fs from 'node:fs';

const VERSION = '14.3.48';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14348] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function variants(value) {
  return [...new Set([value, value.replace(/\n/g, '\r\n')])];
}

function replaceRequired(source, before, after, label) {
  if (variants(after).some((value) => source.includes(value))) return source;
  const matched = variants(before).find((value) => source.includes(value));
  if (!matched) throw new Error(`[v14348] Ponto nao localizado: ${label}`);
  const replacement = matched.includes('\r\n') ? after.replace(/\n/g, '\r\n') : after;
  return source.replace(matched, replacement);
}

function insertAfterRequired(source, anchor, value, label) {
  if (variants(value.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(anchor).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14348] Ancora ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, `${matched}${eol}${value.trimEnd().replace(/\n/g, eol)}`);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14348] Bloco nao localizado: ${label}. start=${start} end=${end}`);
  const eol = source.slice(start, end).includes('\r\n') ? '\r\n' : '\n';
  const normalized = replacement.trimEnd().replace(/\n/g, eol);
  if (source.slice(start, end).trimEnd() === normalized) return source;
  return `${source.slice(0, start)}${normalized}${eol}${eol}${source.slice(end)}`;
}

update('server.mjs', (source) => {
  let next = source;
  const personalityImportAnchor = "} from './server/v14336/concierge-personality.mjs';";
  const voicePolicyImport = `import {
  publicElevenLabsVoiceCatalogV14348,
  resolveElevenLabsVoiceV14348,
} from './server/v14348/elevenlabs-voice-policy.mjs';`;
  next = insertAfterRequired(next, personalityImportAnchor, voicePolicyImport, 'import da politica de duas vozes');

  next = replaceRequired(
    next,
    `function elevenLabsVoiceId() {
  return envAny(ELEVENLABS_VOICE_ENV_KEYS);
}`,
    `function elevenLabsVoiceResolutionV14348(options = {}) {
  return resolveElevenLabsVoiceV14348(options, process.env);
}
function elevenLabsVoiceId(options = {}) {
  return elevenLabsVoiceResolutionV14348(options).voiceId;
}`,
    'resolver de voz ElevenLabs por persona',
  );

  next = replaceRequired(
    next,
    "  const voiceId = String(options.voiceId || elevenLabsVoiceId() || '').trim();",
    "  const voiceResolution = elevenLabsVoiceResolutionV14348(options);\n  const voiceId = String(voiceResolution.voiceId || '').trim();",
    'geracao TTS sem Voice ID arbitrario',
  );

  next = replaceRequired(
    next,
    '  const voiceId = conciergeVoiceIdForSnapshotV14336(snapshot);',
    '  const voiceProfile = conciergeVoiceProfileForSnapshotV14348(snapshot);',
    'perfil de voz da resposta Telegram',
  );
  next = replaceRequired(
    next,
    '    voiceId,',
    '    voiceProfile,',
    'envio do perfil seguro ao TTS',
  );

  const healthBlock = `async function handleTtsHealth(req, res) {
  const defaultVoice = resolveElevenLabsVoiceV14348({ voiceProfile: 'default' }, process.env);
  const publicVoiceOptions = publicElevenLabsVoiceCatalogV14348(process.env);
  const availableProfiles = new Set(publicVoiceOptions.map((item) => item.id));
  const voiceProfiles = Object.fromEntries(['default', 'bruno', 'daniel'].map((profile) => {
    const resolved = resolveElevenLabsVoiceV14348({ voiceProfile: profile }, process.env);
    return [profile, {
      available: availableProfiles.has(profile),
      configured: Boolean(resolved.voiceId),
      activeVoiceEnv: resolved.sourceEnv || '',
    }];
  }));
  return sendJson(res, 200, {
    ok: elevenLabsTtsConfigured(),
    configured: elevenLabsTtsConfigured(),
    provider: effectiveTtsProvider(),
    preferredProvider: ttsProviderPreference(),
    policy: ttsPolicySnapshot(),
    googleTtsBlocked: legacyGoogleTtsRequested() && !legacyGoogleTtsAllowed(),
    model: elevenLabsTtsConfigured() ? elevenLabsModelId() : '',
    voiceConfigured: Boolean(defaultVoice.voiceId),
    keyConfigured: Boolean(elevenLabsApiKey()),
    outputFormat: elevenLabsOutputFormat(),
    activeKeyEnv: envSourceName(ELEVENLABS_KEY_ENV_KEYS),
    activeVoiceEnv: defaultVoice.sourceEnv || '',
    activeModelEnv: envSourceName(ELEVENLABS_MODEL_ENV_KEYS),
    activeOutputEnv: envSourceName(ELEVENLABS_OUTPUT_ENV_KEYS),
    acceptedVoiceEnvKeys: [
      'ELEVENLABS_BRUNO_VOICE_ID',
      'CREWCHECK_BRUNO_VOICE_ID',
      'ELEVENLABS_DANIEL_VOICE_ID',
      'CREWCHECK_DANIEL_VOICE_ID',
      ...ELEVENLABS_VOICE_ENV_KEYS,
    ],
    voiceOptions: publicVoiceOptions,
    voiceProfiles,
    message: elevenLabsTtsConfigured()
      ? 'ElevenLabs TTS configurado com selecao segura por persona.'
      : 'ElevenLabs aguardando chave e voz. Tambem aceito ELEVENLABS_TTS_VOICE_ID.',
  });
}`;
  next = replaceBlock(next, 'async function handleTtsHealth(', 'function handleTtsProviderHealth(', healthBlock, 'health publico das vozes');
  next = next.replace(
    /(function handleTtsProviderHealth\([\s\S]*?\bversion:\s*)'14\.3\.\d+'/,
    `$1'${VERSION}'`,
  );

  const speakBlock = `async function handleTtsSpeak(req, res) {
  if (req.method !== 'POST') return handleTtsHealth(req, res);
  const payload = await readJsonBody(req, 300000);
  const text = cleanTtsText(payload.text || payload.message || '');
  if (!text) return sendJson(res, 400, { ok: false, message: 'Texto vazio.' });
  const result = await generateElevenLabsSpeech(text, {
    speaker: payload.speaker,
    persona: payload.persona,
    voiceProfile: payload.voiceProfile,
    modelId: payload.modelId,
  });
  if (!result.ok) return sendJson(res, result.configured === false ? 200 : 502, { ok: false, configured: result.configured, provider: 'elevenlabs', message: result.message });
  return sendJson(res, 200, {
    ok: true,
    configured: true,
    provider: 'elevenlabs',
    voiceProfile: result.voiceProfile || resolveElevenLabsVoiceV14348(payload, process.env).profile,
    contentType: result.contentType,
    outputFormat: result.outputFormat,
    audioBase64: result.buffer.toString('base64'),
    message: 'Audio gerado com ElevenLabs.',
  });
}`;
  next = replaceBlock(next, 'async function handleTtsSpeak(', 'function telegramToken(', speakBlock, 'endpoint TTS por persona');

  next = replaceRequired(
    next,
    `  if (type === 'atis') {
    const reply = await conciergeAtisReply(\`/atis \${station}\`, null);
    await sendTelegramMessage(chatId, reply, { reply_markup: conciergeWeatherKeyboard(station, 'metar') });
    await sendHumanTelegramVoiceReply(chatId, crewCheckAtisVoiceText(reply));
    return true;
  }`,
    `  if (type === 'atis') {
    const atisMessage = { ...(callback.message || {}), from: callback.from || callback.message?.from || {} };
    const profile = await telegramProfileForChatAsync(atisMessage);
    const snapshot = await conciergeLoadSnapshot(profile);
    const reply = await conciergeAtisReply(\`/atis \${station}\`, snapshot);
    await sendTelegramMessage(chatId, reply, { reply_markup: conciergeWeatherKeyboard(station, 'metar') });
    await sendHumanTelegramVoiceReply(chatId, crewCheckAtisVoiceText(reply), '', snapshot);
    return true;
  }`,
    'voz selecionada no callback ATIS',
  );
  next = replaceRequired(
    next,
    "      if (/^\\/atis(?:@\\S+)?\\b/i.test(normalizedText)) await sendHumanTelegramVoiceReply(chatId, crewCheckAtisVoiceText(reply));",
    "      if (/^\\/atis(?:@\\S+)?\\b/i.test(normalizedText)) await sendHumanTelegramVoiceReply(chatId, crewCheckAtisVoiceText(reply), '', snapshot);",
    'voz selecionada no comando ATIS',
  );

  const versioned = next.replace(
    /(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g,
    `$1'${VERSION}'`,
  );
  if (!new RegExp(`url\\.pathname === '/api/release'[^\\r\\n]*version\\s*:\\s*'${VERSION.replace(/\./g, '\\.')}'`).test(versioned)) {
    throw new Error('[v14348] Endpoint /api/release nao foi versionado.');
  }
  if (!new RegExp(`url\\.pathname === '/api/health'[^\\r\\n]*version\\s*:\\s*'${VERSION.replace(/\./g, '\\.')}'`).test(versioned)) {
    throw new Error('[v14348] Endpoint /api/health nao foi versionado.');
  }
  if (versioned.includes('payload.voiceId') || versioned.includes('options.voiceId')) {
    throw new Error('[v14348] Voice ID arbitrario ainda alcancaria o TTS.');
  }
  return versioned;
});

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Daniel e Bruno usam vozes ElevenLabs separadas por perfil seguro';`));
update('client/src/lib/crewcheckPremiumRuntime.ts', (source) => source.replace(/version:\s*'14\.3\.\d+'/, `version: '${VERSION}'`), { optional: true });
update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`)
  .replace(/!name\.includes\('v[^']+'\)/g, `!name.includes('v${VERSION}')`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/var currentRelease = '[^']+';/g, `var currentRelease = '${VERSION}';`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'Daniel preservado como voz padrao; Bruno usa a nova voz ElevenLabs com selecao segura por speaker/persona.',
}, null, 2)}\n`);
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - separate ElevenLabs voices for Daniel and Bruno`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.48:elevenlabs-dual-voice'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-48-elevenlabs-dual-voice.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140348')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

console.log(`[v14348] CrewCheck ${VERSION}: Daniel preservado e Bruno selecionado pela nova voz ElevenLabs.`);
