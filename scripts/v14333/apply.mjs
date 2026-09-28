import fs from 'node:fs';

const VERSION = '14.3.33';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14333] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14333] Ponto de aplicação não localizado: ${label}`);
  return source.replace(before, after);
}

function insertBeforeRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`[v14333] Âncora ausente: ${label}`);
  return source.replace(anchor, `${value.trimEnd()}\n\n${anchor}`);
}

function patchBlock(source, startMarker, endMarker, label, replacement) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14333] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

const clientIntegrityHelpers = `function normalizeCrewRosterFlightTokens(value: string): string {
  return normalizeSpaces(String(value || '').replace(/\\bLA\\s+(\\d{3,4})\\b/gi, 'LA$1'));
}
function crewRosterSourceHasFlights(value: string): boolean {
  return /\\bLA\\s*\\d{3,4}\\b/i.test(String(value || ''));
}
function countRosterFlightLegs(days: RosterDay[]): number {
  return (days || []).reduce((sum, day) => sum + (day.legs?.length || 0), 0);
}
function assertCrewRosterReportIntegrity(roster: CrewRoster, fullText: string): void {
  if (!crewRosterSourceHasFlights(fullText)) return;
  if (countRosterFlightLegs(roster.days) > 0) return;
  throw new Error('A escala oficial contém voos, mas nenhuma etapa foi reconhecida. A importação foi bloqueada para não salvar uma escala incompleta. Reprocesse o mesmo CrewRosterReport após atualizar o CrewCheck.');
}`;

const clientDateTokenFunction = `function dateTokenFromReportLine(line: string, fallbackYear: number): string | null {
  const explicit = line.match(DATE_TOKEN_RE)?.[0];
  if (explicit) return explicit;
  const pairing = line.match(/\\b(?:LA\\s?\\d{3,4}|HSBE?|ASB|RCFI|DR|DOF?|C\\d{2,3}F)[-/](\\d{6})(?:\\/|\\b)/i);
  if (pairing) return dateTokenFromCompactPairingDate(pairing[1], fallbackYear);
  const compact = line.match(/\\b(\\d{1,2})(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)\\b/i);
  if (!compact) return null;
  const monthMap: Record<string, number> = { jan:1, feb:2, fev:2, mar:3, apr:4, abr:4, may:5, mai:5, jun:6, jul:7, aug:8, ago:8, sep:9, set:9, oct:10, out:10, nov:11, dec:12, dez:12 };
  const month = monthMap[compact[2].slice(0, 3).toLowerCase()] || 0;
  return month ? String(Number(compact[1])).padStart(2, '0') + '-' + monthNumberToEnglishAbbr(month) + '-' + fallbackYear : null;
}`;

const clientDateBlocksFunction = `function buildCrewRosterReportDateBlocks(fullText: string): { dateToken: string; text: string }[] {
  const fallbackYear = Number(fullText.match(/\\d{2}-[A-Za-z]{3}-(\\d{4})/)?.[1]) || new Date().getFullYear();
  const lines = fullText
    .split(/\\r?\\n/)
    .map(line => stripUpdatedDate(normalizeSpaces(line)))
    .filter(line => line && !isHeaderOrFooterRow(line));

  const blocks: { dateToken: string; parts: string[] }[] = [];
  let current: { dateToken: string; parts: string[] } | null = null;

  for (const line of lines) {
    const detectedDateToken = dateTokenFromReportLine(line, fallbackYear);
    const compactDateAtStart = /^\\s*\\d{1,2}(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)\\b/i.test(line);
    const startsDateBlock = Boolean(detectedDateToken) && (
      compactDateAtStart
      || line.indexOf(String(detectedDateToken)) <= 18
      || /^<==/.test(line)
      || /\\b(?:LA\\s?\\d{3,4}|HSBE?|ASB|RCFI)[-/]\\d{6}\\//i.test(line)
    );
    if (detectedDateToken && startsDateBlock) {
      if (current) blocks.push(current);
      const withoutDate = line
        .replace(DATE_TOKEN_RE, '')
        .replace(/^\\s*\\d{1,2}(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)\\b/i, '')
        .trim();
      current = { dateToken: detectedDateToken, parts: [withoutDate] };
      continue;
    }
    if (current && /\\b(LA\\s?\\d{3,4}|OP|PS|DH|[A-Z]{3}\\s+\\d{1,2}:\\d{2}|\\d{1,2}:\\d{2}\\(\\+\\d+\\))\\b/.test(line)) {
      current.parts.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks.map(block => ({ dateToken: block.dateToken, text: normalizeCrewRosterFlightTokens(block.parts.join(' ')) }));
}`;

const clientExtractFlightsFunction = `function extractFlightLegsFromReportBlock(text: string): FlightLeg[] {
  const legs: FlightLeg[] = [];
  const normalized = normalizeCrewRosterFlightTokens(text);
  const appendLeg = (flightNumber: string, explicitWorkType: string | undefined, origin: string, rawDepartureTime: string, destination: string, rawArrivalTime: string, index: number) => {
    const blocked = new Set(['OP','PS','HSB','ASB','DOF','OFF','CRM','RES']);
    if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || blocked.has(origin) || blocked.has(destination) || origin === destination) return;
    const departureTime = cleanTime(rawDepartureTime);
    const arrivalTime = cleanTime(rawArrivalTime);
    const isNextDay = isExplicitNextDayTime(rawArrivalTime) || timeToMinutes(arrivalTime) < timeToMinutes(departureTime);
    legs.push({
      flightNumber,
      origin,
      destination,
      departureTime,
      arrivalTime,
      workType: explicitWorkType || inferWorkTypeFromContext(normalized, index) || 'OP',
      aircraftType: inferAircraftType(normalized.slice(index, index + 180)),
      duration: diffHours(departureTime, arrivalTime, isNextDay),
      isNextDay,
    });
  };

  const standard = /\\b(LA\\d{3,4})\\b\\s+(?:(?:CC|CP|FO|CM)\\s+)?(?:(OP|PS|DH)\\s+)?([A-Z]{3})\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)\\s+([A-Z]{3})\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)/g;
  let match: RegExpExecArray | null;
  while ((match = standard.exec(normalized)) !== null) appendLeg(match[1], match[2], match[3], match[4], match[5], match[6], match.index);

  const timeFirst = /\\b(LA\\d{3,4})\\b\\s+(?:(OP|PS|DH)\\s+)?(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)(?:\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?))?\\s+([A-Z]{3})\\s+([A-Z]{3})\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)/g;
  while ((match = timeFirst.exec(normalized)) !== null) {
    const departureTime = match[4] || match[3];
    appendLeg(match[1], match[2], match[5], departureTime, match[6], match[7], match.index);
  }

  return legs.filter((leg, index, all) => all.findIndex(other => other.flightNumber === leg.flightNumber && other.origin === leg.origin && other.departureTime === leg.departureTime) === index);
}`;

update('client/src/lib/pdfParser.ts', (source) => {
  let next = insertBeforeRequired(source, 'export async function parsePDF(file: File): Promise<CrewRoster> {', clientIntegrityHelpers, 'barreira de integridade do CrewRosterReport');
  next = replaceRequired(
    next,
    `  if (isCrewRosterReport) {\n    const parsed = parseCrewRosterReportRows(rows, fullText);\n    if (parsed.days.length > 0) return parsed;\n  }`,
    `  if (isCrewRosterReport) {\n    const parsed = parseCrewRosterReportRows(rows, fullText);\n    assertCrewRosterReportIntegrity(parsed, fullText);\n    if (parsed.days.length > 0) return parsed;\n  }`,
    'bloqueio de importação oficial incompleta',
  );
  next = replaceRequired(
    next,
    `  const sequentialEventCount = countRosterEvents(sequentialDays);\n  const transposedEventCount = countRosterEvents(transposedDays);`,
    `  const sequentialEventCount = countRosterEvents(sequentialDays);\n  const transposedEventCount = countRosterEvents(transposedDays);\n  const sourceHasFlights = crewRosterSourceHasFlights(fullText);\n  const transposedFlightCount = countRosterFlightLegs(transposedDays);`,
    'contagem de voos da estratégia transposta',
  );
  next = replaceRequired(
    next,
    `  const useStrongTransposed = /Roster\\s+Report/i.test(fullText)\n    && transposedDays.length >= 25\n    && transposedEventCount >= 30;`,
    `  const useStrongTransposed = /Roster\\s+Report/i.test(fullText)\n    && transposedDays.length >= 25\n    && transposedEventCount >= 30\n    && (!sourceHasFlights || transposedFlightCount > 0);`,
    'estratégia transposta não pode vencer com zero voos',
  );
  next = replaceRequired(
    next,
    `  const rescuedDays = useStrongTransposed\n    ? mergedDays\n    : rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);`,
    `  const rescuedDays = rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);`,
    'resgate textual obrigatório dos voos',
  );
  next = patchBlock(next, 'function dateTokenFromReportLine(', 'function buildCrewRosterReportDateBlocks(', 'data compacta do CrewRosterReport', clientDateTokenFunction);
  next = patchBlock(next, 'function buildCrewRosterReportDateBlocks(', 'function extractFlightLegsFromReportBlock(', 'blocos oficiais por data', clientDateBlocksFunction);
  next = patchBlock(next, 'function extractFlightLegsFromReportBlock(', 'function addDaysToRosterDate(', 'voos combinados e quebrados', clientExtractFlightsFunction);
  return next;
});

const serverRescueHelpers = `function normalizeServerRosterFlightTokens(value) {
  return cleanRosterLineV3(String(value || '').replace(/\\bLA\\s+(\\d{3,4})\\b/gi, 'LA$1'));
}
function serverRosterSourceHasFlights(value) {
  return /\\bLA\\s*\\d{3,4}\\b/i.test(String(value || ''));
}
function countServerRosterFlightLegs(days) {
  return (days || []).reduce((sum, day) => sum + (day.legs?.length || 0), 0);
}
function serverRosterDateMarkerFromLine(line, fallbackYear) {
  const explicit = String(line || '').match(/\\b(\\d{2})-([A-Za-z]{3})-(\\d{4})\\b/);
  if (explicit) return { day: Number(explicit[1]), month: monthNameToNum(explicit[2]), year: Number(explicit[3]) };
  const pairing = String(line || '').match(/\\b(?:LA\\s?\\d{3,4}|HSBE?|ASB|RCFI|DR|DOF?|C\\d{2,3}F)[-/](\\d{6})(?:\\/|\\b)/i)?.[1];
  if (pairing) return { day: Number(pairing.slice(0, 2)), month: Number(pairing.slice(2, 4)), year: 2000 + Number(pairing.slice(4, 6)) };
  const compact = String(line || '').match(/\\b(\\d{1,2})(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)\\b/i);
  return compact ? { day: Number(compact[1]), month: monthNameToNum(compact[2]), year: fallbackYear } : null;
}
function buildServerRosterRescueBlocks(fullText, fallbackYear) {
  const blocks = [];
  let current = null;
  for (const rawLine of String(fullText || '').split(/\\n+/)) {
    const line = cleanRosterLineV3(rawLine);
    if (!line || /^(Roster Report|Date\\s+|Duty\\s+|Updated By|Updated Date|A\\/C|Type\\s*$)/i.test(line)) continue;
    const marker = serverRosterDateMarkerFromLine(line, fallbackYear);
    const compactDateAtStart = /^\\s*\\d{1,2}(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)\\b/i.test(line);
    const begins = marker && (compactDateAtStart || /^\\d{2}-[A-Za-z]{3}-\\d{4}/.test(line) || /\\b(?:LA\\s?\\d{3,4}|HSBE?|ASB|RCFI)[-/]\\d{6}\\//i.test(line));
    if (begins) {
      if (current) blocks.push(current);
      current = { marker, parts: [line] };
      continue;
    }
    if (current && /\\b(LA\\s?\\d{3,4}|OP|PS|DH|[A-Z]{3}\\s+\\d{1,2}:\\d{2}|\\d{1,2}:\\d{2}\\(\\+\\d+\\))\\b/.test(line)) current.parts.push(line);
  }
  if (current) blocks.push(current);
  return blocks.map((block) => ({ marker: block.marker, text: normalizeServerRosterFlightTokens(block.parts.join(' ')) }));
}
function extractServerRosterFlightLegs(text) {
  const normalized = normalizeServerRosterFlightTokens(text);
  const legs = [];
  const blocked = new Set(['OP','PS','HSB','ASB','DOF','OFF','CRM','RES']);
  const append = (flightNumber, workType, origin, rawDeparture, destination, rawArrival) => {
    if (!isAirportCodeToken(origin) || !isAirportCodeToken(destination) || blocked.has(origin) || blocked.has(destination) || origin === destination) return;
    const departureTime = normalizeTimeToken(rawDeparture);
    const arrivalTime = normalizeTimeToken(rawArrival);
    const isNextDay = serverDayOffsetFromToken(rawArrival) > serverDayOffsetFromToken(rawDeparture) || toMin(arrivalTime) < toMin(departureTime);
    legs.push({ flightNumber, origin, destination, departureTime, arrivalTime, workType: workType || 'OP', isNextDay, duration: diffHours(departureTime, arrivalTime) });
  };
  let match;
  const standard = /\\b(LA\\d{3,4})\\b\\s+(?:(OP|PS|DH)\\s+)?([A-Z]{3})\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)\\s+([A-Z]{3})\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)/g;
  while ((match = standard.exec(normalized)) !== null) append(match[1], match[2], match[3], match[4], match[5], match[6]);
  const timeFirst = /\\b(LA\\d{3,4})\\b\\s+(?:(OP|PS|DH)\\s+)?(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)(?:\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?))?\\s+([A-Z]{3})\\s+([A-Z]{3})\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)/g;
  while ((match = timeFirst.exec(normalized)) !== null) append(match[1], match[2], match[5], match[4] || match[3], match[6], match[7]);
  return legs.filter((leg, index, all) => all.findIndex((other) => other.flightNumber === leg.flightNumber && other.origin === leg.origin && other.departureTime === leg.departureTime) === index);
}
function rescueServerRosterFlightsFromText(days, fullText, referenceMonth, referenceYear, base) {
  const byDate = new Map();
  for (const day of days || []) {
    const list = byDate.get(day.date) || [];
    list.push(day);
    byDate.set(day.date, list);
  }
  for (const block of buildServerRosterRescueBlocks(fullText, referenceYear)) {
    const marker = block.marker;
    if (!marker?.day || !marker?.month || Math.abs((marker.year * 12 + marker.month) - (referenceYear * 12 + referenceMonth)) > 1) continue;
    const legs = extractServerRosterFlightLegs(block.text);
    if (!legs.length) continue;
    const dateKey = dateObj(marker.day, marker.month, marker.year).date;
    const list = byDate.get(dateKey) || [];
    let flightDay = list.find((day) => day.legs?.length) || null;
    if (!flightDay) { flightDay = makeDay(marker.day, marker.month, marker.year, base); list.push(flightDay); }
    for (const leg of legs) if (!flightDay.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.departureTime === leg.departureTime)) flightDay.legs.push(leg);
    flightDay.legs.sort((a, b) => toMin(a.departureTime) - toMin(b.departureTime));
    flightDay.type = 'VOO';
    flightDay.pairingCode = flightDay.pairingCode || flightDay.legs[0]?.flightNumber || '';
    flightDay.rawText = `${flightDay.rawText || ''} ${block.text}`.trim();
    flightDay.dutyReport = flightDay.dutyReport || flightDay.legs[0]?.departureTime || null;
    flightDay.dutyDebrief = flightDay.dutyDebrief || flightDay.legs.at(-1)?.arrivalTime || null;
    flightDay.isNextDay = Boolean(flightDay.isNextDay || flightDay.legs.some((leg) => leg.isNextDay));
    flightDay.flyingHours = flightDay.legs.reduce((sum, leg) => sum + (leg.duration || 0), 0);
    flightDay.dutyHours = flightDay.dutyReport && flightDay.dutyDebrief ? diffHours(flightDay.dutyReport, flightDay.dutyDebrief) : null;
    byDate.set(dateKey, list);
  }
  return Array.from(byDate.values()).flat();
}`;

update('server/rosterParser.mjs', (source) => {
  let next = insertBeforeRequired(source, 'function scoreServerRosterDays(days) {', serverRescueHelpers, 'resgate oficial no servidor');
  next = replaceRequired(
    next,
    ` const days = columnDays.length >= 8 && columnFlightCount >= Math.max(4, textFlightCount * 0.55) ? columnDays : (scoreServerRosterDays(columnDays) >= scoreServerRosterDays(textDays) ? columnDays : textDays);\n return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };`,
    ` const selectedDays = columnDays.length >= 8 && columnFlightCount >= Math.max(4, textFlightCount * 0.55) ? columnDays : (scoreServerRosterDays(columnDays) >= scoreServerRosterDays(textDays) ? columnDays : textDays);\n const days = rescueServerRosterFlightsFromText(selectedDays, fullText, h.month, h.year, h.base);\n if (serverRosterSourceHasFlights(fullText) && countServerRosterFlightLegs(days) === 0) throw new Error('CrewRosterReport oficial contém voos, mas nenhuma etapa foi reconhecida; importação parcial bloqueada.');\n return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };`,
    'resgate e bloqueio do parser oficial no servidor',
  );
  next = replaceRequired(
    next,
    ` const confidence = uniqueDays >= 28 && flights >= 20 && reserve >= 2 ? 'alta' : uniqueDays >= 20 && flights >= 15 ? 'média' : 'baixa';`,
    ` const sourceHasFlights = serverRosterSourceHasFlights(roster.rawText || '');\n const confidence = sourceHasFlights && flights === 0 ? 'baixa' : uniqueDays >= 28 && flights >= 20 && reserve >= 2 ? 'alta' : uniqueDays >= 20 && flights >= 15 ? 'média' : 'baixa';`,
    'diagnóstico não pode aprovar escala oficial sem voos',
  );
  return next;
});

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: integridade crítica do CrewRosterReport oficial e recuperação de voos';`));
update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`));
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION));
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/crewcheck-cache-reset-[0-9-]+/g, `crewcheck-cache-reset-${VERSION.replace(/\./g, '-')}`)
  .replace(/currentRelease\s*=\s*'[^']+'/g, `currentRelease = '${VERSION}'`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`));
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`));
update('client/public/release.json', () => JSON.stringify({ version: VERSION, build: VERSION_DIGITS, releasedAt: new Date().toISOString(), notes: 'CrewRosterReport oficial: voos restaurados e importação parcial bloqueada.' }, null, 2) + '\n', { optional: true });

console.log(`[v14333] CrewRosterReport oficial protegido: estratégias sem voos não vencem, formatos LA1234/LA 1234 são resgatados e escalas parciais são bloqueadas. Versão ${VERSION}.`);
