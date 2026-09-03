import fs from 'node:fs';

const VERSION = '14.4.09';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const TAG = '[v14409]';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`${TAG} Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertAfter(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`${TAG} Âncora ausente: ${label}`);
  return source.replace(anchor, `${anchor}\n${value.trimEnd()}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${TAG} Bloco ausente: ${label}`);
  return source.replace(before, after);
}

function patchServer(source) {
  let next = source;
  const previousImport = `import {
  conciergeElevenLabsVoiceSettingsV14408,
  conciergeHumanizeReplyV14408,
  conciergeVoiceScriptV14408,
} from './server/v14408/concierge-human.mjs';`;
  const naturalImport = `import {
  conciergeNaturalReplyV14409,
  conciergeVoiceScriptV14409,
  conciergeVoiceSettingsV14409,
} from './server/v14409/concierge-natural.mjs';`;
  next = insertAfter(next, previousImport, naturalImport, 'import do renderizador natural');

  next = replaceRequired(
    next,
    '    return conciergeHumanizeReplyV14408(conciergeFinalizeReplyV14354(command.reply, text), text);',
    '    return conciergeNaturalReplyV14409(conciergeFinalizeReplyV14354(command.reply, text), text);',
    'preferências com resposta natural',
  );
  next = replaceRequired(
    next,
    '  return conciergeHumanizeReplyV14408(finalized, text);',
    '  return conciergeNaturalReplyV14409(finalized, text);',
    'resposta final answer-first',
  );
  next = replaceRequired(
    next,
    'voice_settings: conciergeElevenLabsVoiceSettingsV14408(process.env),',
    'voice_settings: conciergeVoiceSettingsV14409(finalText, process.env),',
    'prosódia adaptativa do TTS',
  );
  next = replaceRequired(
    next,
    'premiumVoiceText(conciergeVoiceScriptV14408(replyText, transcript))',
    'premiumVoiceText(conciergeVoiceScriptV14409(replyText, transcript))',
    'roteiro falado curto',
  );

  next = next.replace(
    /(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g,
    `$1'${VERSION}'`,
  );

  if (!next.includes('conciergeNaturalReplyV14409(finalized, text)')) throw new Error(`${TAG} resposta natural não ligada.`);
  if (!next.includes('conciergeVoiceScriptV14409(replyText, transcript)')) throw new Error(`${TAG} roteiro falado não ligado.`);
  if (!next.includes('conciergeVoiceSettingsV14409(finalText, process.env)')) throw new Error(`${TAG} prosódia adaptativa não ligada.`);
  if (!new RegExp(`url\\.pathname === '/api/release'[^\\r\\n]*version\\s*:\\s*'${VERSION.replace(/\./g, '\\.')}'`).test(next)) throw new Error(`${TAG} /api/release desatualizado.`);
  if (!new RegExp(`url\\.pathname === '/api/health'[^\\r\\n]*version\\s*:\\s*'${VERSION.replace(/\./g, '\\.')}'`).test(next)) throw new Error(`${TAG} /api/health desatualizado.`);
  return next;
}

function patchInfobip(source) {
  let next = source;
  const previousImport = "import { conciergeElevenLabsVoiceSettingsV14408 } from '../v14408/concierge-human.mjs';";
  next = insertAfter(
    next,
    previousImport,
    "import { conciergeVoiceSettingsV14409 } from '../v14409/concierge-natural.mjs';",
    'import de prosódia adaptativa na Infobip',
  );
  next = replaceRequired(
    next,
    'voice_settings: conciergeElevenLabsVoiceSettingsV14408(environment),',
    'voice_settings: conciergeVoiceSettingsV14409(finalText, environment),',
    'prosódia da ligação',
  );
  return next;
}

update('server.mjs', patchServer);
update('server/v14405/infobip-elevenlabs.mjs', patchInfobip);

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Concierge answer-first, sem frases enlatadas e com prosódia adaptativa';`)
  .replace('Pergunte como falaria com alguém da operação. O Concierge mantém o contexto da conversa, entende continuações curtas e responde sem despejar linguagem técnica desnecessária.', 'Pergunte como falaria com alguém da operação. O Concierge responde primeiro o que importa, mantém o contexto e evita frases enlatadas ou explicações repetidas.')
  .replace('Pergunte do seu jeito. Depois, continue com frases curtas como “e o portão?”, “e depois?” ou “que horas preciso sair?”.', 'Pergunte do seu jeito e continue naturalmente: “e o portão?”, “e depois?”, “que horas eu saio?”. A resposta usa o contexto sem repetir a pergunta inteira.'), { optional: true });

update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`), { optional: true });
update('client/src/lib/crewcheckPremiumRuntime.ts', (source) => source.replace(/version:\s*'14\.\d+\.\d+'/, `version: '${VERSION}'`), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/var currentRelease = '[^']+';/g, `currentRelease = '${VERSION}'`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'Concierge answer-first, sem sugestões enlatadas, áudio mais curto e prosódia adaptativa por tipo de resposta.',
}, null, 2)}\n`, { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - answer-first concierge with adaptive natural voice`;
  data.scripts ||= {};
  data.scripts['regression:v14.4.09:concierge-natural'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-4-09-concierge-natural.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140409')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

console.log(`${TAG} CrewCheck ${VERSION}: Concierge answer-first, texto menos robótico e voz adaptativa.`);
