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


const AIMS_HUMAN_AIRPORTS = new Set([
  'AAX','AEP','AFL','AJU','AMS','ARU','ASU','ATL','ATM','BCN','BEL','BOG','BOS','BPS','BRA','BSB','BVB','CAC','CAW','CCS','CDG','CFB','CGB','CGH','CKS','CLO','CMG','CNF','COR','CPT','CPV','CTG','CUN','CUR','CUZ','CWB','CXJ','DFW','DOH','DXB','EPA','ERM','EWR','EZE','FCO','FEC','FEN','FLL','FLN','FOR','FRA','GIG','GPB','GRU','GVR','GYE','GYN','HAV','IAH','IGU','IMP','IOS','IPN','IST','IZA','JDO','JFK','JIA','JJD','JJG','JNB','JOI','JPA','JPR','JTC','LAS','LAX','LAZ','LDB','LEC','LGW','LHR','LIM','LIS','LPB','MAB','MAD','MAO','MCO','MCP','MCZ','MDE','MDZ','MEA','MEX','MGF','MIA','MOC','MUC','MVD','MXP','NAT','NVT','OAL','OPO','OPS','ORD','ORY','PDP','PET','PFB','PIN','PMW','PNZ','POA','PPB','PTY','PUJ','PVH','QNS','RAO','RBR','REC','RIA','ROO','ROS','RVD','SCL','SDQ','SDU','SFO','SJK','SJO','SJP','SLZ','SSA','STM','TBT','TFF','THE','UDI','UIO','URG','VCP','VDC','VIX','VVI','XAP','ZRH'
]);

type AimsHumanLeg = {
  leg: FlightLeg;
  reportTime: string;
  debriefTime: string;
};

type AimsPhysicalLeg = AimsHumanLeg & {
  dateObj: Date;
  reportAbs: number;
  depAbs: number;
  arrAbs: number;
  debriefAbs: number;
  sourceDate: string;
};

function aimsHumanRosterLooksComplete(roster: CrewRoster): boolean {
  const days = roster.days || [];
  const flightDays = days.filter((day) => day.type === 'VOO' && (day.legs || []).length > 0).length;
  const groundDays = days.filter((day) => ['ASB','HSB','HSBE','CRM'].includes(day.type)).length;
  const restDays = days.filter((day) => isAimsRestType(day.type)).length;
  return days.length >= 10 && flightDays >= 5 && (groundDays + restDays) >= 3;
}

function parseAimsRosterHumanText(fullText: string): CrewRoster | null {
  const headerMatch = String(fullText || '').match(/Tripulante\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{3,}?)(?:\s*-\s*)?BP\s*:?\s*(\d+)(?:\s*-\s*)?Base\s*:?\s*([A-Z]{3})(?:\s*-\s*)?(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!headerMatch) return null;

  const crewName = cleanAimsCrewName(headerMatch[1]);
  const crewId = headerMatch[2];
  const base = headerMatch[3].toUpperCase();
  const month = Number(headerMatch[5]);
  const year = Number(headerMatch[6]);
  const rosterOnly = String(fullText || '').split(/\n\s*Tripula(?:ç|c)[oõ]es\b/i)[0];
  const content = rosterOnly
    .replace(/\r/g, '\n')
    .replace(/Confira na escala publicada pela empresa[^\n]*\n/gi, '\n')
    .replace(/Escala de Tripulante Convertida[^\n]*\n/gi, '\n')
    .replace(/Tripulante:[^\n]*\n/gi, '\n')
    .replace(/Timezone[^\n]*/gi, '\n');

  const markerRegex = /\b(\d{2})(Jan|Feb|Mar|Apr|May|Mai|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Ago|Set|Out|Dez)\b/gi;
  const markers: Array<{ marker: string; pos: number; day: number; month: number; year: number }> = [];
  let markerMatch: RegExpExecArray | null;
  while ((markerMatch = markerRegex.exec(content)) !== null) {
    const parsed = parseAimsDateMarker(`${markerMatch[1]}${markerMatch[2]}`, month, year);
    if (!parsed) continue;
    markers.push({ marker: markerMatch[0], pos: markerMatch.index, day: parsed.day, month: parsed.month, year: parsed.year });
  }
  if (markers.length < 5) return null;

  const days: RosterDay[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    const start = marker.pos + marker.marker.length;
    const end = i + 1 < markers.length ? markers[i + 1].pos : content.length;
    const rawBlock = content.slice(start, end).trim();
    const dateObj = new Date(marker.year, marker.month - 1, marker.day);
    const date = formatAimsHumanDate(dateObj);
    const dayOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dateObj.getDay()];
    const tokens = rawBlock
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => !WEEKDAY_TOKENS.has(token.toUpperCase()));
    const parsedDays = parseAimsHumanBlock(tokens, { date, dayOfWeek, dateObj, base, rawBlock });
    days.push(...parsedDays);
  }

  const uniqueDays = dedupeAimsHumanDays(days).sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date) || (a.dutyReport ? minutesOfDay(a.dutyReport) : 9999) - (b.dutyReport ? minutesOfDay(b.dutyReport) : 9999));
  const crewRecords = parseTripulationRecords(fullText, crewName, year);
  const daysWithCrew = applyTripulationRecords(uniqueDays, crewRecords, crewName);
  const roster: CrewRoster = { crewName, crewId, base, rank: 'CCM', month, year, days: daysWithCrew, rawText: fullText };
  return reconcileAimsPhysicalTimelineFromText(roster, fullText);
}

function parseAimsHumanBlock(tokens: string[], context: { date: string; dayOfWeek: string; dateObj: Date; base: string; rawBlock: string }): RosterDay[] {
  const upper = tokens.map((token) => token.toUpperCase());
  const firstLa = upper.findIndex((token, index) => token === 'LA' && /^\d{3,4}$/.test(upper[index + 1] || ''));
  if (firstLa >= 0) return buildAimsHumanFlightDays(tokens, context);

  const firstOperational = upper.findIndex((token) => /^(ASB|RES|HSB|HSBE|RCFI|CRM|CRMB|CRMBSB|CBF|EMER|MT|C\d{2,3}F)$/.test(token));
  if (firstOperational >= 0) {
    const code = upper[firstOperational];
    const own = tokens.slice(firstOperational);
    const parsed = code === 'ASB' || code === 'RES'
      ? parseASB(own)
      : code === 'HSB' || code === 'HSBE'
        ? parseStandby(own, code === 'HSBE' ? 'HSBE' : 'HSB')
        : parseGroundActivity(own, code);
    return [makeAimsHumanRosterDay(context, parsed, context.rawBlock)];
  }

  const restIndex = upper.findIndex((token) => isAimsRestCode(token));
  if (restIndex >= 0) {
    const code = upper[restIndex];
    const type = code === 'DOF' ? 'DOF' : code === 'DR' ? 'DR' : code === 'OFF' ? 'OFF' : 'DO';
    return [makeAimsHumanRosterDay(context, { type, pairingCode: code, dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null }, context.rawBlock)];
  }

  return [makeAimsHumanRosterDay(context, { type: 'OTHER', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: null, flyingHours: null, isNextDay: false, hotel: null }, context.rawBlock)];
}

function buildAimsHumanFlightDays(tokens: string[], context: { date: string; dayOfWeek: string; dateObj: Date; base: string; rawBlock: string }): RosterDay[] {
  const humanLegs = parseAimsHumanLegs(tokens, context.base);
  if (!humanLegs.length) return [makeAimsHumanRosterDay(context, parseFlightDay(tokens, context.base, /\(\.\.\.\)/.test(context.rawBlock)), context.rawBlock)];

  type Group = { legs: AimsHumanLeg[]; startAbs: number; endAbs: number; rawStartDate: Date };
  const groups: Group[] = [];
  let current: Group | null = null;
  let floor = 0;
  for (const humanLeg of humanLegs) {
    const depAbs = normalizeAimsHumanForward(minutesOfDay(humanLeg.leg.departureTime), floor);
    const reportBase = minutesOfDay(humanLeg.reportTime || humanLeg.leg.departureTime);
    let reportAbs = normalizeAimsHumanForward(reportBase, Math.max(0, depAbs - 6 * 60));
    while (reportAbs > depAbs) reportAbs -= 1440;
    const arrAbs = normalizeAimsHumanForward(minutesOfDay(humanLeg.leg.arrivalTime), depAbs + 15);
    const debriefAbs = humanLeg.debriefTime ? normalizeAimsHumanForward(minutesOfDay(humanLeg.debriefTime), arrAbs) : arrAbs + 30;
    const enriched: AimsHumanLeg = {
      ...humanLeg,
      leg: {
        ...humanLeg.leg,
        isNextDay: arrAbs >= 1440 || arrAbs < depAbs,
        duration: Math.round(((arrAbs - depAbs) / 60) * 100) / 100,
      },
    };
    if (current) {
      const gapMinutes = reportAbs - current.endAbs;
      const prevDest = current.legs[current.legs.length - 1]?.leg.destination;
      const sameStation = prevDest && prevDest === humanLeg.leg.origin;
      // Se houve pelo menos 12h entre fim da jornada e nova apresentação, é nova jornada.
      // Isso corrige os falsos blocos de 20h+ e impede “pernoite” entre pernas com menos de 12h.
      if (gapMinutes >= 12 * 60 && sameStation) {
        groups.push(current);
        current = { legs: [enriched], startAbs: reportAbs, endAbs: debriefAbs, rawStartDate: addAimsHumanDays(context.dateObj, Math.floor(reportAbs / 1440)) };
      } else {
        current.legs.push(enriched);
        current.endAbs = Math.max(current.endAbs, debriefAbs);
      }
    } else {
      current = { legs: [enriched], startAbs: reportAbs, endAbs: debriefAbs, rawStartDate: addAimsHumanDays(context.dateObj, Math.floor(reportAbs / 1440)) };
    }
    floor = Math.max(floor, debriefAbs);
  }
  if (current) groups.push(current);

  return groups.map((group) => {
    const startDate = group.rawStartDate;
    const date = formatAimsHumanDate(startDate);
    const dayOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][startDate.getDay()];
    const first = group.legs[0];
    const last = group.legs[group.legs.length - 1];
    const legs = group.legs.map((item) => item.leg);
    const flyingHours = Math.round(legs.reduce((sum, leg) => sum + (Number(leg.duration) || diffHours(leg.departureTime, leg.arrivalTime)), 0) * 100) / 100;
    const dutyHours = Math.round(((group.endAbs - group.startAbs) / 60) * 100) / 100;
    const parsed: ParsedDay = {
      type: 'VOO',
      pairingCode: first.leg.flightNumber,
      dutyReport: minutesToAimsHumanClock(group.startAbs),
      dutyDebrief: minutesToAimsHumanClock(group.endAbs),
      legs,
      dutyHours,
      flyingHours,
      isNextDay: group.endAbs >= 1440 || minutesToAimsHumanClock(group.endAbs) <= minutesToAimsHumanClock(group.startAbs),
      hotel: last.leg.destination && last.leg.destination !== context.base ? last.leg.destination : null,
    };
    return makeAimsHumanRosterDay({ ...context, date, dayOfWeek, dateObj: startDate }, parsed, context.rawBlock);
  });
}

function parseAimsHumanLegs(tokens: string[], homeBase: string): AimsHumanLeg[] {
  const source = tokens.map((token) => String(token || '').trim()).filter(Boolean);
  const legs: AimsHumanLeg[] = [];
  let pendingWorkType: string | null = null;
  for (let i = 0; i < source.length; i += 1) {
    if (isExtraAimsMarker(source[i])) {
      pendingWorkType = 'PS';
      continue;
    }
    if (source[i].toUpperCase() !== 'LA' || !/^\d{3,4}$/.test(source[i + 1] || '')) continue;
    const flightNumber = `LA${source[i + 1]}`;
    i += 2;
    const legTokens: string[] = [];
    while (i < source.length) {
      if (source[i].toUpperCase() === 'LA' && /^\d{3,4}$/.test(source[i + 1] || '')) { i -= 1; break; }
      if (isExtraAimsMarker(source[i]) && source[i + 1]?.toUpperCase() === 'LA') { i -= 1; break; }
      legTokens.push(source[i]);
      i += 1;
    }
    const parsed = parseOneAimsHumanLeg(flightNumber, legTokens, pendingWorkType, homeBase);
    pendingWorkType = null;
    if (parsed) legs.push(parsed);
  }
  return legs;
}

