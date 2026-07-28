import fs from 'node:fs';

const VERSION = '14.3.46';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14346] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14346] Ponto não localizado: ${label}`);
  return source.replace(before, after);
}

function patchBlock(source, startMarker, endMarker, label, transform) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14346] Bloco não localizado: ${label}. start=${start} end=${end}`);
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
  const operationalDeclaration = "    const operationalAirport = String((day as any).operationalAirport || (day as any).airport || day.base || '').trim().toUpperCase();";
  if (!next.includes(operationalDeclaration)) {
    if (!next.includes(anchor)) throw new Error('[v14346] Âncora do evento canônico de solo não localizada.');
    next = next.replace(anchor, `${anchor}\n${operationalDeclaration}`);
  }
  next = replaceRequired(next, '      origin: day.base,\n      destination: day.base,', '      origin: operationalAirport,\n      destination: operationalAirport,', 'origem canônica da atividade presencial');
  return next;
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
  notes: 'Atividades presenciais de solo preservam o aeroporto operacional; MCK em CGH não é roteada para a base contratual BSB.',
}, null, 2)}\n`);

console.log(`[v14346] CrewCheck ${VERSION}: aeroporto operacional separado da base contratual e entregue à Saída Inteligente.`);
