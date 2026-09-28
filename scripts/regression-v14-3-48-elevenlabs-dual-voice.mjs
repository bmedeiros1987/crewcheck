import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BRUNO_VOICE_ID_V14348,
  GENERIC_VOICE_ENV_KEYS_V14348,
  normalizeElevenLabsVoiceProfileV14348,
  publicElevenLabsVoiceCatalogV14348,
  resolveElevenLabsVoiceV14348,
} from '../server/v14348/elevenlabs-voice-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const DANIEL_CURRENT_VOICE_ID = 'Qrdut83w0Cr152Yb4Xn3';
const BRUNO_NEW_VOICE_ID = 'pNZa0DWwl4bXevTwyjr0';
const currentRenderEnv = {
  ELEVENLABS_VOICE_ID: DANIEL_CURRENT_VOICE_ID,
  ELEVENLABS_TTS_VOICE_ID: BRUNO_NEW_VOICE_ID,
};

assert.equal(BRUNO_VOICE_ID_V14348, BRUNO_NEW_VOICE_ID, 'fallback fixo do Bruno deve usar a nova voz');
assert.deepEqual(GENERIC_VOICE_ENV_KEYS_V14348, [
  'ELEVENLABS_VOICE_ID',
  'ELEVENLABS_TTS_VOICE_ID',
  'CREWCHECK_ELEVENLABS_VOICE_ID',
  'CREWCHECK_ELEVENLABS_TTS_VOICE_ID',
  'ELEVENLABS_DEFAULT_VOICE_ID',
  'ELEVENLABS_VOICE',
  'TTS_VOICE_ID',
], 'ordem histórica das variáveis genéricas deve permanecer compatível');

assert.equal(normalizeElevenLabsVoiceProfileV14348('titular'), 'bruno');
assert.equal(normalizeElevenLabsVoiceProfileV14348({ speaker: 'Bruno' }), 'bruno');
assert.equal(normalizeElevenLabsVoiceProfileV14348({ persona: 'Daniel' }), 'daniel');
assert.equal(normalizeElevenLabsVoiceProfileV14348({ voiceProfile: 'desconhecida' }), 'default');

assert.deepEqual(
  resolveElevenLabsVoiceV14348({ voiceProfile: 'default' }, currentRenderEnv),
  {
    profile: 'default',
    voiceId: DANIEL_CURRENT_VOICE_ID,
    sourceEnv: 'ELEVENLABS_VOICE_ID',
    configured: true,
  },
  'a voz padrão deve continuar sendo a voz atual do Daniel no Render',
);
assert.deepEqual(
  resolveElevenLabsVoiceV14348({ voiceProfile: 'daniel' }, currentRenderEnv),
  {
    profile: 'daniel',
    voiceId: DANIEL_CURRENT_VOICE_ID,
    sourceEnv: 'ELEVENLABS_VOICE_ID',
    configured: true,
  },
  'Daniel deve permanecer na variável atual, sem alteração de Voice ID',
);
assert.deepEqual(
  resolveElevenLabsVoiceV14348({ voiceProfile: 'bruno' }, currentRenderEnv),
  {
    profile: 'bruno',
    voiceId: BRUNO_NEW_VOICE_ID,
    sourceEnv: 'ELEVENLABS_TTS_VOICE_ID',
    configured: true,
  },
  'Bruno deve usar a nova voz já presente no Render',
);

for (const selector of [
  { speaker: 'bruno' },
  { persona: 'bruno' },
  { voiceProfile: 'bruno' },
]) {
  assert.equal(
    resolveElevenLabsVoiceV14348(selector, currentRenderEnv).voiceId,
    BRUNO_NEW_VOICE_ID,
    `alias de persona não selecionou Bruno: ${JSON.stringify(selector)}`,
  );
}
for (const ttsAlias of [
  'ELEVENLABS_TTS_VOICE_ID',
  'CREWCHECK_ELEVENLABS_TTS_VOICE_ID',
  'TTS_VOICE_ID',
]) {
  const aliasEnv = {
    ELEVENLABS_VOICE_ID: DANIEL_CURRENT_VOICE_ID,
    [ttsAlias]: `BRUNO_FROM_${ttsAlias}`,
  };
  assert.equal(
    resolveElevenLabsVoiceV14348('bruno', aliasEnv).voiceId,
    aliasEnv[ttsAlias],
    `alias TTS ${ttsAlias} deve vencer ELEVENLABS_VOICE_ID somente para Bruno`,
  );
  assert.equal(
    resolveElevenLabsVoiceV14348('daniel', aliasEnv).voiceId,
    DANIEL_CURRENT_VOICE_ID,
    `alias TTS ${ttsAlias} não pode alterar Daniel`,
  );
}