function parseOneAimsHumanLeg(flightNumber: string, tokens: string[], forcedWorkType: string | null, homeBase: string): AimsHumanLeg | null {
  const cleanTokens = tokens.filter((token) => !isExtraAimsMarker(token));
  const upper = cleanTokens.map((token) => token.toUpperCase().replace(/[^A-Z0-9:+]/g, ''));
  const airportIndexes: number[] = [];
  for (let i = 0; i < upper.length; i += 1) if (isAimsHumanAirport(upper[i], homeBase)) airportIndexes.push(i);
  if (airportIndexes.length < 2) return null;
  const originIdx = airportIndexes[0];
  const destIdx = airportIndexes.find((idx) => idx > originIdx) ?? -1;
  if (destIdx < 0) return null;
  const origin = upper[originIdx];
  const destination = upper[destIdx];
  if (!origin || !destination || origin === destination) return null;

  const timeItems = cleanTokens
    .map((token, idx) => ({ token: normalizeSimpleTime(token), raw: token, idx }))
    .filter((item) => /^\d{1,2}:\d{2}(?:\(\+1\))?$/.test(String(item.raw || '')) || /^\d{2}:\d{2}$/.test(item.token));
  const beforeOrigin = timeItems.filter((item) => item.idx < originIdx).map((item) => item.token);
  const afterDest = timeItems.filter((item) => item.idx > destIdx).map((item) => item.token);
  if (!beforeOrigin.length || !afterDest.length) return null;

  const departureTime = beforeOrigin[beforeOrigin.length - 1];
  const reportTime = beforeOrigin.length >= 2 ? beforeOrigin[0] : departureTime;
  const arrivalTime = afterDest[0];
  const debriefTime = afterDest.length >= 2 ? afterDest[afterDest.length - 1] : addClockMinutes(arrivalTime, 30);
  const duration = diffHours(departureTime, arrivalTime);
  if (!Number.isFinite(duration) || duration < 0.15 || duration > 8.5) return null;

  return {
    reportTime,
    debriefTime,
    leg: {
      flightNumber,
      origin,
      destination,
      departureTime,
      arrivalTime,
      workType: (forcedWorkType || (tokens.some((token) => isExtraAimsMarker(token)) ? 'PS' : 'OP')).toUpperCase(),
      aircraftType: cleanTokens.map((token) => token.toUpperCase()).find((token) => /^\(?(?:32S|31R|39R|328|319|320|321|32N|767|777|789|788|350|359)\)?$/.test(token))?.replace(/[()]/g, ''),
      isNextDay: minutesOfDay(arrivalTime) < minutesOfDay(departureTime),
      duration: Math.round(duration * 100) / 100,
      // Só há apresentação publicada quando a fonte traz um horário ANTES da
      // decolagem. Com um único horário, `reportTime` é a própria decolagem e
      // não pode ser tratado como início de jornada (#512).
      presentationTime: beforeOrigin.length >= 2 ? reportTime : undefined,
    },
  };
}

function isAimsHumanAirport(value: string, homeBase: string): boolean {
  const clean = String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!clean || clean === homeBase) return clean === homeBase;
  if (AIMS_HUMAN_AIRPORTS.has(clean)) return true;
  return /^[A-Z]{3}$/.test(clean) && !/^(LA|OP|PS|DH|PAX|EXTRA|DO|DOF|DR|OFF|ASB|HSB|HSBE|CRM|RCFI|RES)$/.test(clean) && !isKnownRosterCode(clean);
}

function makeAimsHumanRosterDay(context: { date: string; dayOfWeek: string; dateObj: Date; base: string; rawBlock: string }, parsed: ParsedDay, rawText: string): RosterDay {
  return {
    date: context.date,
    dayNumber: context.dateObj.getDate(),
    month: context.dateObj.getMonth() + 1,
    year: context.dateObj.getFullYear(),
    dayOfWeek: context.dayOfWeek,
    type: parsed.type,
    pairingCode: parsed.pairingCode,
    dutyReport: parsed.dutyReport,
    dutyDebrief: parsed.dutyDebrief,
    legs: parsed.legs,
    dutyHours: parsed.dutyHours,
    flyingHours: parsed.flyingHours,
    isNextDay: parsed.isNextDay,
    hotel: parsed.hotel,
    base: context.base,
    rawText,
  };
}

