import fs from 'node:fs';

const VERSION = '14.3.81';
const CACHE_SCHEMA = 'p0-operational-date-anchor-v2';

function update(filePath, transform, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) return;
    throw new Error(`[v14381] Arquivo ausente: ${filePath}`);
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`[v14381] Bloco não localizado: ${label}`);
  return `${source.slice(0, start)}${replacement}\n${source.slice(end)}`;
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14381] Trecho não localizado: ${label}`);
  return source.replace(before, after);
}

const clientDateAnchorHelpers = `type VisualRosterDateAxis = {
  coordinate: 'x' | 'y';
  operational: number;
  updated: number;
};

function visualRosterPageDateAxes(rows: VisualRow[]): Map<number, VisualRosterDateAxis> {
  const byPage = new Map<number, VisualItem[]>();
  for (const row of rows || []) {
    const items = byPage.get(row.page) || [];
    items.push(...(row.items || []));
    byPage.set(row.page, items);
  }
  const axes = new Map<number, VisualRosterDateAxis>();
  for (const [page, items] of byPage.entries()) {
    const operationalHeader = items.find(item => /^Date$/i.test(String(item.str || '').trim()));
    const updatedHeader = items.find(item => /^Updated\\s+Date$/i.test(String(item.str || '').trim()));
    if (!operationalHeader || !updatedHeader) continue;
    const deltaX = Math.abs(operationalHeader.x - updatedHeader.x);
    const deltaY = Math.abs(operationalHeader.y - updatedHeader.y);
    const coordinate: 'x' | 'y' = deltaX > deltaY ? 'x' : 'y';
    axes.set(page, {
      coordinate,
      operational: operationalHeader[coordinate],
      updated: updatedHeader[coordinate],
    });
  }
  return axes;
}

function visualRosterOperationalDateToken(row: Pick<VisualRow, 'page' | 'items' | 'text'>, axes: Map<number, VisualRosterDateAxis>): string | null {
  const axis = axes.get(row.page);
  const candidates = (row.items || []).flatMap(item => {
    const tokens = String(item.str || '').match(DATE_TOKEN_GLOBAL_RE) || [];
    return tokens.map(token => ({ token, item }));
  });
  if (axis && candidates.length) {
    const accepted = candidates
      .map(candidate => {
        const coordinate = candidate.item[axis.coordinate];
        return {
          ...candidate,
          operationalDistance: Math.abs(coordinate - axis.operational),
          updatedDistance: Math.abs(coordinate - axis.updated),
        };
      })
      .filter(candidate => candidate.operationalDistance + 1 < candidate.updatedDistance)
      .sort((a, b) => a.operationalDistance - b.operationalDistance);
    if (accepted[0]) return accepted[0].token;
    return null;
  }

  // Fallback para geradores sem os dois cabeçalhos geométricos. A data
  // administrativa acompanhada de hora decimal é removida antes da escolha.
  const sanitized = stripUpdatedDate(cleanColumnarRosterText(row.text));
  const tokens = sanitized.match(DATE_TOKEN_GLOBAL_RE) || [];
  return tokens[0] || null;
}