const dedicatedEnv = {
  ...currentRenderEnv,
  ELEVENLABS_BRUNO_VOICE_ID: 'BRUNO_DEDICATED',
  ELEVENLABS_DANIEL_VOICE_ID: 'DANIEL_DEDICATED',
};
assert.deepEqual(
  resolveElevenLabsVoiceV14348('bruno', dedicatedEnv),
  {
    profile: 'bruno',
    voiceId: 'BRUNO_DEDICATED',
    sourceEnv: 'ELEVENLABS_BRUNO_VOICE_ID',
    configured: true,
  },
  'variável dedicada do Bruno deve vencer aliases genéricos',
);
assert.deepEqual(
  resolveElevenLabsVoiceV14348('daniel', dedicatedEnv),
  {
    profile: 'daniel',
    voiceId: 'DANIEL_DEDICATED',
    sourceEnv: 'ELEVENLABS_DANIEL_VOICE_ID',
    configured: true,
  },
  'variável dedicada do Daniel deve vencer aliases genéricos',
);
assert.deepEqual(
  resolveElevenLabsVoiceV14348('default', dedicatedEnv),
  {
    profile: 'default',
    voiceId: 'DANIEL_DEDICATED',
    sourceEnv: 'ELEVENLABS_DANIEL_VOICE_ID',
    configured: true,
  },
  'a variável dedicada do Daniel deve preservar Daniel também como perfil padrão',
);
assert.deepEqual(
  resolveElevenLabsVoiceV14348('default', {
    ...dedicatedEnv,
    CREWCHECK_ALLOW_DANIEL_VOICE: 'false',
  }),
  {
    profile: 'default',
    voiceId: DANIEL_CURRENT_VOICE_ID,
    sourceEnv: 'ELEVENLABS_VOICE_ID',
    configured: true,
  },
  'uma voz Daniel explicitamente desabilitada não pode assumir o perfil padrão',
);
assert.equal(
  resolveElevenLabsVoiceV14348('bruno', { CREWCHECK_BRUNO_VOICE_ID: 'BRUNO_COMPAT' }).voiceId,
  'BRUNO_COMPAT',
  'alias dedicado antigo do Bruno deve permanecer compatível',
);
assert.equal(
  resolveElevenLabsVoiceV14348('daniel', { CREWCHECK_DANIEL_VOICE_ID: 'DANIEL_COMPAT' }).voiceId,
  'DANIEL_COMPAT',
  'alias dedicado antigo do Daniel deve permanecer compatível',
);

const genericOnlyEnv = { CREWCHECK_ELEVENLABS_VOICE_ID: 'GENERIC_ONLY' };
for (const profile of ['default', 'bruno']) {
  const resolved = resolveElevenLabsVoiceV14348(profile, genericOnlyEnv);
  assert.equal(resolved.voiceId, 'GENERIC_ONLY', `fallback genérico deve permanecer disponível para ${profile}`);
  assert.equal(resolved.sourceEnv, 'CREWCHECK_ELEVENLABS_VOICE_ID');
}
assert.equal(
  resolveElevenLabsVoiceV14348('daniel', genericOnlyEnv).configured,
  false,
  'um único fallback genérico não pode fingir ser Daniel quando também representa Bruno',
);
assert.deepEqual(
  resolveElevenLabsVoiceV14348('daniel', {
    ...genericOnlyEnv,
    ELEVENLABS_BRUNO_VOICE_ID: 'BRUNO_DISTINCT',
  }),
  {
    profile: 'daniel',
    voiceId: 'GENERIC_ONLY',
    sourceEnv: 'CREWCHECK_ELEVENLABS_VOICE_ID',
    configured: true,
  },
  'fallback genérico distinto da voz do Bruno deve permanecer compatível com Daniel',
);

const onlyBrunoTtsEnv = { ELEVENLABS_TTS_VOICE_ID: BRUNO_NEW_VOICE_ID };
const danielWithoutOwnVoice = resolveElevenLabsVoiceV14348('daniel', onlyBrunoTtsEnv);
assert.equal(danielWithoutOwnVoice.configured, false, 'Daniel deve ficar indisponível quando só existe a voz do Bruno');
assert.equal(danielWithoutOwnVoice.voiceId, '', 'Daniel nunca pode cair silenciosamente na voz do Bruno');
assert.notEqual(danielWithoutOwnVoice.voiceId, BRUNO_NEW_VOICE_ID);
assert.equal(resolveElevenLabsVoiceV14348('bruno', {}).voiceId, BRUNO_NEW_VOICE_ID, 'Bruno deve manter fallback seguro próprio');
assert.equal(resolveElevenLabsVoiceV14348('daniel', {}).configured, false, 'Daniel sem configuração não pode usar o fallback do Bruno');

