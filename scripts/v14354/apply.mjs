import fs from 'node:fs';

const VERSION = '14.3.54';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const LANGUAGE_IMPORT = `import {
  conciergeFinalizeReplyV14354,
} from './server/v14354/concierge-language.mjs';`;
const WRAPPER_MARKER = 'conciergeFinalizeReplyV14354(decorated.reply, text)';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14354] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function variants(value) {
  return [...new Set([value, value.replace(/\n/g, '\r\n')])];
}

function withEol(value, eol) {
  return value.trimEnd().replace(/\n/g, eol);
}

function insertAfterRequired(source, anchor, value, label) {
  if (variants(value.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(anchor).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14354] Âncora ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, `${matched}${eol}${withEol(value, eol)}`);
}

function replaceRequired(source, before, after, label) {
  if (variants(after.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(before).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14354] Bloco ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, withEol(after, eol));
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(WRAPPER_MARKER) && label === 'finalização textual do Concierge') return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14354] Bloco não localizado: ${label}. start=${start} end=${end}`);
  const eol = source.slice(start, end).includes('\r\n') ? '\r\n' : '\n';
  return `${source.slice(0, start)}${withEol(replacement, eol)}${eol}${eol}${source.slice(end)}`;
}

const conciseReplyWrapper = `async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {
  const command = await conciergePreferenceCommandV14336(text, profile, snapshot);
  if (command.handled) return conciergeFinalizeReplyV14354(command.reply, text);
  const rawReply = await buildTelegramConciergeReplyCore(text, profile, command.snapshot || snapshot);
  const currentSnapshot = command.snapshot || snapshot;
  const decorated = decorateConciergeReplyV14336(rawReply, {
    preferences: conciergePreferencesV14336(currentSnapshot),
    roster: currentSnapshot?.roster || {},
  });
  if (decorated.humorApplied) {
    await conciergeSaveSnapshotAsync(profile, null, {
      preferences: {
        lastHumorAt: new Date().toISOString(),
        lastHumorKey: decorated.humorKey,
      },
    });
  }
  return conciergeFinalizeReplyV14354(decorated.reply, text);
}`;

export function patchConciergeServerV14354(source) {
  let next = insertAfterRequired(
    source,
    "} from './server/v14348/elevenlabs-voice-policy.mjs';",
    LANGUAGE_IMPORT,
    'import do normalizador textual',
  );
  next = replaceBlock(
    next,
    'async function buildTelegramConciergeReply(',
    'async function buildTelegramConciergeReplyCore(',
    conciseReplyWrapper,
    'finalização textual do Concierge',
  );
  next = replaceRequired(
    next,
    "if (body.location && typeof body.location === 'object') snapshot = await conciergeSaveSnapshotAsync(profile, null, { preferences: { location: body.location } });",
    "if (body.location && typeof body.location === 'object') snapshot = await conciergeSaveSnapshotAsync(profile, null, { preferences: { location: { ...body.location, source: String(body.location.source || 'app'), updatedAt: new Date().toISOString() } } });",
    'carimbo real da localização recebida pelo app',
  );
  next = next.replace(
    "    `Qualidade da consulta: ${Number(radar.quality || 0)}% · ${Number(radar.alternatives || 0)} fonte(s) útil(eis)`,\n",
    '',
  );
  next = next.replace(
    "    `Qualidade da consulta: ${Number(radar.quality || 0)}% · ${Number(radar.alternatives || 0)} fonte(s) útil(eis)`,\r\n",
    '',
  );
  if (next.includes('Qualidade da consulta:')) throw new Error('[v14354] Métrica técnica do radar ainda está exposta ao tripulante.');
  return next;
}

export function patchConciergeLocationPolicyV14354(source) {
  // Versões posteriores já substituem a política antiga por uma implementação
  // canônica mais restritiva (fonte confiável, timestamp obrigatório e proteção
  // contra horário futuro). Nessa situação, v14.3.54 deve ser idempotente e não
  // exigir que o bloco legado continue existindo.
  if (source.includes('function parseCapturedAt(')
    && source.includes('TRUSTED_LOCATION_SOURCES')
    && source.includes('if (latitude === null || longitude === null || !source || !updatedAt) return null;')) {
    return source;
  }

  let next = replaceRequired(
    source,
    `  const updated = new Date(location.updatedAt || now);
  const updatedAt = Number.isFinite(updated.getTime()) ? updated : new Date(now);`,
    `  const rawUpdatedAt = String(location.updatedAt || location.capturedAt || '').trim();
  const updated = rawUpdatedAt ? new Date(rawUpdatedAt) : new Date(Number.NaN);
  const updatedAt = Number.isFinite(updated.getTime()) ? updated : null;`,
    'localização legada sem horário não pode renascer como atual',
  );
  next = replaceRequired(
    next,
    `    updatedAt: updatedAt.toISOString(),
    expiresAt: new Date(updatedAt.getTime() + ttlMs).toISOString(),`,
    `    updatedAt: updatedAt ? updatedAt.toISOString() : '',
    expiresAt: updatedAt ? new Date(updatedAt.getTime() + ttlMs).toISOString() : '',`,
    'expiração exige horário de captura válido',
  );
  return next;
}

if (process.env.CREWCHECK_V14354_SKIP_APPLY !== '1') {
  update('server.mjs', (source) => patchConciergeServerV14354(source)
    .replace(/(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g, `$1'${VERSION}'`));
  update('server/v14335/concierge-location.mjs', patchConciergeLocationPolicyV14354);
  update('client/src/pages/Home.tsx', (source) => source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(
      /const CREWCHECK_UI_CORE_NOTE = '[^']+';/,
      `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Concierge direto, números em algarismos, gramática pt-BR e localização sem cidade legada';`,
    ));
  update('client/src/App.tsx', (source) => source
    .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
    .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`), { optional: true });
  update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
  update('client/src/lib/crewcheckPremiumRuntime.ts', (source) => source.replace(/version:\s*'14\.3\.\d+'/, `version: '${VERSION}'`), { optional: true });
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
    notes: 'Concierge com gramática pt-BR, números compactos, respostas diretas, aviso da escala oficial e localização antiga expirada.',
  }, null, 2)}\n`, { optional: true });
  update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - concise pt-BR concierge and non-sticky current location`;
    data.scripts ||= {};
    data.scripts['regression:v14.3.54:concierge-language-location'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-54-concierge-language-location.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source
    .replace(/versionCode\s+\d+/, 'versionCode 140354')
    .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

  console.log(`[v14354] CrewCheck ${VERSION}: Concierge conciso em pt-BR e localização legada sem renovação artificial.`);
}
