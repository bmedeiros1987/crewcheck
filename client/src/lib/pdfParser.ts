import { isAimsFormat, parseAimsRoster } from './aimsParser';
import { getRosterCodeDefinition, isKnownRosterCode } from './rosterCodes';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { normalizeRosterDays } from './canonicalRoster';

let pdfjsModulePromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((module: any) => {
      const pdfjs = module.default || module;
      // Required on mobile Chrome/Safari: without an explicit workerSrc PDF.js
      // can throw "No GlobalWorkerOptions.workerSrc specified". We still keep
      // a no-worker retry below for devices that block Worker creation.
      if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return pdfjs;
    }).catch((error) => {
      pdfjsModulePromise = null;
      throw error;
    });
  }
  return pdfjsModulePromise;
}

export interface CrewMember {
  role: 'CP' | 'FO' | 'CCM' | 'CC' | string;
  name: string;
  order: number;
  isCurrentCrew?: boolean;
}

export interface FlightLeg {
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  workType: string; // OP, PS, DH, etc.
  duration?: number;
  aircraftType?: string;
  isNextDay?: boolean;
  crew?: CrewMember[];
  ccmLead?: CrewMember | null;
  ccmBonusStatus?: 'confirmed' | 'not_applicable' | 'pending';
}

export interface RosterDay {
  date: string; // DD/MM/YYYY
  dayOfWeek: string;
  dayNumber?: number;
  month?: number;
  year?: number;
  type: 'VOO' | 'DO' | 'DOF' | 'DR' | 'HSB' | 'HSBE' | 'ASB' | 'OFF' | 'CRM' | 'LAYOVER' | 'RES' | 'OTHER';
  pairingCode: string;
  dutyReport: string | null; // HH:MM
  dutyDebrief: string | null; // HH:MM
  legs: FlightLeg[];
  dutyHours: number | null;
  flyingHours: number | null;
  isNextDay: boolean;
  hotel: string | null;
  base: string;
  rawText?: string;
}

export interface CrewRoster {
  crewName: string;
  crewId: string;
  base: string;
  rank: string;
  airline?: string;
  month: number;
  year: number;
  days: RosterDay[];
  rawText: string;
  totals?: {
    flightHours?: number;
    dutyHours?: number;
  };
}

type VisualItem = {
  str: string;
  x: number;
  y: number;
  page: number;
  width?: number;
};

type VisualRow = {
  page: number;
  key: number;
  text: string;
  items: VisualItem[];
};

const DATE_TOKEN_RE = /\b(\d{2})-([A-Za-z]{3})-(\d{4})\b/;
const DATE_TOKEN_GLOBAL_RE = /\b(\d{2})-([A-Za-z]{3})-(\d{4})\b/g;