function dedupeAimsHumanDays(days: RosterDay[]): RosterDay[] {
  const seen = new Set<string>();
  const output: RosterDay[] = [];
  for (const day of days) {
    const legsKey = (day.legs || []).map((leg) => `${leg.flightNumber}:${leg.origin}-${leg.destination}:${leg.departureTime}-${leg.arrivalTime}`).join('|');
    const key = `${day.date}|${day.type}|${day.dutyReport || ''}|${day.dutyDebrief || ''}|${legsKey}|${day.pairingCode || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(day);
  }
  return output;
}

function normalizeAimsHumanForward(clockMinutes: number, minimum: number): number {
  let value = clockMinutes;
  while (value < minimum) value += 1440;
  return value;
}

function minutesToAimsHumanClock(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function addAimsHumanDays(date: Date, days: number): Date {
  const output = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  output.setDate(output.getDate() + days);
  return output;
}

function formatAimsHumanDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}


function reconcileAimsPhysicalTimelineFromText(roster: CrewRoster, fullText: string): CrewRoster {
  const physicalLegs = extractAimsPhysicalLegs(fullText, roster.base || 'BSB', roster.month, roster.year);
  if (physicalLegs.length < 8) return roster;

  const flightDays = buildAimsPhysicalFlightDays(physicalLegs, roster);
  if (flightDays.length < 5) return roster;

  const originalNonFlights = (roster.days || []).filter((day) => {
    if (!day || day.type === 'VOO' || day.type === 'LAYOVER') return false;
    if (day.type === 'OTHER' && !day.dutyReport && !day.dutyDebrief && !(day.legs || []).length && !day.pairingCode) return false;
    return true;
  });

  const merged = dedupeAimsOperationalDays([...originalNonFlights, ...flightDays]).sort(compareAimsOperationalDays);
  return { ...roster, days: merged, rawText: roster.rawText || fullText };
}

function extractAimsPhysicalLegs(fullText: string, homeBase: string, rosterMonth: number, rosterYear: number): AimsPhysicalLeg[] {
  const rosterOnly = String(fullText || '').split(/\n\s*Tripula(?:ç|c)[oõ]es\b/i)[0];
  const content = rosterOnly
    .replace(/\r/g, '\n')
    .replace(/Confira na escala publicada pela empresa[^\n]*\n/gi, '\n')
    .replace(/Escala de Tripulante Convertida[^\n]*\n/gi, '\n')
    .replace(/Tripulante:[^\n]*\n/gi, '\n')
    .replace(/Timezone[^\n]*/gi, '\n');
  const tokens = content.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  const legs: AimsPhysicalLeg[] = [];
  let currentDate: Date | null = null;
  let pendingWorkType: string | null = null;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const markerDate = parseAimsPhysicalDateToken(token, rosterMonth, rosterYear);
    if (markerDate) {
      currentDate = markerDate;
      continue;
    }
    if (WEEKDAY_TOKENS.has(token.toUpperCase())) continue;
    if (isExtraAimsMarker(token)) {
      pendingWorkType = 'PS';
      continue;
    }
    if (!currentDate || token.toUpperCase() !== 'LA' || !/^\d{3,4}$/.test(tokens[i + 1] || '')) continue;

    const flightNumber = `LA${tokens[i + 1]}`;
    const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    const legTokens: string[] = [];
    let lastDateInside: Date | null = null;
    let j = i + 2;
    while (j < tokens.length) {
      const candidate = tokens[j];
      const nextIsFlight = candidate.toUpperCase() === 'LA' && /^\d{3,4}$/.test(tokens[j + 1] || '');
      if (nextIsFlight) break;

      const dateInside = parseAimsPhysicalDateToken(candidate, rosterMonth, rosterYear);
      if (dateInside) {
        if (aimsPhysicalSegmentLooksComplete(legTokens, homeBase)) break;
        lastDateInside = dateInside;
        legTokens.push(candidate);
        j += 1;
        continue;
      }

      const boundary = isActivityBoundaryToken(candidate.toUpperCase()) && !candidate.startsWith('(...)') && !isExtraAimsMarker(candidate);
      if (boundary && aimsPhysicalSegmentLooksComplete(legTokens, homeBase)) break;
      legTokens.push(candidate);
      j += 1;
    }

    const sanitized = sanitizeAimsPhysicalLegTokens(legTokens);
    const parsed = parseOneAimsHumanLeg(flightNumber, sanitized, pendingWorkType, homeBase);
    pendingWorkType = null;
    if (parsed?.leg) {
      const withAbs = attachAimsPhysicalAbs(parsed, startDate);
      if (withAbs) legs.push(withAbs);
    }
    if (lastDateInside) currentDate = lastDateInside;
    i = Math.max(i + 1, j - 1);
  }

  return legs
    .filter((item) => isCredibleAimsLeg(item.leg))
    .sort((a, b) => a.depAbs - b.depAbs || a.arrAbs - b.arrAbs);
}

function parseAimsPhysicalDateToken(token: string, rosterMonth: number, rosterYear: number): Date | null {
  const match = String(token || '').match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Mai|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Ago|Set|Out|Dez)$/i);
  if (!match) return null;
  const parsed = parseAimsDateMarker(`${match[1]}${match[2]}`, rosterMonth, rosterYear);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day);
}

function sanitizeAimsPhysicalLegTokens(tokens: string[]): string[] {
  return tokens
    .filter((token) => !parseAimsPhysicalDateToken(token, 1, 2026))
    .filter((token) => !WEEKDAY_TOKENS.has(token.toUpperCase()))
    .filter((token) => !FOOTER_TOKENS.some((footer) => token.toUpperCase().includes(footer)))
    .filter(Boolean);
}

function aimsPhysicalSegmentLooksComplete(tokens: string[], homeBase: string): boolean {
  if (tokens.length < 5) return false;
  return Boolean(parseOneAimsHumanLeg('LA0000', sanitizeAimsPhysicalLegTokens(tokens), null, homeBase)?.leg);
}

function attachAimsPhysicalAbs(item: AimsHumanLeg, dateObj: Date): AimsPhysicalLeg | null {
  const dayAbs = aimsPhysicalDaySerial(dateObj) * 1440;
  const depAbs = dayAbs + minutesOfDay(item.leg.departureTime);
  let reportAbs = dayAbs + minutesOfDay(item.reportTime || item.leg.departureTime);
  if (reportAbs > depAbs) reportAbs -= 1440;
  let arrAbs = dayAbs + minutesOfDay(item.leg.arrivalTime);
  while (arrAbs < depAbs + 15) arrAbs += 1440;
  let debriefAbs = dayAbs + minutesOfDay(item.debriefTime || addClockMinutes(item.leg.arrivalTime, 30));
  while (debriefAbs < arrAbs) debriefAbs += 1440;
  const duration = Math.round(((arrAbs - depAbs) / 60) * 100) / 100;
  if (!Number.isFinite(duration) || duration < 0.15 || duration > 8.5) return null;
  return {
    ...item,
    dateObj,
    reportAbs,
    depAbs,
    arrAbs,
    debriefAbs,
    sourceDate: formatAimsHumanDate(dateObj),
    leg: {
      ...item.leg,
      isNextDay: arrAbs >= dayAbs + 1440 || arrAbs < depAbs,
      duration,
    },
  };
}

function buildAimsPhysicalFlightDays(legs: AimsPhysicalLeg[], roster: CrewRoster): RosterDay[] {
  type Group = { legs: AimsPhysicalLeg[]; startAbs: number; endAbs: number; continuityNotes: string[] };
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const item of legs) {
    if (!current) {
      current = { legs: [item], startAbs: item.reportAbs, endAbs: item.debriefAbs, continuityNotes: [] };
      continue;
    }
    const prev = current.legs[current.legs.length - 1];
    const prevDest = prev.leg.destination;
    const nextOrigin = item.leg.origin;
    const sameStation = Boolean(prevDest && nextOrigin && prevDest === nextOrigin);
    const gap = item.reportAbs - current.endAbs;

    if (sameStation && gap >= 12 * 60) {
      current.continuityNotes.push(`Pernoite/pernoite diurno em ${prevDest}: ${formatAimsDurationMinutes(gap)} entre programações.`);
      groups.push(current);
      current = { legs: [item], startAbs: item.reportAbs, endAbs: item.debriefAbs, continuityNotes: [] };
      continue;
    }

    if (!sameStation && gap >= 180) {
      current.continuityNotes.push(`Atenção: próxima origem ${nextOrigin} diferente da última chegada ${prevDest}. Mantive separado para evitar teletransporte na escala.`);
      groups.push(current);
      current = { legs: [item], startAbs: item.reportAbs, endAbs: item.debriefAbs, continuityNotes: [] };
      continue;
    }

    current.legs.push(item);
    current.endAbs = Math.max(current.endAbs, item.debriefAbs);
    if (!sameStation) current.continuityNotes.push(`Conexão física divergente: ${prevDest || '?'} → ${nextOrigin || '?'}.`);
  }
  if (current) groups.push(current);

  return groups.map((group) => makeAimsPhysicalFlightDay(group, roster));
}

function makeAimsPhysicalFlightDay(group: { legs: AimsPhysicalLeg[]; startAbs: number; endAbs: number; continuityNotes: string[] }, roster: CrewRoster): RosterDay {
  const first = group.legs[0];
  const last = group.legs[group.legs.length - 1];
  const startDate = dateFromAimsPhysicalAbs(group.startAbs);
  const date = formatAimsHumanDate(startDate);
  const dayOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][startDate.getDay()];
  const plainLegs = group.legs.map((item) => item.leg);
  const flyingHours = Math.round(plainLegs.reduce((sum, leg) => sum + (Number(leg.duration) || diffHours(leg.departureTime, leg.arrivalTime)), 0) * 100) / 100;
  const dutyHours = Math.round(((group.endAbs - group.startAbs) / 60) * 100) / 100;
  const startClock = minutesToAimsHumanClock(group.startAbs);
  const endClock = minutesToAimsHumanClock(group.endAbs);
  const path = plainLegs.map((leg) => `${leg.flightNumber} ${leg.origin}-${leg.destination}`).join(', ');
  const rawText = [
    `CrewCheck v11.1.85: timeline física por continuidade aeroportuária. ${path}`,
    ...group.continuityNotes,
  ].join(' | ');
  return {
    date,
    dayNumber: startDate.getDate(),
    month: startDate.getMonth() + 1,
    year: startDate.getFullYear(),
    dayOfWeek,
    type: 'VOO',
    pairingCode: first.leg.flightNumber,
    dutyReport: startClock,
    dutyDebrief: endClock,
    legs: plainLegs,
    dutyHours,
    flyingHours,
    isNextDay: Math.floor(group.endAbs / 1440) !== Math.floor(group.startAbs / 1440) || endClock <= startClock,
    hotel: last.leg.destination && last.leg.destination !== roster.base ? last.leg.destination : null,
    base: roster.base,
    rawText,
  };
}

function aimsPhysicalDaySerial(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000);
}

function dateFromAimsPhysicalAbs(absMinutes: number): Date {
  return new Date(Math.floor(absMinutes / 1440) * 86400000);
}

function compareAimsOperationalDays(a: RosterDay, b: RosterDay): number {
  const dateDiff = parseDateForSort(a.date) - parseDateForSort(b.date);
  if (dateDiff !== 0) return dateDiff;
  const ta = a.dutyReport ? minutesOfDay(a.dutyReport) : 9999;
  const tb = b.dutyReport ? minutesOfDay(b.dutyReport) : 9999;
  if (ta !== tb) return ta - tb;
  return humanAimsDayPriority(b) - humanAimsDayPriority(a);
}

function dedupeAimsOperationalDays(days: RosterDay[]): RosterDay[] {
  const seen = new Set<string>();
  const output: RosterDay[] = [];
  for (const day of days) {
    const legsKey = (day.legs || []).map((leg) => `${leg.flightNumber}:${leg.origin}-${leg.destination}:${leg.departureTime}-${leg.arrivalTime}`).join('|');
    const key = `${day.date}|${day.type}|${day.dutyReport || ''}|${day.dutyDebrief || ''}|${day.pairingCode || ''}|${legsKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(day);
  }
  return output;
}

function formatAimsDurationMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function parseAimsRoster(fullText: string, visualRows?: AimsVisualRow[]): CrewRoster {
  const visualParsed = visualRows?.length ? parseAimsRosterFromVisualRows(fullText, visualRows) : null;
  const humanTextParsed = parseAimsRosterHumanText(fullText);
  const legacyParsed = parseAimsRosterLegacy(fullText);

  // v11.1.97: para PDF AIMS em matriz, a leitura visual por coluna é a fonte
  // canônica. A leitura textual linearizada pode atravessar colunas e gerar
  // jornadas absurdas/teletransporte. Usamos texto/legacy só para completar
  // lacunas reais, nunca para substituir uma coluna visual confiável.
  if (aimsVisualRosterLooksReliable(visualParsed)) {
    const secondary = humanTextParsed?.days?.length ? humanTextParsed : legacyParsed;
    const merged = mergeAimsParsedRosters(visualParsed as CrewRoster, secondary);
    return humanReviewAimsRoster(merged);
  }

  if (humanTextParsed && aimsHumanRosterLooksComplete(humanTextParsed)) {
    return humanReviewAimsRoster(humanTextParsed);
  }

  const merged = visualParsed?.days?.length ? mergeAimsParsedRosters(visualParsed, legacyParsed) : legacyParsed;
  return humanReviewAimsRoster(merged);
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

  const columns = buildAimsVisualColumns(header, allItems, dateItems);
  if (columns.length < 3) return null;

  const stitchedColumns = stitchAimsOvernightColumnContinuations(columns);
  const days: RosterDay[] = [];

  for (const column of stitchedColumns) {
    const parsedDays = parseAimsVisualColumnDays(column.tokens, {
      date: column.date,
      dayOfWeek: column.dayOfWeek,
      dateObj: column.dateObj,
      base: header.base,
      rawBlock: column.tokens.join(' '),
    });
    for (const day of parsedDays) {
      if (!day?.date || isAimsDaySuspicious(day)) continue;
      days.push(day);
    }
  }

  const rescuedDays = rescueAimsAtomicFlightsFromColumns(rescueAimsColumnContinuationFlights(days, columns, header), columns, header);
  const uniqueDays = dedupeAimsOperationalDays(rescuedDays).sort(compareAimsOperationalDays);
  const crewRecords = parseTripulationRecords(fullText, header.crewName, header.year);
  const daysWithCrew = applyTripulationRecords(uniqueDays, crewRecords, header.crewName);

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

type AimsVisualColumn = {
  page: number;
  markerX: number;
  date: string;
  dateObj: Date;
  dayOfWeek: string;
  tokens: string[];
};

function buildAimsVisualColumns(
  header: { base: string; month: number; year: number },
  allItems: Array<AimsVisualItem & { width?: number }>,
  dateItems: Array<{ item: AimsVisualItem & { width?: number }; marker: { day: number; month: number; year: number; token: string } }>,
): AimsVisualColumn[] {
  const byPage = new Map<number, typeof dateItems>();
  dateItems.forEach(entry => {
    const arr = byPage.get(entry.item.page) || [];
    arr.push(entry);
    byPage.set(entry.item.page, arr);
  });

  const columns: AimsVisualColumn[] = [];
  for (const [page, markers] of byPage.entries()) {
    const sorted = markers.sort((a, b) => a.item.x - b.item.x);
    const pageItems = allItems.filter(item => item.page === page);

    sorted.forEach((entry, index) => {
      const prev = sorted[index - 1];
      const next = sorted[index + 1];
      const left = prev ? (prev.item.x + entry.item.x) / 2 : entry.item.x - 999;
      const right = next ? (entry.item.x + next.item.x) / 2 : entry.item.x + 999;
      const topY = entry.item.y;

      if (!isPublishedAimsContextMonth(entry.marker.month, entry.marker.year, header.month, header.year)) return;

      const columnItems = pageItems
        .filter(item => item !== entry.item)
        .filter(item => {
          const centerX = getAimsItemCenterX(item);
          return centerX >= left && centerX < right;
        })
        .filter(item => item.y < topY - 1)
        .filter(item => !shouldIgnoreAimsItem(item.str))
        .sort((a, b) => {
          const dy = b.y - a.y;
          if (Math.abs(dy) > 2) return dy;
          return a.x - b.x;
        });

      const tokens = columnItems
        .flatMap(item => splitAimsVisualToken(item.str))
        .map(t => t.trim())
        .filter(Boolean)
        .filter(t => !shouldIgnoreAimsItem(t));

      const dateObj = new Date(entry.marker.year, entry.marker.month - 1, entry.marker.day);
      columns.push({
        page,
        markerX: entry.item.x,
        date: `${String(entry.marker.day).padStart(2, '0')}/${String(entry.marker.month).padStart(2, '0')}/${entry.marker.year}`,
        dateObj,
        dayOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dateObj.getDay()],
        tokens,
      });
    });
  }

  return columns.sort((a, b) => a.page - b.page || a.markerX - b.markerX);
}

function stitchAimsOvernightColumnContinuations(columns: AimsVisualColumn[]): AimsVisualColumn[] {
  const output = columns.map(column => ({ ...column, tokens: [...column.tokens] }));

  for (let i = 0; i < output.length - 1; i += 1) {
    const current = output[i];
    const next = output[i + 1];
    if (!current.tokens.length || !next.tokens.length) continue;
    const lastFlightStart = findLastAimsFlightStart(current.tokens);
    if (lastFlightStart < 0) continue;
    const lastFlightSegment = current.tokens.slice(lastFlightStart);
    if (!isIncompleteAimsFlightSegment(lastFlightSegment, current.tokens)) continue;

    const prefixEnd = findAimsContinuationPrefixEnd(next.tokens);
    if (prefixEnd <= 0) continue;
    const prefix = next.tokens.slice(0, prefixEnd);
    if (!prefixHasArrivalContinuation(prefix)) continue;

    current.tokens = [...current.tokens, ...prefix];
    next.tokens = next.tokens.slice(prefixEnd);
  }

  return output;
}


function rescueAimsColumnContinuationFlights(
  days: RosterDay[],
  columns: AimsVisualColumn[],
  header: { base: string; month: number; year: number },
): RosterDay[] {
  const output = [...days];
  const existing = new Set(output.flatMap(day => (day.legs || []).map(leg => aimsLegUniqueKey(day.date, leg))));

  for (let i = 0; i < columns.length - 1; i += 1) {
    const current = columns[i];
    const next = columns[i + 1];
    if (!current?.tokens?.length || !next?.tokens?.length) continue;
    const prefixEnd = findAimsContinuationPrefixEnd(next.tokens);
    if (prefixEnd <= 0) continue;
    const prefix = next.tokens.slice(0, prefixEnd);
    if (!prefixHasArrivalContinuation(prefix)) continue;

    const starts = findAllAimsFlightStarts(current.tokens);
    for (const start of starts) {
      const nextStart = starts.find(idx => idx > start) ?? current.tokens.length;
      const ownSegment = current.tokens.slice(start, nextStart);
      const ownText = ownSegment.join(' ');
      if (!/\(\.\.\.\)/.test(ownText) && parseAimsHumanLegs(ownSegment, header.base).length) continue;

      const combined = [...ownSegment, ...prefix];
      const parsedDays = buildAimsHumanFlightDays(combined, {
        date: current.date,
        dayOfWeek: current.dayOfWeek,
        dateObj: current.dateObj,
        base: header.base,
        rawBlock: combined.join(' '),
      });

      for (const parsedDay of parsedDays) {
        const validLegs = (parsedDay.legs || []).filter(isCredibleAimsLeg);
        if (!validLegs.length) continue;
        const hasContinuationLeg = validLegs.some(leg => /\(\.\.\.\)/.test(ownText) && minutesOfDay(leg.arrivalTime) <= 5 * 60);
        if (!hasContinuationLeg && !/\(\.\.\.\)/.test(ownText)) continue;
        const missingLegs = validLegs.filter(leg => !existing.has(aimsLegUniqueKey(parsedDay.date, leg)));
        if (!missingLegs.length) continue;
        const rescued: RosterDay = {
          ...parsedDay,
          legs: missingLegs,
          pairingCode: missingLegs[0]?.flightNumber || parsedDay.pairingCode,
          dutyReport: parsedDay.dutyReport || missingLegs[0]?.departureTime || null,
          dutyDebrief: parsedDay.dutyDebrief || addClockMinutes(missingLegs[missingLegs.length - 1]?.arrivalTime || '00:00', 30),
          flyingHours: Math.round(missingLegs.reduce((sum, leg) => sum + (Number(leg.duration) || diffHours(leg.departureTime, leg.arrivalTime)), 0) * 100) / 100,
          dutyHours: parsedDay.dutyReport && parsedDay.dutyDebrief ? diffHours(parsedDay.dutyReport, parsedDay.dutyDebrief) : parsedDay.dutyHours,
          rawText: [parsedDay.rawText, 'CrewCheck v11.1.100: voo noturno restaurado por continuidade de coluna AIMS.'].filter(Boolean).join(' | '),
        };
        output.push(rescued);
        missingLegs.forEach(leg => existing.add(aimsLegUniqueKey(rescued.date, leg)));
      }
    }
  }

  return output;
}

function rescueAimsAtomicFlightsFromColumns(
  days: RosterDay[],
  columns: AimsVisualColumn[],
  header: { base: string; month: number; year: number },
): RosterDay[] {
  const output = [...days];
  const existing = new Set(output.flatMap(day => (day.legs || []).map(leg => `${leg.flightNumber}|${leg.origin}|${leg.destination}|${leg.departureTime}|${leg.arrivalTime}`)));

  for (let i = 0; i < columns.length; i += 1) {
    const column = columns[i];
    const next = columns[i + 1];
    const starts = findAllAimsFlightStarts(column.tokens || []);
    for (const start of starts) {
      const nextStart = starts.find(idx => idx > start) ?? (column.tokens || []).length;
      let segment = (column.tokens || []).slice(start, nextStart);
      const parsedOwn = parseAimsHumanLegs(segment, header.base);
      if (!parsedOwn.length && next?.tokens?.length && /\(\.\.\.\)/.test(segment.join(' '))) {
        const prefixEnd = findAimsContinuationPrefixEnd(next.tokens);
        if (prefixEnd > 0) segment = [...segment, ...next.tokens.slice(0, prefixEnd)];
      }
      const parsedLegs = parseAimsHumanLegs(segment, header.base).filter(item => isCredibleAimsLeg(item.leg));
      for (const item of parsedLegs) {
        const leg = item.leg;
        const legKey = `${leg.flightNumber}|${leg.origin}|${leg.destination}|${leg.departureTime}|${leg.arrivalTime}`;
        if (existing.has(legKey)) continue;
        existing.add(legKey);
        const dutyReport = item.reportTime || leg.departureTime;
        const dutyDebrief = item.debriefTime || addClockMinutes(leg.arrivalTime, 30);
        output.push(makeAimsHumanRosterDay({
          date: column.date,
          dayOfWeek: column.dayOfWeek,
          dateObj: column.dateObj,
          base: header.base,
          rawBlock: [segment.join(' '), 'CrewCheck v11.1.100: voo atômico restaurado da coluna visual AIMS.'].join(' | '),
        }, {
          type: 'VOO',
          pairingCode: leg.flightNumber,
          dutyReport,
          dutyDebrief,
          legs: [leg],
          dutyHours: diffHours(dutyReport, dutyDebrief),
          flyingHours: Number(leg.duration) || diffHours(leg.departureTime, leg.arrivalTime),
          isNextDay: minutesOfDay(dutyDebrief) <= minutesOfDay(dutyReport) || Boolean(leg.isNextDay),
          hotel: leg.destination && leg.destination !== header.base ? leg.destination : null,
        }, segment.join(' ')));
      }
    }
  }

  return output;
}

function findAllAimsFlightStarts(tokens: string[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (String(tokens[i] || '').toUpperCase() === 'LA' && /^\d{3,4}$/.test(String(tokens[i + 1] || ''))) starts.push(i);
  }
  return starts;
}

function aimsLegUniqueKey(date: string, leg: FlightLeg): string {
  return `${date}|${leg.flightNumber}|${leg.origin}|${leg.destination}|${leg.departureTime}|${leg.arrivalTime}`;
}

function findLastAimsFlightStart(tokens: string[]): number {
  let last = -1;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (String(tokens[i] || '').toUpperCase() === 'LA' && /^\d{3,4}$/.test(String(tokens[i + 1] || ''))) last = i;
  }
  return last;
}

