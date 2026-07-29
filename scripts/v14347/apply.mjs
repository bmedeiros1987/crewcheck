import fs from 'node:fs';

const VERSION = '14.3.47';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14347] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  const afterVariants = [...new Set([after, after.replace(/\n/g, '\r\n')])];
  if (afterVariants.some((value) => source.includes(value))) return source;
  const beforeVariants = [...new Set([before, before.replace(/\n/g, '\r\n')])];
  const matched = beforeVariants.find((value) => source.includes(value));
  if (!matched) throw new Error(`[v14347] Ponto não localizado: ${label}`);
  const replacement = matched.includes('\r\n') ? after.replace(/\n/g, '\r\n') : after;
  return source.replace(matched, replacement);
}

function patchBlock(source, startMarker, endMarker, label, transform) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14347] Bloco não localizado: ${label}. start=${start} end=${end}`);
  const before = source.slice(start, end);
  const after = transform(before);
  return after === before ? source : `${source.slice(0, start)}${after}${source.slice(end)}`;
}

update('client/src/lib/pdfParser.ts', (source) => patchBlock(
  source,
  'function crewRosterOffsetMckDays(',
  'function rebuildCrewRosterOffsetDays(',
  'MCK no cliente',
  (block) => replaceRequired(
    block,
    '    day.pairingCode = code;\n    day.dutyReport = cleanTime(rawStart);',
    "    day.pairingCode = code;\n    (day as any).operationalAirport = match[2].toUpperCase();\n    day.dutyReport = cleanTime(rawStart);",
    'aeroporto operacional da MCK no cliente',
  ),
));

update('server/rosterParser.mjs', (source) => patchBlock(
  source,
  'function serverCrewRosterMckDays(',
  'function rebuildServerCrewRosterOffsetDays(',
  'MCK no servidor',
  (block) => replaceRequired(
    block,
    '  day.pairingCode = code;\n  day.dutyReport = serverCrewRosterCleanTime(rawStart);',
    "  day.pairingCode = code;\n  day.operationalAirport = match[2].toUpperCase();\n  day.dutyReport = serverCrewRosterCleanTime(rawStart);",
    'aeroporto operacional da MCK no servidor',
  ),
));

update('client/src/lib/canonicalRoster.ts', (source) => {
  let next = source;
  const anchor = "    const end = hasExactContinuity ? continuityEnd! : dateAt(day, endTime, 23);";
  const declaration = "    const operationalAirport = String((day as any).operationalAirport || (day as any).airport || day.base || '').trim().toUpperCase();";
  if (!next.includes(declaration)) {
    if (!next.includes(anchor)) throw new Error('[v14347] Âncora do evento canônico de solo não localizada.');
    const eol = next.includes('\r\n') ? '\r\n' : '\n';
    next = next.replace(anchor, `${anchor}${eol}${declaration}`);
  }
  next = replaceRequired(
    next,
    "      id: `${day.date}|${kind}|${day.pairingCode || day.type || 'event'}`,",
    "      id: `${day.date}|${kind}|${day.pairingCode || day.type || 'event'}|${startTime}|${endTime}|${operationalAirport}`,",
    'identidade única da atividade presencial',
  );
  return replaceRequired(
    next,
    '      origin: day.base,\n      destination: day.base,',
    '      origin: operationalAirport,\n      destination: operationalAirport,',
    'origem canônica da atividade presencial',
  );
});

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Saída Inteligente usa o aeroporto operacional da primeira atividade presencial';`);
  next = replaceRequired(
    next,
    "    const base = safe((day as any).base || (day as any).airport || (day as any).hotel || event.origin, roster.base || '—');",
    "    const base = safe((day as any).operationalAirport || (day as any).airport || event.origin || (day as any).base || (day as any).hotel, roster.base || '—');",
    'projeção Web da atividade de solo',
  );
  return next;
});

update('server.mjs', (source) => {
  const next = source.replace(
    /(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g,
    `$1'${VERSION}'`,
  );
  if (!new RegExp(`url\\.pathname === '/api/release'[^\\r\\n]*version\\s*:\\s*'${VERSION.replace(/\./g, '\\.')}'`).test(next)) {
    throw new Error('[v14347] Endpoint /api/release não foi versionado.');
  }
  if (!new RegExp(`url\\.pathname === '/api/health'[^\\r\\n]*version\\s*:\\s*'${VERSION.replace(/\./g, '\\.')}'`).test(next)) {
    throw new Error('[v14347] Endpoint /api/health não foi versionado.');
  }
  return next;
});
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
  notes: 'Atividades presenciais preservam o aeroporto operacional; MCK em CGH não é roteada para a base contratual BSB.',
}, null, 2)}\n`);
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - operational airport handoff to Smart Departure`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.47:operational-airport'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-47-smart-departure-operational-airport.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140347')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

console.log(`[v14347] CrewCheck ${VERSION}: aeroporto operacional separado da base contratual e entregue à Saída Inteligente.`);
