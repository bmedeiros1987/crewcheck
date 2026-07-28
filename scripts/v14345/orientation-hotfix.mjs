import fs from 'node:fs';

const VERSION = '14.3.45';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(filePath, transform, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) return;
    throw new Error(`[v14345] Arquivo ausente: ${filePath}`);
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14345] Ponto de aplicação não localizado: ${label}`);
  return source.replace(before, after);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) {
    throw new Error(`[v14345] Bloco não localizado: ${label}. start=${start} end=${end}`);
  }
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

const clientVisualRows = String.raw`async function extractVisualRows(pdf: any): Promise<VisualRow[]> {
  const allRows: VisualRow[] = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const textContent = await page.getTextContent();
    const items: VisualItem[] = (textContent.items as any[])
      .map((item: any) => ({
        str: cleanCellText(item.str || ''),
        x: Number(item.transform?.[4] || 0),
        y: Number(item.transform?.[5] || 0),
        width: Number(item.width || 0),
        page: pageNo,
      }))
      .filter((item: VisualItem) => item.str.length > 0);

    const normalRows = buildRows(items, 'y');
    const rotatedRows = bestRotatedRows(items);
    const chosen = scoreRows(rotatedRows) > scoreRows(normalRows) ? rotatedRows : normalRows;
    allRows.push(...chosen.map(row => ({ ...row, page: pageNo })));
  }

  return allRows;
}

type RotatedTextDirection = 'ascending' | 'descending';

function buildRows(items: VisualItem[], axis: 'x' | 'y', rotatedDirection: RotatedTextDirection = 'descending'): VisualRow[] {
  // JasperReports pode publicar a mesma página a 90 ou 270 graus. O baseline
  // também varia alguns pontos entre células da mesma linha.
  const tolerance = axis === 'x' ? 7 : 4;
  const groups: { key: number; items: VisualItem[] }[] = [];

  for (const item of items) {
    const key = axis === 'x' ? item.x : item.y;
    let group = groups.find(candidate => Math.abs(candidate.key - key) <= tolerance);
    if (!group) {
      group = { key, items: [] };
      groups.push(group);
    }
    group.items.push(item);
    group.key = group.items.reduce((sum, current) => sum + (axis === 'x' ? current.x : current.y), 0) / group.items.length;
  }

  const rows = groups
    .map(group => {
      const sortedItems = [...group.items].sort((a, b) => {
        if (axis === 'x') {
          return rotatedDirection === 'ascending'
            ? a.y - b.y || a.x - b.x
            : b.y - a.y || a.x - b.x;
        }
        return a.x - b.x;
      });
      return {
        page: sortedItems[0]?.page || 1,
        key: group.key,
        items: sortedItems,
        text: normalizeSpaces(sortedItems.map(item => item.str).join(' ')),
      };
    })
    .filter(row => row.text.length > 0);

  return rows.sort((a, b) => axis === 'x' ? a.key - b.key : b.key - a.key);
}

function preferredRotatedTextDirection(items: VisualItem[]): RotatedTextDirection {
  const ascending = buildRows(items, 'x', 'ascending');
  const descending = buildRows(items, 'x', 'descending');
  return scoreRows(ascending) > scoreRows(descending) ? 'ascending' : 'descending';
}