function isIncompleteAimsFlightSegment(segment: string[], fullTokens: string[]): boolean {
  if (segment.length < 4) return false;
  const airportCount = segment.filter(token => isAimsHumanAirport(token, '')).length;
  const timeCount = collectAllClockTokens(segment).length;
  const lastBoundaryAfterFlight = fullTokens.slice(findLastAimsFlightStart(fullTokens) + 2).some(token => isAimsVisualStandaloneBoundaryToken(token));
  return !lastBoundaryAfterFlight && (airportCount < 2 || timeCount < 3 || /\(\.\.\.\)/.test(segment.join(' ')));
}

function findAimsContinuationPrefixEnd(tokens: string[]): number {
  let end = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = String(tokens[i] || '').toUpperCase();
    const next = String(tokens[i + 1] || '').toUpperCase();
    if (token === 'LA' && /^\d{3,4}$/.test(next)) break;
    if (i > 0 && isAimsVisualStandaloneBoundaryToken(token)) break;
    end = i + 1;
  }
  return end;
}

function prefixHasArrivalContinuation(prefix: string[]): boolean {
  if (!prefix.length) return false;
  const airports = prefix.filter(token => isAimsHumanAirport(token, ''));
  const times = collectAllClockTokens(prefix);
  const hasAircraft = prefix.some(token => /^\(?(?:32S|31R|39R|328|319|320|321|32N|767|777|789|788|350|359)\)?$/i.test(token));
  return airports.length >= 1 && times.length >= 1 && (hasAircraft || /\(\.\.\.\)/.test(prefix.join(' ')) || times.some(time => minutesOfDay(time) <= 5 * 60));
}

function parseAimsVisualColumnDays(tokens: string[], context: { date: string; dayOfWeek: string; dateObj: Date; base: string; rawBlock: string }): RosterDay[] {
  const source = tokens
    .map(token => String(token || '').trim())
    .filter(Boolean)
    .filter(token => !WEEKDAY_TOKENS.has(token.toUpperCase()));

  if (!source.length) {
    return [makeAimsHumanRosterDay(context, { type: 'OTHER', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: null, flyingHours: null, isNextDay: false, hotel: null }, context.rawBlock)];
  }

  const output: RosterDay[] = [];
  let i = 0;
  while (i < source.length) {
    const token = String(source[i] || '').toUpperCase();
    const next = String(source[i + 1] || '').toUpperCase();

    if (token === 'LA' && /^\d{3,4}$/.test(next)) {
      const end = findAimsVisualFlightBlockEnd(source, i);
      const segment = source.slice(i, end);
      // v11.1.100: o bloco visual de uma coluna pode conter duas jornadas no mesmo dia
      // separadas por pernoite diurno/solo >=12h. parseFlightDay consolidava tudo em
      // um único ParsedDay e perdia a segunda perna quando a chegada estava costurada
      // no dia seguinte por "(...)". O motor canônico por pernas preserva todas as
      // pernas e divide em cards/jornadas somente após calcular a continuidade física.
      const parsedDays = buildAimsHumanFlightDays(segment, context);
      for (const parsedDay of parsedDays) {
        if (parsedDay.legs?.length) output.push(parsedDay);
      }
      i = Math.max(end, i + 2);
      continue;
    }

    if (isExtraAimsMarker(token) && source[i + 1]?.toUpperCase() === 'LA') {
      const end = findAimsVisualFlightBlockEnd(source, i);
      const segment = source.slice(i, end);
      const parsedDays = buildAimsHumanFlightDays(segment, context);
      for (const parsedDay of parsedDays) {
        if (parsedDay.legs?.length) output.push(parsedDay);
      }
      i = Math.max(end, i + 2);
      continue;
    }

    if (token === 'ASB' || token === 'RES') {
      const end = findAimsVisualActivityBlockEnd(source, i);
      const segment = source.slice(i, end);
      output.push(makeAimsHumanRosterDay(context, parseASB(segment), segment.join(' ')));
      i = Math.max(end, i + 1);
      continue;
    }

    if (token === 'HSB' || token === 'HSBE') {
      const end = findAimsVisualActivityBlockEnd(source, i);
      const segment = source.slice(i, end);
      output.push(makeAimsHumanRosterDay(context, parseStandby(segment, token === 'HSBE' ? 'HSBE' : 'HSB'), segment.join(' ')));
      i = Math.max(end, i + 1);
      continue;
    }

    if (/^(RCFI|CRMBSB|CRMB|CRM|CBF|EMER|MT|C\d{2,3}F)$/.test(token) || isKnownGroundActivity(token)) {
      const end = findAimsVisualActivityBlockEnd(source, i);
      const segment = source.slice(i, end);
      const parsed = /^C\d{2,3}F$/.test(token) || /^(RCFI|CRMBSB|CRMB|CRM|CBF|EMER|MT)$/.test(token)
        ? parseGroundActivity(segment, token)
        : parseGroundActivity(segment, token);
      output.push(makeAimsHumanRosterDay(context, parsed, segment.join(' ')));
      i = Math.max(end, i + 1);
      continue;
    }

    if (isAimsRestCode(token)) {
      const code = token;
      const type = code === 'DOF' ? 'DOF' : code === 'DR' ? 'DR' : code === 'OFF' ? 'OFF' : 'DO';
      output.push(makeAimsHumanRosterDay(context, { type, pairingCode: code, dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null }, code));
      i += 1;
      continue;
    }

    if (token === '(...)') {
      const laIdx = source.slice(i + 1).findIndex((item, localIdx) => String(item || '').toUpperCase() === 'LA' && /^\d{3,4}$/.test(String(source[i + 2 + localIdx] || '')));
      if (laIdx >= 0) {
        i = i + 1 + laIdx;
        continue;
      }
    }

    i += 1;
  }

  if (!output.length) {
    const parsed = parseDayContent(source.join('\n'), context.base);
    output.push(makeAimsHumanRosterDay(context, parsed, source.join(' ')));
  }

  return dedupeAimsOperationalDays(output);
}

function findAimsVisualFlightBlockEnd(tokens: string[], start: number): number {
  let i = start + 1;
  while (i < tokens.length) {
    const token = String(tokens[i] || '').toUpperCase();
    const next = String(tokens[i + 1] || '').toUpperCase();
    if (i > start && isAimsVisualStandaloneBoundaryToken(token)) break;
    if ((token === 'LA' && /^\d{3,4}$/.test(next)) || isExtraAimsMarker(token) || token === '(...)') {
      i += 1;
      continue;
    }
    i += 1;
  }
  return i;
}