function visualRosterDateMarker(row: VisualRow, fallbackYear: number, axes: Map<number, VisualRosterDateAxis>): { day: number; month: number; year: number } | null {
  const explicitToken = visualRosterOperationalDateToken(row, axes);
  const explicit = explicitToken?.match(/\\b(\\d{2})-([A-Za-z]{3})-(\\d{4})\\b/);
  if (explicit) {
    const monthMap: Record<string, number> = { jan:1, feb:2, fev:2, mar:3, apr:4, abr:4, may:5, mai:5, jun:6, jul:7, aug:8, ago:8, sep:9, set:9, oct:10, out:10, nov:11, dec:12, dez:12 };
    const month = monthMap[explicit[2].slice(0, 3).toLowerCase()] || 0;
    return month ? { day: Number(explicit[1]), month, year: Number(explicit[3]) } : null;
  }
  const pairing = String(row.text || '').match(/\\bLA\\s?\\d{3,4}[/-](\\d{6})(?:\\/|\\b)/i)?.[1];
  return pairing ? { day: Number(pairing.slice(0, 2)), month: Number(pairing.slice(2, 4)), year: 2000 + Number(pairing.slice(4, 6)) } : null;
}`;

const serverDateAnchorHelpers = `function serverVisualPageDateAxes(pages) {
 const axes = new Map();
 for (const page of pages || []) {
  const items = page.items || [];
  const operationalHeader = items.find((item) => /^Date$/i.test(String(item.str || '').trim()));
  const updatedHeader = items.find((item) => /^Updated\\s+Date$/i.test(String(item.str || '').trim()));
  if (!operationalHeader || !updatedHeader) continue;
  const deltaX = Math.abs(operationalHeader.x - updatedHeader.x);
  const deltaY = Math.abs(operationalHeader.y - updatedHeader.y);
  const coordinate = deltaX > deltaY ? 'x' : 'y';
  axes.set(page.pageNo, { coordinate, operational: operationalHeader[coordinate], updated: updatedHeader[coordinate] });
 }
 return axes;
}
function serverVisualOperationalDateToken(row, axes) {
 const axis = axes.get(row.page);
 const candidates = (row.items || []).flatMap((item) => {
  const tokens = String(item.str || '').match(/\\b\\d{2}-[A-Za-z]{3}-\\d{4}\\b/g) || [];
  return tokens.map((token) => ({ token, item }));
 });
 if (axis && candidates.length) {
  const accepted = candidates.map((candidate) => {
   const coordinate = candidate.item[axis.coordinate];
   return { ...candidate, operationalDistance: Math.abs(coordinate - axis.operational), updatedDistance: Math.abs(coordinate - axis.updated) };
  }).filter((candidate) => candidate.operationalDistance + 1 < candidate.updatedDistance)
   .sort((a, b) => a.operationalDistance - b.operationalDistance);
  return accepted[0]?.token || null;
 }
 const sanitized = cleanRosterLineV3(row.text);
 const tokens = sanitized.match(/\\b\\d{2}-[A-Za-z]{3}-\\d{4}\\b/g) || [];
 return tokens[0] || null;
}
function serverVisualDateMarker(row, fallbackYear, axes) {
 const explicitToken = serverVisualOperationalDateToken(row, axes);
 const explicit = explicitToken?.match(/\\b(\\d{2})-([A-Za-z]{3})-(\\d{4})\\b/);
 if (explicit) return { day: Number(explicit[1]), month: monthNameToNum(explicit[2]), year: Number(explicit[3]) };
 const pairing = String(row.text || '').match(/\\bLA\\s?\\d{3,4}[/-](\\d{6})(?:\\/|\\b)/i)?.[1];
 return pairing ? { day: Number(pairing.slice(0, 2)), month: Number(pairing.slice(2, 4)), year: 2000 + Number(pairing.slice(4, 6)) } : null;
}`;

export function patchClientOperationalDateAnchorV14381(source) {
  let next = source;
  if (!next.includes('type VisualRosterDateAxis = {')) {
    next = replaceBlock(next, 'function visualRosterDateMarker(', 'function visualRosterStationTimes(', clientDateAnchorHelpers, 'âncora operacional visual do cliente');
  }
  next = replaceRequired(
    next,
    'function parseCrewRosterTransposedColumns(rows: VisualRow[], defaultMonth: number, defaultYear: number, base: string): RosterDay[] {\n  const items = rows.flatMap(row => row.items || []);',
    'function parseCrewRosterTransposedColumns(rows: VisualRow[], defaultMonth: number, defaultYear: number, base: string): RosterDay[] {\n  const pageDateAxes = visualRosterPageDateAxes(rows);\n  const items = rows.flatMap(row => row.items || []);',
    'eixos de data no parser transposto do cliente',
  );
  next = replaceRequired(
    next,
    '    const dateToken = group.text.match(DATE_TOKEN_RE)?.[0] || null;',
    "    const dateToken = visualRosterOperationalDateToken({ page: group.page, items: group.items, text: group.text }, pageDateAxes);",
    'data operacional do grupo transposto do cliente',
  );
  next = replaceRequired(
    next,
    '  let current: { day: number; month: number; year: number } | null = null;\n  const ordered = [...rows].sort((a, b) => a.page - b.page || a.key - b.key);',
    '  const pageDateAxes = visualRosterPageDateAxes(rows);\n  let current: { day: number; month: number; year: number } | null = null;\n  const ordered = [...rows].sort((a, b) => a.page - b.page || a.key - b.key);',
    'eixos de data no resgate visual do cliente',
  );
  next = replaceRequired(
    next,
    '    const marker = visualRosterDateMarker(row.text, referenceYear);',
    '    const marker = visualRosterDateMarker(row, referenceYear, pageDateAxes);',
    'marcador operacional do resgate visual do cliente',
  );
  return next;
}

export function patchServerOperationalDateAnchorV14381(source) {
  let next = source;
  if (!next.includes('function serverVisualPageDateAxes(')) {
    next = replaceBlock(next, 'function serverVisualDateMarker(', 'function serverVisualStationTimes(', serverDateAnchorHelpers, 'âncora operacional visual do servidor');
  }
  next = replaceRequired(
    next,
    ' const rows = buildServerVisualRows(pages);\n let current = null;',
    ' const rows = buildServerVisualRows(pages);\n const pageDateAxes = serverVisualPageDateAxes(pages);\n let current = null;',
    'eixos de data no resgate visual do servidor',
  );
  next = replaceRequired(
    next,
    '  const marker = serverVisualDateMarker(row.text, referenceYear);',
    '  const marker = serverVisualDateMarker(row, referenceYear, pageDateAxes);',
    'marcador operacional do resgate visual do servidor',
  );
  next = replaceRequired(
    next,
    'function parseServerRosterReportColumnGroups(pages, h) {\n const groups = buildServerRosterColumnGroups(pages);',
    'function parseServerRosterReportColumnGroups(pages, h) {\n const groups = buildServerRosterColumnGroups(pages);\n const pageDateAxes = serverVisualPageDateAxes(pages);',
    'eixos de data no parser transposto do servidor',
  );
  next = replaceRequired(
    next,
    "  const dateToken = group.text.match(/\\d{2}-[A-Za-z]{3}-\\d{4}/)?.[0] || null;",
    '  const dateToken = serverVisualOperationalDateToken(group, pageDateAxes);',
    'data operacional do grupo transposto do servidor',
  );
  return next;
}

export function patchComplianceContinuityBoundaryV14381(source) {
  let next = source;
  if (!next.includes('function isInferredContinuityMarker(')) {
    const marker = 'function isLayoverOrInactive(day: RosterDay): boolean {';
    if (!next.includes(marker)) throw new Error('[v14381] fronteira de continuidade da conformidade não localizada');
    const helper = `function isInferredContinuityMarker(day: RosterDay): boolean {
  const type = String(day.type || day.pairingCode || '').toUpperCase();
  return Boolean((day as RosterDay & { continuityInferred?: boolean }).continuityInferred)
    || /(?:PERNOITE|DESCANSO_BASE)_CONTINUIDADE/.test(type);
}