function bestRotatedRows(items: VisualItem[]): VisualRow[] {
  return buildRows(items, 'x', preferredRotatedTextDirection(items));
}`;

const clientHeader = String.raw`function parseHeader(fullText: string): {
  crewName: string;
  crewId: string;
  base: string;
  rank: string;
  airline?: string;
  month: number;
  year: number;
  totals: { flightHours?: number; dutyHours?: number };
} {
  let crewName = 'Tripulante';
  let crewId = '';
  let base = 'BSB';
  let rank = 'CCM';
  const airline = /LATAM|\bLA\d{3,4}\b/i.test(fullText) ? 'LATAM' : 'Companhia aérea';
  let month = new Date().getMonth() + 1;
  let year = new Date().getFullYear();

  const compactText = normalizeSpaces(fullText.replace(/\n/g, ' '));

  const aimsCrew = compactText.match(/Tripulante\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{3,}?)(?:\s*-\s*)?BP\s*:?\s*(\d{3,})(?:\s*-\s*)?Base\s*:?\s*([A-Z]{3})(?:\s*-\s*)?(\d{2})\/(\d{2})\/(\d{4})/i);
  if (aimsCrew) {
    crewName = cleanCrewName(aimsCrew[1]);
    crewId = aimsCrew[2];
    base = aimsCrew[3].toUpperCase();
    month = Number(aimsCrew[5]);
    year = Number(aimsCrew[6]);
  }

  const crewMatch = compactText.match(/([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9-]+)(?:\s*\|\s*|\s+)([A-Z]{3})(?:\s*\|\s*|\s+)([A-Z]{2,5})/);
  if (crewMatch) {
    crewName = cleanCrewName(crewMatch[1]);
    crewId = crewMatch[2];
    base = crewMatch[4];
    rank = crewMatch[5];
  }

  const rosterFull = compactText.match(
    /Roster\s+Report\s+(?:Date\s+)?(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})\s+(.+?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9-]+)(?:\s*\|\s*|\s+)([A-Z]{3})(?:\s*\|\s*|\s+)([A-Z]{2,5})/i,
  );
  if (rosterFull) {
    month = monthNameToNumber(rosterFull[2]);
    year = Number(rosterFull[3]);
    crewName = cleanCrewName(rosterFull[7]);
    crewId = rosterFull[8];
    base = rosterFull[10];
    rank = rosterFull[11];
  }

  const rangeMatch = compactText.match(/(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})/);
  if (rangeMatch) {
    month = monthNameToNumber(rangeMatch[2]);
    year = Number(rangeMatch[3]);
  }

  const flightHours = compactText.match(/\bFH\s*:\s*(\d{1,3}:\d{2})/i)?.[1];
  const dutyHours = compactText.match(/\bDH\s*:\s*(\d{1,3}:\d{2})/i)?.[1];
  const totals = {
    ...(flightHours ? { flightHours: timeStringToHours(flightHours) } : {}),
    ...(dutyHours ? { dutyHours: timeStringToHours(dutyHours) } : {}),
  };

  return { crewName, crewId, base, rank, airline, month, year, totals };
}`;

const clientDebrief = String.raw`function findColumnarDebriefForLastLeg(rawText: string, lastLeg?: FlightLeg): string | null {
  if (!rawText || !lastLeg?.flightNumber || !lastLeg.origin || !lastLeg.destination) return null;
  const raw = String(rawText || '');
  const flight = escapeColumnarRegExp(String(lastLeg.flightNumber).replace(/\s+/g, ''));
  const origin = escapeColumnarRegExp(lastLeg.origin);
  const destination = escapeColumnarRegExp(lastLeg.destination);
  const pattern = new RegExp(
    '\\b' + flight + '\\b\\s+(?:(?:CC|CP|FO|CM)\\s+)?(?:(?:OP|PS|DH)\\s+)?'
      + origin + '\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)\\s+'
      + destination + '\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)',
    'gi',
  );
  const candidates = Array.from(raw.matchAll(pattern));
  const exact = candidates.find(match => cleanTime(match[1]) === cleanTime(lastLeg.departureTime) && cleanTime(match[2]) === cleanTime(lastLeg.arrivalTime));
  const chosen = exact || candidates.at(-1) || null;
  if (!chosen || chosen.index === undefined) return null;
  const matchEnd = chosen.index + chosen[0].length;
  const nextFlightOffset = raw.slice(matchEnd).search(/\bLA\s?\d{3,4}\b\s+(?:(?:CC|CP|FO|CM)\s+)?(?:OP|PS|DH)\b/i);
  const tailEnd = nextFlightOffset >= 0 ? matchEnd + nextFlightOffset : raw.length;
  const tail = raw.slice(matchEnd, tailEnd);
  const rawArrival = chosen[2];
  const arrivalOffset = dayOffsetFromTime(rawArrival);
  const arrivalAbsolute = arrivalOffset * 1440 + timeToMinutes(cleanTime(rawArrival));

  for (const match of tail.matchAll(/\b(\d{1,2}:\d{2}(?:\(\+\d+\))?)\b/g)) {
    const rawCandidate = match[1];
    let candidateOffset = dayOffsetFromTime(rawCandidate);
    const candidate = cleanTime(rawCandidate);
    if (candidateOffset < arrivalOffset) candidateOffset = arrivalOffset;
    if (candidateOffset === arrivalOffset && timeToMinutes(candidate) < timeToMinutes(cleanTime(rawArrival))) candidateOffset += 1;
    const gap = candidateOffset * 1440 + timeToMinutes(candidate) - arrivalAbsolute;
    if (gap >= 0 && gap <= 120) return candidate;
  }
  return null;
}`;

const serverVisualRows = String.raw`function buildServerRows(items, axis = 'y', rotatedDirection = 'descending') {
 const tolerance = axis === 'x' ? 7 : 4;
 const groups = [];
 for (const item of items || []) {
  const key = axis === 'x' ? item.x : item.y;
  let group = groups.find((candidate) => Math.abs(candidate.key - key) <= tolerance);
  if (!group) { group = { key, items: [] }; groups.push(group); }
  group.items.push(item);
  group.key = group.items.reduce((sum, current) => sum + (axis === 'x' ? current.x : current.y), 0) / group.items.length;
 }
 return groups.map((group) => {
  const sortedItems = [...group.items].sort(axis === 'x'
   ? (rotatedDirection === 'ascending' ? ((a, b) => a.y - b.y || a.x - b.x) : ((a, b) => b.y - a.y || a.x - b.x))
   : ((a, b) => a.x - b.x));
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
function preferredServerRotatedDirection(items) {
 const ascending = buildServerRows(items, 'x', 'ascending');
 const descending = buildServerRows(items, 'x', 'descending');
 return scoreServerRows(ascending) > scoreServerRows(descending) ? 'ascending' : 'descending';
}
function buildServerVisualRows(pages) {
 return (pages || []).flatMap(({ pageNo, items }) => {
  const normal = buildServerRows(items, 'y');
  const rotated = buildServerRows(items, 'x', preferredServerRotatedDirection(items));
  const chosen = scoreServerRows(rotated) > scoreServerRows(normal) ? rotated : normal;
  return chosen.map((row) => ({ ...row, page: pageNo }));
 });
}`;

const serverHeader = String.raw`function parseServerHeader(fullText, filename='') {
 const compact = fullText.replace(/\s+/g, ' ');
 let crewName = 'Tripulante', crewId = '', base = 'BSB', rank = 'CCM', month = new Date().getMonth()+1, year = new Date().getFullYear();
 const aims = compact.match(/Tripulante:\s*([^-]+?)\s*-\s*BP:\s*(\d+)\s*-\s*Base:\s*([A-Z]{3})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\s*at[ée]\s*(\d{2})\/(\d{2})\/(\d{4})/i);
 if (aims) {
  crewName = aims[1].trim();
  crewId = aims[2];
  base = aims[3];
  month = Number(aims[5]);
  year = Number(aims[6]);
 }
 const roster = compact.match(/Roster\s+Report\s+(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})\s+(.+?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9-]+)(?:\s*\|\s*|\s+)([A-Z]{3})(?:\s*\|\s*|\s+)([A-Z]{2,5})/i);
 if (roster) {
  month = monthNameToNum(roster[2]);
  year = Number(roster[3]);
  crewName = roster[7].trim();
  crewId = roster[8];
  base = roster[10];
  rank = roster[11];
 }
 const range = compact.match(/(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})/);
 if (range) {
  month = monthNameToNum(range[2]) || month;
  year = Number(range[3]) || year;
 }
 return { crewName, crewId, base, rank, month, year, airline: /\bLA\s?\d{3,4}\b/i.test(fullText) ? 'LATAM' : 'Companhia aérea' };
}`;

const serverContinuation = String.raw`function escapeServerRosterRegExp(value) {
 return String(value || '').replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}
