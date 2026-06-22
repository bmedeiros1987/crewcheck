/**
 * Parser for "Escala de Tripulante Convertida para padrão AIMS" PDF format.
 * This format has a column-per-day layout extracted as sequential text blocks.
 */

import type { CrewRoster, RosterDay, FlightLeg, CrewMember } from './pdfParser';
import { findRosterCodes, getRosterCodeDefinition, isKnownRosterCode } from './rosterCodes';

const MONTH_MAP: Record<string, number> = {
  'jan': 1, 'fev': 2, 'feb': 2, 'mar': 3, 'abr': 4, 'apr': 4,
  'mai': 5, 'may': 5, 'jun': 6, 'jul': 7, 'ago': 8, 'aug': 8,
  'set': 9, 'sep': 9, 'out': 10, 'oct': 10, 'nov': 11, 'dez': 12, 'dec': 12
};

function parseMonthFromCode(code: string): number {
  // Code like "Ma" from "01May" -> extract month
  // Or from header date "01/05/2026"
  const lower = code.toLowerCase();
  for (const [key, val] of Object.entries(MONTH_MAP)) {
    if (lower.startsWith(key)) return val;
  }
  return 0;
}

export function isAimsFormat(text: string): boolean {
  return text.includes('Convertida para padrão AIMS') || 
         text.includes('Convertida para padrao AIMS') ||
         text.includes('Convertida para padr');
}



type AimsVisualItem = { str: string; x: number; y: number; page: number };
type AimsVisualRow = { page: number; key: number; text: string; items: AimsVisualItem[] };

const WEEKDAY_TOKENS = new Set(['MON','TUE','WED','THU','FRI','SAT','SUN','SEG','TER','QUA','QUI','SEX','SAB','SÁB','DOM']);
const FOOTER_TOKENS = ['TIMEZONE', 'BRASÍLIA', 'BRASILIA', 'CONFIRA', 'ESCALA PUBLICADA', 'TRIPULAÇÕES', 'TRIPULACOES'];

export function parseAimsRoster(fullText: string, visualRows?: AimsVisualRow[]): CrewRoster {
  if (visualRows?.length) {
    const parsed = parseAimsRosterFromVisualRows(fullText, visualRows);
    if (parsed && parsed.days.length >= 5) return parsed;
  }
  return parseAimsRosterLegacy(fullText);
}


type TripulationRecord = {
  date?: string;
  flightNumber: string;
  crew: CrewMember[];
  leadCcm: CrewMember | null;
};