`;
    next = next.replace(marker, `${helper}${marker}`);
  }
  next = replaceRequired(
    next,
    '  if (isRecoveryDay(day) || isNonOperationalAbsence(day) || isEmptyCalendarDay(day)) {',
    '  if (isRecoveryDay(day) || isNonOperationalAbsence(day) || isEmptyCalendarDay(day) || isInferredContinuityMarker(day)) {',
    'continuidade fora da jornada regulatória',
  );
  next = replaceRequired(
    next,
    '  if (isRecoveryDay(day) || isNonOperationalAbsence(day)) return false;\n  if ((day.legs || []).length > 0 || day.type === \'VOO\') return true;',
    '  if (isRecoveryDay(day) || isNonOperationalAbsence(day) || isInferredContinuityMarker(day)) return false;\n  if ((day.legs || []).length > 0 || day.type === \'VOO\') return true;',
    'continuidade fora da seleção de jornada ativa',
  );
  next = replaceRequired(
    next,
    '  if (isRecoveryDay(day) || isEmptyCalendarDay(day) || isNonOperationalAbsence(day)) return 0;',
    '  if (isRecoveryDay(day) || isEmptyCalendarDay(day) || isNonOperationalAbsence(day) || isInferredContinuityMarker(day)) return 0;',
    'continuidade fora do total de jornada',
  );
  return next;
}

export function patchRosterCacheOperationalDateV14381(source) {
  let next = source;
  if (!next.includes(`const ROSTER_CACHE_SCHEMA = '${CACHE_SCHEMA}';`)) {
    if (!/const ROSTER_CACHE_SCHEMA = 'p0-[^']+';/.test(next)) throw new Error('[v14381] schema anterior do cache não localizado');
    next = next.replace(/const ROSTER_CACHE_SCHEMA = 'p0-[^']+';/, `const ROSTER_CACHE_SCHEMA = '${CACHE_SCHEMA}';`);
  }
  next = next.replace(/source: 'crewcheck-v14\.3\.\d+-p0-[^']+', cacheSchema: ROSTER_CACHE_SCHEMA/, `source: 'crewcheck-v${VERSION}-p0-operational-date-anchor', cacheSchema: ROSTER_CACHE_SCHEMA`);
  return next;
}

export function patchRuntimeVersionV14381(source) {
  return source.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`);
}

if (process.env.CREWCHECK_V14381_SKIP_APPLY !== '1') {
  update('client/src/lib/pdfParser.ts', patchClientOperationalDateAnchorV14381);
  update('server/rosterParser.mjs', patchServerOperationalDateAnchorV14381);
  update('client/src/lib/complianceEngine.ts', patchComplianceContinuityBoundaryV14381);
  update('client/src/pages/Home.tsx', (source) => patchRosterCacheOperationalDateV14381(source).replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`));
  update('client/public/release.json', () => `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic-safe', notes: 'P0: a data operacional do roster é ancorada na coluna Date; Updated Date nunca cria ou desloca voos.' }, null, 2)}\n`, { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - P0 operational roster date anchor`;
    data.scripts ||= {};
    data.scripts['regression:p0:operational-date-anchor'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-81-operational-date-anchor.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source.replace(/versionCode\s+\d+/, 'versionCode 140381').replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
  update('server.mjs', patchRuntimeVersionV14381, { optional: true });
  update('server/platform.mjs', patchRuntimeVersionV14381, { optional: true });
  console.log(`[v14381] CrewCheck ${VERSION}: Updated Date isolada da data operacional; cache anterior invalidado.`);
}