function findAimsVisualActivityBlockEnd(tokens: string[], start: number): number {
  let i = start + 1;
  while (i < tokens.length) {
    const token = String(tokens[i] || '').toUpperCase();
    const next = String(tokens[i + 1] || '').toUpperCase();
    if (token === 'LA' && /^\d{3,4}$/.test(next)) break;
    if (i > start && isAimsVisualStandaloneBoundaryToken(token)) break;
    i += 1;
  }
  return i;
}

function isAimsVisualStandaloneBoundaryToken(token: string): boolean {
  const value = String(token || '').toUpperCase().trim();
  if (!value || isExtraAimsMarker(value)) return false;
  return /^(HSBE|HSB|ASB|RES|RCFI|CBF|EMER|CRMBSB|CRMB|CRM|MT|C\d{2,3}F|DOF?|DOPR?|DR|OFF|VC)$/.test(value)
    || (isKnownRosterCode(value) && value !== 'LA');
}

function aimsVisualRosterLooksReliable(roster: CrewRoster | null): boolean {
  const days = roster?.days || [];
  const flightLegs = days.reduce((sum, day) => sum + ((day.legs || []).length), 0);
  const flightDays = days.filter(day => day.type === 'VOO' && (day.legs || []).length).length;
  const operationalDays = days.filter(day => ['ASB','HSB','HSBE','CRM','DO','DOF','DR'].includes(day.type)).length;
  const suspiciousLong = days.filter(day => day.type === 'VOO' && Number(day.dutyHours || 0) > 18).length;
  return days.length >= 10 && flightDays >= 5 && flightLegs >= 10 && operationalDays >= 3 && suspiciousLong <= 1;
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

function isPublishedAimsContextMonth(month: number, year: number, referenceMonth: number, referenceYear: number): boolean {
  const value = year * 12 + month;
  const reference = referenceYear * 12 + referenceMonth;
  return Math.abs(value - reference) <= 1;
}


function getAimsItemCenterX(item: AimsVisualItem & { width?: number }): number {
  const width = Number((item as any).width || 0);
  return Number(item.x || 0) + (Number.isFinite(width) && width > 0 ? width / 2 : 0);
}

function splitAimsVisualToken(value: string): string[] {
  return String(value || '')
    .replace(/￾/g, ' ')
    .replace(//g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function aimsDayQualityScore(day: RosterDay): number {
  const legs = day.legs || [];
  const raw = String(day.rawText || '');
  const knownPairing = Boolean(day.pairingCode && (isKnownRosterCode(day.pairingCode) || /^LA\d{3,4}$/i.test(day.pairingCode)));
  const validWindow = Boolean(day.dutyReport && day.dutyDebrief && day.dutyReport !== day.dutyDebrief);
  const rawHasFlight = /\bLA\s*\d{3,4}\b/i.test(day.rawText || '');
  let score = 0;
  score += legs.length * 100;
  score += legs.filter((leg) => leg.origin && leg.destination && leg.departureTime && leg.arrivalTime).length * 40;
  score += validWindow ? 18 : 0;
  score += day.dutyReport ? 8 : 0;
  score += knownPairing ? 12 : 0;
  score += day.type !== 'OTHER' ? 10 : 0;
  const rawFlightCount = countRegexMatches(raw, /\bLA\s*\d{3,4}\b/gi);
  score += rawHasFlight && legs.length === 0 ? -80 : 0;
  score += rawFlightCount > legs.length ? -65 * (rawFlightCount - legs.length) : 0;
  score += rawFlightCount >= 4 && legs.length >= rawFlightCount ? 120 : 0;
  score += isAimsDaySuspicious(day) ? -500 : 0;
  return score;
}

function countRegexMatches(value: string, re: RegExp): number {
  return (String(value || '').match(re) || []).length;
}

function isAimsDaySuspicious(day: RosterDay): boolean {
  const raw = String(day.rawText || '');
  const legs = day.legs || [];

  // Um dia real dificilmente deve carregar metade da página/mês. Isso acontecia
  // quando o fallback textual lia a tabela AIMS por linhas, fazendo 29/30 puxarem
  // a mesma programação ou herdarem horários de outras colunas.
  // Dias AIMS reais podem ter 4+ etapas, inclusive com duas pernas Extra/PS.
  // Só considerar contaminado quando o bloco parece carregar quase a página inteira.
  if (raw.length > 1400 && countRegexMatches(raw, /\bLA\s*\d{3,4}\b/gi) >= 8) return true;
  if (raw.length > 1500 && countRegexMatches(raw, /\b(?:MON|TUE|WED|THU|FRI|SAT|SUN|SEG|TER|QUA|QUI|SEX|SAB|SÁB|DOM)\b/gi) >= 7 && countRegexMatches(raw, /\b(?:3\d{3}|4\d{3})\b/g) >= 8) return true;
  if (legs.length > 8) return true;

  const uniqueDates = countRegexMatches(raw, /\b\d{2}(?:Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)\b/gi);
  // Em PDFs AIMS com escala contínua, um dia real pode carregar visualmente um marcador do dia vizinho.
  // Não descartar automaticamente se houver pernas válidas; isso fazia o sistema "pular" dias.
  if (uniqueDates >= 4) return true;
  if (uniqueDates >= 2 && !legs.length) return true;

  const uniqueFlightKeys = new Set(legs.map((leg) => `${leg.flightNumber}|${leg.origin}|${leg.destination}|${leg.departureTime}`));
  if (uniqueFlightKeys.size !== legs.length) return true;

  return false;
}

function canUseAimsSecondaryDay(candidate: RosterDay, current?: RosterDay): boolean {
  if (isAimsDaySuspicious(candidate)) return false;
  if (!current) return true;

  const candidateScore = aimsDayQualityScore(candidate);
  const currentScore = aimsDayQualityScore(current);

  // A leitura visual/colunar é a fonte canônica para PDF AIMS em matriz.
  // O fallback textual só deve preencher lacunas reais, nunca substituir uma
  // coluna visual boa por um bloco contaminado da página inteira.
  if ((current.legs || []).length > 0 || current.type !== 'OTHER') {
    return candidateScore > currentScore + 180 && (candidate.legs || []).length > (current.legs || []).length;
  }
  return candidateScore > currentScore + 35;
}

function mergeMissingAimsLegs(target: RosterDay, source: RosterDay): void {
  if (!source.legs?.length || isAimsDaySuspicious(source)) return;
  const existingLegKey = new Set((target.legs || []).map((leg) => `${leg.flightNumber}|${leg.origin}|${leg.destination}|${leg.departureTime}`));
  const missingLegs = source.legs.filter((leg) => !existingLegKey.has(`${leg.flightNumber}|${leg.origin}|${leg.destination}|${leg.departureTime}`));
  if (!missingLegs.length) return;

  target.legs = [...(target.legs || []), ...missingLegs].sort((a, b) => minutesOfDay(a.departureTime) - minutesOfDay(b.departureTime));
  target.type = 'VOO';
  target.pairingCode = target.pairingCode || source.pairingCode;
  target.rawText = [target.rawText, source.rawText].filter(Boolean).join(' | ');
  if (!target.dutyReport) target.dutyReport = source.dutyReport;
  if (!target.dutyDebrief) target.dutyDebrief = source.dutyDebrief;
}

function mergeAimsParsedRosters(primary: CrewRoster, secondary: CrewRoster): CrewRoster {
  // v11.1.100: a escala pode ter múltiplas programações no mesmo dia
  // (reserva + voo, voo + pernoite diurno + voo noturno, RCFI + deslocamento etc.).
  // O merge antigo usava Map por data e apagava atividades reais da própria data.
  const merged: RosterDay[] = [];
  const hasExactActivity = (day: RosterDay) => merged.some(item => aimsDayActivityKey(item) === aimsDayActivityKey(day));
  const addActivity = (day: RosterDay) => {
    if (!day?.date || isAimsDaySuspicious(day) || hasExactActivity(day)) return;
    merged.push(day);
  };

  (primary.days || []).forEach(addActivity);

  (secondary.days || []).forEach((day) => {
    if (!day?.date || isAimsDaySuspicious(day)) return;
    if (hasExactActivity(day)) return;

    const sameDate = merged.filter(item => item.date === day.date);
    if (!sameDate.length) {
      if (canUseAimsSecondaryDay(day)) addActivity(day);
      return;
    }

    const existingLegKeys = new Set(sameDate.flatMap(item => (item.legs || []).map(leg => `${leg.flightNumber}|${leg.origin}|${leg.destination}|${leg.departureTime}|${leg.arrivalTime}`)));
    const missingLegs = (day.legs || []).filter(leg => !existingLegKeys.has(`${leg.flightNumber}|${leg.origin}|${leg.destination}|${leg.departureTime}|${leg.arrivalTime}`));
    if (missingLegs.length) {
      addActivity({ ...day, legs: missingLegs, rawText: [day.rawText, 'CrewCheck v11.1.100: atividade adicionada sem substituir outra programação da mesma data.'].filter(Boolean).join(' | ') });
      return;
    }

    const sameKind = sameDate.some(item => item.type === day.type && (item.dutyReport || '') === (day.dutyReport || '') && (item.dutyDebrief || '') === (day.dutyDebrief || ''));
    if (!sameKind && canUseAimsSecondaryDay(day)) addActivity(day);
  });

  const days = dedupeAimsOperationalDays(merged).sort(compareAimsOperationalDays);
  return { ...primary, days, rawText: primary.rawText || secondary.rawText };
}

function aimsDayActivityKey(day: RosterDay): string {
  const legsKey = (day.legs || []).map((leg) => `${leg.flightNumber}:${leg.origin}-${leg.destination}:${leg.departureTime}-${leg.arrivalTime}`).join('|');
  return `${day.date}|${day.type}|${day.dutyReport || ''}|${day.dutyDebrief || ''}|${day.pairingCode || ''}|${legsKey}`;
}


function humanReviewAimsRoster(roster: CrewRoster): CrewRoster {
  const days = (roster.days || [])
    .map((day) => humanReviewAimsDay(day, roster.base || ''))
    .filter(Boolean) as RosterDay[];

  // v11.1.85: nunca reduzir a escala a uma única linha por data.
  // Uma data pode conter voo de manhã + pernoite diurno + voo à noite, ou
  // treinamento/RCFI e outra programação. A deduplicação agora é por atividade.
  const byActivity = new Map<string, RosterDay>();
  for (const day of days) {
    const legsKey = (day.legs || []).map((leg) => `${leg.flightNumber}:${leg.origin}-${leg.destination}:${leg.departureTime}-${leg.arrivalTime}`).join('|');
    const key = `${day.date}|${day.type}|${day.dutyReport || ''}|${day.dutyDebrief || ''}|${day.pairingCode || ''}|${legsKey}`;
    const current = byActivity.get(key);
    if (!current || humanAimsDayPriority(day) > humanAimsDayPriority(current)) byActivity.set(key, day);
  }

  const normalized = Array.from(byActivity.values()).sort(compareAimsOperationalDays);
  const physicallySafe = enforceAimsPhysicalDutyContinuity(normalized, roster);
  const linked = linkAimsMidnightContinuations(physicallySafe)
    .filter(day => !(day.type === 'VOO' && Number(day.dutyHours || 0) > 18))
    .filter(day => !(day.type === 'VOO' && !(day.legs || []).length))
    .filter(day => !(day.type === 'OTHER' && !(day.legs || []).length && !day.dutyReport && !day.dutyDebrief));
  return { ...roster, days: removeCollapsedDuplicateAimsFlights(linked) };
}

function removeCollapsedDuplicateAimsFlights(days: RosterDay[]): RosterDay[] {
  const dropped = new Set<RosterDay>();
  const byDateAndFlight = new Map<string, RosterDay[]>();
  for (const day of days) for (const leg of day.legs || []) {
    const key = `${day.date}|${leg.flightNumber}`;
    const list = byDateAndFlight.get(key) || [];
    if (!list.includes(day)) list.push(day);
    byDateAndFlight.set(key, list);
  }
  for (const candidates of byDateAndFlight.values()) {
    if (candidates.length < 2) continue;
    const multi = candidates.find(day => day.legs.length > 1);
    if (!multi) continue;
    const first = multi.legs[0];
    const last = multi.legs[multi.legs.length - 1];
    for (const candidate of candidates) {
      if (candidate === multi || candidate.legs.length !== 1) continue;
      const only = candidate.legs[0];
      if (only.origin === first.origin && only.destination === last.destination) dropped.add(candidate);
    }
  }
  return days.filter(day => !dropped.has(day));
}

function humanReviewAimsDay(day: RosterDay, homeBase: string): RosterDay | null {
  const raw = String(day.rawText || '');
  const tokens = raw.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  const upperTokens = tokens.map((item) => item.toUpperCase());
  const hasFlightToken = upperTokens.some((token, index) => token === 'LA' && /^\d{3,4}$/.test(upperTokens[index + 1] || ''));
  const firstFlightIndex = upperTokens.findIndex((token, index) => token === 'LA' && /^\d{3,4}$/.test(upperTokens[index + 1] || ''));
  const firstOperationalIndex = findFirstOperationalAimsIndex(upperTokens);
  const firstRestIndex = upperTokens.findIndex((token) => isAimsRestCode(token));

  let fixed: RosterDay = {
    ...day,
    legs: (day.legs || []).filter((leg) => isCredibleAimsLeg(leg)),
    rawText: raw || day.rawText,
  };

  if (hasFlightToken && (!fixed.legs.length || isAimsRestType(fixed.type))) {
    const start = firstFlightIndex >= 0 ? flightContextStartIndex(tokens, firstFlightIndex) : firstFlightIndex;
    const reparsed = parseFlightDay(tokens.slice(Math.max(0, start)), homeBase || fixed.base || '', /\(\.\.\.\)/.test(raw));
    if (reparsed.legs?.length) {
      fixed = {
        ...fixed,
        type: reparsed.type,
        pairingCode: reparsed.pairingCode,
        dutyReport: reparsed.dutyReport,
        dutyDebrief: reparsed.dutyDebrief,
        legs: reparsed.legs.filter((leg) => isCredibleAimsLeg(leg)),
        dutyHours: reparsed.dutyHours,
        flyingHours: reparsed.flyingHours,
        isNextDay: reparsed.isNextDay,
        hotel: reparsed.hotel,
        rawText: raw,
      };
    }
  }

  // Atividade operacional ganha de folga quando a coluna veio contaminada com DO/OFF/DR.
  if (!fixed.legs.length && firstOperationalIndex >= 0 && (firstRestIndex < 0 || firstOperationalIndex <= firstRestIndex || isAimsRestType(fixed.type))) {
    const code = upperTokens[firstOperationalIndex];
    const reparsed = parseDayContent(tokens.slice(firstOperationalIndex).join('\n'), homeBase || fixed.base || '');
    if (reparsed.type !== 'OTHER' || reparsed.legs.length || reparsed.dutyReport || reparsed.dutyDebrief) {
      fixed = {
        ...fixed,
        type: reparsed.type,
        pairingCode: reparsed.pairingCode || code,
        dutyReport: reparsed.dutyReport,
        dutyDebrief: reparsed.dutyDebrief,
        legs: reparsed.legs.filter((leg) => isCredibleAimsLeg(leg)),
        dutyHours: reparsed.dutyHours,
        flyingHours: reparsed.flyingHours,
        isNextDay: reparsed.isNextDay,
        hotel: reparsed.hotel,
        rawText: raw,
      };
    }
  }

  if (fixed.legs.length) {
    const extraFlightNumbers = new Set(Array.from(raw.matchAll(/(?:\[?extra\]?|passageiro|pax)\s+LA\s*(\d{3,4})/gi)).map(match => `LA${match[1]}`));
    if (extraFlightNumbers.size) fixed.legs = fixed.legs.map(leg => extraFlightNumbers.has(leg.flightNumber) ? { ...leg, workType: 'PS' } : leg);
    const first = fixed.legs[0];
    const last = fixed.legs[fixed.legs.length - 1];
    const activationCode = /\b(HSBE|HSB|ASB|RES)\b/i.test(`${fixed.rawText || ''} ${fixed.pairingCode || ''}`)
      ? String(`${fixed.rawText || ''} ${fixed.pairingCode || ''}`.match(/\b(HSBE|HSB|ASB|RES)\b/i)?.[1] || '').toUpperCase()
      : '';
    fixed.type = activationCode === 'HSBE' ? 'HSBE' : activationCode === 'HSB' ? 'HSB' : activationCode === 'ASB' || activationCode === 'RES' ? 'ASB' : 'VOO';
    fixed.pairingCode = fixed.type === 'VOO' ? first.flightNumber : fixed.type;
    fixed.dutyReport = fixed.dutyReport || first.departureTime;
    fixed.dutyDebrief = fixed.dutyDebrief || addClockMinutes(last.arrivalTime, 30);
    fixed.flyingHours = fixed.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
    fixed.dutyHours = fixed.dutyReport && fixed.dutyDebrief ? diffHours(fixed.dutyReport, fixed.dutyDebrief) : fixed.dutyHours;
    if (Number(fixed.dutyHours || 0) > 18) return null;
    fixed.isNextDay = Boolean(fixed.isNextDay || fixed.legs.some((leg) => leg.isNextDay) || (fixed.dutyReport && fixed.dutyDebrief && minutesOfDay(fixed.dutyDebrief) <= minutesOfDay(fixed.dutyReport)));
    fixed.hotel = last.destination && last.destination !== (homeBase || fixed.base) ? last.destination : fixed.hotel;
    return fixed;
  }

  if (isAimsRestType(fixed.type) || (firstRestIndex >= 0 && firstOperationalIndex < 0)) {
    const code = firstRestIndex >= 0 ? upperTokens[firstRestIndex] : String(fixed.pairingCode || fixed.type || '').toUpperCase();
    const type = code === 'DOF' ? 'DOF' : code === 'DR' ? 'DR' : code === 'OFF' ? 'OFF' : 'DO';
    return { ...fixed, type, pairingCode: fixed.pairingCode || code, dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
  }

  if ((fixed.type === 'HSB' || fixed.type === 'HSBE' || fixed.type === 'ASB') && !fixed.legs.length) {
    fixed.pairingCode = fixed.type;
    fixed.dutyHours = fixed.dutyReport && fixed.dutyDebrief ? diffHours(fixed.dutyReport, fixed.dutyDebrief) : fixed.dutyHours;
    fixed.hotel = null;
    return fixed;
  }

  // Pernoite puro/inativo: não recebe dutyReport/dutyDebrief para não gerar repouso falso.
  if (fixed.type === 'LAYOVER') {
    return { ...fixed, dutyReport: null, dutyDebrief: null, dutyHours: 0, flyingHours: 0, legs: [] };
  }

  if (fixed.type === 'VOO' && !fixed.legs.length) return null;
  if (fixed.type === 'OTHER' && !fixed.legs.length && !fixed.dutyReport && !fixed.dutyDebrief) return null;

  return fixed;
}


type AimsLegTimelineItem = {
  leg: FlightLeg;
  depAbs: number;
  arrAbs: number;
  reportAbs: number;
  debriefAbs: number;
  sourceIndex: number;
};

type AimsDutyGroup = {
  items: AimsLegTimelineItem[];
  startAbs: number;
  endAbs: number;
  notes: string[];
};

function enforceAimsPhysicalDutyContinuity(days: RosterDay[], roster: CrewRoster): RosterDay[] {
  const output: RosterDay[] = [];
  for (const day of days) {
    if (!day?.legs?.length || day.legs.length <= 1) {
      output.push(day);
      continue;
    }
    const groups = splitAimsDayIntoPhysicalDutyGroups(day);
    if (groups.length <= 1) {
      output.push(makeAimsDutyGroupDay(day, groups[0], roster));
      continue;
    }
    output.push(...groups.map((group) => makeAimsDutyGroupDay(day, group, roster)));
  }
  return dedupeAimsOperationalDays(output).sort(compareAimsOperationalDays);
}

function splitAimsDayIntoPhysicalDutyGroups(day: RosterDay): AimsDutyGroup[] {
  const baseDate = parseAimsRosterDate(day.date);
  if (!baseDate) return [{ items: (day.legs || []).map((leg, index) => ({ leg, depAbs: minutesOfDay(leg.departureTime), arrAbs: minutesOfDay(leg.arrivalTime), reportAbs: minutesOfDay(day.dutyReport || leg.departureTime), debriefAbs: minutesOfDay(day.dutyDebrief || addClockMinutes(leg.arrivalTime, 30)), sourceIndex: index })), startAbs: minutesOfDay(day.dutyReport || day.legs?.[0]?.departureTime || '00:00'), endAbs: minutesOfDay(day.dutyDebrief || day.legs?.[day.legs.length - 1]?.arrivalTime || '00:00'), notes: [] }];
  const timeline = buildAimsLegTimeline(day);
  if (!timeline.length) return [];

  const groups: AimsDutyGroup[] = [];
  let current: AimsDutyGroup | null = null;
  for (const item of timeline) {
    if (!current) {
      current = { items: [item], startAbs: item.reportAbs, endAbs: item.debriefAbs, notes: [] };
      continue;
    }
    const prev = current.items[current.items.length - 1];
    const sameStation = Boolean(prev.leg.destination && item.leg.origin && prev.leg.destination === item.leg.origin);
    const gap = item.reportAbs - current.endAbs;
    if (sameStation && gap >= 12 * 60) {
      current.notes.push(`Pernoite/pernoite diurno em ${prev.leg.destination}: ${formatAimsDurationMinutes(gap)} entre programações.`);
      groups.push(current);
      current = { items: [item], startAbs: item.reportAbs, endAbs: item.debriefAbs, notes: [] };
      continue;
    }
    if (!sameStation && gap >= 180) {
      current.notes.push(`Separado por continuidade física: última chegada ${prev.leg.destination || '?'} e próxima origem ${item.leg.origin || '?'}.`);
      groups.push(current);
      current = { items: [item], startAbs: item.reportAbs, endAbs: item.debriefAbs, notes: [] };
      continue;
    }
    current.items.push(item);
    current.endAbs = Math.max(current.endAbs, item.debriefAbs);
    if (!sameStation) current.notes.push(`Conexão física divergente preservada para revisão: ${prev.leg.destination || '?'} → ${item.leg.origin || '?'}.`);
  }
  if (current) groups.push(current);
  return groups;
}

function buildAimsLegTimeline(day: RosterDay): AimsLegTimelineItem[] {
  const items: AimsLegTimelineItem[] = [];
  let floor = 0;
  (day.legs || []).forEach((leg, index) => {
    let depAbs = minutesOfDay(leg.departureTime || '00:00');
    while (items.length && depAbs < floor - 90) depAbs += 1440;
    let arrAbs = minutesOfDay(leg.arrivalTime || leg.departureTime || '00:00');
    while (arrAbs < depAbs) arrAbs += 1440;
    const reportClock = findAimsReportTimeForLeg(day.rawText || '', leg) || (index === 0 ? day.dutyReport : null) || leg.departureTime;
    let reportAbs = minutesOfDay(reportClock || leg.departureTime || '00:00');
    while (reportAbs > depAbs) reportAbs -= 1440;
    while (items.length && reportAbs < floor - 12 * 60) reportAbs += 1440;
    const debriefClock = findAimsDebriefTimeForLeg(day.rawText || '', leg) || (index === (day.legs || []).length - 1 ? day.dutyDebrief : null) || addClockMinutes(leg.arrivalTime, 30);
    let debriefAbs = minutesOfDay(debriefClock || leg.arrivalTime || '00:00');
    while (debriefAbs < arrAbs) debriefAbs += 1440;
    const normalizedLeg: FlightLeg = {
      ...leg,
      isNextDay: Math.floor(arrAbs / 1440) !== Math.floor(depAbs / 1440) || minutesOfDay(leg.arrivalTime) < minutesOfDay(leg.departureTime),
      duration: Math.round(((arrAbs - depAbs) / 60) * 100) / 100,
    };
    items.push({ leg: normalizedLeg, depAbs, arrAbs, reportAbs, debriefAbs, sourceIndex: index });
    floor = Math.max(floor, debriefAbs, arrAbs, depAbs);
  });
  return items.sort((a, b) => a.depAbs - b.depAbs || a.sourceIndex - b.sourceIndex);
}

function makeAimsDutyGroupDay(original: RosterDay, group: AimsDutyGroup | undefined, roster: CrewRoster): RosterDay {
  if (!group || !group.items.length) return original;
  const baseDate = parseAimsRosterDate(original.date) || new Date(original.year || roster.year || new Date().getFullYear(), (original.month || roster.month || 1) - 1, original.dayNumber || 1);
  const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  startDate.setDate(startDate.getDate() + Math.floor(group.startAbs / 1440));
  const first = group.items[0];
  const last = group.items[group.items.length - 1];
  const legs = group.items.map((item) => item.leg);
  const dutyHours = Math.round(((group.endAbs - group.startAbs) / 60) * 100) / 100;
  const flyingHours = Math.round(legs.reduce((sum, leg) => sum + (Number(leg.duration) || diffHours(leg.departureTime, leg.arrivalTime)), 0) * 100) / 100;
  const rawText = [original.rawText || '', 'CrewCheck v11.1.93: jornada reancorada por continuidade física e corte por repouso >=12h.', ...group.notes].filter(Boolean).join(' | ');
  return {
    ...original,
    date: formatAimsHumanDate(startDate),
    dayNumber: startDate.getDate(),
    month: startDate.getMonth() + 1,
    year: startDate.getFullYear(),
    dayOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][startDate.getDay()],
    type: 'VOO',
    pairingCode: first.leg.flightNumber,
    dutyReport: minutesToAimsHumanClock(group.startAbs),
    dutyDebrief: minutesToAimsHumanClock(group.endAbs),
    legs,
    dutyHours,
    flyingHours,
    isNextDay: Math.floor(group.endAbs / 1440) !== Math.floor(group.startAbs / 1440) || minutesToAimsHumanClock(group.endAbs) <= minutesToAimsHumanClock(group.startAbs),
    hotel: last.leg.destination && last.leg.destination !== roster.base ? last.leg.destination : null,
    rawText,
  };
}

function parseAimsRosterDate(value: string): Date | null {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function findAimsReportTimeForLeg(rawText: string, leg: FlightLeg): string | null {
  const segment = findAimsRawSegmentForLeg(rawText, leg);
  if (!segment) return null;
  const tokens = segment.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  const originIndex = tokens.findIndex((token) => token.toUpperCase().replace(/[^A-Z]/g, '') === String(leg.origin || '').toUpperCase());
  if (originIndex < 0) return null;
  const times = tokens.slice(0, originIndex).map(normalizeSimpleTime).filter((token) => /^\d{2}:\d{2}$/.test(token));
  return times.length >= 2 ? times[0] : null;
}

function findAimsDebriefTimeForLeg(rawText: string, leg: FlightLeg): string | null {
  const segment = findAimsRawSegmentForLeg(rawText, leg);
  if (!segment) return null;
  const tokens = segment.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  const destinationIndex = tokens.findIndex((token) => token.toUpperCase().replace(/[^A-Z]/g, '') === String(leg.destination || '').toUpperCase());
  if (destinationIndex < 0) return null;
  const times = tokens.slice(destinationIndex + 1).map(normalizeSimpleTime).filter((token) => /^\d{2}:\d{2}$/.test(token));
  return times.length >= 2 ? times[times.length - 1] : null;
}

function findAimsRawSegmentForLeg(rawText: string, leg: FlightLeg): string {
  const digits = String(leg.flightNumber || '').replace(/\D/g, '');
  if (!digits) return '';
  const re = new RegExp(`\\bLA\\s*${digits}\\b`, 'i');
  const match = re.exec(rawText || '');
  if (!match) return '';
  const after = rawText.slice(match.index + match[0].length);
  const next = /\bLA\s*\d{3,4}\b/i.exec(after);
  return after.slice(0, next ? next.index : Math.min(after.length, 240));
}

function isAimsRestCode(token: string): boolean {
  return /^(DOF?|DOPR?|DR|OFF|VC)$/.test(String(token || '').toUpperCase());
}

function isAimsRestType(type: string): boolean {
  return /^(DOF?|DR|OFF)$/.test(String(type || '').toUpperCase());
}

function findFirstOperationalAimsIndex(tokens: string[]): number {
  return tokens.findIndex((token) => /^(HSBE|HSB|ASB|RES|CRMBSB|CRMB|CRM|CBF|EMER|MT|RCFI|C\d{2,3}F)$/.test(String(token || '').toUpperCase()));
}

function isCredibleAimsLeg(leg: FlightLeg): boolean {
  if (!leg?.flightNumber || !leg.origin || !leg.destination || !leg.departureTime || !leg.arrivalTime) return false;
  if (leg.origin === leg.destination) return false;
  const duration = leg.duration || diffHours(leg.departureTime, leg.arrivalTime);
  return Number.isFinite(duration) && duration >= 0.15 && duration <= 8.5;
}

function humanAimsDayPriority(day: RosterDay): number {
  const legs = day.legs || [];
  let score = legs.length * 1000;
  if (day.dutyReport && day.dutyDebrief) score += 120;
  if (day.type === 'VOO') score += 90;
  if (day.type === 'ASB' || day.type === 'HSB' || day.type === 'HSBE') score += 70;
  if (day.type === 'CRM') score += 60;
  if (isAimsRestType(day.type)) score += 20;
  score += Math.min(String(day.rawText || '').length, 800) / 100;
  return score;
}

function linkAimsMidnightContinuations(days: RosterDay[]): RosterDay[] {
  return days.map((day, index) => {
    const prev = index > 0 ? days[index - 1] : null;
    if (!prev?.legs?.length || !day.legs?.length || !prev.dutyDebrief || !day.dutyReport) return day;
    const rest = restHoursBetweenAimsDays(prev, day);
    const prevLast = prev.legs[prev.legs.length - 1];
    const nextFirst = day.legs[0];
    const sameStation = Boolean(prevLast?.destination && nextFirst?.origin && prevLast.destination === nextFirst.origin);
    const nextStartsVeryEarly = minutesOfDay(day.dutyReport || nextFirst.departureTime) <= 5 * 60;
    if (rest !== null && rest >= 0 && rest <= 5 && (sameStation || nextStartsVeryEarly || /\(\.\.\.\)/.test(day.rawText || ''))) {
      return { ...day, rawText: [day.rawText, `CrewCheck: continuação operacional da jornada anterior (${rest.toFixed(1)}h em solo), não pernoite/repouso.`].filter(Boolean).join(' | ') };
    }
    return day;
  });
}

function restHoursBetweenAimsDays(prev: RosterDay, next: RosterDay): number | null {
  if (!prev.dutyDebrief || !next.dutyReport) return null;
  const [pd, pm, py] = prev.date.split('/').map(Number);
  const [nd, nm, ny] = next.date.split('/').map(Number);
  const dayDiff = (new Date(ny, nm - 1, nd).getTime() - new Date(py, pm - 1, pd).getTime()) / 36e5;
  let rest = dayDiff + (minutesOfDay(next.dutyReport) - minutesOfDay(prev.dutyDebrief)) / 60;
  if (prev.isNextDay) rest -= 24;
  while (rest < 0) rest += 24;
  return Math.round(rest * 10) / 10;
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
  
  // Sort days by absolute date, preserving previous/current/next-month continuity.
  days.sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date));
  
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

function flightContextStartIndex(tokens: string[], laIdx: number): number {
  if (laIdx <= 0) return laIdx;
  let start = laIdx;
  for (let i = laIdx - 1; i >= Math.max(0, laIdx - 5); i -= 1) {
    const value = String(tokens[i] || '').toUpperCase().trim();
    if (!value) continue;
    if (isExtraAimsMarker(value) || /^\d{1,2}:\d{2}(?:\(\+1\))?$/.test(value) || /^(APRES|APRESENTA|APRESENTACAO|APRESENTAÇÃO|REPORT|CHECKIN|CHECK-IN)$/.test(value)) {
      start = i;
      continue;
    }
    // Não misturar janela de ASB/HSB com voo: nesses casos a função de acionamento já trata o dutyReport.
    if (/^(HSBE|HSB|ASB|RES|DO|DOF|DR|OFF|VC|CRM|CRMB|MT|C\d{2,3}F)$/.test(value)) break;
  }
  return start;
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
    const flightStartIdx = flightContextStartIndex(remaining, laAnywhereIdx);
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
    const hsbType = firstLine.includes('HSBE') ? 'HSBE' : 'HSB';
    if (remaining.slice(1).some(l => l === 'ASB' || l === 'RES' || l === 'LA')) return parseReserveOrStandbyActivationDay(remaining, hsbType, homeBase);
    return parseStandby(remaining, hsbType);
  }
  if (firstLine === 'HSBE') {
    if (remaining.slice(1).some(l => l === 'ASB' || l === 'RES' || l === 'LA')) return parseReserveOrStandbyActivationDay(remaining, 'HSBE', homeBase);
    return parseStandby(remaining, 'HSBE');
  }
  
  // CRM Training
  if (firstLine === 'CRMB' || firstLine === 'CRM' || firstLine.startsWith('CRM') || /^C\d{2,3}F$/.test(firstLine)) {
    return parseCRM(remaining);
  }
  
  // ASB - Airport Standby
  if (firstLine === 'ASB' || firstLine.startsWith('ASB')) {
    if (remaining.slice(1).some(l => l === 'LA')) return parseReserveOrStandbyActivationDay(remaining, 'ASB', homeBase);
    return parseASB(remaining);
  }
  
  // Check if it's a layover continuation (starts with "(...)" indicating previous day's activity continues)
  if (firstLine === '(...)' || firstLine.startsWith('(...)')) {
    const afterEllipsis = remaining.slice(1);
    
    // Em AIMS, (...) costuma ser apenas continuação/pernoite. Checamos códigos
    // operacionais antes de DO/DR/OFF para não transformar ASB em inativo/folga.
    const asbIdx = afterEllipsis.findIndex(l => l === 'ASB' || /^ASB/.test(l));
    if (asbIdx >= 0) {
      const asbBlock = afterEllipsis.slice(asbIdx);
      if (asbBlock.slice(1).some(l => l === 'LA')) return parseReserveOrStandbyActivationDay(asbBlock, 'ASB', homeBase);
      return parseASB(asbBlock);
    }

    const hsbIdx = afterEllipsis.findIndex(l => l === 'HSBE' || l === 'HSB');
    if (hsbIdx >= 0) {
      const hsbType = afterEllipsis[hsbIdx] === 'HSBE' ? 'HSBE' : 'HSB';
      return parseStandby(afterEllipsis.slice(hsbIdx), hsbType);
    }

    // Em colunas AIMS, o marcador (...) pode aparecer antes de pernas reais do dia.
    // Priorizar voo evita transformar 21/22-Jul em “sem programação” quando um DO/DR
    // de outro dia ficou no mesmo bloco visual.
    const hasFlights = afterEllipsis.some(l => l === 'LA');
    if (hasFlights) {
      const laStart = afterEllipsis.findIndex(l => l === 'LA');
      const flightStartIdx = flightContextStartIndex(afterEllipsis, laStart);
      return parseFlightDay(afterEllipsis.slice(flightStartIdx), homeBase, true);
    }

    // Check for CRM after (...)
    const knownIdx = afterEllipsis.findIndex(l => isKnownGroundActivity(l));
    if (knownIdx >= 0) {
      return parseGroundActivity(afterEllipsis.slice(knownIdx), afterEllipsis[knownIdx]);
    }

    const doIdx = afterEllipsis.findIndex(l => l === 'DOPR' || l === 'DOP' || l === 'VC' || l === 'DOPR' || l === 'DOP' || l === 'VC' || l === 'DO' || l === 'DOF' || l === 'DR' || l === 'OFF');
    if (doIdx >= 0) {
      const typeStr = afterEllipsis[doIdx] as RosterDay['type'];
      return { type: typeStr, pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null };
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
    const flightStartIdx = flightContextStartIndex(remaining, laIdx);
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
  else if (def?.category === 'GROUND_DUTY' || /^C\d{2,3}F$/i.test(canonicalCode) || /^(CRM|RCFI|CBF|EMER|MT)$/i.test(canonicalCode)) type = 'CRM';

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


function parseReserveOrStandbyActivationDay(lines: string[], activationType: 'HSB' | 'HSBE' | 'ASB', homeBase: string): ParsedDay {
  const activation = activationType === 'ASB' ? parseASB(lines) : parseStandby(lines, activationType);
  const laStart = lines.findIndex((line, index) => String(line || '').toUpperCase() === 'LA' && /^\d{3,4}$/.test(String(lines[index + 1] || '')));
  if (laStart < 0) return activation;

  const flightStart = laStart > 0 && isExtraAimsMarker(lines[laStart - 1]) ? laStart - 1 : laStart;
  const flight = parseFlightDay(lines.slice(flightStart), homeBase, false);
  if (!flight.legs?.length) return activation;

  const dutyReport = activation.dutyReport || flight.dutyReport;
  const dutyDebrief = flight.dutyDebrief || activation.dutyDebrief;
  const dutyHours = dutyReport && dutyDebrief ? diffHours(dutyReport, dutyDebrief) : flight.dutyHours;
  return {
    ...flight,
    type: activationType,
    pairingCode: activationType,
    dutyReport,
    dutyDebrief,
    dutyHours,
    flyingHours: flight.flyingHours,
    isNextDay: Boolean(flight.isNextDay || (dutyReport && dutyDebrief && minutesOfDay(dutyDebrief) <= minutesOfDay(dutyReport))),
    hotel: flight.hotel,
  };
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

  const airportSet = new Set(['AAX','AEP','AFL','AJU','AMS','ARU','ASU','ATL','ATM','BCN','BEL','BOG','BOS','BPS','BRA','BSB','BVB','CAC','CAW','CCS','CDG','CFB','CGB','CGH','CKS','CLO','CMG','CNF','COR','CPT','CPV','CTG','CUN','CUR','CUZ','CWB','CXJ','DFW','DOH','DXB','EPA','ERM','EWR','EZE','FCO','FEC','FEN','FLL','FLN','FOR','FRA','GIG','GPB','GRU','GVR','GYE','GYN','HAV','IAH','IGU','IMP','IOS','IPN','IST','IZA','JDO','JFK','JIA','JJD','JJG','JNB','JOI','JPA','JPR','JTC','LAS','LAX','LAZ','LDB','LEC','LGW','LHR','LIM','LIS','LPB','MAB','MAD','MAO','MCO','MCP','MCZ','MDE','MDZ','MEA','MEX','MGF','MIA','MOC','MUC','MVD','MXP','NAT','NVT','OAL','OPO','OPS','ORD','ORY','PDP','PET','PFB','PIN','PMW','PNZ','POA','PPB','PTY','PUJ','PVH','QNS','RAO','RBR','REC','RIA','ROO','ROS','RVD','SCL','SDQ','SDU','SFO','SJK','SJO','SJP','SLZ','SSA','STM','TBT','TFF','THE','UDI','UIO','URG','VCP','VDC','VIX','VVI','XAP','ZRH']);
  const timeRegex = /^\d{1,2}:\d{2}(?:\(\+1\))?$/;
  const aircraftRegex = /^\(?(?:32S|31R|39R|328|319|320|321|32N|767|777|789|788|350|359)\)?$/i;
  const isAimsTime = (value: string) => timeRegex.test(String(value || '').trim());
  const cleanTime = (value: string) => normalizeSimpleTime(String(value || '').trim());
  const nonAirportTokens = new Set(['LA','OP','PS','DH','PAX','EXTRA','PASSAGEIRO','APRES','APRESENTA','APRESENTACAO','APRESENTAÇÃO','REPORT','CHECKIN','CHECK-IN','HSB','HSBE','ASB','RES','CRM','CRMB','CRMBSB','MT','CBF','EMER','DO','DOF','DOP','DOPR','DR','OFF','VC','NS','NSJ','IJ','DM','FH','DH']);
  const isAirport = (value: string) => {
    const clean = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!clean) return false;
    if (airportSet.has(clean)) return true;
    // "Aprendizado" tolerante: se a escala oficial trouxer um IATA que ainda não está no dicionário,
    // aceita 3 letras como aeroporto desde que não seja sigla operacional conhecida.
    return /^[A-Z]{3}$/.test(clean) && !nonAirportTokens.has(clean) && !isKnownRosterCode(clean) && !MONTH_MAP[clean.toLowerCase()];
  };
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

    type TimePick = { idx: number; value: string; source: 'before-origin' | 'after-origin' };
    type BestLegPick = { originIdx: number; destIdx: number; dep: string; depIdx: number; arrRaw: string; arrIdx: number; report: string | null; score: number };
    let best: BestLegPick | null = null;
    const timeIndexes = legTokens.map((token, idx) => ({ token, idx })).filter((item) => isAimsTime(item.token));

    const scoreCandidate = (originIdx: number, dep: TimePick, destIdx: number, arrIdx: number, arrRaw: string, report: string | null) => {
      const origin = upper[originIdx];
      const destination = upper[destIdx];
      if (!origin || !destination || origin === destination) return;
      const duration = diffHours(dep.value, arrRaw);
      if (duration < 0.15 || duration > 8.5) return;
      const orderPenalty = dep.source === 'after-origin' ? 0 : 4;
      const distancePenalty = Math.abs(destIdx - originIdx - 2);
      const reportBonus = report ? 6 : 0;
      const score = 140 - Math.abs(duration - 1.8) * 6 - distancePenalty - orderPenalty + reportBonus;
      if (!best || score > best.score) best = { originIdx, destIdx, dep: dep.value, depIdx: dep.idx, arrRaw, arrIdx, report, score };
    };

    for (let a = 0; a < airportIndexes.length - 1; a++) {
      const originIdx = airportIndexes[a];

      const beforeTimes = timeIndexes
        .filter((item) => item.idx < originIdx)
        .map((item) => ({ idx: item.idx, value: cleanTime(item.token), source: 'before-origin' as const }));
      const beforeOriginTime = beforeTimes[beforeTimes.length - 1] || null;
      const reportFromBefore = beforeTimes.length >= 2 ? beforeTimes[0].value : null;

      const nextAirportAfterOrigin = airportIndexes.find((idx) => idx > originIdx) ?? legTokens.length;
      const afterOriginTimes = timeIndexes
        .filter((item) => item.idx > originIdx && item.idx < nextAirportAfterOrigin)
        .map((item) => ({ idx: item.idx, value: cleanTime(item.token), source: 'after-origin' as const }));

      const depCandidates: TimePick[] = [];
      if (beforeOriginTime) depCandidates.push(beforeOriginTime);
      depCandidates.push(...afterOriginTimes);

      for (const dep of depCandidates) {
        for (let b = a + 1; b < airportIndexes.length; b++) {
          const destIdx = airportIndexes[b];
          if (destIdx <= dep.idx) continue;
          const arrivalCandidates = timeIndexes.filter((item) => item.idx > destIdx).map((item) => ({ idx: item.idx, raw: cleanTime(item.token) }));
          for (const arr of arrivalCandidates) {
            scoreCandidate(originIdx, dep, destIdx, arr.idx, arr.raw, reportFromBefore);
          }
        }
      }
    }

    if (!best) return { leg: null, reportCandidate: null, debriefCandidate: null };
    const bestLeg = best as BestLegPick;
    const origin = upper[bestLeg.originIdx];
    const destination = upper[bestLeg.destIdx];
    const afterArrivalTimes = timeIndexes.filter((item) => item.idx > bestLeg.arrIdx).map((item) => cleanTime(item.token));
    const debriefCandidate = afterArrivalTimes.length ? afterArrivalTimes[afterArrivalTimes.length - 1] : null;
    const workType = (forcedWorkType || (hasExtraMarker ? 'PS' : 'OP')).toUpperCase();
    const arrClean = bestLeg.arrRaw.replace('(+1)', '');
    const nextDay = /\(\+1\)/.test(bestLeg.arrRaw) || minutesOfDay(bestLeg.arrRaw) < minutesOfDay(bestLeg.dep);
    const durationHours = diffHours(bestLeg.dep, bestLeg.arrRaw);
    const leg: FlightLeg = {
      flightNumber,
      origin,
      destination,
      departureTime: bestLeg.dep,
      arrivalTime: arrClean,
      workType,
      aircraftType: aircraftFrom(legTokens),
      isNextDay: nextDay,
      duration: durationHours,
    };
    return { leg, reportCandidate: bestLeg.report, debriefCandidate };
  }

  while (i < source.length) {
    const token = source[i];
    const upper = String(token || '').toUpperCase();

    if (isExtraAimsMarker(token)) {
      pendingWorkType = 'PS';
      i++;
      continue;
    }

    // Alguns PDFs extraídos no Android/iOS trazem a apresentação antes do primeiro "LA".
    // Preservar esse horário para não usar a decolagem como apresentação. MAS: quando
    // este bloco chegou via continuação "(...)" (isLayoverStart=true), o token antes do
    // "LA" pode ser o boundary de folga/descanso/pernoite de OUTRO dia que ficou colado
    // no mesmo bloco visual (ver flightContextStartIndex) - nunca é seguro promovê-lo a
    // apresentação deste voo (#510). Nesse caso a apresentação publicada de verdade, se
    // existir, já é encontrada por parseLegTokens via reportFromBefore (linha ~2512),
    // escopada aos próprios tokens da perna - não precisa deste atalho.
    if (!isLayoverStart && !legs.length && !firstReportTime && isAimsTime(token)) {
      firstReportTime = cleanTime(token);
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
          // Não interromper a leitura da perna. No AIMS convertido, (...) pode
          // separar origem/destino em voo noturno, ex.: LA3500 22:55 BSB (...) MAB 00:50 01:20.
          legTokens.push(source[i]);
          if (i + 1 < source.length && /^[A-Z]{3}$/.test(String(source[i + 1] || '').toUpperCase())) {
            hotel = String(source[i + 1]).toUpperCase();
          }
          i++;
          continue;
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
        // O debrief explícito pertence à última perna lida. Se uma perna posterior
        // não traz debrief publicado, não manter o debrief da perna anterior; usar
        // chegada + 30min no fechamento da jornada. Isso evita dutyDebrief voltar
        // para 08:50 em voos noturnos como GRU-PMW 23:35-02:00.
        explicitDebriefTime = parsed.debriefCandidate || null;
        if (parsed.leg.isNextDay) isNextDay = true;
        legs.push(parsed.leg);
      }
      continue;
    }

    if (upper.startsWith('(...)')) {
      if (i + 1 < source.length && /^[A-Z]{3}$/.test(String(source[i + 1] || '').toUpperCase())) hotel = String(source[i + 1]).toUpperCase();
      // Se ainda existir LA adiante no mesmo bloco, não parar a leitura; isso
      // recupera PDFs em que a coluna começa por continuação do pernoite e depois traz o voo do dia.
      const nextLa = source.slice(i + 1).findIndex((token) => String(token || '').toUpperCase() === 'LA');
      if (nextLa >= 0) { i++; continue; }
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