function normalizeCrewNameForMatch(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isSameCrewMember(candidate: string, rosterName: string): boolean {
  const a = normalizeCrewNameForMatch(candidate);
  const b = normalizeCrewNameForMatch(rosterName);
  if (!a || !b) return false;
  if (a === b) return true;

  // Escalas e holerites podem alternar entre "BRUNO SARAIVA" e
  // "BRUNO SARAIVA DE MEDEIROS". Para a gratificação CCM, isso precisa
  // casar de forma robusta sem depender do sobrenome final.
  if (` ${b} `.includes(` ${a} `) || ` ${a} `.includes(` ${b} `)) return true;

  const aParts = a.split(' ').filter(Boolean);
  const bParts = b.split(' ').filter(Boolean);
  const aFirst = aParts[0];
  const aLast = aParts[aParts.length - 1];
  const bFirst = bParts[0];
  const bLast = bParts[bParts.length - 1];
  if (aFirst && aLast && bFirst && bLast && aFirst === bFirst && aLast === bLast) return true;

  // Se o nome curto do PDF de tripulação estiver contido nos nomes do perfil
  // (ex.: BRUNO + SARAIVA), considera o tripulante como o atual.
  const shortParts = aParts.length <= bParts.length ? aParts : bParts;
  const longParts = aParts.length <= bParts.length ? bParts : aParts;
  return shortParts.length >= 2 && shortParts.every((part) => longParts.includes(part));
}

function normalizeFlightKey(value: string): string {
  const compact = String(value || '').toUpperCase().replace(/\s+/g, '');
  const digits = compact.match(/\d{3,4}/)?.[0];
  return digits ? `LA${digits}` : compact;
}

function cleanAimsTripulationCrewName(value: string): string {
  return String(value || '')
    .replace(/Confira na escala publicada pela empresa[\s\S]*$/i, ' ')
    .replace(/Timezone[\s\S]*$/i, ' ')
    .replace(/\b(?:Tripula(?:ç|c)[aã]o|Tripula(?:ç|c)[oõ]es|Crew\s+List|Crew\s+Complement|Crew\s+Members)\b/gi, ' ')
    .replace(/\b(?:LA\s*\d{3,4}|OP|PS|DH|SB|BSB|GRU|CGH|GIG|SDU|CNF|VCP)\b[\s\S]*$/i, ' ')
    .replace(/\b\d{5,10}\b/g, ' ')
    .replace(/[|;]/g, ' ')
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAimsCrewMembersFromTripulationText(text: string, rosterName: string): CrewMember[] {
  const source = String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\b(CP|FO|CCM|CC|CM)\b\s*[:–—-]?/gi, '\n$1 ');
  const crew: CrewMember[] = [];
  const seen = new Set<string>();
  const re = /(?:^|\n|[,;|])\s*(CP|FO|CCM|CC|CM)\s+([\s\S]*?)(?=\n\s*(?:CP|FO|CCM|CC|CM)\b|\s*[,;|]\s*(?:CP|FO|CCM|CC|CM)\b|$)/gi;
  let item: RegExpExecArray | null;
  while ((item = re.exec(source)) !== null) {
    const role = item[1].toUpperCase() === 'CM' ? 'CCM' : item[1].toUpperCase();
    const name = cleanAimsTripulationCrewName(item[2]);
    const normalized = normalizeCrewNameForMatch(name);
    const minPartsOk = normalized.split(' ').length >= 2 || ['CP','FO'].includes(role);
    if (!normalized || normalized.length < 2 || !minPartsOk) continue;
    const key = `${role}|${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    crew.push({
      role,
      name,
      order: crew.length,
      isCurrentCrew: isSameCrewMember(name, rosterName),
    });
  }
  return crew;
}

function parseTripulationRecords(fullText: string, rosterName: string, fallbackYear: number): TripulationRecord[] {
  const raw = String(fullText || '');
  const sectionMatch = raw.match(/(?:Tripula(?:ç|c)[oõ]es|Tripulacao|Tripula(?:ç|c)[aã]o|Crew\s+List|Crew\s+Complement|Crew\s+Members)([\s\S]*)/i);
  const sectionSource = sectionMatch ? sectionMatch[1] : raw;
  const section = sectionSource
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    // Tripulações do AIMS podem vir quebradas em linhas separadas:
    // data | LA voo | CP/FO/CCM/CC. Normalizamos antes do regex.
    .replace(/(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\s*\n+\s*(?:Voo|Flight)?\s*LA\s*(\d{3,4})\s*\n+\s*(?=CP|FO|CCM|CC|CM\b)/gi, '\n$1 LA$2 ')
    .replace(/(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\s+(?:Voo|Flight)?\s*LA\s*(\d{3,4})\s+(?=CP|FO|CCM|CC|CM\b)/gi, '\n$1 LA$2 ')
    .replace(/\b(?:Voo|Flight)?\s*LA\s*(\d{3,4})\s*\n+\s*(?=CP|FO|CCM|CC|CM\b)/gi, '\nLA$1 ')
    .replace(/\b(?:Voo|Flight)?\s*LA\s*(\d{3,4})\s+(?=CP|FO|CCM|CC|CM\b)/gi, '\nLA$1 ')
    .replace(/\s+(?=(?:\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\s+)?LA\s*\d{3,4}\s+(?:CP|FO|CCM|CC|CM)\b)/gi, '\n')
    .replace(/\n{2,}/g, '\n');

  const lineRegex = /(?:^|\n)\s*(?:(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+)?LA\s*(\d{3,4})\s+((?:CP|FO|CCM|CC|CM)\b[\s\S]*?)(?=\n\s*(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+)?LA\s*\d{3,4}\s+(?:CP|FO|CCM|CC|CM)\b|$)/gi;
  const records: TripulationRecord[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(section)) !== null) {
    const day = match[1] ? String(Number(match[1])).padStart(2, '0') : undefined;
    const month = match[2] ? String(Number(match[2])).padStart(2, '0') : undefined;
    let year = match[3] ? Number(match[3]) : fallbackYear;
    if (year < 100) year += 2000;
    const date = day && month ? `${day}/${month}/${year}` : undefined;
    const flightNumber = `LA${match[4]}`;
    const crew = parseAimsCrewMembersFromTripulationText(match[5], rosterName);
    if (!crew.length) continue;
    const leadCcm = crew.find((member) => member.role === 'CCM') || null;
    records.push({ date, flightNumber, crew, leadCcm });
  }
  return records.filter((record, index, all) => all.findIndex((other) => other.date === record.date && normalizeFlightKey(other.flightNumber) === normalizeFlightKey(record.flightNumber)) === index);
}

function applyTripulationRecords(days: RosterDay[], records: TripulationRecord[], rosterName: string): RosterDay[] {
  if (!records.length) return days;
  const byExact = new Map<string, TripulationRecord>();
  const byDate = new Map<string, TripulationRecord[]>();
  const byFlight = new Map<string, TripulationRecord>();
  records.forEach((record) => {
    const flightKey = normalizeFlightKey(record.flightNumber);
    if (record.date) {
      byExact.set(`${record.date}|${flightKey}`, record);
      const list = byDate.get(record.date) || [];
      list.push(record);
      byDate.set(record.date, list);
    }
    if (!byFlight.has(flightKey)) byFlight.set(flightKey, record);
  });
  return days.map((day) => ({
    ...day,
    legs: (day.legs || []).map((leg, legIndex) => {
      const flightKey = normalizeFlightKey(leg.flightNumber || '');
      const exact = byExact.get(`${day.date}|${flightKey}`);
      const fallback = !exact && legIndex === 0 ? byDate.get(day.date)?.find((record) => normalizeFlightKey(record.flightNumber) === flightKey) : undefined;
      const record = exact || fallback || byFlight.get(flightKey);
      if (!record) return leg;
      const crew = record.crew.map((member, index) => ({
        ...member,
        order: index,
        isCurrentCrew: member.isCurrentCrew || isSameCrewMember(member.name, rosterName),
      }));
      const leadCcm = crew.find((member) => member.role === 'CCM') || null;
      const current = crew.find((member) => member.isCurrentCrew) || null;
      const status = leadCcm && current?.role === 'CCM'
        ? (Number(leadCcm.order) === Number(current.order) ? 'confirmed' : 'not_applicable')
        : (leadCcm && isSameCrewMember(leadCcm.name, rosterName) ? 'confirmed' : (leadCcm ? 'pending' : 'pending'));
      return {
        ...leg,
        crew,
        ccmLead: leadCcm,
        ccmBonusStatus: status,
      };
    }),
  }));
}

function parseAimsRosterFromVisualRows(fullText: string, visualRows: AimsVisualRow[]): CrewRoster | null {
  const header = parseAimsHeader(fullText);
  const allItems = visualRows
    .flatMap(row => row.items || [])
    .map(item => ({ ...item, str: String(item.str || '').trim() }))
    .filter(item => item.str.length > 0);

  const dateItems = allItems
    .map(item => ({ item, marker: parseAimsDateMarker(item.str, header.month, header.year) }))
    .filter((entry): entry is { item: AimsVisualItem; marker: { day: number; month: number; year: number; token: string } } => Boolean(entry.marker));

  if (dateItems.length < 3) return null;

  const byPage = new Map<number, typeof dateItems>();
  dateItems.forEach(entry => {
    const arr = byPage.get(entry.item.page) || [];
    arr.push(entry);
    byPage.set(entry.item.page, arr);
  });

  const days: RosterDay[] = [];
  const seen = new Set<string>();

  for (const [page, markers] of byPage.entries()) {
    const sorted = markers.sort((a, b) => a.item.x - b.item.x);
    const pageItems = allItems.filter(item => item.page === page);

    sorted.forEach((entry, index) => {
      const prev = sorted[index - 1];
      const next = sorted[index + 1];
      const left = prev ? (prev.item.x + entry.item.x) / 2 : entry.item.x - 999;
      const right = next ? (entry.item.x + next.item.x) / 2 : entry.item.x + 999;
      const topY = entry.item.y;

      const columnItems = pageItems
        .filter(item => item !== entry.item)
        .filter(item => item.x >= left && item.x < right)
        .filter(item => item.y < topY - 1)
        .filter(item => !shouldIgnoreAimsItem(item.str))
        .sort((a, b) => {
          const dy = b.y - a.y;
          if (Math.abs(dy) > 2) return dy;
          return a.x - b.x;
        });

      const tokens = columnItems
        .flatMap(item => item.str.split(/\s+/))
        .map(t => t.trim())
        .filter(Boolean)
        .filter(t => !shouldIgnoreAimsItem(t));

      // AIMS pode trazer transbordos do mês anterior/posterior na mesma grade.
      // Para evitar tela com dois meses, mantemos somente o mês de referência.
      if (entry.marker.month !== header.month || entry.marker.year !== header.year) return;
      const dateFormatted = `${String(entry.marker.day).padStart(2, '0')}/${String(entry.marker.month).padStart(2, '0')}/${entry.marker.year}`;
      if (seen.has(dateFormatted)) return;
      seen.add(dateFormatted);

      const dateObj = new Date(entry.marker.year, entry.marker.month - 1, entry.marker.day);
      const dayOfWeekNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const dayOfWeek = dayOfWeekNames[dateObj.getDay()];
      const parsed = parseDayContent(tokens.join('\n'), header.base);
      const rawText = tokens.join(' ');

      days.push({
        date: dateFormatted,
        dayOfWeek,
        type: parsed.type,
        pairingCode: parsed.pairingCode,
        dutyReport: parsed.dutyReport,
        dutyDebrief: parsed.dutyDebrief,
        legs: parsed.legs,
        dutyHours: parsed.dutyHours,
        flyingHours: parsed.flyingHours,
        isNextDay: parsed.isNextDay,
        hotel: parsed.hotel,
        base: header.base,
        rawText,
      });
    });
  }

  days.sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date));

  const crewRecords = parseTripulationRecords(fullText, header.crewName, header.year);
  const daysWithCrew = applyTripulationRecords(days, crewRecords, header.crewName);

  return {
    crewName: header.crewName,
    crewId: header.crewId,
    base: header.base,
    rank: header.rank,
    airline: 'LATAM',
    month: header.month,
    year: header.year,
    days: daysWithCrew,
    rawText: fullText,
  };
}

function parseAimsHeader(fullText: string): { crewName: string; crewId: string; base: string; rank: string; month: number; year: number } {
  const compact = fullText.replace(/\s+/g, ' ');
  const match = compact.match(/Tripulante\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{3,}?)(?:\s*-\s*)?BP\s*:?\s*(\d+)(?:\s*-\s*)?Base\s*:?\s*([A-Z]{3})(?:\s*-\s*)?(\d{2})\/(\d{2})\/(\d{4})/i);
  return {
    crewName: cleanAimsCrewName(match?.[1] || ''),
    crewId: match?.[2] || '',
    base: match?.[3] || 'BSB',
    rank: /\bCCM\b/i.test(fullText) ? 'CCM' : /\bCC\b/i.test(fullText) ? 'CC' : 'CCM',
    month: match ? Number(match[5]) : new Date().getMonth() + 1,
    year: match ? Number(match[6]) : new Date().getFullYear(),
  };
}

function cleanAimsCrewName(value: string): string {
  return String(value || '').replace(/\b(Tripulante|BP|Base)\b/gi, ' ').replace(/\s+/g, ' ').trim() || 'Tripulante';
}

function parseAimsDateMarker(value: string, baseMonth: number, baseYear: number): { day: number; month: number; year: number; token: string } | null {
  const match = value.match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i);
  if (!match) return null;
  const day = Number(match[1]);
  if (day < 1 || day > 31) return null;
  const code = match[2].toLowerCase();
  let month = parseMonthFromCode(code);
  if (code === 'ma') month = baseMonth === 6 ? 5 : 3;
  if (!month) return null;
  let year = baseYear;
  if (month < baseMonth - 6) year += 1;
  if (month > baseMonth + 6) year -= 1;
  return { day, month, year, token: value };
}

function shouldIgnoreAimsItem(value: string): boolean {
  const v = value.trim();
  const upper = v.toUpperCase();
  if (!v) return true;
  if (WEEKDAY_TOKENS.has(upper)) return true;
  if (upper === 'Y') return true;
  if (/^\d{2}(JAN|FEB|MAR|APR|MAY|MA|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i.test(v)) return true;
  if (FOOTER_TOKENS.some(term => upper.includes(term))) return true;
  return false;
}

function parseDateForSort(date: string): number {
  const [d, m, y] = date.split('/').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function parseAimsRosterLegacy(fullText: string): CrewRoster {
  // Extract header info
  // "Tripulante: NOME DO TRIPULANTE -BP:00000000 -Base: BSB -01/05/2026 até31/05/2026"
  const headerMatch = fullText.match(/Tripulante\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{3,}?)(?:\s*-\s*)?BP\s*:?\s*(\d+)(?:\s*-\s*)?Base\s*:?\s*([A-Z]{3})(?:\s*-\s*)?(\d{2})\/(\d{2})\/(\d{4})/i);
  
  let crewName = 'Tripulante';
  let crewId = '';
  let base = 'BSB';
  let month = new Date().getMonth() + 1;
  let year = new Date().getFullYear();
  
  if (headerMatch) {
    crewName = cleanAimsCrewName(headerMatch[1]);
    crewId = headerMatch[2];
    base = headerMatch[3];
    month = parseInt(headerMatch[5]);
    year = parseInt(headerMatch[6]);
  }
  
  // Parse all pages text into lines
  const lines = fullText.split('\n');
  const allLines: string[] = [];
  
  for (const line of lines) {
    // Skip headers and footers
    if (line.includes('Convertida para padr') || 
        line.includes('Tripulante:') || 
        line.includes('Confira na') ||
        line.includes('Timezone') ||
        line.includes('Tripulações') ||
        line.trim() === '') continue;
    allLines.push(line.trim());
  }
  
  // Join all content and split by day markers
  // Day markers are like "01Ma", "02Ma", etc. or "01Jun" for next month overflow
  const content = allLines.join('\n');
  
  // Split by day markers: pattern is DDMon (e.g., "01Ma", "10Ma", "01Jun")
  // These can appear concatenated with previous content like "(320)10Ma" or "21:0019Ma"
  const dayPattern = /(\d{2})(Jan|Feb|Mar|Apr|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Ja|Fe|Ma|Ab|Mai|Ju|Jul|Ag|Se|Ou|No|De)/gi;
  
  // Find all day markers and their positions
  const dayMarkers: { day: number; monthCode: string; pos: number }[] = [];
  let match;
  
  while ((match = dayPattern.exec(content)) !== null) {
    const dayNum = parseInt(match[1]);
    const monthCode = match[2];
    if (dayNum >= 1 && dayNum <= 31) {
      dayMarkers.push({ day: dayNum, monthCode, pos: match.index });
    }
  }
  
  // Parse each day's content
  const days: RosterDay[] = [];
  const seenDates = new Set<string>();
  
  for (let i = 0; i < dayMarkers.length; i++) {
    const marker = dayMarkers[i];
    const startPos = marker.pos + `${marker.day.toString().padStart(2, '0')}${marker.monthCode}`.length;
    const endPos = i < dayMarkers.length - 1 ? dayMarkers[i + 1].pos : content.length;
    const dayContent = content.substring(startPos, endPos).trim();
    
    // Determine if this is the target month or overflow (next month)
    let dayMonth = month;
    let dayYear = year;
    const mc = marker.monthCode.toLowerCase();
    
    // Check if it's a different month (e.g., "01Jun" when month is May)
    const parsedMonth = parseMonthFromCode(mc);
    if (parsedMonth > 0 && parsedMonth !== month) {
      dayMonth = parsedMonth;
      if (parsedMonth < month) dayYear++;
    }
    
    // Mantém também dias de transbordo do PDF (mês anterior/posterior),
    // porque a programação pode começar antes do dia 1º ou terminar após o fechamento do mês.
    
    const dateFormatted = `${marker.day.toString().padStart(2, '0')}/${dayMonth.toString().padStart(2, '0')}/${dayYear}`;
    
    // Deduplicate: keep only the first occurrence of each date
    if (seenDates.has(dateFormatted)) continue;
    seenDates.add(dateFormatted);
    
    const dateObj = new Date(dayYear, dayMonth - 1, marker.day);
    const dayOfWeekNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const dayOfWeek = dayOfWeekNames[dateObj.getDay()];
    
    // Parse the day content
    const parsed = parseDayContent(dayContent, base);
    
    days.push({
      date: dateFormatted,
      dayOfWeek,
      type: parsed.type,
      pairingCode: parsed.pairingCode,
      dutyReport: parsed.dutyReport,
      dutyDebrief: parsed.dutyDebrief,
      legs: parsed.legs,
      dutyHours: parsed.dutyHours,
      flyingHours: parsed.flyingHours,
      isNextDay: parsed.isNextDay,
      hotel: parsed.hotel,
      base
    });
  }
  
  // Sort days by date
  days.sort((a, b) => {
    const [da, ma] = a.date.split('/').map(Number);
    const [db, mb] = b.date.split('/').map(Number);
    if (ma !== mb) return ma - mb;
    return da - db;
  });
  
  const crewRecords = parseTripulationRecords(fullText, crewName, year);
  const daysWithCrew = applyTripulationRecords(days, crewRecords, crewName);

  return {
    crewName,
    crewId,
    base,
    rank: 'CCM',
    month,
    year,
    days: daysWithCrew,
    rawText: fullText
  };
}

interface ParsedDay {
  type: RosterDay['type'];
  pairingCode: string;
  dutyReport: string | null;
  dutyDebrief: string | null;
  legs: FlightLeg[];
  dutyHours: number | null;
  flyingHours: number | null;
  isNextDay: boolean;
  hotel: string | null;
}

function parseDayContent(content: string, homeBase: string): ParsedDay {
  // Split by both newlines AND whitespace to handle space-separated tokens from column extraction
  // First split by newlines, then split each line by spaces to get individual tokens
  const rawLines = content.split('\n').filter(l => l.trim() !== '');
  const lines: string[] = [];
  for (const line of rawLines) {
    // Split each line by whitespace to get individual tokens
    const tokens = line.split(/\s+/).filter(t => t.trim() !== '');
    lines.push(...tokens);
  }
  
  // First token might be "y" (year indicator), skip it
  let idx = 0;
  if (idx < lines.length && lines[idx] === 'y') idx++;
  
  // Next token is day of week (Fri, Sat, etc.), skip it
  if (idx < lines.length && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i.test(lines[idx])) idx++;
  
  // Now determine the day type from remaining content
  const remaining = lines.slice(idx);
  
  if (remaining.length === 0) {
    return { type: 'OTHER', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: null, flyingHours: null, isNextDay: false, hotel: null };
  }
  
  // Check first meaningful token
  const firstLine = remaining[0];
  const laAnywhereIdx = remaining.findIndex(l => l === 'LA');

  // Activity + flight on the same day (e.g. C32F + LA4546)
  if (laAnywhereIdx > 0 && isKnownGroundActivity(firstLine)) {
    const flightStartIdx = laAnywhereIdx > 0 && isExtraAimsMarker(remaining[laAnywhereIdx - 1]) ? laAnywhereIdx - 1 : laAnywhereIdx;
    const flight = parseFlightDay(remaining.slice(flightStartIdx), homeBase, false);
    return {
      ...flight,
      pairingCode: firstLine,
      rawActivityCode: firstLine,
    } as ParsedDay;
  }

  // Standalone ground activities
  if (isKnownGroundActivity(firstLine)) {
    return parseGroundActivity(remaining, firstLine);
  }
  
  // Day off types
  if (firstLine === 'DO' || firstLine.startsWith('DO')) {
    return { type: 'DO', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  if (firstLine === 'DOF' || firstLine.startsWith('DOF')) {
    return { type: 'DOF', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  if (firstLine === 'DR' || firstLine.startsWith('DR')) {
    return { type: 'DR', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  if (firstLine === 'OFF' || firstLine.startsWith('OFF')) {
    return { type: 'OFF', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  
  // HSB/HSBE - Standby
  if (firstLine === 'HSB' || firstLine.startsWith('HSB')) {
    return parseStandby(remaining, firstLine.includes('HSBE') ? 'HSBE' : 'HSB');
  }
  if (firstLine === 'HSBE') {
    return parseStandby(remaining, 'HSBE');
  }
  
  // CRM Training
  if (firstLine === 'CRMB' || firstLine === 'CRM' || firstLine.startsWith('CRM') || /^C\d{2,3}F$/.test(firstLine)) {
    return parseCRM(remaining);
  }
  
  // ASB - Airport Standby
  if (firstLine === 'ASB' || firstLine.startsWith('ASB')) {
    return parseASB(remaining);
  }
  
  // Check if it's a layover continuation (starts with "(...)" indicating previous day's activity continues)
  if (firstLine === '(...)' || firstLine.startsWith('(...)')) {
    const afterEllipsis = remaining.slice(1);
    
    // Em AIMS, (...) costuma ser apenas continuação/pernoite. Checamos códigos
    // operacionais antes de DO/DR/OFF para não transformar ASB em inativo/folga.
    const asbIdx = afterEllipsis.findIndex(l => l === 'ASB' || /^ASB/.test(l));
    if (asbIdx >= 0) return parseASB(afterEllipsis.slice(asbIdx));

    const hsbIdx = afterEllipsis.findIndex(l => l === 'HSBE' || l === 'HSB');
    if (hsbIdx >= 0) {
      const hsbType = afterEllipsis[hsbIdx] === 'HSBE' ? 'HSBE' : 'HSB';
      return parseStandby(afterEllipsis.slice(hsbIdx), hsbType);
    }

    const doIdx = afterEllipsis.findIndex(l => l === 'DOPR' || l === 'DOP' || l === 'VC' || l === 'DOPR' || l === 'DOP' || l === 'VC' || l === 'DO' || l === 'DOF' || l === 'DR' || l === 'OFF');
    if (doIdx >= 0) {
      const typeStr = afterEllipsis[doIdx] as RosterDay['type'];
      return { type: typeStr, pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
    }
    
    // Check for CRM after (...)
    const knownIdx = afterEllipsis.findIndex(l => isKnownGroundActivity(l));
    if (knownIdx >= 0) {
      return parseGroundActivity(afterEllipsis.slice(knownIdx), afterEllipsis[knownIdx]);
    }
    
    // Check for flights after (...)
    const hasFlights = afterEllipsis.some(l => l === 'LA');
    if (hasFlights) {
      const laStart = afterEllipsis.findIndex(l => l === 'LA');
      const flightStartIdx = laStart > 0 && isExtraAimsMarker(afterEllipsis[laStart - 1]) ? laStart - 1 : laStart;
      return parseFlightDay(afterEllipsis.slice(flightStartIdx), homeBase, true);
    }
    
    // Pure layover - check for station (non-home-base)
    const stationLine = afterEllipsis.find(l => /^[A-Z]{3}$/.test(l) && l !== homeBase);
    if (stationLine) {
      return { 
        type: 'LAYOVER', 
        pairingCode: '', 
        dutyReport: null, 
        dutyDebrief: null, 
        legs: [], 
        dutyHours: 0, 
        flyingHours: 0, 
        isNextDay: false, 
        hotel: stationLine 
      };
    }
    
    // If no station found and no other type, it might be a rest day
    return { type: 'OTHER', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  
  // Flight day - starts with "LA" or has "[extra]" marker
  if (firstLine === 'LA' || isExtraAimsMarker(firstLine)) {
    return parseFlightDay(remaining, homeBase, false);
  }
  
  // Check if it's a DO/DOF that was preceded by (...) 
  // Pattern: (...) \n STATION \n time \n time \n DO/DOF
  const doIdx = remaining.findIndex(l => l === 'DOPR' || l === 'DOP' || l === 'VC' || l === 'DO' || l === 'DOF' || l === 'DR');
  if (doIdx > 0) {
    const typeStr = remaining[doIdx] as RosterDay['type'];
    return { type: typeStr, pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }
  
  // Fallback: check for LA anywhere
  const laIdx = remaining.findIndex(l => l === 'LA');
  if (laIdx >= 0) {
    const flightStartIdx = laIdx > 0 && isExtraAimsMarker(remaining[laIdx - 1]) ? laIdx - 1 : laIdx;
    return parseFlightDay(remaining.slice(flightStartIdx), homeBase, false);
  }
  
  return { type: 'OTHER', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: null, flyingHours: null, isNextDay: false, hotel: null };
}


function isExtraAimsMarker(token: string): boolean {
  const value = String(token || '').trim().toUpperCase();
  return value === '[EXTRA]' || value === 'EXTRA' || value === 'PS' || value === 'PAX' || value === 'PASSAGEIRO';
}


function isKnownGroundActivity(token: string): boolean {
  return isKnownRosterCode(token);
}

function parseGroundActivity(lines: string[], code: string): ParsedDay {
  const def = getRosterCodeDefinition(code);
  const canonicalCode = def?.code || code;

  // Folgas/marcadores normalmente vêm sem janela de horário e não devem ser
  // confundidos com atividades de solo. Mantemos o código para tradução direta.
  if (def?.category === 'DAY_OFF') {
    const type = canonicalCode === 'DR' ? 'DR' : canonicalCode === 'DOF' ? 'DOF' : canonicalCode === 'OFF' ? 'OFF' : 'DO';
    // DOP/DOPR/VC e outras folgas ficam como tipo DO para cálculos,
    // mas mantêm pairingCode original para exibir/traduzir corretamente.
    return { type, pairingCode: canonicalCode, dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }

  const window = collectDutyWindow(lines);
  const startTime = window.start;
  const endTime = window.end;
  let dutyHours: number | null = null;
  if (startTime && endTime) dutyHours = diffHours(startTime, endTime);

  let type: RosterDay['type'] = 'OTHER';
  if (def?.category === 'RESERVE') type = 'ASB';
  else if (def?.category === 'STANDBY') type = canonicalCode === 'HSBE' ? 'HSBE' : 'HSB';
  else if (/^C\d{2,3}F$/i.test(canonicalCode) || /^(CRM|CBF|EMER)$/i.test(canonicalCode)) type = 'CRM';

  return {
    type,
    pairingCode: canonicalCode,
    dutyReport: startTime,
    dutyDebrief: endTime,
    legs: [],
    dutyHours,
    flyingHours: 0,
    isNextDay: Boolean(startTime && endTime && minutesOfDay(endTime) <= minutesOfDay(startTime)),
    hotel: null
  };
}

function collectDutyWindow(lines: string[]): { start: string | null; end: string | null } {
  const airports = new Set(['BSB','GRU','CGH','VCP','NAT','MCZ','FOR','CNF','PMW','FLN','MAB','CPV','GYN','JPA','EZE','VIX','SSA','GIG','SDU','REC','AJU','BEL','SLZ','CGB','POA','CUR']);
  const tokens = lines.map(line => String(line || '').trim()).filter(Boolean);
  const stationTimes: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (airports.has(tokens[i].toUpperCase()) && /^\d{1,2}:\d{2}(?:\(\+1\))?$/.test(tokens[i + 1])) {
      stationTimes.push(normalizeSimpleTime(tokens[i + 1]));
    }
  }
  if (stationTimes.length >= 2) return { start: stationTimes[0], end: stationTimes[stationTimes.length - 1] };

  const times = collectTimes(tokens).filter(time => !looksLikeDuration(time));
  if (!times.length) return { start: null, end: null };
  const start = times[0];
  let end = times[1] || times[0];
  for (const candidate of times.slice(1)) {
    const h = diffHours(start, candidate);
    if (h >= 0.25 && h <= 14) end = candidate;
  }
  return { start, end };
}

function collectTimes(lines: string[]): string[] {
  return collectAllClockTokens(lines);
}

function collectAllClockTokens(lines: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const line of lines) {
    for (const match of String(line || '').matchAll(/\b([01]?\d|2[0-3]):[0-5]\d(?:\(\+1\))?\b/g)) {
      const clean = normalizeSimpleTime(match[0]);
      if (!seen.has(clean) && !looksLikeDuration(clean)) {
        seen.add(clean);
        output.push(clean);
      }
    }
  }
  return output;
}

function normalizeSimpleTime(time: string): string {
  return time.replace(/^([0-9]):/, '0$1:').replace('(+1)', '');
}

function looksLikeDuration(time: string): boolean {
  return ['00:59','01:25','01:40','01:45','01:50','02:00','02:05','02:10','02:15','02:25','02:30','02:40','02:45','02:50','03:00','03:10','03:15','05:20','06:00','06:25','07:30','07:35','07:40','08:55','10:30','10:45','10:55','11:30'].includes(time);
}

function minutesOfDay(time: string): number {
  const [h, m] = time.replace('(+1)', '').split(':').map(Number);
  return h * 60 + m;
}

function diffHours(start: string, end: string): number {
  let diff = minutesOfDay(end) - minutesOfDay(start);
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

function addClockMinutes(time: string, minutesToAdd: number): string {
  const [hours, minutes] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(hours)) return '';
  const total = (((hours * 60 + (Number.isFinite(minutes) ? minutes : 0) + minutesToAdd) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function isActivityBoundaryToken(token: string): boolean {
  const value = String(token || '').toUpperCase().trim();
  return value === 'LA'
    || value === '[EXTRA]'
    || value === '(...)'
    || /^(HSBE|HSB|ASB|RES|CBF|EMER|CRMBSB|CRMB|CRM|MT|C\d{2,3}F|DOF?|DOPR?|DR|OFF|VC)$/.test(value)
    || isKnownRosterCode(value);
}

function sliceOwnActivityLines(lines: string[], code: string): string[] {
  const tokens = lines.map((line) => String(line || '').trim()).filter(Boolean);
  const normalizedCode = String(code || '').toUpperCase();
  let startIdx = tokens.findIndex((token) => token.toUpperCase() === normalizedCode || token.toUpperCase().startsWith(normalizedCode));
  if (startIdx < 0) startIdx = 0;
  const output: string[] = [];
  for (let i = startIdx; i < tokens.length; i++) {
    const token = tokens[i].toUpperCase();
    if (i > startIdx && isActivityBoundaryToken(token)) break;
    output.push(tokens[i]);
  }
  return output.length ? output : tokens;
}

function findNextActivityStartAfter(lines: string[], code: string, startTime: string): string | null {
  const tokens = lines.map((line) => String(line || '').trim()).filter(Boolean);
  const normalizedCode = String(code || '').toUpperCase();
  const idx = tokens.findIndex((token) => token.toUpperCase() === normalizedCode || token.toUpperCase().startsWith(normalizedCode));
  if (idx < 0) return null;
  const startMinutes = minutesOfDay(startTime);
  for (let i = idx + 1; i < tokens.length; i++) {
    if (!isActivityBoundaryToken(tokens[i].toUpperCase())) continue;
    const nextBlock = tokens.slice(i, Math.min(tokens.length, i + 8));
    const nextStart = collectAllClockTokens(nextBlock)[0];
    if (!nextStart || nextStart === startTime) continue;
    const diff = minutesOfDay(nextStart) - startMinutes;
    if (diff > 10 && diff <= 12 * 60) return nextStart;
  }
  return null;
}

function parseStandby(lines: string[], type: 'HSB' | 'HSBE'): ParsedDay {
  // HSB/HSBE deve usar apenas o bloco do próprio código.
  // Quando HSB e ASB aparecem no mesmo dia, a reserva não pode herdar horário do sobreaviso.
  const ownLines = sliceOwnActivityLines(lines, type);
  const times = collectAllClockTokens(ownLines);
  const uniqueTimes = Array.from(new Set(times));

  const startTime = uniqueTimes[0] || null;
  let endTime: string | null = uniqueTimes.find((time) => time !== startTime) || null;

  // Para sobreaviso, se o PDF não trouxe fim legível e existe uma próxima programação
  // no mesmo dia, usar o início dela como fim provável do HSB. Se não houver, a UI
  // ainda consegue mostrar estimativa conservadora de 3h sem afetar diárias.
  if (startTime && !endTime) endTime = findNextActivityStartAfter(lines, type, startTime);

  let dutyHours: number | null = null;
  if (startTime && endTime) dutyHours = diffHours(startTime, endTime);

  return {
    type,
    pairingCode: '',
    dutyReport: startTime,
    dutyDebrief: endTime,
    legs: [],
    dutyHours,
    flyingHours: 0,
    isNextDay: Boolean(startTime && endTime && minutesOfDay(endTime) <= minutesOfDay(startTime)),
    hotel: null
  };
}

function parseCRM(lines: string[]): ParsedDay {
  // CRM training day
  // CRMB
  // SB
  // 09:00
  // ...
  // 18:00
  
  const times: string[] = [];
  const timePattern = /^(\d{1,2}:\d{2})/;
  
  for (const line of lines) {
    const tm = line.match(timePattern);
    if (tm) times.push(tm[1]);
  }
  
  let startTime: string | null = null;
  let endTime: string | null = null;
  
  if (times.length >= 2) {
    const uniqueTimes = Array.from(new Set(times));
    startTime = uniqueTimes[0];
    endTime = uniqueTimes[1] || uniqueTimes[0];
    for (const candidate of uniqueTimes.slice(1)) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = candidate.split(':').map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      if (diff >= 15 && diff <= 14 * 60) endTime = candidate;
    }
  }
  
  let dutyHours: number | null = null;
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let diffMin = (eh * 60 + em) - (sh * 60 + sm);
    if (diffMin < 0) diffMin += 24 * 60;
    dutyHours = diffMin / 60;
  }
  
  return {
    type: 'CRM',
    pairingCode: findRosterCodes(lines.join(' '))[0] || '',
    dutyReport: startTime,
    dutyDebrief: endTime,
    legs: [],
    dutyHours,
    flyingHours: 0,
    isNextDay: false,
    hotel: null
  };
}

function parseASB(lines: string[]): ParsedDay {
  // ASB/RES: isola o bloco da reserva. Não usar horários de HSB/HSBE anteriores.
  // Se o PDF repetir o início como fim ou não trouxer o fim, a regra operacional do
  // CrewCheck é considerar 6h de reserva a partir do início.
  const ownLines = sliceOwnActivityLines(lines, 'ASB');
  const times = collectAllClockTokens(ownLines);
  const uniqueTimes = Array.from(new Set(times));

  const startTime = uniqueTimes[0] || null;
  let endTime: string | null = null;

  if (startTime) {
    for (const candidate of uniqueTimes.slice(1)) {
      if (candidate === startTime) continue;
      const diff = diffHours(startTime, candidate) * 60;
      if (diff >= 30 && diff <= 12 * 60) endTime = candidate;
    }
    if (!endTime || endTime === startTime) endTime = addClockMinutes(startTime, 6 * 60);
  }

  let dutyHours: number | null = null;
  if (startTime && endTime) dutyHours = diffHours(startTime, endTime);

  return {
    type: 'ASB',
    pairingCode: '',
    dutyReport: startTime,
    dutyDebrief: endTime,
    legs: [],
    dutyHours,
    flyingHours: 0,
    isNextDay: Boolean(startTime && endTime && minutesOfDay(endTime) <= minutesOfDay(startTime)),
    hotel: null
  };
}


function findBestAimsLegPattern(tokens: string[]): { origin: string; destination: string; departureTime: string; arrivalTime: string } | null {
  const airports = new Set(['BSB','GRU','CGH','VCP','NAT','MCZ','FOR','CNF','PMW','FLN','MAB','CPV','GYN','JPA','EZE','VIX','SSA','GIG','SDU','REC','AJU','BEL','SLZ','CGB','POA','CUR']);
  const isTime = (value: string) => /^\d{1,2}:\d{2}(?:\(\+1\))?$/.test(value);
  const upper = tokens.map(t => String(t || '').toUpperCase());
  const candidates: Array<{ origin: string; destination: string; departureTime: string; arrivalTime: string; score: number }> = [];
  for (let i = 0; i < upper.length; i++) {
    if (!airports.has(upper[i])) continue;
    for (let j = i + 1; j < Math.min(upper.length, i + 5); j++) {
      if (!isTime(tokens[j])) continue;
      for (let k = j + 1; k < Math.min(upper.length, j + 5); k++) {
        if (!airports.has(upper[k])) continue;
        for (let l = k + 1; l < Math.min(upper.length, k + 5); l++) {
          if (!isTime(tokens[l])) continue;
          const departureTime = tokens[j].replace(/^([0-9]):/, '0$1:');
          const arrivalTime = tokens[l].replace(/^([0-9]):/, '0$1:').replace('(+1)', '');
          const [dh, dm] = departureTime.replace('(+1)', '').split(':').map(Number);
          const [ah, am] = arrivalTime.split(':').map(Number);
          let duration = (ah * 60 + am) - (dh * 60 + dm);
          if (duration <= 0) duration += 24 * 60;
          if (duration < 15 || duration > 450) continue;
          const score = 100 - (upper[i] === upper[k] ? 20 : 0) - Math.abs(duration / 60 - 1.8);
          candidates.push({ origin: upper[i], destination: upper[k], departureTime, arrivalTime, score });
        }
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function parseFlightDay(lines: string[], homeBase: string, isLayoverStart: boolean): ParsedDay {
  // AIMS/SLESCALE premium rule:
  // - first flight of a duty may show two times before the route: Apresentação, then decolagem.
  // - subsequent flights normally show only decolagem before the route.
  // - [extra] / Extra / PS marks the following flight as passenger/extra.
  const source = lines.map((line) => String(line || '').trim()).filter(Boolean);
  const legs: FlightLeg[] = [];
  let i = 0;
  let firstReportTime: string | null = null;
  let lastArrivalTime: string | null = null;
  let explicitDebriefTime: string | null = null;
  let isNextDay = false;
  let hotel: string | null = null;
  let totalFlyingMin = 0;
  let pendingWorkType: string | null = null;

  const airportSet = new Set(['BSB','GRU','CGH','VCP','NAT','MCZ','FOR','CNF','PMW','FLN','MAB','CPV','GYN','JPA','EZE','VIX','SSA','GIG','SDU','REC','AJU','BEL','SLZ','CGB','POA','CUR','IGU','MAO','THE','IOS','UDI','JDO','BPS','CWB','LDB','JOI','NVT','RAO','SJP','OPS','PVH','RBR','BOG','LIM','SCL','MIA','LAX']);
  const timeRegex = /^\d{1,2}:\d{2}(?:\(\+1\))?$/;
  const aircraftRegex = /^\(?(?:32S|31R|39R|328|319|320|321|32N|767|777|789|788|350|359)\)?$/i;
  const isAimsTime = (value: string) => timeRegex.test(String(value || '').trim());
  const cleanTime = (value: string) => normalizeSimpleTime(String(value || '').trim());
  const isAirport = (value: string) => airportSet.has(String(value || '').trim().toUpperCase());
  const aircraftFrom = (tokens: string[]) => tokens.map((t) => String(t || '').trim().toUpperCase()).find((t) => aircraftRegex.test(t))?.replace(/[()]/g, '');

  function nextFlightStartsAt(index: number): boolean {
    return String(source[index] || '').toUpperCase() === 'LA' && /^\d{3,4}$/.test(String(source[index + 1] || ''));
  }

  function parseLegTokens(flightNumber: string, legTokensRaw: string[], forcedWorkType: string | null): { leg: FlightLeg | null; reportCandidate: string | null; debriefCandidate: string | null } {
    const hasExtraMarker = legTokensRaw.some((token) => isExtraAimsMarker(token));
    const legTokens = legTokensRaw.filter((token) => !isExtraAimsMarker(token) && !/^\(\.\.\.\)/.test(token));
    const upper = legTokens.map((token) => String(token || '').trim().toUpperCase());
    const airportIndexes: number[] = [];
    for (let idx = 0; idx < upper.length; idx++) if (isAirport(upper[idx])) airportIndexes.push(idx);
    if (airportIndexes.length < 2) return { leg: null, reportCandidate: null, debriefCandidate: null };

    let best: { originIdx: number; destIdx: number; dep: string; arrRaw: string; report: string | null; score: number } | null = null;
    for (let a = 0; a < airportIndexes.length - 1; a++) {
      const originIdx = airportIndexes[a];
      const origin = upper[originIdx];
      const beforeOriginTimes = legTokens.slice(0, originIdx).filter(isAimsTime).map(cleanTime);
      if (!beforeOriginTimes.length) continue;
      const departureTime = beforeOriginTimes[beforeOriginTimes.length - 1];
      const reportCandidate = beforeOriginTimes.length >= 2 ? beforeOriginTimes[0] : null;
      for (let b = a + 1; b < airportIndexes.length; b++) {
        const destIdx = airportIndexes[b];
        const destination = upper[destIdx];
        if (!destination || destination === origin) continue;
        const afterDestTimes = legTokens.slice(destIdx + 1).filter(isAimsTime).map(cleanTime);
        if (!afterDestTimes.length) continue;
        const arrivalTime = afterDestTimes[0];
        const duration = diffHours(departureTime, arrivalTime);
        if (duration < 0.15 || duration > 8.5) continue;
        const score = 100 - Math.abs(duration - 1.8) * 6 - Math.abs(destIdx - originIdx - 1);
        if (!best || score > best.score) best = { originIdx, destIdx, dep: departureTime, arrRaw: arrivalTime, report: reportCandidate, score };
      }
    }

    if (!best) return { leg: null, reportCandidate: null, debriefCandidate: null };
    const origin = upper[best.originIdx];
    const destination = upper[best.destIdx];
    const afterDestTimes = legTokens.slice(best.destIdx + 1).filter(isAimsTime).map(cleanTime);
    const debriefCandidate = afterDestTimes.length >= 2 ? afterDestTimes[afterDestTimes.length - 1] : null;
    const workType = (forcedWorkType || (hasExtraMarker ? 'PS' : 'OP')).toUpperCase();
    const arrClean = best.arrRaw.replace('(+1)', '');
    const nextDay = /\(\+1\)/.test(best.arrRaw) || minutesOfDay(best.arrRaw) < minutesOfDay(best.dep);
    const durationHours = diffHours(best.dep, best.arrRaw);
    const leg: FlightLeg = {
      flightNumber,
      origin,
      destination,
      departureTime: best.dep,
      arrivalTime: arrClean,
      workType,
      aircraftType: aircraftFrom(legTokens),
      isNextDay: nextDay,
      duration: durationHours,
    };
    return { leg, reportCandidate: best.report, debriefCandidate };
  }

  while (i < source.length) {
    const token = source[i];
    const upper = String(token || '').toUpperCase();

    if (isExtraAimsMarker(token)) {
      pendingWorkType = 'PS';
      i++;
      continue;
    }

    if (nextFlightStartsAt(i)) {
      const flightNum = `LA${source[i + 1]}`;
      i += 2;
      const legTokens: string[] = [];
      while (i < source.length) {
        if (nextFlightStartsAt(i)) break;
        // [extra] immediately before the next LA belongs to the next leg, not the current leg.
        if (isExtraAimsMarker(source[i]) && String(source[i + 1] || '').toUpperCase() === 'LA') break;
        if (String(source[i] || '').startsWith('(...)')) {
          legTokens.push(source[i]);
          i++;
          if (i < source.length && /^[A-Z]{3}$/.test(String(source[i] || '').toUpperCase())) hotel = String(source[i]).toUpperCase();
          break;
        }
        legTokens.push(source[i]);
        i++;
      }

      const parsed = parseLegTokens(flightNum, legTokens, pendingWorkType);
      pendingWorkType = null;
      if (parsed.leg) {
        if (!firstReportTime) firstReportTime = parsed.reportCandidate || parsed.leg.departureTime;
        if (parsed.leg.duration) totalFlyingMin += Math.round(parsed.leg.duration * 60);
        lastArrivalTime = parsed.leg.arrivalTime || lastArrivalTime;
        if (parsed.debriefCandidate && legs.length >= 0) explicitDebriefTime = parsed.debriefCandidate;
        if (parsed.leg.isNextDay) isNextDay = true;
        legs.push(parsed.leg);
      }
      continue;
    }

    if (upper.startsWith('(...)')) {
      if (i + 1 < source.length && /^[A-Z]{3}$/.test(String(source[i + 1] || '').toUpperCase())) hotel = String(source[i + 1]).toUpperCase();
      break;
    }

    i++;
  }

  let dutyReport = firstReportTime;
  let dutyDebrief: string | null = explicitDebriefTime;
  if (!dutyDebrief && lastArrivalTime) {
    dutyDebrief = addClockMinutes(lastArrivalTime, 30);
    if (minutesOfDay(dutyDebrief) < minutesOfDay(lastArrivalTime)) isNextDay = true;
  }

  let dutyHours: number | null = null;
  if (dutyReport && dutyDebrief) dutyHours = diffHours(dutyReport, dutyDebrief);

  if (legs.length > 0 && legs[legs.length - 1].destination !== homeBase) hotel = legs[legs.length - 1].destination;
  const flyingHours = totalFlyingMin > 0 ? totalFlyingMin / 60 : null;

  return {
    type: 'VOO',
    pairingCode: legs.length > 0 ? legs[0].flightNumber : '',
    dutyReport,
    dutyDebrief,
    legs,
    dutyHours,
    flyingHours,
    isNextDay,
    hotel
  };
}