function serverRosterRawLegTimings(raw, legs) {
 const usedIndexes = new Set();
 const assignments = (legs || []).map((leg, index) => {
  const safeFlight = escapeServerRosterRegExp(String(leg.flightNumber || '').replace(/[^A-Z0-9]/gi, ''));
  const safeOrigin = escapeServerRosterRegExp(String(leg.origin || '').toUpperCase());
  const safeDestination = escapeServerRosterRegExp(String(leg.destination || '').toUpperCase());
  const pattern = new RegExp('\\b' + safeFlight + '\\b\\s+(?:(?:OP|PS|DH)\\s+)?' + safeOrigin + '\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)\\s+' + safeDestination + '\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)', 'gi');
  const candidates = Array.from(String(raw || '').matchAll(pattern))
   .map((match) => ({ match, sourceIndex: match.index ?? -1 }))
   .filter((candidate) => candidate.sourceIndex >= 0 && !usedIndexes.has(candidate.sourceIndex));
  const expectedDeparture = normalizeTimeToken(leg.departureTime);
  const expectedArrival = normalizeTimeToken(leg.arrivalTime);
  const chosen = candidates.find((candidate) => normalizeTimeToken(candidate.match[1]) === expectedDeparture && normalizeTimeToken(candidate.match[2]) === expectedArrival)
   || candidates.find((candidate) => normalizeTimeToken(candidate.match[1]) === expectedDeparture)
   || candidates[0]
   || null;
  const sourceIndex = chosen?.sourceIndex ?? -1;
  if (sourceIndex >= 0) usedIndexes.add(sourceIndex);
  const rawDeparture = chosen?.match[1] || leg.departureTime;
  const rawArrival = chosen?.match[2] || leg.arrivalTime;
  const departureOffset = serverDayOffsetFromToken(rawDeparture);
  let arrivalOffset = serverDayOffsetFromToken(rawArrival);
  const departureTime = normalizeTimeToken(rawDeparture);
  const arrivalTime = normalizeTimeToken(rawArrival);
  if (arrivalOffset < departureOffset) arrivalOffset = departureOffset;
  if (arrivalOffset === departureOffset && toMin(arrivalTime) < toMin(departureTime)) arrivalOffset += 1;
  return {
   leg,
   index,
   sourceIndex,
   matchEnd: sourceIndex >= 0 ? sourceIndex + (chosen?.match[0]?.length || 0) : -1,
   rawDeparture,
   rawArrival,
   departureOffset,
   arrivalOffset,
   departureAbsolute: departureOffset * 1440 + toMin(departureTime),
   arrivalAbsolute: arrivalOffset * 1440 + toMin(arrivalTime),
   report: null,
  };
 }).sort((a, b) => {
  const ai = a.sourceIndex >= 0 ? a.sourceIndex : Number.MAX_SAFE_INTEGER - a.index;
  const bi = b.sourceIndex >= 0 ? b.sourceIndex : Number.MAX_SAFE_INTEGER - b.index;
  return ai - bi;
 });

 let previousMatchEnd = 0;
 for (const timing of assignments) {
  if (timing.sourceIndex < 0) continue;
  const between = String(raw || '').slice(previousMatchEnd, timing.sourceIndex);
  const rawReport = between.match(/(?:^|\s)(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s*$/)?.[1] || null;
  const reportOffset = serverDayOffsetFromToken(rawReport);
  const reportAbsolute = reportOffset * 1440 + toMin(rawReport || '00:00');
  const reportGap = timing.departureAbsolute - reportAbsolute;
  timing.report = rawReport && reportOffset === timing.departureOffset && reportGap >= 0 && reportGap <= 180
   ? normalizeTimeToken(rawReport)
   : null;
  previousMatchEnd = Math.max(previousMatchEnd, timing.matchEnd);
 }
 return assignments;
}
function serverRosterDebriefForTiming(raw, timing, nextTiming) {
 const end = nextTiming?.sourceIndex >= 0 ? nextTiming.sourceIndex : String(raw || '').length;
 const tail = String(raw || '').slice(Math.max(0, timing.matchEnd), end);
 for (const match of tail.matchAll(/\b(\d{1,2}:\d{2}(?:\(\+\d+\))?)\b/g)) {
  const rawTime = match[1];
  let offset = serverDayOffsetFromToken(rawTime);
  const time = normalizeTimeToken(rawTime);
  if (offset < timing.arrivalOffset) offset = timing.arrivalOffset;
  if (offset === timing.arrivalOffset && toMin(time) < toMin(normalizeTimeToken(timing.rawArrival))) offset += 1;
  const absolute = offset * 1440 + toMin(time);
  const gap = absolute - timing.arrivalAbsolute;
  if (gap >= 0 && gap <= 120) return { time, offset, absolute };
 }
 const arrivalMinutes = toMin(normalizeTimeToken(timing.rawArrival)) + 30;
 const offset = timing.arrivalOffset + Math.floor(arrivalMinutes / 1440);
 const minuteOfDay = arrivalMinutes % 1440;
 return {
  time: String(Math.floor(minuteOfDay / 60)).padStart(2, '0') + ':' + String(minuteOfDay % 60).padStart(2, '0'),
  offset,
  absolute: offset * 1440 + minuteOfDay,
 };
}
function normalizeServerCrewRosterContinuationDays(days, referenceMonth, referenceYear, base) {
 const output = [];
 for (const day of days || []) {
  if (!day?.legs?.length || !/\(\+\d+\)/.test(day.rawText || '')) {
   output.push(day);
   continue;
  }
  const raw = day.rawText || '';
  const timings = serverRosterRawLegTimings(raw, day.legs);
  const segments = [];
  for (const timing of timings) {
   const current = segments.at(-1);
   if (!current) {
    segments.push({ startOffset: timing.departureOffset, report: timing.report || (timing.departureOffset === 0 ? day.dutyReport : null), timings: [timing] });
    continue;
   }
   const previous = current.timings.at(-1);
   const groundGap = timing.departureAbsolute - previous.arrivalAbsolute;
   if (timing.report || groundGap >= 12 * 60) segments.push({ startOffset: timing.departureOffset, report: timing.report, timings: [timing] });
   else current.timings.push(timing);
  }

  for (const segment of segments) {
   const marker = addDaysToServerDate({ day: day.dayNumber, month: day.month, year: day.year }, segment.startOffset);
   const monthDistance = Math.abs((marker.year * 12 + marker.month) - (referenceYear * 12 + referenceMonth));
   if (monthDistance > 1) continue;
   const target = makeDay(marker.day, marker.month, marker.year, base || day.base);
   target.type = 'VOO';
   const pairingFlight = String(raw || '').match(/\b(LA\s?\d{3,4})[/-]\d{6}(?:\/|\b)/i)?.[1]?.replace(/\s+/g, '').toUpperCase();
   target.pairingCode = pairingFlight || day.pairingCode || segment.timings[0]?.leg.flightNumber || '';
   target.rawText = raw;
   target.hotel = day.hotel || null;
   target.legs = segment.timings.map((timing) => {
    const departureTime = normalizeTimeToken(timing.rawDeparture);
    const arrivalTime = normalizeTimeToken(timing.rawArrival);
    const isNextDay = timing.arrivalOffset > timing.departureOffset || toMin(arrivalTime) < toMin(departureTime);
    return { ...timing.leg, departureTime, arrivalTime, isNextDay, duration: diffHours(departureTime, arrivalTime) };
   });
   const reportTime = segment.report || (segment.startOffset === 0 ? day.dutyReport : null) || target.legs[0]?.departureTime || null;
   const lastTiming = segment.timings.at(-1);
   const nextTiming = timings[timings.indexOf(lastTiming) + 1] || null;
   const debrief = serverRosterDebriefForTiming(raw, lastTiming, nextTiming);
   target.dutyReport = reportTime;
   target.dutyDebrief = debrief.time;
   const reportAbsolute = segment.startOffset * 1440 + toMin(reportTime || target.legs[0]?.departureTime || '00:00');
   target.dutyHours = Math.round(Math.max(0, debrief.absolute - reportAbsolute) / 60 * 100) / 100;
   target.flyingHours = Math.round(target.legs.reduce((sum, leg) => sum + Number(leg.duration || 0), 0) * 100) / 100;
   target.isNextDay = debrief.offset > segment.startOffset || target.legs.some((leg) => leg.isNextDay);
   output.push(target);
  }
 }
 return output.sort((a, b) => new Date(a.year, a.month - 1, a.dayNumber).getTime() - new Date(b.year, b.month - 1, b.dayNumber).getTime()
  || toMin(a.dutyReport || '23:59') - toMin(b.dutyReport || '23:59'));
}
function rescueServerOffsetGroundActivities(days, fullText, referenceMonth, referenceYear, base) {
 const output = [...(days || [])];
 const existing = new Set(output.map((day) => [day.date, day.pairingCode, day.dutyReport || '', day.dutyDebrief || ''].join('|')));
 for (const block of buildServerRosterRescueBlocks(fullText, referenceYear)) {
  const anchor = block.marker;
  const activityPattern = /(?:(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s+)?\b(MCK(?:320|_SS)?)\b\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/gi;
  let match;
  while ((match = activityPattern.exec(block.text)) !== null) {
   const [, rawReport, rawCode, , rawStart, , rawEnd] = match;
   const startOffset = serverDayOffsetFromToken(rawStart);
   const reportOffset = serverDayOffsetFromToken(rawReport);
   const reportGap = startOffset * 1440 + toMin(normalizeTimeToken(rawStart))
    - (reportOffset * 1440 + toMin(normalizeTimeToken(rawReport || '00:00')));
   const plausibleReport = rawReport && reportOffset === startOffset && reportGap >= 0 && reportGap <= 180 ? rawReport : null;
   const endOffset = Math.max(startOffset, serverDayOffsetFromToken(rawEnd));
   const marker = addDaysToServerDate(anchor, startOffset);
   if (Math.abs((marker.year * 12 + marker.month) - (referenceYear * 12 + referenceMonth)) > 1) continue;
   const day = makeDay(marker.day, marker.month, marker.year, base);
   day.type = 'CRM';
   day.pairingCode = rawCode.toUpperCase();
   day.rawText = match[0];
   day.dutyReport = normalizeTimeToken(plausibleReport || rawStart);
   day.dutyDebrief = normalizeTimeToken(rawEnd);
   day.isNextDay = endOffset > startOffset || toMin(day.dutyDebrief) < toMin(day.dutyReport);
   day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
   day.flyingHours = 0;
   const key = [day.date, day.pairingCode, day.dutyReport, day.dutyDebrief].join('|');
   if (!existing.has(key)) { existing.add(key); output.push(day); }
  }
 }
 return output;
}`;

update('client/src/lib/pdfParser.ts', (source) => {
  let next = replaceBlock(source, 'async function extractVisualRows(', 'function scoreRows(', clientVisualRows, 'orientação adaptativa das linhas visuais');
  next = replaceBlock(next, 'function parseHeader(', 'function parseDaysFromRows(', clientHeader, 'cabeçalho e totais do CrewRosterReport');
  next = replaceBlock(next, 'function findColumnarDebriefForLastLeg(', 'function applyColumnarActivityWindow(', clientDebrief, 'término oficial após a última etapa');
  next = replaceRequired(
    next,
    `  for (const [page, pageItems] of byPage.entries()) {\n    const columns: { x: number; items: VisualItem[] }[] = [];`,
    `  for (const [page, pageItems] of byPage.entries()) {\n    const rotatedDirection = preferredRotatedTextDirection(pageItems);\n    const columns: { x: number; items: VisualItem[] }[] = [];`,
    'direção visual da leitura transposta no cliente',
  );
  next = replaceRequired(
    next,
    `    for (const item of relevant.sort((a, b) => a.x - b.x || b.y - a.y)) {`,
    `    for (const item of relevant.sort((a, b) => a.x - b.x || (rotatedDirection === 'ascending' ? a.y - b.y : b.y - a.y))) {`,
    'ordem das células transpostas no cliente',
  );
  next = replaceRequired(
    next,
    `      const sorted = column.items.sort((a, b) => b.y - a.y || a.x - b.x);`,
    `      const sorted = column.items.sort((a, b) => rotatedDirection === 'ascending' ? a.y - b.y || a.x - b.x : b.y - a.y || a.x - b.x);`,
    'ordem visual de cada linha transposta no cliente',
  );
  next = replaceRequired(
    next,
    `      const text = cleanColumnarRosterText(sorted.map(item => item.str).join(' '));\n      if (!text || /Roster Report|BRUNO|DH\\s*:|FH\\s*:|01-Jul-2026 to/i.test(text)) continue;`,
    `      const text = cleanColumnarRosterText(sorted.map(item => item.str).join(' '));\n      if (!text || /Roster Report|BRUNO|DH\\s*:|FH\\s*:|01-Jul-2026 to/i.test(text)) continue;\n      if (/^(LEGEND|MCK\\s+Emergency mockup|HSB\\s+Home Stand by|DO\\s+Day off|DR\\s+Requested day off|<==\\s+Pairing\\/Flight extends)/i.test(text)) continue;`,
    'legenda não pode virar atividade no cliente',
  );
  next = replaceRequired(
    next,
    `  const reportRaw = flightIndex >= 0 ? items.slice(flightIndex + 1).find(item => /^\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?$/.test(item.str))?.str : null;`,
    `  const reportRaw = flightIndex >= 0 ? items.slice(0, flightIndex).reverse().find(item => /^\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?$/.test(item.str))?.str || null : null;`,
    'apresentação antes do número do voo no cliente',
  );
  next = replaceRequired(
    next,
    `  const startRaw = afterCode || stationTimes[stationTimes.length - 1] || allTimes[allTimes.length - 1] || null;`,
    `  const startRaw = afterCode || stationTimes[0] || allTimes[0] || null;`,
    'janela HSB/ASB em ordem visual no cliente',
  );
  next = replaceRequired(
    next,
    `    timing.report = rawReport && dayOffsetFromTime(rawReport) === timing.departureOffset ? cleanTime(rawReport) : null;`,
    `    const reportOffset = dayOffsetFromTime(rawReport);\n    const reportAbsolute = reportOffset * 1440 + timeToMinutes(cleanTime(rawReport || '00:00'));\n    const reportGap = timing.departureAbsolute - reportAbsolute;\n    timing.report = rawReport && reportOffset === timing.departureOffset && reportGap >= 0 && reportGap <= 180 ? cleanTime(rawReport) : null;`,
    'filtro de apresentação plausível no cliente',
  );
  next = replaceRequired(
    next,
    `      const [, rawReport, rawCode, origin, rawStart, destination, rawEnd] = match;\n      const startOffset = Math.max(dayOffsetFromTime(rawReport), dayOffsetFromTime(rawStart));\n      const endOffset = Math.max(startOffset, dayOffsetFromTime(rawEnd));`,
    `      const [, rawReport, rawCode, origin, rawStart, destination, rawEnd] = match;\n      const startOffset = dayOffsetFromTime(rawStart);\n      const reportOffset = dayOffsetFromTime(rawReport);\n      const reportGap = startOffset * 1440 + timeToMinutes(cleanTime(rawStart)) - (reportOffset * 1440 + timeToMinutes(cleanTime(rawReport || '00:00')));\n      const plausibleReport = rawReport && reportOffset === startOffset && reportGap >= 0 && reportGap <= 180 ? rawReport : null;\n      const endOffset = Math.max(startOffset, dayOffsetFromTime(rawEnd));`,
    'apresentação plausível das atividades MCK no cliente',
  );
  next = replaceRequired(
    next,
    `      day.dutyReport = cleanTime(rawReport || rawStart);`,
    `      day.dutyReport = cleanTime(plausibleReport || rawStart);`,
    'horário inicial real das atividades MCK no cliente',
  );
  next = replaceRequired(
    next,
    `      target.pairingCode = day.pairingCode || segment.timings[0]?.leg.flightNumber || '';`,
    `      const pairingFlight = raw.match(/\\b(LA\\s?\\d{3,4})[/-]\\d{6}(?:\\/|\\b)/i)?.[1]?.replace(/\\s+/g, '').toUpperCase();\n      target.pairingCode = pairingFlight || day.pairingCode || segment.timings[0]?.leg.flightNumber || '';`,
    'código original do pairing no cliente',
  );
  return next;
});

update('server/rosterParser.mjs', (source) => {
  let next = replaceBlock(source, 'function buildServerRows(', 'function buildServerFullText(', serverVisualRows, 'orientação adaptativa das linhas no servidor');
  next = replaceBlock(next, 'function parseServerHeader(', 'function monthNameToNum(', serverHeader, 'cabeçalho oficial no servidor');
  const hasAuthoritativeOffsetRebuild = next.includes('function rebuildServerCrewRosterOffsetDays(');
  next = replaceRequired(
    next,
    ` for (const page of pages || []) {\n  const relevant = (page.items || [])`,
    ` for (const page of pages || []) {\n  const rotatedDirection = preferredServerRotatedDirection(page.items || []);\n  const relevant = (page.items || [])`,
    'direção visual da leitura transposta no servidor',
  );
  next = replaceRequired(
    next,
    `  for (const item of relevant.sort((a, b) => a.x - b.x || b.y - a.y)) {`,
    `  for (const item of relevant.sort((a, b) => a.x - b.x || (rotatedDirection === 'ascending' ? a.y - b.y : b.y - a.y))) {`,
    'ordem das células transpostas no servidor',
  );
  next = replaceRequired(
    next,
    `   const items = column.items.sort((a, b) => b.y - a.y || a.x - b.x);`,
    `   const items = column.items.sort((a, b) => rotatedDirection === 'ascending' ? a.y - b.y || a.x - b.x : b.y - a.y || a.x - b.x);`,
    'ordem visual de cada linha transposta no servidor',
  );
  next = replaceRequired(
    next,
    `   const text = cleanRosterLineV3(items.map((item) => item.str).join(' '));\n   if (!text || /Roster Report|BRUNO|DH\\s*:|FH\\s*:|01-Jul-2026 to/i.test(text)) continue;`,
    `   const text = cleanRosterLineV3(items.map((item) => item.str).join(' '));\n   if (!text || /Roster Report|BRUNO|DH\\s*:|FH\\s*:|01-Jul-2026 to/i.test(text)) continue;\n   if (/^(LEGEND|MCK\\s+Emergency mockup|HSB\\s+Home Stand by|DO\\s+Day off|DR\\s+Requested day off|<==\\s+Pairing\\/Flight extends)/i.test(text)) continue;`,
    'legenda não pode virar atividade no servidor',
  );
  next = replaceRequired(
    next,
    ` const reportRaw = flightIndex >= 0 ? items.slice(flightIndex + 1).find((item) => /^\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?$/.test(item.str))?.str : null;`,
    ` const reportRaw = flightIndex >= 0 ? items.slice(0, flightIndex).reverse().find((item) => /^\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?$/.test(item.str))?.str || null : null;`,
    'apresentação antes do número do voo no servidor',
  );
  next = replaceRequired(
    next,
    `  .replace(/\\b(SCHEDULER|msgsys|\\d{6,})\\b/gi, ' ')`,
    `  .replace(/\\b(SCHEDULER|msgsys)\\b/gi, ' ')`,
    'data compacta do pairing preservada no servidor',
  );
  next = replaceRequired(
    next,
    `function isRosterContinuationV3(line) {\n return /\\b(LA\\s?\\d{3,4}|DOPR|DOP|DOF?|DR|OFF|VC|HSBE?|ASB|CBF|EMER|MT|CRM|C\\d{2,3}F|NSJ?|IJ|DM|[A-Z]{3}\\s+\\d{1,2}:\\d{2}|\\d{1,2}:\\d{2}\\(\\+1\\))\\b/i.test(line);\n}`,
    `function isRosterContinuationV3(line) {\n if (/^(LEGEND|MCK\\s+Emergency mockup|HSB\\s+Home Stand by|DO\\s+Day off|DR\\s+Requested day off|<==\\s+Pairing\\/Flight extends)/i.test(String(line || ''))) return false;\n return /\\b(LA\\s?\\d{3,4}|DOPR|DOP|DOF?|DR|OFF|VC|HSBE?|ASB|CBF|EMER|MT|CRM|C\\d{2,3}F|NSJ?|IJ|DM|[A-Z]{3}\\s+\\d{1,2}:\\d{2}|\\d{1,2}:\\d{2}\\(\\+\\d+\\))\\b/i.test(line);\n}`,
    'continuação do bloco sem legenda e com offsets amplos',
  );
  next = replaceRequired(
    next,
    `function isTimeToken(t) { return /^\\d{1,2}:\\d{2}(?:\\(\\+1\\))?$/.test(String(t)); }`,
    `function isTimeToken(t) { return /^\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?$/.test(String(t)); }`,
    'tokens de tempo até (+N) no servidor',
  );
  next = replaceRequired(
    next,
    `function normalizeTimeToken(t) { return String(t).replace(/^([0-9]):/,'0$1:'); }`,
    `function normalizeTimeToken(t) { return String(t || '').replace(/\\(\\s*[+＋]\\s*\\d+\\s*\\)/g, '').replace(/^([0-9]):/,'0$1:'); }`,
    'normalização de offsets de tempo no servidor',
  );
  next = replaceRequired(
    next,
    `function toMin(t) { const [h,m]=normalizeTimeToken(t).replace('(＋1)','').replace('( +1 )','').replace('( +1)','').replace('(+1)','').split(':').map(Number); return h*60+m; }`,
    `function toMin(t) { const [h,m]=normalizeTimeToken(t).split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h*60+m : 0; }`,
    'minutos válidos para qualquer offset no servidor',
  );
  if (!hasAuthoritativeOffsetRebuild) {
    if (next.includes('function escapeServerRosterRegExp(')) {
      const start = next.indexOf('function escapeServerRosterRegExp(');
      const end = next.lastIndexOf('function scoreServerRosterDays(');
      if (end <= start) throw new Error('[v14345] Limites da continuidade multijornada do servidor inválidos.');
      next = `${next.slice(0, start)}${serverContinuation.trimEnd()}\n\n${next.slice(end)}`;
    } else {
      const anchor = 'function scoreServerRosterDays(';
      if (!next.includes(anchor)) throw new Error('[v14345] Âncora de continuidade do servidor ausente.');
      next = next.replace(anchor, () => `${serverContinuation}\n\n${anchor}`);
    }
    next = replaceRequired(
      next,
      `   const [, rawReport, rawCode, , rawStart, , rawEnd] = match;\n   const startOffset = Math.max(serverDayOffsetFromToken(rawReport), serverDayOffsetFromToken(rawStart));\n   const endOffset = Math.max(startOffset, serverDayOffsetFromToken(rawEnd));`,
      `   const [, rawReport, rawCode, , rawStart, , rawEnd] = match;\n   const startOffset = serverDayOffsetFromToken(rawStart);\n   const reportOffset = serverDayOffsetFromToken(rawReport);\n   const reportGap = startOffset * 1440 + toMin(normalizeTimeToken(rawStart))\n    - (reportOffset * 1440 + toMin(normalizeTimeToken(rawReport || '00:00')));\n   const plausibleReport = rawReport && reportOffset === startOffset && reportGap >= 0 && reportGap <= 180 ? rawReport : null;\n   const endOffset = Math.max(startOffset, serverDayOffsetFromToken(rawEnd));`,
      'apresentação plausível das atividades MCK no servidor',
    );
    next = replaceRequired(
      next,
      `   day.dutyReport = normalizeTimeToken(rawReport || rawStart);`,
      `   day.dutyReport = normalizeTimeToken(plausibleReport || rawStart);`,
      'horário inicial real das atividades MCK no servidor',
    );
    next = replaceRequired(
      next,
      `   target.pairingCode = day.pairingCode || segment.timings[0]?.leg.flightNumber || '';`,
      `   const pairingFlight = String(raw || '').match(/\\b(LA\\s?\\d{3,4})[/-]\\d{6}(?:\\/|\\b)/i)?.[1]?.replace(/\\s+/g, '').toUpperCase();\n   target.pairingCode = pairingFlight || day.pairingCode || segment.timings[0]?.leg.flightNumber || '';`,
      'código original do pairing no servidor',
    );
    next = replaceRequired(
      next,
      ` const roster = isAims ? parseServerAims(fullText, pages) : parseServerRosterReport(fullText, pages, filename);\n roster.rawText = fullText;\n roster.days = rescueServerFlightsFromVisualPages(roster.days, pages, roster.month, roster.year, roster.base);\n roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);`,
      ` const roster = isAims ? parseServerAims(fullText, pages) : parseServerRosterReport(fullText, pages, filename);\n roster.rawText = fullText;\n const parsedFlightCount = countServerRosterFlightLegs(roster.days);\n if (!isAims && parsedFlightCount === 0) roster.days = rescueServerFlightsFromVisualPages(roster.days, pages, roster.month, roster.year, roster.base);\n if (!isAims) roster.days = normalizeServerCrewRosterContinuationDays(roster.days, roster.month, roster.year, roster.base);\n if (!isAims) roster.days = rescueServerOffsetGroundActivities(roster.days, fullText, roster.month, roster.year, roster.base);\n roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);`,
      'pipeline final de continuidade no servidor',
    );
    next = replaceRequired(
      next,
      `function extractTotals(fullText) { const m=fullText.match(/FH\\s*:\\s*(\\d{1,3}:\\d{2})\\s*\\|\\s*DH\\s*:\\s*(\\d{1,3}:\\d{2})/i); return m ? { flightHours: timeToHours(m[1]), dutyHours: timeToHours(m[2]) } : {}; }`,
      `function extractTotals(fullText) { const fh=fullText.match(/\\bFH\\s*:\\s*(\\d{1,3}:\\d{2})/i)?.[1]; const dh=fullText.match(/\\bDH\\s*:\\s*(\\d{1,3}:\\d{2})/i)?.[1]; return { ...(fh ? { flightHours: timeToHours(fh) } : {}), ...(dh ? { dutyHours: timeToHours(dh) } : {}) }; }`,
      'totais DH/FH independentes no servidor',
    );
  }
  return next;
});

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: CrewRosterReport rotacionado, offsets multijornada e MCK por data civil';`), { optional: true });
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
  build: VERSION_DIGITS,
  channel: 'web',
  updatePolicy: 'automatic',
  notes: 'CrewRosterReport rotacionado: cabeçalho, voos, PS, MCK, HSB e jornadas (+1/+2/+3) publicados na data civil correta.',
}, null, 2)}\n`, { optional: true });

console.log(`[v14345] CrewCheck ${VERSION}: escala oficial de agosto corrigida com orientação adaptativa, baseline tolerante e continuidade física até (+3).`);