export async function parsePDF(file: File): Promise<CrewRoster> {
  const arrayBuffer = await readPdfFileAsArrayBuffer(file);
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(arrayBuffer);
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  } catch (workerError) {
    // Last-resort mobile fallback: if the browser/PWA refuses to start the
    // worker, retry in fake-worker mode instead of crashing the whole app.
    pdf = await pdfjsLib.getDocument({
      data,
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  }
  const rows = await extractVisualRows(pdf);
  const fullText = rows.map(row => row.text).join('\n');

  if (isAimsFormat(fullText)) {
    return parseAimsRoster(fullText, rows);
  }

  const isCrewRosterReport = /Roster\s+Report/i.test(fullText) || /CrewRosterReport/i.test(file.name);
  if (isCrewRosterReport) {
    const parsed = parseCrewRosterReportRows(rows, fullText);
    if (parsed.days.length > 0) return parsed;
  }

  if (isTicketRosterFormat(fullText, file.name)) {
    const parsed = parseTicketRoster(fullText, rows);
    if (parsed.days.length > 0) return parsed;
  }

  const fallback = parseRosterText(fullText);
  if (fallback.days.length === 0) {
    throw new Error('Nao foi possivel interpretar este PDF. Envie um CrewRosterReport ou AIMS com texto selecionavel.');
  }
  return fallback;
}


async function readPdfFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  // iOS/Safari/PWA sometimes provides files from iCloud/Files with limited
  // Blob.arrayBuffer support or delayed access. FileReader is more reliable
  // on those devices, so we keep it as the primary fallback.
  if (file.arrayBuffer) {
    try {
      const buffer = await file.arrayBuffer();
      if (buffer && buffer.byteLength > 0) return buffer;
    } catch {
      // fall back below
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer && reader.result.byteLength > 0) {
        resolve(reader.result);
      } else {
        reject(new Error('PDF vazio ou não acessível pelo navegador.'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler PDF no dispositivo.'));
    reader.readAsArrayBuffer(file);
  });
}

async function extractVisualRows(pdf: any): Promise<VisualRow[]> {
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
    const rotatedRows = buildRows(items, 'x');
    const chosen = scoreRows(rotatedRows) > scoreRows(normalRows) ? rotatedRows : normalRows;
    allRows.push(...chosen.map(row => ({ ...row, page: pageNo })));
  }

  return allRows;
}

function buildRows(items: VisualItem[], axis: 'x' | 'y'): VisualRow[] {
  const tolerance = 4;
  const groups: { key: number; items: VisualItem[] }[] = [];

  for (const item of items) {
    const key = axis === 'x' ? item.x : item.y;
    let group = groups.find(g => Math.abs(g.key - key) <= tolerance);
    if (!group) {
      group = { key, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  const rows = groups
    .map(group => {
      const sortedItems = [...group.items].sort((a, b) => {
        if (axis === 'x') return b.y - a.y; // rotated PDFs: visual left-to-right is descending Y
        return a.x - b.x;
      });
      return {
        page: sortedItems[0]?.page || 1,
        key: group.key,
        items: sortedItems,
        text: normalizeSpaces(sortedItems.map(i => i.str).join(' ')),
      };
    })
    .filter(row => row.text.length > 0);

  return rows.sort((a, b) => {
    if (axis === 'x') return a.key - b.key;
    return b.key - a.key;
  });
}

function scoreRows(rows: VisualRow[]): number {
  const text = rows.map(r => r.text).join('\n');
  let score = 0;
  if (/Roster\s+Report/i.test(text)) score += 8;
  if (/\d{2}-[A-Za-z]{3}-\d{4}\s+to\s+\d{2}-[A-Za-z]{3}-\d{4}/.test(text)) score += 10;
  if (/[A-ZÀ-Ú\s]{6,}\s*\|\s*\d{6,}\s*\|/.test(text)) score += 8;
  score += rows.filter(r => DATE_TOKEN_RE.test(r.text) && /\b(LA\d{3,4}|DO|DR|HSBE?|ASB|CBF|EMER|MT|C\d{2,3}F|NSJ?|IJ|DM|[A-Z]{1,4}J)\b/.test(r.text)).length * 3;
  score += rows.filter(r => /\bLA\d{3,4}\b.*\b(OP|PS|DH)\b.*\b[A-Z]{3}\s+\d{1,2}:\d{2}/.test(r.text)).length * 2;
  return score;
}

function parseCrewRosterReportRows(rows: VisualRow[], fullText: string): CrewRoster {
  const header = parseHeader(fullText);
  const transposedDays = parseCrewRosterTransposedColumns(rows, header.month, header.year, header.base);
  const visualDays = parseDaysFromRows(rows, header.month, header.year, header.base);
  const columnarDays = parseCrewRosterColumnarRows(rows, header.month, header.year, header.base);
  const looseDays = parseCrewRosterReportLooseText(fullText, header.month, header.year, header.base);

  const transposedScore = scoreParsedDays(transposedDays, header.month, header.year);
  const visualScore = scoreParsedDays(visualDays, header.month, header.year);
  const columnarScore = scoreParsedDays(columnarDays, header.month, header.year);
  const looseScore = scoreParsedDays(looseDays, header.month, header.year);

  // v13.3.3: CrewRosterReport oficial deve ser sequencial/text-first quando o texto
  // já encontra uma escala suficiente. A leitura visual/transposta continua como
  // fallback, mas não deve contaminar a escala com linhas técnicas como msgsys,
  // Updated Date ou datas fora do período publicado.
  const sequentialDays = dedupeColumnarRosterDays(looseDays);
  const sequentialEventCount = countRosterEvents(sequentialDays);
  const transposedEventCount = countRosterEvents(transposedDays);
  const useStrongTransposed = /Roster\s+Report/i.test(fullText)
    && transposedDays.length >= 25
    && transposedEventCount >= 30;
  const useSequentialOnly = /Roster\s+Report/i.test(fullText)
    && sequentialDays.length >= 8
    && sequentialEventCount >= 8
    && (transposedDays.length < 20 || sequentialEventCount >= countRosterEvents(transposedDays) * 0.85);

  const primaryVisual = transposedScore >= Math.max(columnarScore, visualScore, looseScore)
    ? transposedDays
    : (columnarScore > visualScore ? columnarDays : visualDays);

  const mergedDays = useStrongTransposed
    ? transposedDays
    : useSequentialOnly
    ? sequentialDays
    : mergeParsedDaySources(primaryVisual, [...looseDays, ...(primaryVisual === transposedDays ? [...visualDays, ...columnarDays] : (columnarScore > visualScore ? visualDays : columnarDays))], header.month, header.year);

  const rescuedDays = useStrongTransposed
    ? mergedDays
    : rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);
  const crewRecords = parseGenericTripulationRecords(fullText, header.crewName, header.year, header.month);
  const days = applyGenericTripulationRecordsToDays(normalizeCrewRosterReportContinuationDays(rescuedDays, header.month, header.year, header.base), crewRecords, header.crewName);

  return normalizeRosterDays({
    crewName: header.crewName,
    crewId: header.crewId,
    base: header.base,
    rank: header.rank,
    airline: header.airline,
    month: header.month,
    year: header.year,
    days,
    rawText: fullText,
    totals: header.totals,
  });
}



function countRosterEvents(days: RosterDay[]): number {
  return (days || []).reduce((sum, day) => sum + Math.max(1, (day.legs || []).length), 0);
}

function parseCrewRosterTransposedColumns(rows: VisualRow[], defaultMonth: number, defaultYear: number, base: string): RosterDay[] {
  const items = rows.flatMap(row => row.items || []);
  const byPage = new Map<number, VisualItem[]>();
  for (const item of items) {
    const list = byPage.get(item.page) || [];
    list.push(item);
    byPage.set(item.page, list);
  }
  const groups: { page: number; x: number; items: VisualItem[]; text: string }[] = [];
  for (const [page, pageItems] of byPage.entries()) {
    const columns: { x: number; items: VisualItem[] }[] = [];
    const relevant = pageItems
      .map(item => ({ ...item, str: cleanColumnarRosterText(item.str) }))
      .filter(item => item.str && item.x > 45 && item.y > 35 && !/^(LEGEND|<==)$/i.test(item.str));
    for (const item of relevant.sort((a, b) => a.x - b.x || b.y - a.y)) {
      let column = columns.find(col => Math.abs(col.x - item.x) <= 18);
      if (!column) {
        column = { x: item.x, items: [] };
        columns.push(column);
      }
      column.items.push(item);
      column.x = column.items.reduce((sum, it) => sum + it.x, 0) / column.items.length;
    }
    for (const column of columns.sort((a, b) => a.x - b.x)) {
      const sorted = column.items.sort((a, b) => b.y - a.y || a.x - b.x);
      const text = cleanColumnarRosterText(sorted.map(item => item.str).join(' '));
      if (!text || /Roster Report|BRUNO|DH\s*:|FH\s*:|01-Jul-2026 to/i.test(text)) continue;
      if (!/\b(LA\s?\d{3,4}|OP|PS|DH|HSBE?|ASB|RCFI|DOPR|DOP|DOF?|DR|OFF|VC|[A-Z]{3}\s+\d{1,2}:\d{2})\b/i.test(text)) continue;
      groups.push({ page, x: column.x, items: sorted, text });
    }
  }

  const days: RosterDay[] = [];
  let currentDate: { day: number; month: number; year: number } | null = null;
  let openFlightDuty: RosterDay | null = null;
  for (const group of groups.sort((a, b) => a.page - b.page || a.x - b.x)) {
    const dateToken = group.text.match(DATE_TOKEN_RE)?.[0] || null;
    if (dateToken) currentDate = parseDateToken(dateToken, defaultMonth, defaultYear);
    if (!currentDate) continue;
    const parsed = parseTransposedColumnGroup(group, currentDate, base);
    if (!parsed || !isPublishedRosterContextMonth(parsed.month || defaultMonth, parsed.year || defaultYear, defaultMonth, defaultYear)) continue;
    if (parsed.type === 'VOO' && parsed.legs?.length && !dateToken && openFlightDuty) {
      mergeTransposedFlightDuty(openFlightDuty, parsed);
      continue;
    }
    days.push(parsed);
    openFlightDuty = parsed.type === 'VOO' && parsed.legs?.length ? parsed : null;
  }
  return dedupeColumnarRosterDays(days);
}

function mergeTransposedFlightDuty(target: RosterDay, continuation: RosterDay): void {
  for (const leg of continuation.legs || []) {
    if (!target.legs.some(old => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.departureTime === leg.departureTime)) {
      target.legs.push(leg);
    }
  }
  target.rawText = normalizeSpaces(`${target.rawText || ''} ${continuation.rawText || ''}`);
  target.dutyReport = target.dutyReport || continuation.dutyReport || target.legs[0]?.departureTime || null;
  if (continuation.dutyDebrief) target.dutyDebrief = continuation.dutyDebrief;
  target.isNextDay = Boolean(target.isNextDay || continuation.isNextDay || target.legs.some(leg => leg.isNextDay));
  finalizeRosterDay(target);
}

function addDaysToParsedDate(marker: { day: number; month: number; year: number }, daysToAdd: number): { day: number; month: number; year: number } {
  const date = new Date(marker.year, marker.month - 1, marker.day, 12, 0, 0, 0);
  date.setDate(date.getDate() + daysToAdd);
  return { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() };
}

function parseTransposedColumnGroup(group: { items: VisualItem[]; text: string }, currentDate: { day: number; month: number; year: number }, base: string): RosterDay | null {
  const items = group.items || [];
  const text = group.text || '';
  const flight = items.find(item => /^LA\s?\d{3,4}$/i.test(item.str))?.str.replace(/\s+/g, '').toUpperCase();
  if (flight) return parseTransposedFlightGroup(items, text, currentDate, base, flight);
  const activity = text.match(/\b(HSBE|HSB|ASB|RCFI|CRMBSB|CRMB|CRM|C\d{2,3}F|MT|CBF|EMER)\b/i)?.[1]?.toUpperCase();
  if (activity) return parseTransposedActivityGroup(text, currentDate, base, activity);
  const rest = text.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/i)?.[1]?.toUpperCase();
  if (rest) {
    const day = createRosterDay(currentDate.day, currentDate.month, currentDate.year, base);
    day.rawText = text;
    day.type = rest === 'OFF' || rest === 'VC' || rest.startsWith('DOP') ? 'DO' : rest as RosterDay['type'];
    day.pairingCode = rest;
    day.dutyHours = 0;
    day.flyingHours = 0;
    return day;
  }
  return null;
}

function parseTransposedFlightGroup(items: VisualItem[], text: string, currentDate: { day: number; month: number; year: number }, base: string, flightNumber: string): RosterDay | null {
  const stationRows = transposedStationTimeRows(items);
  if (stationRows.length < 2) return null;
  const [departureRow, arrivalRow] = stationRows;
  const origin = departureRow.airport;
  const rawDeparture = departureRow.time;
  const destination = arrivalRow.airport;
  const rawArrival = arrivalRow.time;
  const offset = Math.max(dayOffsetFromTime(rawDeparture), dayOffsetFromTime(rawArrival));
  const day = createRosterDay(currentDate.day, currentDate.month, currentDate.year, base);
  const departureTime = cleanTime(rawDeparture);
  const arrivalTime = cleanTime(rawArrival);
  const workType = items.find(item => /^(OP|PS|DH)$/i.test(item.str))?.str.toUpperCase() || 'OP';
  const aircraftType = items.find(item => /^(32S|31R|39R|328|319|320|321|32N)$/i.test(item.str))?.str.toUpperCase();
  const flightIndex = items.findIndex(item => /^LA\s?\d{3,4}$/i.test(item.str));
  const reportRaw = flightIndex >= 0 ? items.slice(flightIndex + 1).find(item => /^\d{1,2}:\d{2}(?:\(\+\d+\))?$/.test(item.str))?.str : null;
  const destinationY = arrivalRow.y;
  const debriefRaw = Number.isFinite(destinationY)
    ? items.find(item => item.y > Number(destinationY) && item.y < Number(destinationY) + 145 && /^\d{1,2}:\d{2}(?:\(\+\d+\))?$/.test(item.str))?.str || null
    : null;
  const isNextDay = dayOffsetFromTime(rawArrival) > dayOffsetFromTime(rawDeparture) || timeToMinutes(arrivalTime) < timeToMinutes(departureTime);
  day.rawText = text;
  day.type = 'VOO';
  day.pairingCode = flightNumber;
  day.dutyReport = reportRaw ? cleanTime(reportRaw) : departureTime;
  day.dutyDebrief = debriefRaw ? cleanTime(debriefRaw) : arrivalTime;
  day.isNextDay = isNextDay || offset > 0;
  day.legs = [{ flightNumber, origin, destination, departureTime, arrivalTime, workType, aircraftType, isNextDay, duration: diffHours(departureTime, arrivalTime, isNextDay) }];
  finalizeRosterDay(day);
  return day;
}

function transposedStationTimeRows(items: VisualItem[]): Array<{ airport: string; time: string; y: number }> {
  const rows: Array<{ y: number; items: VisualItem[] }> = [];
  for (const item of items) {
    let row = rows.find(candidate => Math.abs(candidate.y - item.y) <= 2);
    if (!row) { row = { y: item.y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  return rows
    .map(row => ({ y: row.y, text: normalizeSpaces(row.items.sort((a, b) => a.x - b.x).map(item => item.str).join(' ')) }))
    .map(row => ({ ...row, match: row.text.match(/^([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)$/i) }))
    .filter((row): row is typeof row & { match: RegExpMatchArray } => Boolean(row.match))
    .map(row => ({ airport: row.match[1].toUpperCase(), time: row.match[2], y: row.y }))
    .filter(row => !/^(OP|PS|HSB|ASB|DOF|OFF)$/.test(row.airport))
    .sort((a, b) => a.y - b.y)
    .slice(0, 2);
}

function parseTransposedActivityGroup(text: string, currentDate: { day: number; month: number; year: number }, base: string, rawCode: string): RosterDay {
  const code = rawCode === 'CRMBSB' || rawCode === 'CRMB' || /^C\d{2,3}F$/.test(rawCode) ? 'CRM' : rawCode;
  const day = createRosterDay(currentDate.day, currentDate.month, currentDate.year, base);
  day.rawText = text;
  day.pairingCode = code;
  day.type = code === 'ASB' || code === 'HSB' || code === 'HSBE' ? code as RosterDay['type'] : (code === 'CRM' || code === 'RCFI' || code === 'MT' || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');
  const stationTimes = Array.from(text.matchAll(/\b[A-Z]{3}\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/g))
    .map(match => cleanTime(match[1]))
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  const unique = stationTimes.length >= 2
    ? stationTimes
    : Array.from(new Set((text.match(/\b\d{1,2}:\d{2}(?:\(\+\d+\))?\b/g) || []).map(cleanTime).filter(time => time !== '00:00' && !looksLikeColumnDuration(time)))).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  day.dutyReport = unique[0] || null;
  day.dutyDebrief = unique.length > 1 ? unique[unique.length - 1] : null;
  day.flyingHours = 0;
  day.dutyHours = day.dutyReport && day.dutyDebrief ? diffHours(day.dutyReport, day.dutyDebrief) : null;
  return day;
}

function looksLikeColumnDuration(time: string): boolean {
  return ['00:59','01:00','01:25','01:35','01:40','01:45','01:50','01:55','02:00','02:05','02:10','02:15','02:20','02:25','02:30','02:35','02:40','02:45','02:50','02:55','03:00','03:10','03:15','03:25','03:35','04:00','04:35','04:42','06:00','06:25','07:30','07:35','07:40','07:55','08:10','08:20','10:30','10:45','10:55','11:15','11:25','11:30'].includes(cleanTime(time));
}


function rescueFlightsFromFullText(days: RosterDay[], fullText: string, referenceMonth: number, referenceYear: number, base: string): RosterDay[] {
  const byDate = new Map<string, RosterDay[]>();
  for (const day of days) {
    const list = byDate.get(day.date) || [];
    list.push(day);
    byDate.set(day.date, list);
  }

  for (const block of buildCrewRosterReportDateBlocks(fullText)) {
    const parsedDate = parseDateToken(block.dateToken, referenceMonth, referenceYear);
    if (!isPublishedRosterContextMonth(parsedDate.month, parsedDate.year, referenceMonth, referenceYear)) continue;
    const dateKey = formatRosterDate(parsedDate.day, parsedDate.month, parsedDate.year);
    const legs = extractFlightLegsFromReportBlock(block.text);
    if (!legs.length) continue;

    let list = byDate.get(dateKey) || [];
    let flightDay = list.find(day => day.legs?.length) || null;
    if (!flightDay) {
      flightDay = createRosterDay(parsedDate.day, parsedDate.month, parsedDate.year, base);
      list.push(flightDay);
    }

    for (const leg of legs) {
      if (!flightDay.legs.some(existing => existing.flightNumber === leg.flightNumber && existing.departureTime === leg.departureTime && existing.origin === leg.origin)) {
        flightDay.legs.push(leg);
      }
    }

    flightDay.legs = flightDay.legs.sort((a, b) => timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime));
    flightDay.type = 'VOO';
    flightDay.rawText = normalizeSpaces(`${flightDay.rawText || ''} ${block.text}`);
    flightDay.dutyReport = extractDutyReportFromReportBlock(block.text, flightDay.legs[0]?.flightNumber || '') || flightDay.dutyReport;
    const debrief = extractDutyDebriefFromReportBlock(block.text, flightDay.legs[flightDay.legs.length - 1]);
    if (debrief) flightDay.dutyDebrief = debrief;
    if (!flightDay.pairingCode) {
      const pairing = block.text.match(/\b(LA\d{3,4}[-/][A-Z0-9/ -]+?\d{6}[A-Z0-9/ -]*-P)\b/i)?.[1];
      flightDay.pairingCode = pairing ? normalizeSpaces(pairing) : flightDay.legs[0]?.flightNumber || '';
    }
    if (flightDay.legs.some(leg => leg.isNextDay)) flightDay.isNextDay = true;
    finalizeRosterDay(flightDay);
    byDate.set(dateKey, list);
  }

  return Array.from(byDate.values()).flat().sort((a, b) => {
    const [ad, am, ay] = a.date.split('/').map(Number);
    const [bd, bm, by] = b.date.split('/').map(Number);
    const av = new Date(ay || referenceYear, (am || referenceMonth) - 1, ad || 1).getTime();
    const bv = new Date(by || referenceYear, (bm || referenceMonth) - 1, bd || 1).getTime();
    if (av !== bv) return av - bv;
    return (a.dutyReport ? timeToMinutes(a.dutyReport) : 9999) - (b.dutyReport ? timeToMinutes(b.dutyReport) : 9999);
  });
}

function dateTokenFromCompactPairingDate(value: string, fallbackYear: number): string | null {
  const compact = String(value || '').replace(/\D/g, '');
  if (compact.length !== 6) return null;
  const day = Number(compact.slice(0, 2));
  const month = Number(compact.slice(2, 4));
  const year = 2000 + Number(compact.slice(4, 6));
  if (!day || !month || month < 1 || month > 12) return null;
  return `${String(day).padStart(2, '0')}-${monthNumberToEnglishAbbr(month)}-${year || fallbackYear}`;
}

function dateTokenFromReportLine(line: string, fallbackYear: number): string | null {
  const explicit = line.match(DATE_TOKEN_RE)?.[0];
  if (explicit) return explicit;
  const pairing = line.match(/\b(?:LA\d{3,4}|HSBE?|ASB|RCFI|DR|DOF?|C\d{2,3}F)[-/](\d{6})(?:\/|\b)/i);
  if (pairing) return dateTokenFromCompactPairingDate(pairing[1], fallbackYear);
  return null;
}

function buildCrewRosterReportDateBlocks(fullText: string): { dateToken: string; text: string }[] {
  const fallbackYear = Number(fullText.match(/\d{2}-[A-Za-z]{3}-(\d{4})/)?.[1]) || new Date().getFullYear();
  const lines = fullText
    .split(/\r?\n/)
    .map(line => stripUpdatedDate(normalizeSpaces(line)))
    .filter(line => line && !isHeaderOrFooterRow(line));

  const blocks: { dateToken: string; parts: string[] }[] = [];
  let current: { dateToken: string; parts: string[] } | null = null;

  for (const line of lines) {
    const detectedDateToken = dateTokenFromReportLine(line, fallbackYear);
    if (detectedDateToken && (line.indexOf(detectedDateToken) <= 18 || /^<==/.test(line) || /\b(?:LA\d{3,4}|HSBE?|ASB|RCFI)[-/]\d{6}\//i.test(line))) {
      if (current) blocks.push(current);
      current = { dateToken: detectedDateToken, parts: [line.replace(DATE_TOKEN_RE, '').trim()] };
      continue;
    }
    if (current && /\b(LA\d{3,4}|OP|PS|DH|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+\d+\))\b/.test(line)) {
      current.parts.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks.map(block => ({ dateToken: block.dateToken, text: normalizeSpaces(block.parts.join(' ')) }));
}

function extractFlightLegsFromReportBlock(text: string): FlightLeg[] {
  const legs: FlightLeg[] = [];
  const re = /\b(LA\d{3,4})\b\s+(?:(?:CC|CP|FO|CM)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const [, flightNumber, explicitWorkType, origin, departureTime, destination, rawArrivalTime] = match;
    const isNextDay = isExplicitNextDayTime(rawArrivalTime) || timeToMinutes(cleanTime(rawArrivalTime)) < timeToMinutes(cleanTime(departureTime));
    const arrivalTime = cleanTime(rawArrivalTime);
    legs.push({
      flightNumber,
      origin,
      destination,
      departureTime: cleanTime(departureTime),
      arrivalTime,
      workType: explicitWorkType || inferWorkTypeFromContext(text, match.index) || 'OP',
      aircraftType: inferAircraftType(text),
      duration: diffHours(cleanTime(departureTime), arrivalTime, isNextDay),
      isNextDay,
    });
  }
  return legs.filter((leg, index, all) => all.findIndex(other => other.flightNumber === leg.flightNumber && other.origin === leg.origin && other.departureTime === leg.departureTime) === index);
}

function addDaysToRosterDate(date: string, daysToAdd: number): { day: number; month: number; year: number } {
  const [d, m, y] = date.split('/').map(Number);
  const value = new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1);
  value.setDate(value.getDate() + daysToAdd);
  return { day: value.getDate(), month: value.getMonth() + 1, year: value.getFullYear() };
}

function normalizeCrewRosterReportContinuationDays(days: RosterDay[], referenceMonth: number, referenceYear: number, base: string): RosterDay[] {
  const output: RosterDay[] = [];
  for (const day of days) {
    if (!day.legs?.length || !/\(\+\d+\)/.test(day.rawText || '')) {
      output.push(day);
      continue;
    }
    const isSingleConnectedDuty = day.legs.length > 1
      && day.legs.every((leg, index) => index === 0 || day.legs[index - 1].destination === leg.origin)
      && Boolean(day.dutyReport);
    if (isSingleConnectedDuty) {
      day.legs = day.legs.map((leg) => ({ ...leg, departureTime: cleanTime(leg.departureTime), arrivalTime: cleanTime(leg.arrivalTime) }));
      day.isNextDay = true;
      finalizeRosterDay(day);
      output.push(day);
      continue;
    }
    const raw = day.rawText || '';
    const legsByOffset = new Map<number, FlightLeg[]>();
    for (const leg of day.legs) {
      const safeFlight = escapeColumnarRegExp(leg.flightNumber.replace(/[^A-Z0-9]/gi, ''));
      const safeOrigin = escapeColumnarRegExp(String(leg.origin || '').toUpperCase());
      const pattern = new RegExp(`${safeFlight}[\\s\\S]{0,80}?${safeOrigin}\\s+(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)`, 'i');
      const rawDepart = raw.match(pattern)?.[1] || leg.departureTime;
      const offset = dayOffsetFromTime(rawDepart);
      const cleanedLeg = { ...leg, departureTime: cleanTime(leg.departureTime), arrivalTime: cleanTime(leg.arrivalTime), isNextDay: leg.isNextDay || offset > 0 };
      const list = legsByOffset.get(offset) || [];
      list.push(cleanedLeg);
      legsByOffset.set(offset, list);
    }

    if (legsByOffset.size <= 1) {
      day.legs = day.legs.map((leg) => ({ ...leg, departureTime: cleanTime(leg.departureTime), arrivalTime: cleanTime(leg.arrivalTime) }));
      finalizeRosterDay(day);
      output.push(day);
      continue;
    }

    for (const [offset, legs] of Array.from(legsByOffset.entries()).sort((a, b) => a[0] - b[0])) {
      const target = offset === 0 ? day : createRosterDay(addDaysToRosterDate(day.date, offset).day, addDaysToRosterDate(day.date, offset).month, addDaysToRosterDate(day.date, offset).year, base || day.base);
      target.type = 'VOO';
      target.pairingCode = day.pairingCode || legs[0]?.flightNumber || '';
      target.rawText = raw;
      target.legs = legs.sort((a, b) => timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime));
      target.dutyReport = offset === 0 ? day.dutyReport : (target.legs[0]?.departureTime || null);
      target.dutyDebrief = offset === 0 ? day.dutyDebrief : null;
      target.isNextDay = offset > 0 || target.legs.some((leg) => leg.isNextDay);
      finalizeRosterDay(target);
      if (isPublishedRosterContextMonth(target.month, target.year, referenceMonth, referenceYear)) output.push(target);
    }
  }
  return output.sort((a, b) => {
    const [ad, am, ay] = a.date.split('/').map(Number);
    const [bd, bm, by] = b.date.split('/').map(Number);
    const av = new Date(ay || referenceYear, (am || referenceMonth) - 1, ad || 1).getTime();
    const bv = new Date(by || referenceYear, (bm || referenceMonth) - 1, bd || 1).getTime();
    if (av !== bv) return av - bv;
    return (a.dutyReport ? timeToMinutes(a.dutyReport) : 9999) - (b.dutyReport ? timeToMinutes(b.dutyReport) : 9999);
  });
}


type GenericTripulationRecord = {
  date?: string;
  flightNumber: string;
  crew: CrewMember[];
  leadCcm: CrewMember | null;
};

function normalizeTripulationFlightKey(value: string): string {
  const compact = String(value || '').toUpperCase().replace(/\s+/g, '');
  const digits = compact.match(/\d{3,4}/)?.[0];
  return digits ? `LA${digits}` : compact;
}

function normalizeCrewNameForTripulation(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\b(SR|SRA|MR|MRS|MS|TRIPULANTE|CREW|MEMBER)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSameCrewMemberInTripulation(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeCrewNameForTripulation(a);
  const right = normalizeCrewNameForTripulation(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const aParts = left.split(' ').filter((part) => part.length > 1);
  const bParts = right.split(' ').filter((part) => part.length > 1);
  if (aParts.length < 2 || bParts.length < 2) return false;
  if (aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1]) return true;
  const shortParts = aParts.length <= bParts.length ? aParts : bParts;
  const longParts = aParts.length <= bParts.length ? bParts : aParts;
  return shortParts.length >= 2 && shortParts.every((part) => longParts.includes(part));
}

function cleanTripulationCrewName(value: string): string {
  return normalizeSpaces(String(value || '')
    .replace(/Confira na escala publicada pela empresa[\s\S]*$/i, ' ')
    .replace(/Timezone[\s\S]*$/i, ' ')
    .replace(/\b(?:Tripula(?:ç|c)[aã]o|Tripula(?:ç|c)[oõ]es|Crew\s+List|Crew\s+Complement|Crew\s+Members)\b/gi, ' ')
    .replace(/\b(?:LA\s*\d{3,4}|OP|PS|DH|SB|BSB|GRU|CGH|GIG|SDU|CNF|VCP)\b[\s\S]*$/i, ' ')
    .replace(/\b\d{5,10}\b/g, ' ')
    .replace(/[|;]/g, ' ')
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, ' ')
    .trim());
}

function normalizeTripulationRoleForDisplay(role: string): string {
  const value = String(role || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (value === 'CM') return 'CCM';
  return value || 'CCM';
}

function parseCrewMembersFromTripulationText(text: string, rosterName: string): CrewMember[] {
  const source = String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\b(CP|FO|CCM|CC|CM)\b\s*[:–—-]?/gi, '\n$1 ');
  const crew: CrewMember[] = [];
  const seen = new Set<string>();
  const re = /(?:^|\n|[,;|])\s*(CP|FO|CCM|CC|CM)\s+([\s\S]*?)(?=\n\s*(?:CP|FO|CCM|CC|CM)\b|\s*[,;|]\s*(?:CP|FO|CCM|CC|CM)\b|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const role = normalizeTripulationRoleForDisplay(match[1]);
    const name = cleanTripulationCrewName(match[2]);
    const normalized = normalizeCrewNameForTripulation(name);
    const minPartsOk = normalized.split(' ').length >= 2 || ['CP','FO'].includes(role);
    if (!normalized || normalized.length < 2 || !minPartsOk) continue;
    const key = `${role}|${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    crew.push({
      role,
      name,
      order: crew.length,
      isCurrentCrew: isSameCrewMemberInTripulation(name, rosterName),
    });
  }
  return crew;
}

function parseGenericTripulationRecords(fullText: string, rosterName: string, fallbackYear: number, fallbackMonth: number): GenericTripulationRecord[] {
  const raw = String(fullText || '');
  const sectionMatch = raw.match(/(?:Tripula(?:ç|c)[oõ]es|Tripulacao|Tripula(?:ç|c)[aã]o|Crew\s+List|Crew\s+Complement|Crew\s+Members)([\s\S]*)/i);
  const sectionSource = sectionMatch ? sectionMatch[1] : raw;
  const records: GenericTripulationRecord[] = [];
  const section = sectionSource
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\s+(?:Voo|Flight)?\s*LA\s*(\d{3,4})\s+(?=CP|FO|CCM|CC|CM\b)/gi, '\n$1 LA$2 ')
    .replace(/\b(?:Voo|Flight)?\s*LA\s*(\d{3,4})\s+(?=CP|FO|CCM|CC|CM\b)/gi, '\nLA$1 ')
    .replace(/\s+(?=(?:\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\s+)?LA\s*\d{3,4}\s+(?:CP|FO|CCM|CC|CM)\b)/gi, '\n')
    .replace(/\n{2,}/g, '\n');

  const lineRegex = /(?:^|\n)\s*(?:(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\s+)?LA\s*(\d{3,4})\s+((?:CP|FO|CCM|CC|CM)\b[\s\S]*?)(?=\n\s*(?:\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\s+)?LA\s*\d{3,4}\s+(?:CP|FO|CCM|CC|CM)\b|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(section)) !== null) {
    const day = match[1] ? String(Number(match[1])).padStart(2, '0') : undefined;
    const month = match[2] ? String(Number(match[2])).padStart(2, '0') : String(fallbackMonth).padStart(2, '0');
    let year = match[3] ? Number(match[3]) : fallbackYear;
    if (year < 100) year += 2000;
    const date = day ? `${day}/${month}/${year}` : undefined;
    const flightNumber = `LA${match[4]}`;
    const crew = parseCrewMembersFromTripulationText(match[5], rosterName);
    if (!crew.length) continue;
    const leadCcm = crew.find((member) => String(member.role || '').toUpperCase() === 'CCM') || null;
    records.push({ date, flightNumber, crew, leadCcm });
  }

  return records.filter((record, index, all) => all.findIndex((other) => other.date === record.date && normalizeTripulationFlightKey(other.flightNumber) === normalizeTripulationFlightKey(record.flightNumber)) === index);
}

function applyGenericTripulationRecordsToDays(days: RosterDay[], records: GenericTripulationRecord[], rosterName: string): RosterDay[] {
  if (!records.length) return days;
  const byExact = new Map<string, GenericTripulationRecord>();
  const byDate = new Map<string, GenericTripulationRecord[]>();
  const byFlight = new Map<string, GenericTripulationRecord>();
  for (const record of records) {
    const flightKey = normalizeTripulationFlightKey(record.flightNumber);
    if (record.date) {
      byExact.set(`${record.date}|${flightKey}`, record);
      const list = byDate.get(record.date) || [];
      list.push(record);
      byDate.set(record.date, list);
    }
    if (!byFlight.has(flightKey)) byFlight.set(flightKey, record);
  }

  return days.map((day) => ({
    ...day,
    legs: (day.legs || []).map((leg, legIndex) => {
      const flightKey = normalizeTripulationFlightKey(leg.flightNumber || '');
      const exact = byExact.get(`${day.date}|${flightKey}`);
      const sameDateFallback = !exact && legIndex === 0 ? byDate.get(day.date)?.find((record) => normalizeTripulationFlightKey(record.flightNumber) === flightKey) : undefined;
      const flightFallback = !exact && !sameDateFallback ? byFlight.get(flightKey) : undefined;
      const record = exact || sameDateFallback || flightFallback;
      if (!record) return leg;
      const crew = record.crew.map((member, index) => ({
        ...member,
        order: index,
        isCurrentCrew: member.isCurrentCrew || isSameCrewMemberInTripulation(member.name, rosterName),
      }));
      const leadCcm = crew.find((member) => String(member.role || '').toUpperCase() === 'CCM') || null;
      const current = crew.find((member) => member.isCurrentCrew) || null;
      const ccmBonusStatus: FlightLeg['ccmBonusStatus'] = leadCcm
        ? (current && String(current.role || '').toUpperCase() === 'CCM'
          ? (leadCcm.order === current.order ? 'confirmed' : 'not_applicable')
          : (isSameCrewMemberInTripulation(leadCcm.name, rosterName) ? 'confirmed' : 'pending'))
        : 'pending';
      return { ...leg, crew, ccmLead: leadCcm, ccmBonusStatus };
    }),
  }));
}

function extractDutyReportFromReportBlock(text: string, firstFlightNumber: string): string | null {
  if (!firstFlightNumber) return null;
  const fromBeforeFlight = extractDutyReportBeforeFirstFlight(text, firstFlightNumber);
  if (fromBeforeFlight) return cleanTime(fromBeforeFlight);
  const pairingReport = text.match(/\bLA\d{3,4}[/-][^\s]+\s+(\d{1,2}:\d{2})\s+LA\d{3,4}\b/);
  return pairingReport ? cleanTime(pairingReport[1]) : null;
}

function extractDutyDebriefFromReportBlock(text: string, lastLeg?: FlightLeg): string | null {
  if (!lastLeg) return null;
  const idx = text.lastIndexOf(lastLeg.flightNumber);
  const tail = idx >= 0 ? text.slice(idx) : text;
  const nextDayTimes = tail.match(/\b\d{1,2}:\d{2}\(\+\d+\)\b/g) || [];
  if (lastLeg.isNextDay && nextDayTimes.length >= 2) return cleanTime(nextDayTimes[nextDayTimes.length - 1]);
  const timeMatches = tail.match(/\b\d{1,2}:\d{2}(?:\(\+\d+\))?\b/g) || [];
  const arrivalIndex = timeMatches.findIndex(time => cleanTime(time) === lastLeg.arrivalTime);
  if (arrivalIndex >= 0 && timeMatches[arrivalIndex + 1]) {
    const candidate = cleanTime(timeMatches[arrivalIndex + 1]);
    const gap = diffHours(lastLeg.arrivalTime, candidate, /\(\+\d+\)/.test(timeMatches[arrivalIndex + 1]));
    if (gap >= 0 && gap <= 3) return candidate;
  }
  return null;
}

function isPublishedRosterContextMonth(month: number | undefined, year: number | undefined, referenceMonth: number, referenceYear: number): boolean {
  if (!month || !year) return false;
  const value = year * 12 + month;
  const reference = referenceYear * 12 + referenceMonth;
  // Mantém mês de referência e transbordos publicados do mês anterior/posterior.
  return Math.abs(value - reference) <= 1;
}

function formatRosterDate(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function scoreParsedDays(days: RosterDay[], referenceMonth: number, referenceYear: number): number {
  const referenceDays = days.filter(day => isPublishedRosterContextMonth(day.month, day.year, referenceMonth, referenceYear));
  const dates = new Set(referenceDays.map(day => day.date));
  const flights = referenceDays.reduce((sum, day) => sum + (day.legs?.length || 0), 0);
  const activities = referenceDays.filter(day => day.pairingCode || day.type !== 'OTHER').length;
  return dates.size * 6 + flights * 5 + activities * 2;
}


function mergeParsedDaySources(visualDays: RosterDay[], looseDays: RosterDay[], referenceMonth: number, referenceYear: number): RosterDay[] {
  const merged = new Map<string, RosterDay[]>();

  const add = (day: RosterDay) => {
    if (!isPublishedRosterContextMonth(day.month, day.year, referenceMonth, referenceYear)) return;
    const list = merged.get(day.date) || [];
    list.push(day);
    merged.set(day.date, list);
  };

  visualDays.forEach(add);

  for (const loose of looseDays) {
    if (!isPublishedRosterContextMonth(loose.month, loose.year, referenceMonth, referenceYear)) continue;
    const list = merged.get(loose.date) || [];

    if (loose.legs?.length) {
      const visualFlightIndex = list.findIndex(day => day.legs?.length);
      if (visualFlightIndex >= 0) {
        const current = list[visualFlightIndex];
        if (flightCoverageScore(loose) > flightCoverageScore(current)) {
          list[visualFlightIndex] = loose;
        } else {
          const missingLegs = (loose.legs || []).filter(leg => !current.legs.some(existing => existing.flightNumber === leg.flightNumber && existing.departureTime === leg.departureTime));
          if (missingLegs.length) {
            current.legs = [...current.legs, ...missingLegs];
            current.rawText = normalizeSpaces(`${current.rawText || ''} ${loose.rawText || ''}`);
            finalizeRosterDay(current);
          }
        }
      } else {
        list.push(loose);
      }
    } else {
      const exists = list.some(day => sameRosterRow(day, loose));
      if (!exists) list.push(loose);
    }

    merged.set(loose.date, list);
  }

  return Array.from(merged.values()).flat().sort((a, b) => {
    const da = Number(a.date.slice(0, 2));
    const db = Number(b.date.slice(0, 2));
    if (da !== db) return da - db;
    return (a.dutyReport ? timeToMinutes(a.dutyReport) : 9999) - (b.dutyReport ? timeToMinutes(b.dutyReport) : 9999);
  });
}

function flightCoverageScore(day: RosterDay): number {
  const legs = day.legs || [];
  const nextDayBonus = day.isNextDay || legs.some(leg => leg.isNextDay) ? 4 : 0;
  return legs.length * 10 + routeSignatureForScore(legs).length + nextDayBonus;
}

function routeSignatureForScore(legs: FlightLeg[]): string {
  if (!legs.length) return '';
  const points = [legs[0].origin];
  for (const leg of legs) if (points[points.length - 1] !== leg.destination) points.push(leg.destination);
  return points.join('-');
}

function sameRosterRow(a: RosterDay, b: RosterDay): boolean {
  return a.date === b.date
    && (a.pairingCode || a.type) === (b.pairingCode || b.type)
    && (a.dutyReport || '') === (b.dutyReport || '')
    && (a.dutyDebrief || '') === (b.dutyDebrief || '')
    && (a.legs || []).length === (b.legs || []).length;
}

function cleanCrewName(value: string): string {
  return normalizeSpaces(String(value || '')
    .replace(/\b(Tripulante|Crew|Roster|Report|Date|BP|Base)\b/gi, ' ')
    .replace(/\s+-\s*$/g, ' ')
    .trim()) || 'Tripulante';
}

function parseHeader(fullText: string): {
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
  let airline = /LATAM|\bLA\d{3,4}\b/i.test(fullText) ? 'LATAM' : 'Companhia aérea';
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

  const crewMatch = compactText.match(/([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/);
  if (crewMatch) {
    crewName = cleanCrewName(crewMatch[1]);
    crewId = crewMatch[2];
    base = crewMatch[4];
    rank = crewMatch[5];
  }

  const rosterFull = compactText.match(/Roster\s+Report\s+(?:Date\s+)?(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4}).*?([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/i);
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

  const totalsMatch = compactText.match(/FH\s*:\s*(\d{1,3}:\d{2})\s*\|\s*DH\s*:\s*(\d{1,3}:\d{2})/i);
  const totals = totalsMatch
    ? { flightHours: timeStringToHours(totalsMatch[1]), dutyHours: timeStringToHours(totalsMatch[2]) }
    : {};

  return { crewName, crewId, base, rank, airline, month, year, totals };
}

function parseDaysFromRows(rows: VisualRow[], defaultMonth: number, defaultYear: number, base: string): RosterDay[] {
  const days: RosterDay[] = [];
  let currentDay: RosterDay | null = null;

  const finishCurrentDay = () => {
    if (!currentDay) return;
    finalizeRosterDay(currentDay);
    days.push(currentDay);
    currentDay = null;
  };

  for (const row of rows) {
    const rowText = stripUpdatedDate(normalizeSpaces(row.text));
    if (!rowText || isHeaderOrFooterRow(rowText)) continue;

    const primaryDate = getPrimaryDateFromRow(row);

    if (primaryDate) {
      finishCurrentDay();
      const parsedDate = parseDateToken(primaryDate, defaultMonth, defaultYear);
      currentDay = createRosterDay(parsedDate.day, parsedDate.month, parsedDate.year, base);
      currentDay.rawText = rowText;
      parseRowIntoDay(currentDay, rowText.replace(primaryDate, '').trim());
    } else if (currentDay && isContinuationRow(rowText)) {
      currentDay.rawText = `${currentDay.rawText || ''}\n${rowText}`.trim();
      parseRowIntoDay(currentDay, rowText);
    }
  }

  finishCurrentDay();

  return days.filter(day => {
    if (!isPublishedRosterContextMonth(day.month, day.year, defaultMonth, defaultYear)) return false;
    if (day.type === 'OTHER' && day.legs.length === 0 && !day.dutyReport && !day.pairingCode) return false;
    return true;
  });
}


function parseCrewRosterColumnarRows(rows: VisualRow[], defaultMonth: number, defaultYear: number, base: string): RosterDay[] {
  const days: RosterDay[] = [];
  let currentDay: RosterDay | null = null;
  let prelude: string[] = [];

  const finishCurrentDay = () => {
    if (!currentDay) return;
    finalizeRosterDay(currentDay);
    if (!(currentDay.type === 'OTHER' && currentDay.legs.length === 0 && !currentDay.pairingCode)) {
      days.push(currentDay);
    }
    currentDay = null;
  };

  for (const row of rows) {
    const rowText = cleanColumnarRosterText(row.text);
    if (!rowText || isHeaderOrFooterRow(rowText)) continue;
    const primaryDate = getColumnarDateFromText(rowText);

    if (primaryDate) {
      finishCurrentDay();
      const parsedDate = parseDateToken(primaryDate, defaultMonth, defaultYear);
      currentDay = createRosterDay(parsedDate.day, parsedDate.month, parsedDate.year, base);
      const withoutDate = cleanColumnarRosterText(rowText.replace(primaryDate, ' '));
      const rawText = cleanColumnarRosterText([...prelude.slice(-3), withoutDate].join(' '));
      currentDay.rawText = rawText;
      parseRowIntoDay(currentDay, rawText);
      prelude = [];
    } else if (currentDay && (isColumnarContinuationText(rowText) || /\b\d{1,2}:\d{2}(?:\(\+\d+\))?\b/.test(rowText) || /\b[A-Z]{3}\b/.test(rowText))) {
      currentDay.rawText = cleanColumnarRosterText(`${currentDay.rawText || ''} ${rowText}`);
      parseRowIntoDay(currentDay, currentDay.rawText || rowText);
    } else if (isColumnarPreludeText(rowText)) {
      prelude.push(rowText);
      if (prelude.length > 4) prelude = prelude.slice(-4);
    }
  }

  finishCurrentDay();

  return dedupeColumnarRosterDays(days).filter(day => {
    if (!isPublishedRosterContextMonth(day.month, day.year, defaultMonth, defaultYear)) return false;
    if (day.type === 'OTHER' && day.legs.length === 0 && !day.dutyReport && !day.pairingCode) return false;
    return true;
  });
}

function cleanColumnarRosterText(value: string): string {
  return normalizeSpaces(String(value || '')
    .replace(/\u000c/g, ' ')
    .replace(/\uFFFE/g, ' ')
    .replace(/\b\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/g, ' ')
    .replace(/\b(?:SCHEDULER|msgsys|AIRCOM_SQS)\b/gi, ' ')
    .replace(/\bUpdated\s+(?:Date|By)\b/gi, ' '));
}

function getColumnarDateFromText(text: string): string | null {
  const clean = cleanColumnarRosterText(text);
  const dates = clean.match(DATE_TOKEN_GLOBAL_RE) || [];
  if (!dates.length) return null;
  if (/\b(LA\s?\d{3,4}|OP|PS|DH|HSBE?|ASB|CRMBSB|CRM|DOF?|DR|OFF|VC)\b/i.test(clean)) return dates[dates.length - 1];
  return null;
}

function isColumnarPreludeText(text: string): boolean {
  return /\b(?:LA\s?\d{3,4}\/\d{6}|HSBE?-|ASB-|CRM|CRMBSB|DOF?|DOP|DR|OFF|VC|C\d{2,3}F|MT|CBF|EMER)\b/i.test(text);
}

function isColumnarContinuationText(text: string): boolean {
  return /\b(?:LA\s?\d{3,4}|OP|PS|DH|HSBE?|ASB|CRM|CRMBSB|DOF?|DOP|DR|OFF|VC|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+\d+\)|320-P|JJCC)\b/i.test(text);
}

function dedupeColumnarRosterDays(days: RosterDay[]): RosterDay[] {
  const map = new Map<string, RosterDay>();
  for (const day of days) {
    const legKey = (day.legs || []).map(leg => `${leg.flightNumber}-${leg.origin}-${leg.destination}-${leg.departureTime}-${leg.arrivalTime}-${leg.workType}`).join(';');
    const key = `${day.date}|${day.pairingCode || day.type}|${day.dutyReport || ''}|${day.dutyDebrief || ''}|${legKey}`;
    if (!map.has(key)) map.set(key, day);
  }
  return Array.from(map.values()).sort((a, b) => {
    const da = Number(a.date.slice(0, 2));
    const db = Number(b.date.slice(0, 2));
    if (da !== db) return da - db;
    return (a.dutyReport ? timeToMinutes(a.dutyReport) : 9999) - (b.dutyReport ? timeToMinutes(b.dutyReport) : 9999);
  });
}

function parseColumnarFlightLegsIntoDay(day: RosterDay, rowText: string): void {
  const text = cleanColumnarRosterText(rowText);
  const reversedFlightRegex = /\b([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s+(OP|PS|DH)\s+(?:(?:CC|CP|FO|CM)\s+)?(LA\s?\d{3,4})\b(?:\s+(\d{1,2}:\d{2}))?/gi;
  let match: RegExpExecArray | null;

  while ((match = reversedFlightRegex.exec(text)) !== null) {
    const [, destination, rawArrivalTime, origin, rawDepartureTime, workType, rawFlightNumber, reportTime] = match;
    const flightNumber = rawFlightNumber.replace(/\s+/g, '').toUpperCase();
    const departureTime = cleanTime(rawDepartureTime);
    const arrivalTime = cleanTime(rawArrivalTime);
    const isNextDay = isExplicitNextDayTime(rawArrivalTime) || timeToMinutes(arrivalTime) < timeToMinutes(cleanTime(departureTime));
    const prefix = text.slice(0, match.index);
    const aircraftType = inferAircraftType(prefix);

    if (!day.legs.some(leg => leg.flightNumber === flightNumber && leg.origin === origin && leg.destination === destination && leg.departureTime === departureTime)) {
      day.legs.push({
        flightNumber,
        origin,
        destination,
        departureTime: cleanTime(departureTime),
        arrivalTime,
        workType: workType.toUpperCase(),
        aircraftType,
        duration: diffHours(cleanTime(departureTime), arrivalTime, isNextDay),
        isNextDay,
      });
    }

    if (reportTime && !day.dutyReport) day.dutyReport = cleanTime(reportTime);
    const debrief = maybeColumnarDebriefBeforeRoute(prefix);
    if (debrief) day.dutyDebrief = debrief;
    if (isNextDay || /\(\+\d+\)/.test(prefix)) day.isNextDay = true;
  }

  const splitWrappedFlightRegex = /(?:^|\s)(?:(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s+)?([A-Z]{3})\s+(?:(32S|31R|39R|328|319|320|321|32N)\s+)?(?:\d{1,2}:\d{2}\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s+(OP|PS|DH)\s+(?:(?:CC|CP|FO|CM)\s+)?(LA\s?\d{3,4})\b\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/gi;
  while ((match = splitWrappedFlightRegex.exec(text)) !== null) {
    const [, rawDebrief, destination, rawAircraftType, origin, rawDepartureTime, workType, rawFlightNumber, rawArrivalTime] = match;
    const flightNumber = rawFlightNumber.replace(/\s+/g, '').toUpperCase();
    const departureTime = cleanTime(rawDepartureTime);
    const arrivalTime = cleanTime(rawArrivalTime);
    const isNextDay = isExplicitNextDayTime(rawArrivalTime) || timeToMinutes(arrivalTime) < timeToMinutes(cleanTime(departureTime));
    const prefix = text.slice(0, match.index);
    const aircraftType = rawAircraftType || inferAircraftType(prefix);

    if (!day.legs.some(leg => leg.flightNumber === flightNumber && leg.origin === origin && leg.destination === destination && leg.departureTime === departureTime)) {
      day.legs.push({
        flightNumber,
        origin,
        destination,
        departureTime: cleanTime(departureTime),
        arrivalTime,
        workType: workType.toUpperCase(),
        aircraftType,
        duration: diffHours(cleanTime(departureTime), arrivalTime, isNextDay),
        isNextDay,
      });
    }

    if (rawDebrief) day.dutyDebrief = cleanTime(rawDebrief);
    if (isNextDay || /\(\+\d+\)/.test(prefix)) day.isNextDay = true;
  }

  if (day.legs.length > 0) {
    day.legs.sort((a, b) => timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime));
    day.type = 'VOO';
    if (!day.pairingCode) day.pairingCode = day.legs[0].flightNumber;
    if (!day.dutyReport) day.dutyReport = day.legs[0].departureTime;
    day.flyingHours = round2(day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime, leg.isNextDay)), 0));
  }
}

function maybeColumnarDebriefBeforeRoute(prefix: string): string | null {
  const times = prefix.match(/\b\d{1,2}:\d{2}(?:\(\+\d+\))?\b/g) || [];
  const last = times[times.length - 1];
  if (!last) return null;
  const clean = cleanTime(last);
  if (/^00:00$/.test(clean)) return null;
  return clean;
}

function escapeColumnarRegExp(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findColumnarDebriefForLastLeg(rawText: string, lastLeg?: FlightLeg): string | null {
  if (!rawText || !lastLeg?.destination || !lastLeg?.arrivalTime) return null;
  const raw = String(rawText || '');
  const dest = escapeColumnarRegExp(lastLeg.destination);
  const arrival = escapeColumnarRegExp(lastLeg.arrivalTime);
  const flightNumber = String(lastLeg.flightNumber || '').toUpperCase();
  if (flightNumber) {
    const idx = raw.toUpperCase().lastIndexOf(flightNumber);
    const near = idx >= 0 ? raw.slice(Math.max(0, idx - 220), idx) : '';
    const nearMatch = near.match(new RegExp(`(\\d{1,2}:\\d{2}(?:\\(\\+1\\))?)\\s+${dest}\\b`, 'i'));
    if (nearMatch) {
      const clean = cleanTime(nearMatch[1]);
      if (clean !== '00:00') return clean;
    }
  }
  const re = new RegExp(`(\\d{1,2}:\\d{2}(?:\\(\\+1\\))?)\\s+(?:(?:32S|31R|39R|328|319|320|321|32N|0:00|00:00)\\s+){0,4}${dest}\\s+${arrival}(?:\\(\\+1\\))?`, 'i');
  const match = raw.match(re);
  if (!match) return null;
  const clean = cleanTime(match[1]);
  return clean === '00:00' ? null : clean;
}

function applyColumnarActivityWindow(day: RosterDay, rowText: string): void {
  if (day.legs.length > 0) return;
  const text = cleanColumnarRosterText(rowText);
  const upper = text.toUpperCase();
  const rest = upper.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
  const activity = upper.match(/\b(HSBE|HSB|ASB|CRMBSB|CRMB|CRM|C\d{2,3}F|MT|CBF|EMER|NSJ|NS|IJ|DM|SAER)\b/);

  if (rest) {
    day.type = rest[1] === 'OFF' || rest[1] === 'VC' || rest[1].startsWith('DOP') ? 'DO' : rest[1] as RosterDay['type'];
    day.pairingCode = rest[1];
    day.dutyReport = null;
    day.dutyDebrief = null;
    day.dutyHours = 0;
    day.flyingHours = 0;
    return;
  }

  if (!activity) return;
  let code = activity[1];
  if (code === 'CRMBSB' || code === 'CRMB' || /^C\d{2,3}F$/.test(code)) code = 'CRM';
  day.type = code === 'CRM' ? 'CRM' : code as RosterDay['type'];
  day.pairingCode = code;
  day.flyingHours = 0;

  const codeRe = new RegExp(`\\b${activity[1]}\\b\\s*(\\d{1,2}:\\d{2}(?:\\(\\+\\d+\\))?)?`, 'i');
  const afterCode = text.match(codeRe)?.[1] || null;
  const stationTimes = [...text.matchAll(/\b[A-Z]{3}\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/g)].map(m => m[1]);
  const allTimes = text.match(/\b\d{1,2}:\d{2}(?:\(\+\d+\))?\b/g) || [];
  const startRaw = afterCode || stationTimes[stationTimes.length - 1] || allTimes[allTimes.length - 1] || null;
  const endRaw = stationTimes.find(time => cleanTime(time) !== cleanTime(startRaw || '')) || allTimes.find(time => cleanTime(time) !== cleanTime(startRaw || '')) || null;

  if (startRaw) day.dutyReport = cleanTime(startRaw);
  if (endRaw) {
    day.dutyDebrief = cleanTime(endRaw);
    day.isNextDay = /\(\+\d+\)/.test(endRaw) || Boolean(day.dutyReport && timeToMinutes(day.dutyDebrief) < timeToMinutes(day.dutyReport));
  }
  if (day.dutyReport && day.dutyDebrief) day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, day.isNextDay));
}

function getPrimaryDateFromRow(row: VisualRow): string | null {
  const text = row.text.trim();
  const firstDateByText = text.match(DATE_TOKEN_RE)?.[0] || null;
  if (firstDateByText && text.startsWith(firstDateByText)) return firstDateByText;

  const dateIndex = row.items.findIndex(item => DATE_TOKEN_RE.test(item.str));
  if (dateIndex >= 0 && dateIndex <= 1) {
    const match = row.items[dateIndex].str.match(DATE_TOKEN_RE);
    return match?.[0] || null;
  }

  // Mac/Safari and some PDF generators expose the landscape CrewRosterReport transposed:
  // each visual table row becomes an X-axis group and the real Date column appears at the end.
  // Accept the last date token when the same row contains operational data.
  const allDates = text.match(DATE_TOKEN_GLOBAL_RE) || [];
  if (allDates.length && /\b(LA\s?\d{3,4}|OP|PS|DH|HSBE?|ASB|CRMBSB|CRM|DOF?|DR|OFF|VC)\b/i.test(text)) {
    return allDates[allDates.length - 1];
  }

  return null;
}

function parseRowIntoDay(day: RosterDay, rowText: string): void {
  const text = stripUpdatedDate(normalizeSpaces(rowText));
  if (!text) return;

  const type = inferDayType(text);
  if (type !== 'OTHER' || day.type === 'OTHER') day.type = type;

  const pairing = extractPairingCode(text);
  if (pairing && !day.pairingCode) day.pairingCode = pairing;

  parseFlightLegsIntoDay(day, text);
  parseColumnarFlightLegsIntoDay(day, text);
  parseActivityTimesIntoDay(day, text);
  applyColumnarActivityWindow(day, text);
}

function parseFlightLegsIntoDay(day: RosterDay, text: string): void {
  const flightRegex = /\b(LA\d{3,4})\b\s+(?:(?:CC|CP|FO|CM)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/g;
  let match: RegExpExecArray | null;

  while ((match = flightRegex.exec(text)) !== null) {
    const [, flightNumber, explicitWorkType, origin, departureTime, destination, rawArrivalTime] = match;
    const isNextDay = isExplicitNextDayTime(rawArrivalTime) || timeToMinutes(cleanTime(rawArrivalTime)) < timeToMinutes(cleanTime(departureTime));
    const arrivalTime = cleanTime(rawArrivalTime);
    const workType = explicitWorkType || inferWorkTypeFromContext(text, match.index) || 'OP';
    const aircraftType = inferAircraftType(text);

    if (!day.legs.some(leg => leg.flightNumber === flightNumber && leg.origin === origin && leg.departureTime === cleanTime(departureTime))) {
      day.legs.push({
        flightNumber,
        origin,
        destination,
        departureTime: cleanTime(departureTime),
        arrivalTime,
        workType,
        aircraftType,
        duration: diffHours(cleanTime(departureTime), arrivalTime, isNextDay),
        isNextDay,
      });
    }

    day.type = 'VOO';
    if (isNextDay) day.isNextDay = true;
  }

  if (day.legs.length > 0) {
    const firstLeg = day.legs[0];
    if (!day.dutyReport) {
      const reportCandidate = extractDutyReportBeforeFirstFlight(text, firstLeg.flightNumber);
      day.dutyReport = reportCandidate || null;
    }
    day.flyingHours = round2(day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime, leg.isNextDay)), 0));
  }
}

function selectReliableGroundWindow(values: string[], dayType: RosterDay['type']): { start: string; end: string; isNextDay: boolean } | null {
  const unique = Array.from(new Set((values || []).map(cleanTime).filter(Boolean)));
  if (unique.length < 2) return null;
  const start = unique[0];
  let selected: string | null = null;
  let selectedNextDay = false;

  for (const rawCandidate of unique.slice(1)) {
    const candidate = cleanTime(rawCandidate);
    if (!candidate || candidate === start) continue;
    const rawValue = values.find((item) => cleanTime(item) === candidate) || candidate;
    const explicitNextDay = /\(\+\d+\)/.test(rawValue);
    const hours = diffHours(start, candidate, explicitNextDay);

    if (dayType === 'ASB' || dayType === 'RES') {
      if (hours >= 0.5 && hours <= 12) { selected = candidate; selectedNextDay = explicitNextDay; }
      continue;
    }

    if (dayType === 'HSB' || dayType === 'HSBE') {
      if (hours >= 0.5 && hours <= 14) { selected = candidate; selectedNextDay = explicitNextDay; }
      continue;
    }

    if (hours >= 0.25 && hours <= 14) { selected = candidate; selectedNextDay = explicitNextDay; }
  }

  if (!selected) return null;
  return { start, end: selected, isNextDay: selectedNextDay || timeToMinutes(selected) < timeToMinutes(start) };
}

function parseActivityTimesIntoDay(day: RosterDay, text: string): void {
  const times = [...text.matchAll(/\b(\d{1,2}:\d{2})(?:\(\+\d+\))?\b/g)].map(m => m[0]);
  const cleanTimes = times.map(cleanTime);

  if (day.type === 'DO' || day.type === 'DOF' || day.type === 'DR' || day.type === 'OFF') {
    day.dutyReport = null;
    day.dutyDebrief = null;
    day.dutyHours = 0;
    return;
  }

  if ((day.type === 'HSB' || day.type === 'HSBE' || day.type === 'ASB' || day.type === 'CRM' || day.type === 'OTHER') && day.legs.length === 0) {
    const stationTimes = [...text.matchAll(/\b[A-Z]{3}\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/g)].map(m => m[1]);
    const stationWindow = selectReliableGroundWindow(stationTimes, day.type);
    if (stationWindow) {
      day.dutyReport = stationWindow.start;
      day.dutyDebrief = stationWindow.end;
      day.isNextDay = stationWindow.isNextDay;
      day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, stationWindow.isNextDay));
      return;
    }

    const timeWindow = selectReliableGroundWindow(cleanTimes, day.type);
    if (timeWindow) {
      day.dutyReport = timeWindow.start;
      day.dutyDebrief = timeWindow.end;
      day.isNextDay = timeWindow.isNextDay;
      day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, timeWindow.isNextDay));
      return;
    }

    const uniqueTimes = Array.from(new Set(cleanTimes.map(cleanTime))).filter(Boolean);
    if (uniqueTimes.length >= 1) {
      day.dutyReport = uniqueTimes[0];
      // Para reserva/sobreaviso, nunca repetimos o início como fim.
      // Quando o PDF não entrega o fim com segurança, deixamos o término sem leitura
      // para evitar 17:10–17:10, falso 0h e rotina calculada em cima de janela errada.
      day.dutyDebrief = null;
      day.dutyHours = null;
      return;
    }
  }

  if (day.legs.length > 0) {
    const firstLeg = day.legs[0];
    if (!day.dutyReport) {
      day.dutyReport = extractDutyReportBeforeFirstFlight(text, firstLeg.flightNumber) || null;
    }
    const lastLeg = day.legs[day.legs.length - 1];
    day.dutyDebrief = day.dutyDebrief || findColumnarDebriefForLastLeg(day.rawText || '', lastLeg) || addMinutes(lastLeg.arrivalTime, 30);
    const dutyStartForCalc = day.dutyReport || firstLeg.departureTime;
    day.isNextDay = day.isNextDay || Boolean(lastLeg.isNextDay) || timeToMinutes(day.dutyDebrief) < timeToMinutes(dutyStartForCalc);
    day.dutyHours = round2(diffHours(dutyStartForCalc, day.dutyDebrief, day.isNextDay));
  }
}

function finalizeRosterDay(day: RosterDay): void {
  if (day.legs.length > 0) {
    day.type = 'VOO';
    const firstLeg = day.legs[0];
    const lastLeg = day.legs[day.legs.length - 1];
    day.dutyReport = day.dutyReport || null;
    day.dutyDebrief = findColumnarDebriefForLastLeg(day.rawText || '', lastLeg) || day.dutyDebrief || addMinutes(lastLeg.arrivalTime, 30);
    const dutyStartForCalc = day.dutyReport || firstLeg.departureTime;
    day.isNextDay = day.isNextDay || Boolean(lastLeg.isNextDay) || timeToMinutes(day.dutyDebrief) < timeToMinutes(dutyStartForCalc);
    day.dutyHours = round2(diffHours(dutyStartForCalc, day.dutyDebrief, day.isNextDay));
    day.flyingHours = round2(day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime, leg.isNextDay)), 0));
  } else if (day.dutyReport && day.dutyDebrief && day.dutyHours === null) {
    day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, day.isNextDay));
  }

  if (day.type === 'OTHER' && /\b(CBF|EMER|MT|C\d{2,3}F|NSJ?|IJ|DM|[A-Z]{1,4}J)\b/.test(day.rawText || '')) {
    day.flyingHours = 0;
  }
}

function createRosterDay(day: number, month: number, year: number, base: string): RosterDay {
  const dateObj = new Date(year, month - 1, day);
  return {
    date: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    dayNumber: day,
    month,
    year,
    dayOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dateObj.getDay()],
    type: 'OTHER',
    pairingCode: '',
    dutyReport: null,
    dutyDebrief: null,
    legs: [],
    dutyHours: null,
    flyingHours: null,
    isNextDay: false,
    hotel: null,
    base,
  };
}

function inferDayType(text: string): RosterDay['type'] {
  const sample = ` ${text.toUpperCase()} `;
  // Prioridade operacional: evita ASB/HSBE/MT serem confundidos com descanso/inativo
  // quando o PDF/AIMS contém (...) ou restos de linhas de pernoite na mesma coluna.
  if (/\bLA\d{3,4}\b/.test(sample)) return 'VOO';
  if (/\bHSBE\b/.test(sample)) return 'HSBE';
  if (/\bHSB\b/.test(sample)) return 'HSB';
  if (/\bASB\b/.test(sample)) return 'ASB';
  if (/\bCRM\b/.test(sample)) return 'CRM';
  if (/\bC\d{2,3}F\b/.test(sample)) return 'CRM';
  if (/\bRES\b/.test(sample)) return 'RES';
  if (/\bDOF\b/.test(sample)) return 'DOF';
  if (/\b(DOPR|DOP|VC|FOLGA)\b/.test(sample)) return 'DO';
  if (/\bDO\b/.test(sample)) return 'DO';
  if (/\bDR\b/.test(sample)) return 'DR';
  if (/\bOFF\b/.test(sample)) return 'OFF';
  return 'OTHER';
}

function extractPairingCode(text: string): string {
  const direct = text.match(/\b(?:LA\d{3,4}|HSBE?|ASB|C\d{2,3}F|MT|CBF|EMER|NSJ?|IJ|DM|[A-Z]{1,4}J)[-/A-Z0-9]*\/\d{6}\/[A-Z0-9-]+\b/i)?.[0];
  if (direct) return direct;
  const activity = text.match(/\b(HSBE?|ASB|CBF|EMER|MT|C\d{2,3}F|NSJ?|IJ|DM|DOPR|DOP|VC|FOLGA|[A-Z]{1,4}J|DOF?|DR|CRM)\b/i)?.[0];
  return activity || '';
}

function extractDutyReportBeforeFirstFlight(text: string, flightNumber: string): string | null {
  const idx = text.indexOf(flightNumber);
  if (idx <= 0) return null;
  const beforeFlight = text.slice(0, idx);
  const times = beforeFlight.match(/\b\d{1,2}:\d{2}\b/g);
  return times?.[times.length - 1] || null;
}

function inferWorkTypeFromContext(text: string, index: number): string | null {
  const fragment = text.slice(Math.max(0, index - 20), index + 60);
  const match = fragment.match(/\b(OP|PS|DH)\b/);
  return match?.[1] || null;
}

function inferAircraftType(text: string): string | undefined {
  return text.match(/\b(320|321|32S|31R|39R|328)\b/)?.[1];
}

function isContinuationRow(text: string): boolean {
  return /\b(LA\d{3,4}|HSBE?|ASB|CBF|EMER|MT|NSJ?|IJ|DM|DOPR|DOP|VC|FOLGA|[A-Z]{1,4}J|DOF?|DR|CRM|C\d{2,3}F)\b/.test(text);
}

function isHeaderOrFooterRow(text: string): boolean {
  return /^(Date\b|Pairing\/Activity\b|Duty\b|Report\b|Item\b|Updated Date\b)/i.test(text)
    || /Roster\s+Report/i.test(text)
    || /\bDep Stn\b|\bArr\. Stn\b|\bUpdated By\b|\bACY Rep\b|\bA\/C\b/i.test(text)
    || /^\f+$/.test(text);
}

function stripUpdatedDate(text: string): string {
  return normalizeSpaces(text
    .replace(/\b(?:AIRCOM_SQS|JTA_SQS|SABREMM|SCHEDULER|msgsys)\s+\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/gi, ' ')
    .replace(/\b\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/g, ' ')
    .replace(/\b(?:Updated\s+Date|Updated\s+By|SCHEDULER|msgsys|AIRCOM_SQS|JTA_SQS|SABREMM)\b[\s\S]*$/i, ' ')
    .replace(/\b(SCHEDULER|msgsys|AIRCOM_SQS|JTA_SQS|SABREMM|\d{6,})\b\s*$/i, ' '));
}

function cleanCellText(text: string): string {
  return String(text).replace(/[\u0000-\u001F\uFFFE]/g, '').trim();
}

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cleanTime(time: string): string {
  return String(time || '').replace(/\(\+\d+\)/g, '').padStart(5, '0');
}

function dayOffsetFromTime(value: string | null | undefined): number {
  const match = String(value || '').match(/\(\+(\d+)\)/);
  return match ? Number(match[1]) || 0 : 0;
}

function isExplicitNextDayTime(value: string | null | undefined): boolean {
  return dayOffsetFromTime(value) > 0;
}

function monthNameToNumber(name: string): number {
  const map: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  return map[name.toLowerCase().substring(0, 3)] || 1;
}

function parseDateToken(token: string, defaultMonth: number, defaultYear: number): { day: number; month: number; year: number } {
  const match = token.match(DATE_TOKEN_RE);
  if (!match) return { day: 1, month: defaultMonth, year: defaultYear };
  return {
    day: Number(match[1]),
    month: monthNameToNumber(match[2]),
    year: Number(match[3]),
  };
}

function timeStringToHours(time: string): number {
  const [h, m] = cleanTime(time).split(':').map(Number);
  return h + m / 60;
}

function timeToMinutes(time: string): number {
  const [h, m] = cleanTime(time).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function diffHours(start: string, end: string, forceNextDay = false): number {
  let diff = timeToMinutes(cleanTime(end)) - timeToMinutes(cleanTime(start));
  if (diff < 0 || forceNextDay) diff += 24 * 60;
  return diff / 60;
}

function addMinutes(time: string, minutes: number): string {
  const total = timeToMinutes(time) + minutes;
  const normalized = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function subtractMinutes(time: string, minutes: number): string {
  return addMinutes(time, -minutes);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}


function parseCrewRosterReportLooseText(fullText: string, referenceMonth: number, referenceYear: number, base: string): RosterDay[] {
  const lines = fullText
    .split(/\r?\n/)
    .map(line => stripUpdatedDate(normalizeSpaces(line)))
    .filter(line => line && !isHeaderOrFooterRow(line));

  const blocks: { dateToken: string; text: string }[] = [];
  let current: { dateToken: string; parts: string[] } | null = null;

  for (const line of lines) {
    const detectedDateToken = dateTokenFromReportLine(line, referenceYear);
    if (detectedDateToken && (line.indexOf(detectedDateToken) <= 18 || /^<==/.test(line) || /\b(?:LA\d{3,4}|HSBE?|ASB|RCFI)[-/]\d{6}\//i.test(line))) {
      if (current) blocks.push({ dateToken: current.dateToken, text: current.parts.join(' ') });
      current = { dateToken: detectedDateToken, parts: [line.replace(DATE_TOKEN_RE, '').trim()] };
      continue;
    }
    if (current && isRelevantContinuationText(line)) {
      current.parts.push(line);
    }
  }
  if (current) blocks.push({ dateToken: current.dateToken, text: current.parts.join(' ') });

  const days: RosterDay[] = [];
  for (const block of blocks) {
    const parsedDate = parseDateToken(block.dateToken, referenceMonth, referenceYear);
    if (!isPublishedRosterContextMonth(parsedDate.month, parsedDate.year, referenceMonth, referenceYear)) continue;
    const day = createRosterDay(parsedDate.day, parsedDate.month, parsedDate.year, base);
    day.rawText = normalizeSpaces(block.text);
    parseRowIntoDay(day, day.rawText);
    rescueSplitFlightLegsIntoDay(day, day.rawText);
    if (day.type === 'OTHER') {
      const type = inferDayType(day.rawText || '');
      if (type !== 'OTHER') day.type = type;
    }
    finalizeRosterDay(day);
    if (day.type === 'OTHER' && day.legs.length === 0 && !day.pairingCode && !day.dutyReport) continue;
    days.push(day);
  }

  const enriched = rescueActivitiesFromText(days, fullText, referenceMonth, referenceYear, base);
  return enriched.sort((a, b) => {
    const da = Number(a.date.slice(0, 2));
    const db = Number(b.date.slice(0, 2));
    if (da !== db) return da - db;
    return (a.dutyReport ? timeToMinutes(a.dutyReport) : 9999) - (b.dutyReport ? timeToMinutes(b.dutyReport) : 9999);
  });
}


function rescueSplitFlightLegsIntoDay(day: RosterDay, text: string): void {
  // Alguns CrewRosterReport em PDF quebram a última perna noturna em várias
  // linhas/colunas: a estação de chegada e o debrief aparecem antes do número
  // do voo, enquanto o horário de chegada fica depois. Ex. do relatório real:
  // MAB 01:15(+1) ... LA3500 OP BSB 22:55 ... 00:45(+1)
  const startRe = /\b(LA\d{3,4})\b\s+(?:(?:CC|CP|FO|CM)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2})/g;
  let match: RegExpExecArray | null;
  let changed = false;

  while ((match = startRe.exec(text)) !== null) {
    const [, flightNumber, explicitWorkType, origin, departureTime] = match;
    if (day.legs.some(leg => leg.flightNumber === flightNumber && leg.departureTime === departureTime)) continue;

    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 180);
    const before = text.slice(Math.max(0, match.index - 140), match.index);

    let destination = '';
    let rawArrivalTime = '';
    let rawDebriefTime = '';

    const directAfter = after.match(/^\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/);
    if (directAfter) {
      destination = directAfter[1];
      rawArrivalTime = directAfter[2];
      const debriefAfter = after.slice(directAfter.index || 0).match(/\b\d{1,2}:\d{2}\(\+\d+\)\b/g);
      if (debriefAfter && debriefAfter.length > 1) rawDebriefTime = debriefAfter[debriefAfter.length - 1];
    }

    if (!destination || !rawArrivalTime) {
      const stationBefore = [...before.matchAll(/\b([A-Z]{3})\s+(\d{1,2}:\d{2}\(\+\d+\))/g)].pop();
      const nextDayTimesAfter = after.match(/\b\d{1,2}:\d{2}\(\+\d+\)\b/g) || [];
      const destinationBefore = stationBefore?.[1];
      const debriefBefore = stationBefore?.[2];
      const arrivalAfter = nextDayTimesAfter[0];
      if (destinationBefore && debriefBefore && arrivalAfter) {
        destination = destinationBefore;
        rawDebriefTime = debriefBefore;
        // O primeiro horário (+1) depois do voo costuma ser a chegada; o debrief
        // normalmente aparece na coluna anterior como no caso MAB 00:45 / 01:15.
        rawArrivalTime = arrivalAfter;
      }
    }

    if (!destination || !rawArrivalTime) continue;

    const isNextDay = isExplicitNextDayTime(rawArrivalTime) || timeToMinutes(cleanTime(rawArrivalTime)) < timeToMinutes(cleanTime(departureTime));
    const arrivalTime = cleanTime(rawArrivalTime);
    const workType = explicitWorkType || inferWorkTypeFromContext(text, match.index) || 'OP';

    day.legs.push({
      flightNumber,
      origin,
      destination,
      departureTime,
      arrivalTime,
      workType,
      aircraftType: inferAircraftType(after) || inferAircraftType(text),
      duration: diffHours(cleanTime(departureTime), arrivalTime, isNextDay),
      isNextDay,
    });

    if (isNextDay) day.isNextDay = true;
    if (rawDebriefTime) day.dutyDebrief = cleanTime(rawDebriefTime);
    changed = true;
  }

  if (changed) {
    day.type = 'VOO';
    day.legs.sort((a, b) => timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime));
    finalizeRosterDay(day);
  }
}

function isRelevantContinuationText(line: string): boolean {
  return /\b(LA\d{3,4}|DOF?|DR|OFF|HSBE?|ASB|CBF|EMER|MT|CRM|C\d{2,3}F|NSJ?|IJ|DM|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+\d+\))\b/i.test(line);
}

function rescueActivitiesFromText(days: RosterDay[], fullText: string, referenceMonth: number, referenceYear: number, base: string): RosterDay[] {
  const existing = new Set(days.map(day => `${day.date}|${day.pairingCode}|${day.dutyReport || ''}|${day.legs.map(l => l.flightNumber).join(',')}`));
  const output = [...days];
  const compact = fullText.replace(/\r/g, '\n');
  const activityRe = new RegExp(`(\\d{2})-${monthNumberToEnglishAbbr(referenceMonth)}-${referenceYear}\\s+\\b(CBF|EMER|MT|CRM|C\\d{2,3}F|NSJ?|IJ|DM)\\b([\\s\\S]{0,180}?)(?=\\d{2}-[A-Za-z]{3}-\\d{4}|$)`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = activityRe.exec(compact)) !== null) {
    const dayNumber = Number(match[1]);
    const code = match[2].toUpperCase();
    const text = normalizeSpaces(`${code} ${match[3] || ''}`);
    const day = createRosterDay(dayNumber, referenceMonth, referenceYear, base);
    day.rawText = text;
    day.type = code === 'CRM' || /^C\d{2,3}F$/.test(code) || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER';
    day.pairingCode = code;
    parseActivityTimesIntoDay(day, text);
    finalizeRosterDay(day);
    const key = `${day.date}|${day.pairingCode}|${day.dutyReport || ''}|`;
    if (!existing.has(key)) {
      existing.add(key);
      output.push(day);
    }
  }
  return output;
}

function monthNumberToEnglishAbbr(month: number): string {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month - 1] || 'Jan';
}


const TICKET_WEEKDAYS = new Set(['MON','TUE','WED','THU','FRI','SAT','SUN']);
const TICKET_MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const TICKET_STATIONS = new Set(['BSB','GRU','CGH','VCP','NAT','MAB','FLN','MCZ','FOR','CNF','PMW','CPV','GYN','JPA','SDU','GIG','SSA','REC','POA','CWB','BEL','MAO','SLZ','THE','AJU','IOS','NVT','IGU','UDI','RAO','JOI','CXJ','LDB','MGF','JDO','BPS','VIX','PNZ','STM','MCP','PVH','RBR','BVB','CGB','CGR','XAP','IMP','FEN','OPS','JTC','PPB','MOC','IZA','CAC','AEP','EZE','SCL','LIM','BOG','MIA','JFK','LAX','MEX','MAD','LIS','FCO','CDG','LHR','FRA','MUC','AMS','ASU','MVD','UIO','GYE']);

type TicketHeader = { crewName: string; crewId: string; base: string; rank: string; month: number; year: number; airline: string };
type TicketVisualItem = VisualItem & { rowIndex: number; visualY: number };
type TicketMarker = { page: number; weekday: string; day: number; month: number; year: number; weekY: number; monthY: number; order: number };

function isTicketRosterFormat(text: string, fileName?: string): boolean {
  const sample = normalizeTicketText(text);
  return /Tripulante\s*:/i.test(sample)
    && /(Apresenta(?:ção|cao)|Termino da Jornada|Término da Jornada|LA\s*\d{3,4})/i.test(sample)
    && /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b[\s\S]{0,140}\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(sample)
    || /ticket/i.test(fileName || '');
}

function parseTicketRoster(fullText: string, visualRows?: VisualRow[]): CrewRoster {
  // O formato ticket costuma ser extraído de formas diferentes em Android,
  // desktop e iOS: às vezes a ordem visual fica boa, outras vezes o texto linear
  // fica mais fiel. Por isso, calculamos os dois caminhos e escolhemos o mais
  // completo, em vez de aceitar uma interpretação parcial com 1 ou 2 dias.
  const parsedFromVisual = visualRows?.length ? parseTicketRosterFromVisualRows(fullText, visualRows) : null;
  const parsedFromText = parseTicketRosterFromText(fullText);
  return chooseBestTicketRoster(parsedFromVisual, parsedFromText);
}

function chooseBestTicketRoster(visual: CrewRoster | null, text: CrewRoster): CrewRoster {
  if (!visual || !visual.days?.length) return text;
  if (!text.days?.length) return visual;

  // Ticket PDFs are extracted differently depending on browser/WebView.
  // Android usually gives a good visual order, while desktop/PDF.js often gives
  // a better linear text order. Using only one source caused platform-specific
  // losses, including day 21/22 overnight legs on web and duplicate 1h HSB/ASB
  // rows on Android. We now merge both interpretations and then pick the best
  // row for each real duty window.
  const preferred = scoreTicketRoster(text) >= scoreTicketRoster(visual) ? text : visual;
  const secondary = preferred === text ? visual : text;
  const mergedDays = dedupeTicketDaysPreferBest([...(preferred.days || []), ...(secondary.days || [])]);

  return {
    ...preferred,
    crewName: preferred.crewName !== 'Tripulante' ? preferred.crewName : secondary.crewName,
    crewId: preferred.crewId || secondary.crewId,
    base: preferred.base || secondary.base,
    month: preferred.month || secondary.month,
    year: preferred.year || secondary.year,
    rawText: preferred.rawText || secondary.rawText,
    days: mergedDays,
  };
}

function scoreTicketRoster(roster: CrewRoster): number {
  const days = roster.days || [];
  const flightLegs = days.reduce((sum, day) => sum + (day.legs?.length || 0), 0);
  const timed = days.filter(day => day.dutyReport || day.dutyDebrief).length;
  const known = days.filter(day => day.pairingCode && (isKnownRosterCode(day.pairingCode) || /^LA\d{3,4}$/.test(day.pairingCode))).length;
  const overnight = days.filter(day => day.isNextDay || day.type === 'LAYOVER' || (day.legs || []).some(leg => leg.isNextDay)).length;
  const validDuration = days.filter(day => !day.dutyReport || !day.dutyDebrief || timeToMinutes(day.dutyDebrief) !== timeToMinutes(day.dutyReport)).length;
  return days.length * 10 + flightLegs * 8 + timed * 4 + known * 2 + overnight * 8 + validDuration;
}

function parseTicketRosterFromVisualRows(fullText: string, visualRows: VisualRow[]): CrewRoster | null {
  const rawItems = visualRows.flatMap((row, rowIndex) => (row.items || []).map(item => ({
    ...item,
    rowIndex,
    str: String(item.str || '').trim(),
  }))).filter(item => item.str.length > 0);
  if (rawItems.length < 10) return null;

  const firstY = rawItems[0]?.y || 0;
  const lastY = rawItems[rawItems.length - 1]?.y || 0;
  const orientation = firstY > lastY ? -1 : 1;
  const items: TicketVisualItem[] = rawItems.map(item => ({ ...item, visualY: orientation * item.y }));
  const markers = findTicketDateMarkers(items);
  if (markers.length < 3) return null;

  const reference = inferTicketReference(markers, fullText);
  const days: RosterDay[] = [];

  const markersByPage = new Map<number, TicketMarker[]>();
  for (const marker of markers) {
    const arr = markersByPage.get(marker.page) || [];
    arr.push(marker);
    markersByPage.set(marker.page, arr);
  }

  for (const [page, pageMarkers] of markersByPage.entries()) {
    const sorted = pageMarkers.sort((a, b) => a.weekY - b.weekY || a.order - b.order);
    const pageItems = items.filter(item => item.page === page).sort((a, b) => a.visualY - b.visualY || a.x - b.x);

    sorted.forEach((marker, index) => {
      const prev = sorted[index - 1];
      const next = sorted[index + 1];
      const startY = prev ? Math.max(prev.monthY + 6, marker.weekY - 45) : marker.weekY - 55;
      const endY = next ? next.weekY - 8 : Infinity;
      const blockItems = pageItems.filter(item => item.visualY >= startY && item.visualY < endY);
      const blockText = normalizeTicketText(blockItems.map(item => item.str).join(' '));
      const parsed = parseTicketDayBlock(marker, blockText, reference.base);
      for (const day of parsed) {
        if (day.month !== reference.month || day.year !== reference.year) continue;
        days.push(day);
      }
    });
  }

  const uniqueDays = dedupeTicketDays(days).sort((a, b) => {
    const da = parseTicketDateForSort(a.date);
    const db = parseTicketDateForSort(b.date);
    if (da !== db) return da - db;
    return (a.dutyReport ? timeToMinutes(a.dutyReport) : 9999) - (b.dutyReport ? timeToMinutes(b.dutyReport) : 9999);
  });

  return {
    crewName: reference.crewName,
    crewId: reference.crewId,
    base: reference.base,
    rank: reference.rank,
    airline: reference.airline,
    month: reference.month,
    year: reference.year,
    days: uniqueDays,
    rawText: fullText,
  };
}

function findTicketDateMarkers(items: TicketVisualItem[]): TicketMarker[] {
  const markers: TicketMarker[] = [];
  const weekdayItems = items.filter(item => TICKET_WEEKDAYS.has(normalizeTicketToken(item.str))).sort((a, b) => a.rowIndex - b.rowIndex);

  for (const weekday of weekdayItems) {
    const dayCandidate = items
      .filter(item => item.page === weekday.page)
      .filter(item => /^\d{1,2}$/.test(item.str.trim()))
      .filter(item => Number(item.str) >= 1 && Number(item.str) <= 31)
      .filter(item => Math.abs(item.x - weekday.x) <= 25)
      .filter(item => item.visualY >= weekday.visualY - 2 && item.visualY <= weekday.visualY + 30)
      .sort((a, b) => Math.abs(a.visualY - weekday.visualY) - Math.abs(b.visualY - weekday.visualY))[0];
    if (!dayCandidate) continue;

    const monthCandidate = items
      .filter(item => item.page === weekday.page)
      .filter(item => Boolean(TICKET_MONTHS[normalizeTicketToken(item.str)]))
      .filter(item => Math.abs(item.x - weekday.x) <= 35)
      .filter(item => item.visualY >= weekday.visualY - 2 && item.visualY <= weekday.visualY + 42)
      .sort((a, b) => Math.abs(a.visualY - dayCandidate.visualY) - Math.abs(b.visualY - dayCandidate.visualY))[0];
    if (!monthCandidate) continue;

    const month = TICKET_MONTHS[normalizeTicketToken(monthCandidate.str)];
    markers.push({
      page: weekday.page,
      weekday: normalizeTicketToken(weekday.str),
      day: Number(dayCandidate.str),
      month,
      year: new Date().getFullYear(),
      weekY: weekday.visualY,
      monthY: Math.max(weekday.visualY, dayCandidate.visualY, monthCandidate.visualY),
      order: weekday.rowIndex,
    });
  }

  const deduped: TicketMarker[] = [];
  for (const marker of markers.sort((a, b) => a.page - b.page || a.weekY - b.weekY)) {
    const exists = deduped.some(prev => prev.page === marker.page && Math.abs(prev.weekY - marker.weekY) < 6 && prev.day === marker.day && prev.month === marker.month);
    if (!exists) deduped.push(marker);
  }

  const referenceYear = inferTicketYearFromMarkers(deduped);
  return deduped.map(marker => ({ ...marker, year: referenceYear }));
}

function inferTicketReference(markers: TicketMarker[], fullText: string): TicketHeader {
  const clean = normalizeTicketText(fullText);
  const crewName = clean.match(/Tripulante\s*:\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{2,}?)(?=\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Apresenta|LA\s*\d|$))/i)?.[1]?.trim() || 'Tripulante';
  const monthCounts = new Map<number, number>();
  for (const marker of markers) monthCounts.set(marker.month, (monthCounts.get(marker.month) || 0) + 1);
  const month = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || new Date().getMonth() + 1;
  const year = inferTicketYearFromMarkers(markers, month);
  const base = inferTicketBase(clean) || 'BSB';
  return { crewName: cleanCrewName(crewName), crewId: '', base, rank: 'CCM', month, year, airline: 'LATAM' };
}

function inferTicketYearFromMarkers(markers: TicketMarker[], referenceMonth?: number): number {
  const currentYear = new Date().getFullYear();
  const months = markers.map(marker => marker.month);
  if (!months.length) return currentYear;
  const ref = referenceMonth || months.sort((a, b) => months.filter(x => x === b).length - months.filter(x => x === a).length)[0] || new Date().getMonth() + 1;
  return currentYear;
}

function inferTicketBase(text: string): string | null {
  const stationHits = [...text.matchAll(/\b([A-Z]{3})\s+\d{1,2}:\d{2}\b/g)]
    .map(match => match[1])
    .filter(code => TICKET_STATIONS.has(code));
  const counts = new Map<string, number>();
  for (const station of stationHits) counts.set(station, (counts.get(station) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function parseTicketDayBlock(marker: TicketMarker, blockText: string, base: string): RosterDay[] {
  const output: RosterDay[] = [];
  const text = normalizeTicketText(blockText);
  const flightDay = parseTicketFlights(marker, text, base);
  if (flightDay) output.push(flightDay);
  const activityDays = parseTicketActivities(marker, text, base, Boolean(flightDay));
  output.push(...activityDays);
  return output;
}

function parseTicketFlights(marker: TicketMarker, text: string, base: string): RosterDay | null {
  const flightMatches = [...text.matchAll(/\bLA\s*(\d{3,4})\b/g)];
  if (!flightMatches.length) return null;

  const day = createRosterDay(marker.day, marker.month, marker.year, base);
  day.type = 'VOO';
  day.rawText = text;
  const ticketReportMatch = text.match(/Apresenta(?:ção|cao)\s*:\s*(\d{1,2}:\d{2})/i);
  day.dutyReport = ticketReportMatch ? cleanTime(ticketReportMatch[1]) : null;
  const debriefMatch = text.match(/T(?:é|e)rmino\s+da\s+Jornada\s*:\s*(\d{1,2}:\d{2})/i);
  if (debriefMatch) day.dutyDebrief = cleanTime(debriefMatch[1]);

  flightMatches.forEach((match, index) => {
    const flightNumber = `LA${match[1]}`;
    const start = match.index || 0;
    const end = index < flightMatches.length - 1 ? (flightMatches[index + 1].index || text.length) : text.length;
    const segment = text.slice(start, end);
    const pair = parseTicketStationTimePair(segment);
    if (!pair) return;
    const { first, second } = pair;
    const isNextDay = /\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)/.test(segment) || timeToMinutes(second.time) < timeToMinutes(first.time);
    const workType = /\bExtra\b/i.test(segment) ? 'PS' : 'OP';
    if (day.legs.some(leg => leg.flightNumber === flightNumber && leg.departureTime === first.time && leg.origin === first.station)) return;
    day.legs.push({
      flightNumber,
      origin: first.station,
      destination: second.station,
      departureTime: first.time,
      arrivalTime: second.time,
      workType,
      isNextDay,
      duration: diffHours(first.time, second.time, isNextDay),
    });
    if (isNextDay) day.isNextDay = true;
  });

  if (!day.legs.length) return null;
  day.legs.sort((a, b) => timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime));
  day.pairingCode = day.legs.map(leg => leg.flightNumber).join(' · ');
  finalizeRosterDay(day);
  return day;
}

type TicketStationTime = { station: string; time: string };

function parseTicketStationTimePair(segment: string): { first: TicketStationTime; second: TicketStationTime } | null {
  // Caminho 1: texto linear já pareado: "BSB 14:19 VCP 15:45".
  const adjacentPairs = [...segment.matchAll(/\b([A-Z]{3})\s+(\d{1,2}:\d{2})\b/g)]
    .map(pair => ({ station: pair[1], time: cleanTime(pair[2]) }))
    .filter(pair => TICKET_STATIONS.has(pair.station));
  if (adjacentPairs.length >= 2) return { first: adjacentPairs[0], second: adjacentPairs[1] };

  // Caminho 2: muitos PDFs ticket saem em colunas: "BSB VCP 14:19 15:45".
  // Nesse caso, preservamos a ordem visual/textual e casamos as duas primeiras
  // estações com os dois primeiros horários do segmento.
  const stations = [...segment.matchAll(/\b([A-Z]{3})\b/g)]
    .map(match => match[1])
    .filter(station => TICKET_STATIONS.has(station));
  const times = [...segment.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map(match => cleanTime(match[1]));
  if (stations.length >= 2 && times.length >= 2) {
    return {
      first: { station: stations[0], time: times[0] },
      second: { station: stations[1], time: times[1] },
    };
  }

  return null;
}

function parseTicketActivities(marker: TicketMarker, text: string, base: string, hasFlight: boolean): RosterDay[] {
  const output: RosterDay[] = [];
  const codeMatches = [...text.matchAll(/\b([A-Z][A-Z0-9_-]{1,12})\b/g)];
  const candidates: { code: string; index: number }[] = [];

  for (const match of codeMatches) {
    const rawCode = match[1].toUpperCase();
    if (rawCode === 'LA' || rawCode === 'OP' || rawCode === 'PS' || rawCode === 'EXTRA') continue;
    if (TICKET_STATIONS.has(rawCode)) continue;
    if (/^LA\d{3,4}$/.test(rawCode)) continue;
    const code = normalizeRosterCodeAlias(rawCode);
    if (!isTicketActivityCode(code)) continue;
    if (hasFlight && (code === 'DO' || code === 'DR' || code === 'DOF' || code === 'OFF')) continue;
    candidates.push({ code, index: match.index || 0 });
  }

  candidates.sort((a, b) => a.index - b.index);
  const consumed = new Set<string>();
  candidates.forEach((candidate, index) => {
    const key = `${candidate.code}-${candidate.index}`;
    if (consumed.has(key)) return;
    consumed.add(key);
    const end = index < candidates.length - 1 ? candidates[index + 1].index : text.length;
    const segment = text.slice(candidate.index, end);
    const day = createRosterDay(marker.day, marker.month, marker.year, base);
    day.pairingCode = candidate.code;
    day.rawText = segment;
    day.type = mapTicketActivityType(candidate.code);

    if (isTicketDayOffCode(candidate.code)) {
      day.dutyReport = null;
      day.dutyDebrief = null;
      day.dutyHours = 0;
    } else {
      const adjacentTimes = [...segment.matchAll(/\b[A-Z]{3}\s+(\d{1,2}:\d{2})\b/g)].map(match => cleanTime(match[1]));
      const looseTimes = [...segment.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map(match => cleanTime(match[1]));
      const uniqueTimes = Array.from(new Set(adjacentTimes.length >= 2 ? adjacentTimes : looseTimes));
      if (uniqueTimes.length >= 2) {
        // In ticket layout, activity segments often include station/start and
        // station/end, but some extraction modes repeat the first time twice.
        // Use the first and the last distinct time to avoid 09:00-09:00,
        // 11:07-11:07 and synthetic 1h duplicates.
        day.dutyReport = uniqueTimes[0];
        day.dutyDebrief = uniqueTimes[uniqueTimes.length - 1];
        day.isNextDay = timeToMinutes(day.dutyDebrief) < timeToMinutes(day.dutyReport);
        day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, day.isNextDay));
      }
    }

    finalizeRosterDay(day);
    output.push(day);
  });

  return dedupeTicketDays(output);
}

function normalizeRosterCodeAlias(code: string): string {
  const upper = code.toUpperCase();
  if (upper === 'HSB') return 'HSB';
  if (upper === 'HSBE') return 'HSBE';
  return upper;
}

function isTicketActivityCode(code: string): boolean {
  return isKnownRosterCode(code)
    || /^(DO|DR|DOF|OFF|HSB|HSBE|ASB|MT|CBF|EMER|C\d{2,3}F|M\d{2,3}|CRM|SICK|VC|PS|NSJ|NS|NSS|NSP)$/.test(code);
}

function isTicketDayOffCode(code: string): boolean {
  return ['DO', 'DR', 'DOF', 'OFF', 'VC', 'DOP', 'DOPR', 'FOLGA'].includes(code) || getRosterCodeDefinition(code)?.category === 'DAY_OFF';
}

function mapTicketActivityType(code: string): RosterDay['type'] {
  if (code === 'DO') return 'DO';
  if (code === 'DOF') return 'DOF';
  if (code === 'DR') return 'DR';
  if (['DOP', 'DOPR', 'VC', 'FOLGA'].includes(code) || getRosterCodeDefinition(code)?.category === 'DAY_OFF') return 'DO';
  if (code === 'OFF') return 'OFF';
  if (code === 'HSBE') return 'HSBE';
  if (code === 'HSB') return 'HSB';
  if (code === 'ASB') return 'ASB';
  if (code === 'RES') return 'RES';
  if (code === 'CRM' || code === 'CBF' || code === 'EMER' || /^C\d{2,3}F$/.test(code)) return 'CRM';
  return 'OTHER';
}

function parseTicketRosterFromText(fullText: string): CrewRoster {
  const clean = normalizeTicketText(fullText);
  const lines = fullText.split(/\r?\n/).map(line => normalizeTicketText(line)).filter(Boolean);
  const markers: { index: number; weekday: string; day: number; month: number; year: number }[] = [];
  const year = new Date().getFullYear();

  for (let i = 0; i < lines.length; i++) {
    const weekday = lines[i].match(/(?:^|\s)(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:\s|$)/i)?.[1];
    if (!weekday) continue;
    let dayNumber = 0;
    let month = 0;
    const windowText = lines.slice(i, Math.min(lines.length, i + 8)).join(' ');
    const compactMarker = windowText.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
    if (compactMarker) {
      dayNumber = Number(compactMarker[2]);
      month = TICKET_MONTHS[compactMarker[3].toUpperCase()];
    } else {
      for (let j = i; j < Math.min(lines.length, i + 8); j++) {
        const dayMatch = lines[j].match(/(?:^|\s)(\d{1,2})(?:\s|$)/);
        if (dayMatch && !dayNumber) dayNumber = Number(dayMatch[1]);
        const monthMatch = lines[j].match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
        if (monthMatch) month = TICKET_MONTHS[monthMatch[1].toUpperCase()];
        if (dayNumber >= 1 && dayNumber <= 31 && month) break;
      }
    }
    if (dayNumber >= 1 && dayNumber <= 31 && month) markers.push({ index: i, weekday: weekday.toUpperCase(), day: dayNumber, month, year });
  }

  const dedupedMarkers = markers.filter((marker, index, all) => !all.some((prev, prevIndex) => prevIndex < index && prev.day === marker.day && prev.month === marker.month && Math.abs(prev.index - marker.index) <= 3));
  const monthCounts = new Map<number, number>();
  dedupedMarkers.forEach(marker => monthCounts.set(marker.month, (monthCounts.get(marker.month) || 0) + 1));
  const referenceMonth = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || new Date().getMonth() + 1;
  const base = inferTicketBase(clean) || 'BSB';
  const crewName = clean.match(/Tripulante\s*:\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{2,}?)(?=\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Apresenta|LA\s*\d|$))/i)?.[1]
    || clean.match(/Tripulante\s*:\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{2,})/i)?.[1]
    || 'Tripulante';
  const days: RosterDay[] = [];

  dedupedMarkers.forEach((marker, idx) => {
    const start = findTicketBlockStart(lines, marker.index, idx > 0 ? dedupedMarkers[idx - 1].index : -1);
    const end = idx < dedupedMarkers.length - 1 ? dedupedMarkers[idx + 1].index : lines.length;
    const blockText = normalizeTicketText(lines.slice(start, end).join(' '));
    const ticketMarker: TicketMarker = { page: 1, weekday: marker.weekday, day: marker.day, month: marker.month, year, weekY: marker.index, monthY: marker.index + 3, order: marker.index };
    parseTicketDayBlock(ticketMarker, blockText, base).forEach(day => {
      const dayMonth = day.month || marker.month;
      if (dayMonth === referenceMonth || Math.abs(dayMonth - referenceMonth) <= 1) days.push(day);
    });
  });

  return {
    crewName: cleanCrewName(crewName),
    crewId: '',
    base,
    rank: 'CCM',
    airline: 'LATAM',
    month: referenceMonth,
    year,
    days: dedupeTicketDays(days),
    rawText: fullText,
  };
}

function findTicketBlockStart(lines: string[], markerIndex: number, previousMarkerIndex: number): number {
  // No layout ticket, a linha "Apresentação" e até o primeiro par estação/horário
  // podem aparecer visualmente acima do marcador do dia. Recuamos poucas linhas,
  // sem invadir o bloco do dia anterior.
  let start = markerIndex;
  for (let i = markerIndex - 1; i > previousMarkerIndex; i--) {
    const line = lines[i] || '';
    if (/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(line)) break;
    if (/T(?:é|e)rmino\s+da\s+Jornada/i.test(line)) break;
    if (/Apresenta(?:ção|cao)|\bLA\s*\d{3,4}\b|\b[A-Z]{3}\s+\d{1,2}:\d{2}\b|\b\d{1,2}:\d{2}\b/.test(line)) start = i;
    if (markerIndex - i >= 6) break;
  }
  return start;
}


function parseTicketDateForSort(date: string): number {
  const [d, m, y] = date.split('/').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1).getTime();
}

function dedupeTicketDays(days: RosterDay[]): RosterDay[] {
  return dedupeTicketDaysPreferBest(days);
}

function dedupeTicketDaysPreferBest(days: RosterDay[]): RosterDay[] {
  const output: RosterDay[] = [];
  const sorted = [...days].sort((a, b) => parseTicketDateForSort(a.date) - parseTicketDateForSort(b.date)
    || (a.dutyReport ? timeToMinutes(a.dutyReport) : 9999) - (b.dutyReport ? timeToMinutes(b.dutyReport) : 9999)
    || String(a.pairingCode || '').localeCompare(String(b.pairingCode || '')));

  for (const candidate of sorted) {
    const idx = output.findIndex(existing => isSameTicketDuty(existing, candidate));
    if (idx < 0) {
      output.push(candidate);
      continue;
    }
    if (ticketDayQuality(candidate) > ticketDayQuality(output[idx])) output[idx] = candidate;
  }

  return output.sort((a, b) => parseTicketDateForSort(a.date) - parseTicketDateForSort(b.date)
    || (a.dutyReport ? timeToMinutes(a.dutyReport) : 9999) - (b.dutyReport ? timeToMinutes(b.dutyReport) : 9999)
    || String(a.pairingCode || '').localeCompare(String(b.pairingCode || '')));
}

function isSameTicketDuty(a: RosterDay, b: RosterDay): boolean {
  if (a.date !== b.date) return false;
  if (isTicketFlightDay(a) || isTicketFlightDay(b)) return sameTicketFlightDuty(a, b);

  const codeA = String(a.pairingCode || a.type || '').toUpperCase();
  const codeB = String(b.pairingCode || b.type || '').toUpperCase();
  if (codeA !== codeB) return false;

  if (!a.dutyReport && !b.dutyReport && !a.dutyDebrief && !b.dutyDebrief) return true;
  if (!a.dutyReport || !b.dutyReport) return false;

  const startDiff = Math.abs(timeToMinutes(a.dutyReport) - timeToMinutes(b.dutyReport));
  const endDiff = a.dutyDebrief && b.dutyDebrief ? Math.abs(timeToMinutes(a.dutyDebrief) - timeToMinutes(b.dutyDebrief)) : 9999;
  const overlaps = ticketWindowsOverlap(a, b, 5);

  // Same activity extracted twice by two PDF engines, usually one row is
  // 11:07-11:07 and the other is 11:07-12:25 or 11:08-12:08. Treat as one.
  return startDiff <= 5 || endDiff <= 5 || overlaps;
}

function sameTicketFlightDuty(a: RosterDay, b: RosterDay): boolean {
  const sigA = ticketFlightSignature(a);
  const sigB = ticketFlightSignature(b);
  if (sigA && sigB) return sigA === sigB || sigA.includes(sigB) || sigB.includes(sigA);
  return false;
}

function ticketFlightSignature(day: RosterDay): string {
  return (day.legs || []).map(leg => `${leg.flightNumber}-${leg.origin}-${leg.destination}-${leg.departureTime}`).join('|');
}

function isTicketFlightDay(day: RosterDay): boolean {
  return day.type === 'VOO' && Array.isArray(day.legs) && day.legs.length > 0;
}

function ticketWindowsOverlap(a: RosterDay, b: RosterDay, toleranceMinutes = 0): boolean {
  if (!a.dutyReport || !a.dutyDebrief || !b.dutyReport || !b.dutyDebrief) return false;
  const aStart = timeToMinutes(a.dutyReport);
  const aEnd = normalizeTicketEnd(aStart, timeToMinutes(a.dutyDebrief));
  const bStart = timeToMinutes(b.dutyReport);
  const bEnd = normalizeTicketEnd(bStart, timeToMinutes(b.dutyDebrief));
  return aStart <= bEnd + toleranceMinutes && bStart <= aEnd + toleranceMinutes;
}

function normalizeTicketEnd(start: number, end: number): number {
  return end < start ? end + 1440 : end;
}

function ticketDayQuality(day: RosterDay): number {
  const legs = day.legs?.length || 0;
  const duration = day.dutyReport && day.dutyDebrief ? Math.max(0, diffHours(day.dutyReport, day.dutyDebrief, Boolean(day.isNextDay)) * 60) : 0;
  const zeroTimePenalty = day.dutyReport && day.dutyDebrief && day.dutyReport === day.dutyDebrief ? -500 : 0;
  const nextDayBonus = (day.isNextDay || (day.legs || []).some(leg => leg.isNextDay)) ? 100 : 0;
  const knownBonus = isKnownRosterCode(day.pairingCode || '') || /^LA\d{3,4}/.test(day.pairingCode || '') ? 10 : 0;
  return legs * 1000 + duration + nextDayBonus + knownBonus + zeroTimePenalty + String(day.rawText || '').length / 200;
}

function normalizeTicketToken(value: string): string {
  return normalizeTicketText(value).toUpperCase();
}

function normalizeTicketText(value: string): string {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\uE000-\uF8FF]/g, ' ')
    .replace(/[^\p{L}\p{N}:\/()+_\-.'\s]/gu, ' ')
    .replace(/\bLA\s+(\d{3,4})\b/gi, 'LA$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRosterText(fullText: string): CrewRoster {
  const header = parseHeader(fullText);
  const syntheticRows = fullText.split('\n').map((text, index) => ({
    page: 1,
    key: index,
    text: normalizeSpaces(text),
    items: normalizeSpaces(text).split(' ').map((str, i) => ({ str, x: i, y: 0, page: 1 })),
  }));
  const days = parseDaysFromRows(syntheticRows, header.month, header.year, header.base);

  return normalizeRosterDays({
    crewName: header.crewName,
    crewId: header.crewId,
    base: header.base,
    rank: header.rank,
    airline: header.airline,
    month: header.month,
    year: header.year,
    days,
    rawText: fullText,
    totals: header.totals,
  });
}
