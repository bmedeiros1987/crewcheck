import fs from 'node:fs';

const VERSION = '14.3.40';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14340] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14340] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14340] Ponto não localizado: ${label}`);
  return source.replace(before, after);
}

const clientVisualRescue = String.raw`function visualRosterDateMarker(text: string, fallbackYear: number): { day: number; month: number; year: number } | null {
  const explicit = String(text || '').match(/\b(\d{2})-([A-Za-z]{3})-(\d{4})\b/);
  if (explicit) {
    const monthMap: Record<string, number> = { jan:1, feb:2, fev:2, mar:3, apr:4, abr:4, may:5, mai:5, jun:6, jul:7, aug:8, ago:8, sep:9, set:9, oct:10, out:10, nov:11, dec:12, dez:12 };
    const month = monthMap[explicit[2].slice(0, 3).toLowerCase()] || 0;
    return month ? { day: Number(explicit[1]), month, year: Number(explicit[3]) } : null;
  }
  const pairing = String(text || '').match(/\bLA\s?\d{3,4}[/-](\d{6})(?:\/|\b)/i)?.[1];
  return pairing ? { day: Number(pairing.slice(0, 2)), month: Number(pairing.slice(2, 4)), year: 2000 + Number(pairing.slice(4, 6)) } : null;
}
function visualRosterStationTimes(text: string): Array<{ airport: string; rawTime: string }> {
  return Array.from(String(text || '').matchAll(/\b([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/g))
    .map((match) => ({ airport: match[1].toUpperCase(), rawTime: match[2] }))
    .filter((item) => !/^(OP|PS|HSB|ASB|DOF|OFF|CRM|RES)$/.test(item.airport));
}
function rescueFlightsFromVisualRows(days: RosterDay[], rows: VisualRow[], referenceMonth: number, referenceYear: number, base: string): RosterDay[] {
  const byDate = new Map<string, RosterDay[]>();
  for (const day of days || []) {
    const list = byDate.get(day.date) || [];
    list.push(day);
    byDate.set(day.date, list);
  }
  let current: { day: number; month: number; year: number } | null = null;
  const ordered = [...rows].sort((a, b) => a.page - b.page || a.key - b.key);
  for (let index = 0; index < ordered.length; index++) {
    const row = ordered[index];
    const marker = visualRosterDateMarker(row.text, referenceYear);
    if (marker) current = marker;
    if (!current || !isPublishedRosterContextMonth(current.month, current.year, referenceMonth, referenceYear)) continue;
    if (/\bLA\s?\d{3,4}[/-]\d{6}\//i.test(row.text)) continue;
    const flightNumber = row.text.match(/\bLA\s?\d{3,4}\b/i)?.[0]?.replace(/\s+/g, '').toUpperCase();
    if (!flightNumber) continue;
    const currentPairs = visualRosterStationTimes(row.text);
    const previous = ordered[index - 1];
    const previousPairs = previous && previous.page === row.page && Math.abs(row.key - previous.key) <= 36
      ? visualRosterStationTimes(previous.text)
      : [];
    let route: Array<{ airport: string; rawTime: string }> = [];
    if (currentPairs.length >= 2) route = currentPairs.slice(0, 2);
    else if (currentPairs.length === 1 && previousPairs.length >= 1) {
      const previousPair = previousPairs[previousPairs.length - 1];
      const currentOrder = dayOffsetFromTime(currentPairs[0].rawTime) * 1440 + timeToMinutes(cleanTime(currentPairs[0].rawTime));
      const previousOrder = dayOffsetFromTime(previousPair.rawTime) * 1440 + timeToMinutes(cleanTime(previousPair.rawTime));
      route = previousOrder <= currentOrder ? [previousPair, currentPairs[0]] : [currentPairs[0], previousPair];
    }
    else if (currentPairs.length === 0 && previousPairs.length >= 2) route = previousPairs.slice(0, 2);
    if (route.length < 2 || route[0].airport === route[1].airport) continue;
    const departureTime = cleanTime(route[0].rawTime);
    const arrivalTime = cleanTime(route[1].rawTime);
    const isNextDay = dayOffsetFromTime(route[1].rawTime) > dayOffsetFromTime(route[0].rawTime) || timeToMinutes(arrivalTime) < timeToMinutes(departureTime);
    const dateKey = formatRosterDate(current.day, current.month, current.year);
    const list = byDate.get(dateKey) || [];
    let flightDay = list.find((day) => day.type === 'VOO' || day.legs?.length) || null;
    if (!flightDay) {
      flightDay = createRosterDay(current.day, current.month, current.year, base);
      list.push(flightDay);
    }
    if (!flightDay.legs.some((leg) => leg.flightNumber === flightNumber && leg.origin === route[0].airport && leg.departureTime === departureTime)) {
      const workType = row.text.match(/\b(OP|PS|DH)\b/i)?.[1]?.toUpperCase() || 'OP';
      const aircraftType = row.text.match(/\b(32S|31R|39R|328|319|320|321|32N)\b/i)?.[1]?.toUpperCase();
      flightDay.legs.push({ flightNumber, origin: route[0].airport, destination: route[1].airport, departureTime, arrivalTime, workType, aircraftType, isNextDay, duration: diffHours(departureTime, arrivalTime, isNextDay) });
    }
    flightDay.type = 'VOO';
    flightDay.pairingCode = flightDay.pairingCode || flightNumber;
    flightDay.rawText = normalizeSpaces(String(flightDay.rawText || '') + ' ' + String(previous?.text || '') + ' ' + row.text);
    flightDay.dutyReport = flightDay.dutyReport || flightDay.legs[0]?.departureTime || null;
    flightDay.dutyDebrief = flightDay.legs.at(-1)?.arrivalTime || flightDay.dutyDebrief;
    flightDay.isNextDay = Boolean(flightDay.isNextDay || flightDay.legs.some((leg) => leg.isNextDay));
    finalizeRosterDay(flightDay);
    byDate.set(dateKey, list);
  }
  return Array.from(byDate.values()).flat();
}`;

update('client/src/lib/pdfParser.ts', (source) => {
  let next = source;
  next = replaceBlock(next, 'function assertCrewRosterReportIntegrity(', 'function dateTokenFromReportLine(', String.raw`function assertCrewRosterReportIntegrity(roster: CrewRoster, fullText: string): void {
  if (!crewRosterSourceHasFlights(fullText) || countRosterFlightLegs(roster.days) > 0) return;
  console.warn('[CrewCheck] CrewRosterReport com voos ainda sem etapas no primeiro passe; importação seguirá e os resgates visual/servidor continuarão tentando recuperar os trechos.');
}`, 'barreira de importação convertida em diagnóstico');
  if (!next.includes('function rescueFlightsFromVisualRows(')) {
    const anchor = 'function rescueFlightsFromFullText(';
    if (!next.includes(anchor)) throw new Error('[v14340] Âncora do resgate visual ausente.');
    next = next.replace(anchor, `${clientVisualRescue}\n\n${anchor}`);
  }
  next = replaceRequired(
    next,
    `  const rescuedDays = rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);\n  const crewRecords = parseGenericTripulationRecords(fullText, header.crewName, header.year, header.month);\n  const days = applyGenericTripulationRecordsToDays(normalizeCrewRosterReportContinuationDays(rescuedDays, header.month, header.year, header.base), crewRecords, header.crewName);`,
    `  const rescuedDays = rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);\n  const visuallyRescuedDays = rescueFlightsFromVisualRows(rescuedDays, rows, header.month, header.year, header.base);\n  const crewRecords = parseGenericTripulationRecords(fullText, header.crewName, header.year, header.month);\n  const days = applyGenericTripulationRecordsToDays(normalizeCrewRosterReportContinuationDays(visuallyRescuedDays, header.month, header.year, header.base), crewRecords, header.crewName);`,
    'resgate visual antes da normalização canônica',
  );
  return next;
});

const serverVisualFunctions = String.raw`function buildServerRows(items, axis = 'y') {
 const groups = [];
 for (const item of items || []) {
  const key = axis === 'x' ? item.x : item.y;
  let group = groups.find((candidate) => Math.abs(candidate.key - key) <= 4);
  if (!group) { group = { key, items: [] }; groups.push(group); }
  group.items.push(item);
 }
 return groups.map((group) => {
  const sortedItems = [...group.items].sort(axis === 'x' ? ((a, b) => b.y - a.y || a.x - b.x) : ((a, b) => a.x - b.x));
  return { key: group.key, items: sortedItems, text: sortedItems.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim() };
 }).filter((row) => row.text).sort(axis === 'x' ? ((a, b) => a.key - b.key) : ((a, b) => b.key - a.key));
}
function scoreServerRows(rows) {
 const text = rows.map((row) => row.text).join('\n');
 let score = 0;
 if (/Roster\s+Report/i.test(text)) score += 8;
 if (/\d{2}-[A-Za-z]{3}-\d{4}\s+to\s+\d{2}-[A-Za-z]{3}-\d{4}/.test(text)) score += 10;
 if (/[A-ZÀ-Ú\s]{6,}\s*\|\s*\d{6,}\s*\|/.test(text)) score += 8;
 score += rows.filter((row) => /\b\d{2}-[A-Za-z]{3}-\d{4}\b/.test(row.text) && /\b(LA\s?\d{3,4}|DO|DR|HSBE?|ASB)\b/i.test(row.text)).length * 3;
 score += rows.filter((row) => /\bLA\s?\d{3,4}\b.*\b(OP|PS|DH)\b.*\b[A-Z]{3}\s+\d{1,2}:\d{2}/i.test(row.text)).length * 2;
 return score;
}
function buildServerVisualRows(pages) {
 return (pages || []).flatMap(({ pageNo, items }) => {
  const normal = buildServerRows(items, 'y');
  const rotated = buildServerRows(items, 'x');
  const chosen = scoreServerRows(rotated) > scoreServerRows(normal) ? rotated : normal;
  return chosen.map((row) => ({ ...row, page: pageNo }));
 });
}
function buildServerFullText(pages) {
 return buildServerVisualRows(pages).map((row) => row.text).join('\n');
}
function serverVisualDateMarker(text, fallbackYear) {
 const explicit = String(text || '').match(/\b(\d{2})-([A-Za-z]{3})-(\d{4})\b/);
 if (explicit) return { day: Number(explicit[1]), month: monthNameToNum(explicit[2]), year: Number(explicit[3]) };
 const pairing = String(text || '').match(/\bLA\s?\d{3,4}[/-](\d{6})(?:\/|\b)/i)?.[1];
 return pairing ? { day: Number(pairing.slice(0, 2)), month: Number(pairing.slice(2, 4)), year: 2000 + Number(pairing.slice(4, 6)) } : null;
}
function serverVisualStationTimes(text) {
 return Array.from(String(text || '').matchAll(/\b([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/g))
  .map((match) => ({ airport: match[1].toUpperCase(), rawTime: match[2] }))
  .filter((item) => isAirportCodeToken(item.airport));
}
function rescueServerFlightsFromVisualPages(days, pages, referenceMonth, referenceYear, base) {
 const byDate = new Map();
 for (const day of days || []) { const list = byDate.get(day.date) || []; list.push(day); byDate.set(day.date, list); }
 const rows = buildServerVisualRows(pages);
 let current = null;
 for (let index = 0; index < rows.length; index++) {
  const row = rows[index];
  const marker = serverVisualDateMarker(row.text, referenceYear);
  if (marker) current = marker;
  if (!current || !current.month || Math.abs((current.year * 12 + current.month) - (referenceYear * 12 + referenceMonth)) > 1) continue;
  if (/\bLA\s?\d{3,4}[/-]\d{6}\//i.test(row.text)) continue;
  const flightNumber = row.text.match(/\bLA\s?\d{3,4}\b/i)?.[0]?.replace(/\s+/g, '').toUpperCase();
  if (!flightNumber) continue;
  const currentPairs = serverVisualStationTimes(row.text);
  const previous = rows[index - 1];
  const previousPairs = previous && previous.page === row.page && Math.abs(row.key - previous.key) <= 36 ? serverVisualStationTimes(previous.text) : [];
  let route = [];
  if (currentPairs.length >= 2) route = currentPairs.slice(0, 2);
  else if (currentPairs.length === 1 && previousPairs.length >= 1) {
   const previousPair = previousPairs[previousPairs.length - 1];
   const currentOrder = serverDayOffsetFromToken(currentPairs[0].rawTime) * 1440 + toMin(normalizeTimeToken(currentPairs[0].rawTime));
   const previousOrder = serverDayOffsetFromToken(previousPair.rawTime) * 1440 + toMin(normalizeTimeToken(previousPair.rawTime));
   route = previousOrder <= currentOrder ? [previousPair, currentPairs[0]] : [currentPairs[0], previousPair];
  }
  else if (currentPairs.length === 0 && previousPairs.length >= 2) route = previousPairs.slice(0, 2);
  if (route.length < 2 || route[0].airport === route[1].airport) continue;
  const departureTime = normalizeTimeToken(route[0].rawTime);
  const arrivalTime = normalizeTimeToken(route[1].rawTime);
  const isNextDay = serverDayOffsetFromToken(route[1].rawTime) > serverDayOffsetFromToken(route[0].rawTime) || toMin(arrivalTime) < toMin(departureTime);
  const dateKey = dateObj(current.day, current.month, current.year).date;
  const list = byDate.get(dateKey) || [];
  let flightDay = list.find((day) => day.type === 'VOO' || day.legs?.length);
  if (!flightDay) { flightDay = makeDay(current.day, current.month, current.year, base); list.push(flightDay); }
  if (!flightDay.legs.some((leg) => leg.flightNumber === flightNumber && leg.origin === route[0].airport && leg.departureTime === departureTime)) {
   const workType = row.text.match(/\b(OP|PS|DH)\b/i)?.[1]?.toUpperCase() || 'OP';
   const aircraftType = row.text.match(/\b(32S|31R|39R|328|319|320|321|32N)\b/i)?.[1]?.toUpperCase();
   flightDay.legs.push({ flightNumber, origin: route[0].airport, destination: route[1].airport, departureTime, arrivalTime, workType, aircraftType, isNextDay, duration: diffHours(departureTime, arrivalTime) });
  }
  flightDay.type = 'VOO';
  flightDay.pairingCode = flightDay.pairingCode || flightNumber;
  flightDay.rawText = cleanRosterLineV3(String(flightDay.rawText || '') + ' ' + String(previous?.text || '') + ' ' + row.text);
  flightDay.dutyReport = flightDay.dutyReport || flightDay.legs[0]?.departureTime || null;
  flightDay.dutyDebrief = flightDay.legs.at(-1)?.arrivalTime || flightDay.dutyDebrief;
  flightDay.isNextDay = Boolean(flightDay.isNextDay || flightDay.legs.some((leg) => leg.isNextDay));
  flightDay.flyingHours = flightDay.legs.reduce((sum, leg) => sum + Number(leg.duration || 0), 0);
  flightDay.dutyHours = flightDay.dutyReport && flightDay.dutyDebrief ? diffHours(flightDay.dutyReport, flightDay.dutyDebrief) : null;
  byDate.set(dateKey, list);
 }
 return Array.from(byDate.values()).flat();
}`;

update('server/rosterParser.mjs', (source) => {
  let next = replaceBlock(source, 'function buildServerFullText(', 'function parseServerHeader(', serverVisualFunctions, 'leitura orientada do Jasper CrewRosterReport');
  next = replaceRequired(
    next,
    ` roster.rawText = fullText;\n roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);`,
    ` roster.rawText = fullText;\n roster.days = rescueServerFlightsFromVisualPages(roster.days, pages, roster.month, roster.year, roster.base);\n roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);`,
    'resgate visual no servidor',
  );
  next = next.replace(
    ` if (serverRosterSourceHasFlights(fullText) && countServerRosterFlightLegs(days) === 0) throw new Error('CrewRosterReport oficial contém voos, mas nenhuma etapa foi reconhecida; importação parcial bloqueada.');`,
    ` if (serverRosterSourceHasFlights(fullText) && countServerRosterFlightLegs(days) === 0) console.warn('[CrewCheck] Voos identificados no PDF; o resgate visual continuará após a leitura principal.');`,
  );
  return next;
});