const currentCatalog = publicElevenLabsVoiceCatalogV14348(currentRenderEnv);
assert.deepEqual(currentCatalog, [
  { id: 'default', label: 'Padrão do CrewCheck' },
  { id: 'bruno', label: 'Bruno' },
  { id: 'daniel', label: 'Daniel' },
], 'catálogo deve publicar as três opções quando Daniel e Bruno são distintos');
for (const option of currentCatalog) {
  assert.deepEqual(Object.keys(option).sort(), ['id', 'label'], 'catálogo público deve expor somente id lógico e rótulo');
}
const serializedCatalog = JSON.stringify(currentCatalog);
assert.ok(!serializedCatalog.includes(DANIEL_CURRENT_VOICE_ID), 'catálogo público não pode expor Voice ID do Daniel');
assert.ok(!serializedCatalog.includes(BRUNO_NEW_VOICE_ID), 'catálogo público não pode expor Voice ID do Bruno');
assert.ok(
  !publicElevenLabsVoiceCatalogV14348(onlyBrunoTtsEnv).some((option) => option.id === 'daniel'),
  'Daniel não pode aparecer no catálogo sem voz própria distinta',
);
assert.ok(
  !publicElevenLabsVoiceCatalogV14348({
    ...currentRenderEnv,
    CREWCHECK_ALLOW_DANIEL_VOICE: 'false',
  }).some((option) => option.id === 'daniel'),
  'flag explícita false deve ocultar Daniel sem alterar a voz configurada',
);
assert.deepEqual(
  resolveElevenLabsVoiceV14348('daniel', {
    ...dedicatedEnv,
    CREWCHECK_ALLOW_DANIEL_VOICE: 'false',
  }),
  {
    profile: 'daniel',
    voiceId: '',
    sourceEnv: '',
    configured: false,
  },
  'flag explícita false deve bloquear Daniel também no resolver usado pelo endpoint público',
);

const chain = read('scripts/v139/apply.mjs');
const v14347Index = chain.indexOf("await import('../v14347/apply.mjs');");
const v14348Index = chain.indexOf("await import('../v14348/apply.mjs');");
assert.ok(v14347Index >= 0, 'v14.3.47 deve permanecer na preparação canônica');
assert.ok(v14348Index > v14347Index, 'v14.3.48 deve suceder o aeroporto operacional');
assert.ok(chain.trimEnd().endsWith("await import('../v14348/apply.mjs');"), 'v14.3.48 deve encerrar a preparação canônica');

const server = read('server.mjs');
assert.ok(server.includes("from './server/v14348/elevenlabs-voice-policy.mjs';"), 'servidor deve importar a política central de voz');
assert.ok(server.includes('speaker: payload.speaker'), 'endpoint TTS deve aceitar speaker lógico');
assert.ok(server.includes('persona: payload.persona'), 'endpoint TTS deve aceitar persona lógica');
assert.ok(server.includes('voiceProfile: payload.voiceProfile'), 'endpoint TTS deve aceitar voiceProfile lógico');
assert.ok(!server.includes('payload.voiceId'), 'endpoint público não pode aceitar Voice ID arbitrário');
assert.ok(!server.includes('options.voiceId'), 'geração TTS não pode contornar a política por Voice ID arbitrário');
assert.ok(server.includes('acceptedVoiceEnvKeys'), 'health TTS deve documentar as variáveis aceitas sem expor seus valores');
assert.ok(server.includes('voiceProfiles'), 'health TTS deve mostrar disponibilidade por perfil lógico');
for (const sttMarker of [
  'ELEVENLABS_STT_MODEL',
  'elevenLabsSttConfigured()',
  'transcribeTelegramAudioWithElevenLabs',
]) assert.ok(server.includes(sttMarker), `integração STT ElevenLabs deve permanecer intacta: ${sttMarker}`);
assert.match(server, /url\.pathname === '\/api\/release'[^\r\n]*version\s*:\s*'14\.3\.48'/, 'release do servidor deve anunciar v14.3.48');
assert.match(server, /url\.pathname === '\/api\/health'[^\r\n]*version\s*:\s*'14\.3\.48'/, 'health do servidor deve anunciar v14.3.48');
assert.ok(read('client/src/pages/Home.tsx').includes("const DEFAULT_VERSION = '14.3.48';"), 'Web/PWA deve anunciar v14.3.48');
assert.ok(read('client/public/release.json').includes('14.3.48'), 'release.json deve anunciar v14.3.48');

const tracked = [
  'server.mjs',
  'client/src/pages/Home.tsx',
  'client/src/lib/crewcheckPremiumRuntime.ts',
  'client/src/App.tsx',
  'client/src/pages/AuthPage.tsx',
  'client/index.html',
  'client/public/sw.js',
  'client/public/release.json',
  'package.json',
  'android-wrapper/app/build.gradle',
];
const before = new Map(tracked.map((relative) => [relative, read(relative)]));
const second = spawnSync(process.execPath, [path.join(root, 'scripts/v14348/apply.mjs')], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(second.status, 0, second.stderr || second.stdout || 'reaplicação final v14.3.48 falhou');
for (const relative of tracked) {
  assert.equal(read(relative), before.get(relative), `v14.3.48 deve ser idempotente em ${relative}`);
}

console.log('v14.3.48 ElevenLabs dual voice: Daniel preserved, Bruno updated, logical selectors, safe fallbacks, private IDs, STT preservation and idempotency validated.');
