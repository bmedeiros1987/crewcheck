import type { CrewRoster, RosterDay, FlightLeg } from './pdfParser';
import { getActRulesForProfile, getLegalProfile, type CrewRoleSelection, type LegalProfileSummary } from './actRules';
import { getRosterCodeDefinition } from './rosterCodes';

export interface ComplianceAlert {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  description: string;
  details?: string;
  legalReference?: string;
  date?: string;
  confidence?: 'alta' | 'media' | 'baixa';
  classification?: 'confirmada' | 'atencao' | 'leitura_inconsistente';
  evidence?: string;
}

export interface Metrics {
  totalFlightHours: number;
  maxFlightHoursMonth: number;
  totalDutyHours: number;
  maxDutyHoursMonth: number;
  totalDaysOff: number;
  minDaysOffRequired: number;
  totalStandby: number;
  maxStandbyMonth: number;
  nightOperations: number;
  maxNightOps168h: number;
  weekendPairs: number;
  minWeekendPairs: number;
  restDays: number;
  daysOff: number;
  standbyCount: number;
  reserveCount: number;
  averageTurnaround: number;
  maxConsecutiveNights: number;
}

export interface DayLoadAnalysis {
  date: string;
  dayOfWeek: string;
  type: RosterDay['type'];
  label: string;
  fatigueScore: number;
  loadLabel: 'Leve' | 'Moderado' | 'Puxado' | 'Muito puxado';
  dutyHours: number;
  flightHours: number;
  dutyStartTime: string | null;
  dutyEndTime: string | null;
  isDutyNextDay: boolean;
  sectors: number;
  restBefore: number | null;
  restAfter: number | null;
  isNightDuty: boolean;
  isEarlyStart: boolean;
  isLateFinish: boolean;
  isDayOff: boolean;
  gymScore: number;
  reasons: string[];
  blockedWindows?: Array<{ startTime: string; endTime: string; isNextDay?: boolean; label: string; source: 'duty' | 'flight' | 'standby' | 'reserve' | 'training' | 'raw' }>;
}

export interface LoadAnalysis {
  intensityScore: number;
  recoveryScore: number;
  grade: 'Excelente' | 'Boa' | 'Moderada' | 'Pesada' | 'Muito pesada';
  summary: string;
  hardestDays: DayLoadAnalysis[];
  easiestDays: DayLoadAnalysis[];
  days: DayLoadAnalysis[];
}

export interface ComplianceResult {
  engineVersion?: string;
  alerts: ComplianceAlert[];
  metrics: Metrics;
  overallStatus: 'compliant' | 'warning' | 'violation';
  score: number;
  summary: string;
  loadAnalysis: LoadAnalysis;
  legalProfile: LegalProfileSummary;
}

export interface GymRecommendation {
  date: string;
  dayNumber: number;
  dayType: string;
  reason: string;
  availability: 'ideal' | 'good' | 'moderate' | 'limited';
  suggestedDuration: string;
  suggestedTime: string;
  startTime: string;
  endTime: string;
  duration: string;
  priority: 'high' | 'medium' | 'low';
  planType?: 'completo' | 'moderado' | 'recuperativo' | 'mobilidade' | 'evitar';
  focus?: string;
  intensity?: string;
  caution?: string;
  confidence?: 'alta' | 'media' | 'baixa';
  recoveryScore: number;
  loadScore: number;
}

const COMPLIANCE_ENGINE_VERSION = '11.1.95';
const SHOW_TECHNICAL_CODE_ALERTS = false;

const LIMITS = {
  maxFlightHoursMonth: 80,
  maxDutyHoursMonth: 176,
  maxDailyDutyHoursSimpleAttention: 11,
  maxDailyDutyHoursComposite: 14,
  absoluteDailyDutyLimit: 18,
  maxDailyFlightHoursSimple: 8,
  maxDailyLandingsSimple: 4,
  minDaysOffRequired: 10,
  minDaysOffFallback: 9,
  maxStandbyMonth: 8,
  maxStandbyHours: 12,
  minStandbyRestIfNotCalled: 8,
  maxReserveHours121: 6,
  maxReserveHoursOther: 10,
  maxNightOps168h: 4,
  maxConsecutiveNightOps: 2,
  minWeekendPairs: 1,
  maxConsecutiveWorkPeriods: 6,
};

function parseTime(timeStr: string | null | undefined): { hours: number; minutes: number } | null {
  if (!timeStr) return null;
  const [h, m] = timeStr.replace('(+1)', '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { hours: h, minutes: m };
}

function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

function minutesOfDay(timeStr: string | null | undefined): number | null {
  const parsed = parseTime(timeStr);
  if (!parsed) return null;
  return parsed.hours * 60 + parsed.minutes;
}

function diffHours(start: string, end: string, forceNextDay = false): number {
  const startMinutes = minutesOfDay(start);
  const endMinutes = minutesOfDay(end);
  if (startMinutes === null || endMinutes === null) return 0;
  let diff = endMinutes - startMinutes;
  if (diff < 0 || forceNextDay) diff += 24 * 60;
  return diff / 60;
}

function getFlightHours(day: RosterDay): number {
  const legs = day.legs || [];
  if (legs.length) {
    const legSum = legs.reduce((sum, leg) => sum + getLegHours(leg), 0);
    // v11.0.98: o total de flyingHours vindo do PDF convertido pode herdar
    // janela/pernoite e virar 20h+. Para regulamentação automática, pernas
    // legíveis são mais confiáveis que o total agregado do PDF.
    return round1(legSum);
  }
  return typeof day.flyingHours === 'number' ? round1(day.flyingHours) : 0;
}

function getLegHours(leg: FlightLeg): number {
  if (typeof leg.duration === 'number') return leg.duration;
  return diffHours(leg.departureTime, leg.arrivalTime, Boolean(leg.isNextDay));
}

function getDutyWindowHours(day: RosterDay): number {
  if (!day.dutyReport || !day.dutyDebrief) return 0;
  return diffHours(day.dutyReport, day.dutyDebrief, day.isNextDay);
}

function getGroundIntervalHours(day: RosterDay): number {
  if (!day.legs || day.legs.length < 2) return 0;
  const totalMinutes = getGroundIntervals(day).reduce((sum, interval) => sum + interval.minutes, 0);
  return round1(totalMinutes / 60);
}

function getLegDutyEnvelopeHours(day: RosterDay): number {
  const legs = day.legs || [];
  if (!legs.length) return 0;

  const start = cleanClockTime(day.dutyReport) || cleanClockTime(legs[0]?.departureTime);
  const lastLeg = legs[legs.length - 1];
  const lastArrival = cleanClockTime(lastLeg?.arrivalTime);
  if (!start || !lastArrival) return getFlightHours(day);

  const firstDeparture = minutesOfDay(legs[0]?.departureTime);
  const lastArrivalMin = minutesOfDay(lastArrival);
  const lastIsNextDay = Boolean(day.isNextDay || lastLeg?.isNextDay || (firstDeparture !== null && lastArrivalMin !== null && lastArrivalMin <= firstDeparture));
  const flightEnvelope = diffHours(start, lastArrival, lastIsNextDay);
  // Corte operacional estimado: 30 minutos após o último pouso quando o PDF parece
  // ter puxado o debrief de outro dia/perna. Isso evita jornadas absurdas de 20h+.
  return round1(flightEnvelope + 0.5);
}


function getDutyMarginsWithoutGround(day: RosterDay): { reportMargin: number; debriefMargin: number; sectorDutyHours: number; evidence: string } {
  const legs = day.legs || [];
  const flightHours = getFlightHours(day);
  if (!legs.length) {
    return { reportMargin: 0, debriefMargin: 0, sectorDutyHours: round1(flightHours), evidence: 'sem pernas de voo' };
  }

  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const report = cleanClockTime(day.dutyReport);
  const firstDeparture = cleanClockTime(firstLeg?.departureTime);
  const lastArrival = cleanClockTime(lastLeg?.arrivalTime);
  const debrief = cleanClockTime(day.dutyDebrief);

  let reportMargin = 0.83; // apresentação típica quando a coluna está contaminada ou ausente
  if (report && firstDeparture) {
    const minutes = windowDurationMinutes(report, firstDeparture, false);
    // Só aceitar margem de apresentação plausível. Valores altos quase sempre indicam
    // que o PDF juntou pernoite/continuação no mesmo dia.
    if (minutes >= 0 && minutes <= 180) reportMargin = minutes / 60;
  }

  let debriefMargin = 0.5; // corte padrão de 30 min após último pouso
  if (lastArrival && debrief) {
    const explicitNextDay = Boolean(day.isNextDay || lastLeg?.isNextDay);
    const minutes = windowDurationMinutes(lastArrival, debrief, explicitNextDay);
    // Aceitar apenas corte plausível; se o corte cair horas depois, é contaminação
    // de pernoite/coluna e não deve inflar a métrica regulatória.
    if (minutes >= 0 && minutes <= 120) debriefMargin = minutes / 60;
  }

  return {
    reportMargin: round1(reportMargin),
    debriefMargin: round1(debriefMargin),
    sectorDutyHours: round1(flightHours + reportMargin + debriefMargin),
    evidence: `voo ${flightHours.toFixed(1)}h + apresentação ${reportMargin.toFixed(1)}h + corte ${debriefMargin.toFixed(1)}h`,
  };
}

function isLikelyParserMergedDutyWindow(day: RosterDay, dutyWindowHours: number, groundHours: number, flightHours: number): boolean {
  const legs = day.legs || [];
  if (!legs.length) return false;
  if (dutyWindowHours <= 0) return false;
  const raw = `${day.rawText || ''} ${day.pairingCode || ''}`.toUpperCase();
  const noGroundDuty = getDutyMarginsWithoutGround(day).sectorDutyHours;

  // AIMS convertido frequentemente traz o corte do dia seguinte no dia anterior
  // (ex.: 09:30 até 08:50), gerando 20h+ artificiais. Quando a janela excede
  // muito o bloco de voo + apresentação/corte plausíveis, tratamos como parser.
  if (dutyWindowHours >= 16 && dutyWindowHours > noGroundDuty + 4) return true;

  // Um ou dois trechos com janela gigante quase sempre são pernoite/continuação
  // visualmente colados, não uma jornada diária real.
  if (legs.length <= 2 && dutyWindowHours > 14 && flightHours <= 7) return true;

  // Se o raw traz continuação visual "(...)" ou aeroportos soltos, aumenta a chance
  // de o parser ter herdado horários de outro bloco.
  if (dutyWindowHours > 13 && /\.\.\.|CONTINUA|CONTINUACAO|CONTINUAÇÃO/.test(raw) && flightHours <= 8) return true;

  // Solo diurno longo não deve virar jornada. Se a diferença entre janela e voo é
  // majoritariamente solo/espera, deixe como leitura estimada, não irregularidade.
  if (groundHours >= 3 && dutyWindowHours > noGroundDuty + groundHours - 0.2) return true;

  return false;
}

function getRegulatoryDutyBreakdown(day: RosterDay): { dutyWindowHours: number; groundHours: number; dutyHours: number; mode: 'liquida_sem_solo' | 'janela' | 'estimada_parser' | 'indisponivel' } {
  if (isRecoveryDay(day) || isNonOperationalAbsence(day) || isEmptyCalendarDay(day)) {
    return { dutyWindowHours: 0, groundHours: 0, dutyHours: 0, mode: 'indisponivel' };
  }

  const dutyWindowHours = getDutyWindowHours(day);

  if (day.type === 'VOO' && (day.legs || []).length > 0) {
    const groundHours = getGroundIntervalHours(day);
    const flightHours = getFlightHours(day);
    const noGroundDuty = getDutyMarginsWithoutGround(day).sectorDutyHours;

    if (isLikelyParserMergedDutyWindow(day, dutyWindowHours, groundHours, flightHours)) {
      // Em leitura contaminada, não usar report/debrief bruto. A métrica segura é:
      // horas de voo + apresentação plausível + corte plausível, sem solo/pernoite.
      return { dutyWindowHours: round1(dutyWindowHours), groundHours: round1(groundHours), dutyHours: round1(noGroundDuty), mode: 'estimada_parser' };
    }

    // Tempo em solo entre etapas não entra como jornada automática. Mesmo quando o
    // report/debrief forem confiáveis, a régua de alerta usa voo + apresentação/corte
    // plausíveis para evitar que conexão longa vire irregularidade falsa.
    const netDuty = dutyWindowHours > 0
      ? Math.max(flightHours, Math.min(Math.max(0, dutyWindowHours - groundHours), noGroundDuty + 0.3))
      : Math.max(flightHours, noGroundDuty);
    return { dutyWindowHours: round1(dutyWindowHours), groundHours: round1(groundHours), dutyHours: round1(netDuty), mode: 'liquida_sem_solo' };
  }

  if (isStandby(day) && !hasStandbyActivationCombination(day)) {
    // Sobreaviso sem acionamento é validado pela própria janela de SAV, mas não entra
    // como jornada de voo/trabalho para alertas de jornada diária/semanal/mensal.
    return { dutyWindowHours: 0, groundHours: 0, dutyHours: 0, mode: 'indisponivel' };
  }

  if (typeof day.dutyHours === 'number' && day.dutyHours > 0 && !day.legs?.length) {
    return { dutyWindowHours: round1(day.dutyHours), groundHours: 0, dutyHours: round1(day.dutyHours), mode: 'janela' };
  }

  if (dutyWindowHours > 0) {
    return { dutyWindowHours: round1(dutyWindowHours), groundHours: 0, dutyHours: round1(dutyWindowHours), mode: 'janela' };
  }

  return { dutyWindowHours: 0, groundHours: 0, dutyHours: 0, mode: 'indisponivel' };
}

function isValidClockTime(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^\d{1,2}:\d{2}(?:\(\+1\))?$/.test(value.trim());
}

function cleanClockTime(value: string | null | undefined): string | null {
  if (!isValidClockTime(value)) return null;
  const base = value.trim().replace('(+1)', '');
  const [h, m] = base.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isWindowNextDay(start: string, end: string, explicitNextDay = false): boolean {
  const startMin = minutesOfDay(start);
  const endMin = minutesOfDay(end);
  if (startMin === null || endMin === null) return explicitNextDay;
  return Boolean(explicitNextDay || endMin <= startMin);
}

function windowDurationMinutes(start: string, end: string, explicitNextDay = false): number {
  const startMin = minutesOfDay(start);
  const endMin = minutesOfDay(end);
  if (startMin === null || endMin === null) return 0;
  let diff = endMin - startMin;
  if (diff <= 0 || explicitNextDay) diff += 24 * 60;
  return diff;
}

type BlockingWindowSource = 'duty' | 'flight' | 'standby' | 'reserve' | 'training' | 'raw';

type BlockingWindow = { startTime: string; endTime: string; isNextDay?: boolean; label: string; source: BlockingWindowSource };

function makeBlockingWindow(start: string | null | undefined, end: string | null | undefined, label: string, source: BlockingWindowSource, explicitNextDay = false): BlockingWindow | null {
  const cleanStart = cleanClockTime(start);
  const cleanEnd = cleanClockTime(end);
  if (!cleanStart || !cleanEnd) return null;
  const duration = windowDurationMinutes(cleanStart, cleanEnd, explicitNextDay);
  // Descartar janelas absurdas ou quase zeradas para não contaminar rotina/repouso.
  if (duration < 15 || duration > 20 * 60) return null;
  return { startTime: cleanStart, endTime: cleanEnd, isNextDay: isWindowNextDay(cleanStart, cleanEnd, explicitNextDay), label, source };
}

function pushUniqueWindow(windows: BlockingWindow[], next: BlockingWindow | null) {
  if (!next) return;
  const key = `${next.startTime}-${next.endTime}-${next.label}-${next.source}`;
  if (windows.some((item) => `${item.startTime}-${item.endTime}-${item.label}-${item.source}` === key)) return;
  windows.push(next);
}

function getActivityLabelForWindow(day: RosterDay): string {
  const type = String(day.type || '').toUpperCase();
  if (type === 'VOO') return 'voo';
  if (type === 'ASB' || type === 'RES') return 'reserva';
  if (type === 'HSB' || type === 'HSBE') return 'sobreaviso';
  if (isTrainingOrGround(day)) return 'treinamento/check';
  return 'programação';
}

function getDayBlockingWindows(day: RosterDay): BlockingWindow[] {
  const windows: BlockingWindow[] = [];
  const type = String(day.type || '').toUpperCase();
  const label = getActivityLabelForWindow(day);

  pushUniqueWindow(windows, makeBlockingWindow(day.dutyReport, day.dutyDebrief, label, isStandby(day) ? 'standby' : isReserve(day) ? 'reserve' : isTrainingOrGround(day) ? 'training' : 'duty', day.isNextDay));

  const legs = day.legs || [];
  if (legs.length) {
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    // Bloqueio mínimo pelo horário real dos voos. Isso impede sugestão de rotina
    // dentro do voo quando report/debrief vierem ausentes, invertidos ou contaminados
    // por check/treinamento anterior.
    pushUniqueWindow(windows, makeBlockingWindow(firstLeg.departureTime, lastLeg.arrivalTime, 'voo', 'flight', Boolean(day.isNextDay || lastLeg.isNextDay)));
  }

  const raw = `${day.rawText || ''} ${day.pairingCode || ''}`.toUpperCase();
  const rawTimes = Array.from(raw.matchAll(/\b(\d{1,2}:\d{2})(?:\s*\(\+1\)|\(\+1\))?/g)).map((match) => {
    const token = match[0].replace(/\s+/g, '');
    return token.includes('(+1)') ? `${match[1]}(+1)` : match[1];
  });

  if ((type === 'ASB' || type === 'RES' || type === 'HSB' || type === 'HSBE') && rawTimes.length >= 2) {
    pushUniqueWindow(windows, makeBlockingWindow(rawTimes[0], rawTimes[1], label, type === 'ASB' || type === 'RES' ? 'reserve' : 'standby', rawTimes[1].includes('(+1)')));
  }

  if (!windows.length && rawTimes.length >= 2 && !isFormalDayOff(day) && !isLayoverOrInactive(day)) {
    pushUniqueWindow(windows, makeBlockingWindow(rawTimes[0], rawTimes[rawTimes.length - 1], label, 'raw', rawTimes[rawTimes.length - 1].includes('(+1)')));
  }

  return windows.sort((a, b) => (minutesOfDay(a.startTime) ?? 0) - (minutesOfDay(b.startTime) ?? 0));
}

function getPrimaryBlockingWindow(day: RosterDay): BlockingWindow | null {
  const windows = getDayBlockingWindows(day);
  if (!windows.length) return null;
  // Para o painel e rotina, o voo real tem prioridade quando o report/debrief está
  // ausente ou misturado com check. A janela completa continua em blockedWindows.
  return windows.find((item) => item.source === 'flight') || windows[0];
}

function getDutyHours(day: RosterDay): number {
  return getRegulatoryDutyBreakdown(day).dutyHours;
}

function getEffectiveStandbyHours(day: RosterDay): number {
  const raw = `${day.rawText || ''} ${day.pairingCode || ''}`.toUpperCase();
  const afterCode = raw.replace(/.*\bHSBE?\b/, '');
  const stationTimes = [...afterCode.matchAll(/\b[A-Z]{3}\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/g)].map(match => match[1]);

  if (stationTimes.length >= 2) {
    const start = stationTimes[0];
    const end = stationTimes[1];
    return round1(diffHours(start.replace('(+1)', ''), end.replace('(+1)', ''), end.includes('(+1)')));
  }

  if (day.dutyReport && day.dutyDebrief) {
    return round1(diffHours(day.dutyReport, day.dutyDebrief, day.isNextDay));
  }

  return 0;
}

function isFormalDayOff(day: RosterDay): boolean {
  const type = String(day.type || '').toUpperCase();
  const code = getPrimaryRosterCode(day);
  const definition = getRosterCodeDefinition(code);
  // Considera como folga formal qualquer código mapeado na base de siglas como DAY_OFF.
  // Isso inclui DOP/DOPR (período oposto), VC (férias) e demais folgas publicadas.
  return ['DO', 'DOF', 'DR'].includes(type) || definition?.category === 'DAY_OFF' || ['DOP', 'DOPR', 'VC', 'FOLGA'].includes(code);
}

function isRestExtension(day: RosterDay): boolean {
  return day.type === 'OFF';
}

function isLayoverOrInactive(day: RosterDay): boolean {
  return day.type === 'LAYOVER';
}

function isRecoveryDay(day: RosterDay): boolean {
  return isFormalDayOff(day) || isRestExtension(day) || isLayoverOrInactive(day);
}

function isEmptyCalendarDay(day: RosterDay): boolean {
  return day.type === 'OTHER' && !day.dutyReport && !day.dutyDebrief && !(day.legs || []).length && !day.pairingCode;
}

function getPrimaryRosterCode(day: RosterDay): string {
  const direct = String(day.pairingCode || '').toUpperCase().trim();
  if (direct && direct !== '—' && !/^LA\d{3,4}$/.test(direct)) return direct;
  const type = String(day.type || '').toUpperCase().trim();
  const raw = String(day.rawText || '').toUpperCase();
  const mapped = raw.match(/\b(DOPR|DOP|DOF|DOA|DOBI|DOB|DOM|DRC|DR|VC|FOLGA|OFF|NSJ|IJ|NS|DM|[A-Z]{1,4}J)\b/)?.[1];
  return mapped || type || '';
}

function getRosterCode(day: RosterDay): string {
  return getPrimaryRosterCode(day);
}

function isNonOperationalAbsence(day: RosterDay): boolean {
  const code = getRosterCode(day);
  return code === 'NS' || code === 'DM' || (code.endsWith('J') && code !== 'IJ');
}

function isJourneyInterruption(day: RosterDay): boolean {
  return getRosterCode(day) === 'IJ';
}

function isDayOff(day: RosterDay): boolean {
  // Mantido para compatibilidade visual: qualquer dia de recuperação aparece como descanso.
  return isRecoveryDay(day);
}

function isActiveDuty(day: RosterDay): boolean {
  if (isRecoveryDay(day) || isNonOperationalAbsence(day)) return false;
  return day.type === 'VOO' || isStandby(day) || isReserve(day) || isTrainingOrGround(day) || isJourneyInterruption(day) || getDutyHours(day) > 0;
}

function isStandby(day: RosterDay): boolean {
  return ['HSB', 'HSBE'].includes(day.type);
}

function isReserve(day: RosterDay): boolean {
  return ['RES', 'ASB'].includes(day.type);
}

function isTrainingOrGround(day: RosterDay): boolean {
  const key = `${day.type} ${day.pairingCode || ''} ${day.rawText || ''}`.toUpperCase();
  if (isNonOperationalAbsence(day)) return false;
  return /\b(CRM|CBF|EMER|MT|C\d{2,3}F|IJ|TREIN|TRAIN|SIM|CHECK|COMPET[ÊE]NCIA|MEETING|REUNI[AÃ]O|INTERRUP[ÇC][AÃ]O)\b/.test(key) || (day.type === 'OTHER' && getDutyHours(day) > 0 && day.legs.length === 0);
}

function isNightLeg(leg: FlightLeg): boolean {
  return legTouchesMadrugada(leg);
}

function legTouchesMadrugada(leg: FlightLeg): boolean {
  const dep = minutesOfDay(leg.departureTime);
  const arr = minutesOfDay(leg.arrivalTime);
  if (dep === null || arr === null) return Boolean(leg.isNextDay);
  let start = dep;
  let end = arr;
  if (end <= start || leg.isNextDay) end += 24 * 60;
  const windows: Array<[number, number]> = [
    [0, 6 * 60],
    [24 * 60, 30 * 60],
  ];
  return windows.some(([windowStart, windowEnd]) => start < windowEnd && end > windowStart);
}

function startsInEarlyWindow(day: RosterDay): boolean {
  const rep = parseTime(day.dutyReport || day.legs?.[0]?.departureTime);
  return Boolean(rep && rep.hours < 6);
}

function finishesLate(day: RosterDay): boolean {
  const deb = parseTime(day.dutyDebrief || day.legs?.[day.legs.length - 1]?.arrivalTime);
  return Boolean(day.isNextDay || (deb && deb.hours >= 22));
}

function getRestBetween(prev: RosterDay, next: RosterDay): number | null {
  if (!prev.dutyDebrief || !next.dutyReport) return null;

  const prevDate = parseDate(prev.date);
  const nextDate = parseDate(next.date);
  const dayDiff = (nextDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60);
  const prevEnd = minutesOfDay(prev.dutyDebrief);
  const nextStart = minutesOfDay(next.dutyReport);
  if (prevEnd === null || nextStart === null) return null;

  let rest = dayDiff + (nextStart - prevEnd) / 60;
  if (prev.isNextDay) rest -= 24;
  while (rest < 0) rest += 24;
  return round1(rest);
}

function isSameOperationalContinuation(prev: RosterDay, next: RosterDay): boolean {
  if (!prev || !next) return false;
  if (!isActiveDuty(prev) || !isActiveDuty(next)) return false;
  const rest = getRestBetween(prev, next);
  // Continuidade operacional curta: voo que cruza meia-noite com solo <= 5h.
  // Pernoite real (>12h) é tratado por detectAndMarkLayovers e não deve ser confundido
  // com continuação de jornada.
  if (rest === null || rest < 0 || rest > 5) return false;

  const prevLast = prev.legs?.[prev.legs.length - 1];
  const nextFirst = next.legs?.[0];
  const sameStation = Boolean(prevLast?.destination && nextFirst?.origin && prevLast.destination === nextFirst.origin);
  const nextStartsEarly = (minutesOfDay(next.dutyReport || nextFirst?.departureTime) ?? 9999) < 7 * 60;
  const previousEndedAfterMidnight = Boolean(prev.isNextDay || prevLast?.isNextDay || (minutesOfDay(prev.dutyDebrief || prevLast?.arrivalTime) ?? 9999) <= 6 * 60);

  // Escalas AIMS frequentemente quebram a mesma missão na virada do dia. Se o "repouso"
  // calculado é 1h/2h entre pouso e nova decolagem/apresentação cedo, não é repouso:
  // é continuação operacional/solo curto e não deve gerar alerta de repouso mínimo.
  const explicitContinuation = /continua[cç][aã]o operacional|\(\.\.\.\)|fim de jornada anterior|mesma jornada/i.test(`${next.rawText || ''} ${prev.rawText || ''}`);
  if (rest <= 5 && (nextStartsEarly || explicitContinuation) && (prev.legs?.length || 0) > 0 && (next.legs?.length || 0) > 0) return true;
  return Boolean((sameStation || previousEndedAfterMidnight || explicitContinuation) && nextStartsEarly);
}

function shouldEvaluateMinimumRest(prev: RosterDay, next: RosterDay): boolean {
  // CBF + EMER, cursos sequenciais, check + voo e outras atividades do mesmo dia
  // são subprogramações de um mesmo bloco operacional/agenda. Não devem gerar
  // falso positivo de repouso mínimo de 12h entre elas.
  if (prev.date === next.date) return false;
  if (isSameOperationalContinuation(prev, next)) return false;

  // Dias sem programação lida, folgas, OFF e pernoite/inativo não iniciam nova
  // jornada para fins de comparação automática de repouso mínimo.
  if (isEmptyCalendarDay(next) || isRecoveryDay(next) || isLayoverOrInactive(next)) return false;
  if (isEmptyCalendarDay(prev) || isRecoveryDay(prev) || isLayoverOrInactive(prev)) return false;

  return true;
}

function requiredRestAfterDuty(dutyHours: number, prev?: RosterDay, next?: RosterDay): number {
  // v10.8.37: 13h somente para escala originalmente publicada.
  // Acionamento, PS, voo extra, alteração ou reprogramação voltam para a régua de 12h.
  // Jornada muito longa mantém atenção operacional, mas só sobe para 16h quando não houver marca de alteração.
  if (isActivationOrScheduleChange(prev) || isActivationOrScheduleChange(next)) return 12;
  if (dutyHours > 15) return 16;
  return isOriginallyPublishedSchedule(prev) && isOriginallyPublishedSchedule(next) ? 13 : 12;
}

function isOriginallyPublishedSchedule(day?: RosterDay): boolean {
  if (!day) return false;
  if (isActivationOrScheduleChange(day)) return false;
  const raw = `${day.rawText || ''} ${day.type || ''} ${day.pairingCode || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/\b(ORIGINAL|PUBLICADA|ESCALA ORIGINAL|PLANEJADA|PLANNED|PUBLISHED)\b/.test(raw)) return true;
  return Boolean(day.dutyReport || day.dutyDebrief || (day.legs || []).length);
}

function isActivationOrScheduleChange(day?: RosterDay): boolean {
  if (!day) return false;
  const raw = `${day.rawText || ''} ${day.type || ''} ${day.pairingCode || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/\b(PS|EXTRA|ACIONAMENTO|ACIONADO|ALTERACAO|MUDANCA|MUDADO|REPROGRAMACAO|REPROGRAMADO|CHAMADO|CALL OUT)\b/.test(raw)) return true;
  return Boolean((day.legs || []).some((leg) => /\b(PS|EXTRA|OP|ACIONADO|ALTERADO)\b/i.test(String(leg.workType || ''))));
}


function isActivatedStandbyOrReserve(day?: RosterDay): boolean {
  if (!day) return false;
  if (!(isStandby(day) || isReserve(day))) return false;
  if ((day.legs || []).length > 0) return true;
  // Fix: only use explicit activation tokens — NOT 'ASB' or 'RESERVA' as they are the reserve type itself,
  // not evidence of activation. Including them caused every ASB to self-activate.
  const raw = `${day.rawText || ''} ${day.pairingCode || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return /\b(ACIONAMENTO|ACIONAD[OA]|CHAMAD[OA]|CALL\s*OUT|CALL-OUT|ATIVAD[OA]|CONVOCAD[OA]|REPROGRAMAD[OA]|ALTERACAO|ALTERAD[OA]|MUDANCA|MUDADO|VOO|LA\s*\d{3,4}|PS|EXTRA)\b/.test(raw);
}

function isActivationLikeDuty(day?: RosterDay): boolean {
  if (!day) return false;
  if ((day.legs || []).length > 0) return true;
  // Fix: 'VOO' type with legs is an activation, but isReserve(day) alone is NOT —
  // an ASB/RES without legs is a reserve period, not an activation event.
  if (day.type === 'VOO') return true;
  const raw = `${day.rawText || ''} ${day.pairingCode || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return /\b(LA\s*\d{3,4}|PS|EXTRA|ACIONAMENTO|ACIONAD[OA]|CHAMAD[OA]|CALL\s*OUT|VOO)\b/.test(raw);
}

function hasLinkedActivationInRoster(days: RosterDay[], day: RosterDay, index: number): boolean {
  if (!(isStandby(day) || isReserve(day))) return false;
  if (isActivatedStandbyOrReserve(day)) return true;
  const dayStart = minutesOfDay(day.dutyReport);
  const dayEnd = minutesOfDay(day.dutyDebrief);
  return days.some((candidate, candidateIndex) => {
    if (candidateIndex === index || candidate.date !== day.date) return false;
    if (isRecoveryDay(candidate) || isEmptyCalendarDay(candidate)) return false;
    if (!isActivationLikeDuty(candidate)) return false;
    const candidateStart = minutesOfDay(candidate.dutyReport || candidate.legs?.[0]?.departureTime);
    if (dayEnd !== null && candidateStart !== null) {
      const normalizedCandidate = candidateStart < dayEnd ? candidateStart + 24 * 60 : candidateStart;
      const gap = normalizedCandidate - dayEnd;
      // Acionamento típico: reserva/voo começa logo após o sobreaviso/reserva,
      // mas o PDF pode quebrar ou arredondar horário. Aceita até 6h para não gerar falso positivo.
      if (gap >= -15 && gap <= 6 * 60) return true;
    }
    if (dayStart !== null && candidateStart !== null) {
      // Fix: tighten the loose 12h window that was linking any two same-day events.
      // Only link if the candidate starts within 3h of the reserve/standby start.
      return Math.abs(candidateStart - dayStart) <= 3 * 60;
    }
    // Fix: do NOT return true as a fallback — that caused every reserve to be activated.
    return false;
  });
}

function calculateWeekendPairs(days: RosterDay[]): number {
  const offByDate = new Set(days.filter(isDayOff).map(day => day.date));
  const weekends = new Set<string>();

  days.forEach(day => {
    const date = parseDate(day.date);
    if (date.getDay() !== 6) return;
    const sunday = new Date(date);
    sunday.setDate(date.getDate() + 1);
    const saturdayKey = formatDate(date);
    const sundayKey = formatDate(sunday);
    if (offByDate.has(saturdayKey) && offByDate.has(sundayKey)) {
      weekends.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
    }
  });

  return weekends.size;
}

function formatDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function getMadrugadaKeys(days: RosterDay[]): number[] {
  const sorted = sortDays(days);
  const keys: number[] = [];
  let previousDay: RosterDay | null = null;

  for (const day of sorted) {
    if (!hasMadrugadaDuty(day)) {
      previousDay = day;
      continue;
    }

    const date = parseDate(day.date);
    const firstStart = getFirstOperationalStart(day).time;
    const startsBeforeSix = (minutesOfDay(firstStart) ?? 9999) < 6 * 60;
    const sameNightAsPrevious = Boolean(previousDay && hasMadrugadaDuty(previousDay) && previousDay.isNextDay && startsBeforeSix && !isRecoveryDay(previousDay));
    const keyDate = sameNightAsPrevious ? parseDate(previousDay!.date) : date;
    const key = keyDate.getTime();
    if (!keys.includes(key)) keys.push(key);
    previousDay = day;
  }

  return keys.sort((a, b) => a - b);
}

function countNightOpsInRolling168h(days: RosterDay[]): number {
  const nightDates = getMadrugadaKeys(days);
  let max = 0;
  for (let i = 0; i < nightDates.length; i++) {
    const start = nightDates[i];
    const end = start + 168 * 60 * 60 * 1000;
    const count = nightDates.filter(value => value >= start && value <= end).length;
    max = Math.max(max, count);
  }
  return max;
}

function countMaxConsecutiveMadrugadas(days: RosterDay[]): number {
  const keys = getMadrugadaKeys(days);
  if (!keys.length) return 0;
  let current = 1;
  let max = 1;
  for (let i = 1; i < keys.length; i++) {
    const dayGap = Math.round((keys[i] - keys[i - 1]) / (24 * 60 * 60 * 1000));
    if (dayGap === 1) current += 1;
    else current = 1;
    max = Math.max(max, current);
  }
  return max;
}

function hasMadrugadaDuty(day: RosterDay): boolean {
  if (isRecoveryDay(day) || isNonOperationalAbsence(day) || isEmptyCalendarDay(day)) return false;
  const legs = day.legs || [];
  if (legs.length > 0) {
    // Madrugada regulatória por voo: conta somente quando a perna toca 00:00–06:00.
    // Voo sem madrugada continua quebrando a sequência para reduzir falso positivo.
    return legs.some(legTouchesMadrugada);
  }
  if (isStandby(day)) {
    // Regra operacional ajustada: sobreaviso conta para o limite de madrugada
    // quando a janela COMEÇA na madrugada, mesmo sem acionamento. Ele continua
    // não entrando como jornada de voo/trabalho, apenas na métrica de madrugadas.
    const report = minutesOfDay(day.dutyReport);
    return report !== null && report < 6 * 60;
  }
  if (isReserve(day)) return false;
  if (!isActiveDuty(day)) return false;
  const report = minutesOfDay(day.dutyReport);
  const debrief = minutesOfDay(day.dutyDebrief);
  if (report === null || debrief === null) return false;
  // Solo/treinamento/reunião só entram como madrugada quando a atividade inteira é
  // inequivocamente operacional e atravessa a madrugada. Isso fica como exceção.
  return Boolean(day.isNextDay || (report < 6 * 60 && debrief <= 6 * 60));
}

function pushAlert(alerts: ComplianceAlert[], alert: Omit<ComplianceAlert, 'id'>): void {
  alerts.push({ id: `alert_${alerts.length + 1}`, ...alert });
}

function getGroundIntervals(day: RosterDay): Array<{ minutes: number; previousArrival: string; nextDeparture: string; period: 'diurno' | 'noturno' }> {
  const legs = day.legs || [];
  const intervals: Array<{ minutes: number; previousArrival: string; nextDeparture: string; period: 'diurno' | 'noturno' }> = [];
  for (let i = 0; i < legs.length - 1; i++) {
    const previous = legs[i];
    const next = legs[i + 1];
    const previousArrival = minutesOfDay(previous.arrivalTime);
    const nextDeparture = minutesOfDay(next.departureTime);
    if (previousArrival === null || nextDeparture === null) continue;
    let minutes = nextDeparture - previousArrival;
    if (minutes < 0 || previous.isNextDay) minutes += 24 * 60;
    const period: 'diurno' | 'noturno' = previousArrival >= 5 * 60 && previousArrival <= 21 * 60 + 59 ? 'diurno' : 'noturno';
    intervals.push({ minutes, previousArrival: previous.arrivalTime, nextDeparture: next.departureTime, period });
  }
  return intervals;
}

function isLikelySingleDayOff(sortedDays: RosterDay[], index: number): boolean {
  const day = sortedDays[index];
  if (!isFormalDayOff(day)) return false;
  const previous = sortedDays[index - 1];
  const next = sortedDays[index + 1];
  return Boolean(previous && next && isActiveDuty(previous) && isActiveDuty(next));
}

function isTrainingDay(day: RosterDay): boolean {
  const code = (day.pairingCode || day.type || '').toUpperCase();
  // MT é reunião operacional (Meeting), não treinamento/check.
  if (code === 'MT') return false;
  return isTrainingOrGround(day);
}

function collectUnclassifiedCodes(roster: CrewRoster): Array<{ code: string; dates: string[] }> {
  const known = new Set([
    'DO', 'DR', 'DOF', 'OFF', 'HSB', 'HSBE', 'ASB', 'RES', 'CRM', 'CBF', 'EMER', 'MT', 'C32F',
    'NS', 'NSJ', 'IJ', 'DM',
    'VOO', 'LA', 'OP', 'PS', 'DH', 'CC', 'CCM', 'CP', 'CM', 'FO', 'CMT', 'CMD',
    'WCH', 'WCHR', 'WCHS', 'WCHC', 'WCBD', 'BLND', 'DEAF', 'UMNR', 'PNAE', 'POB',
    'NOTOC', 'DG', 'DGR', 'DEPA', 'DEPU', 'PETC', 'ESAN', 'SVAN', 'AVIH', 'POC', 'KME', 'KIM', 'MOR', 'ASR',
    'BSB', 'GRU', 'CGH', 'VCP', 'NAT', 'MCZ', 'FOR', 'CNF', 'PMW', 'FLN', 'MAB', 'CPV', 'GYN', 'JPA', 'EZE', 'CWB', 'BEL', 'SSA', 'CXJ', 'MAO', 'SDU', 'GIG', 'REC', 'AJU', 'THE', 'SLZ', 'BPS', 'IOS',
    'SDC', 'ACY', 'REP', 'DEB', 'UTC', 'FH', 'RANK', 'AERO', 'TAM', 'SNA', 'INATIVO',
    'DIA', 'EM', 'NA', 'NO', 'DA', 'DAS', 'DE', 'DO', 'DOS', 'BRAS', 'BRASILIA', 'BRASÍLIA', 'APOS', 'APÓS', 'ESCALA', 'BRANCO', 'PERNOITE', 'PROGRAMACAO', 'PROGRAMAÇÃO', 'LIDA', 'PDF', 'PARA', 'ESTE', 'SEM', 'BASE',
    // Calendário/datas: nunca devem virar siglas operacionais desconhecidas.
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    'FEV', 'ABR', 'MAI', 'AGO', 'SET', 'OUT', 'DEZ',
    'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN',
    'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'SÁB', 'DOM',
  ]);

  const found = new Map<string, Set<string>>();
  const add = (code: string, date: string) => {
    if (!found.has(code)) found.set(code, new Set());
    found.get(code)!.add(date);
  };

  roster.days.forEach(day => {
    const airportCodes = new Set<string>([roster.base, day.base, ...(day.legs || []).flatMap(leg => [leg.origin, leg.destination])]);
    const text = `${day.rawText || ''} ${day.pairingCode || ''}`.toUpperCase();
    const tokens = text.match(/\b(?:[A-Z]{2,5}|[A-Z]\d{2}[A-Z]|C\d{2,3}F)\b/g) || [];
    tokens.forEach(token => {
      if (known.has(token) || airportCodes.has(token)) return;
      if (/^[A-Z]{1,4}J$/.test(token) && token !== 'IJ') return;
      if (/^LA\d{3,4}$/.test(token) || /^C\d{2,3}F$/.test(token) || /^\d+$/.test(token)) return;
      if (/^\d{2,3}[A-Z]?$/.test(token)) return;
      add(token, day.date);
    });
  });

  return [...found.entries()]
    .map(([code, dates]) => ({ code, dates: [...dates].slice(0, 5) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}


type TimingConfidence = {
  confidence: 'alta' | 'media' | 'baixa';
  status: 'ok' | 'review';
  notes: string[];
  evidence: string;
};

function getDayTimingConfidence(day: RosterDay): TimingConfidence {
  const notes: string[] = [];
  const active = isActiveDuty(day);
  const dutyBreakdown = getRegulatoryDutyBreakdown(day);
  const dutyHours = dutyBreakdown.dutyHours;
  const raw = `${day.rawText || ''} ${day.pairingCode || ''}`.toUpperCase();
  const extractedTimes = raw.match(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g) || [];

  if (!active) {
    return {
      confidence: 'alta',
      status: 'ok',
      notes: ['dia não operacional ou recuperação; sem cálculo legal crítico por horário'],
      evidence: `${day.date} · ${day.type}`,
    };
  }

  if (!day.dutyReport || !day.dutyDebrief) {
    notes.push('atividade sem duty report/debrief confiável no PDF');
  }

  if (dutyBreakdown.mode === 'estimada_parser') {
    notes.push('janela de apresentação/corte parece contaminada por continuação/pernoite; usando estimativa pelos trechos para evitar falso positivo');
  }

  if (day.dutyReport && day.dutyDebrief) {
    const report = minutesOfDay(day.dutyReport);
    const debrief = minutesOfDay(day.dutyDebrief);
    if (report === null || debrief === null) notes.push('horário de apresentação ou corte inválido');
    if (dutyHours <= 0) notes.push('jornada calculada zerada/negativa para atividade operacional');
    if (dutyHours > 18) notes.push(`jornada calculada muito alta (${dutyHours.toFixed(1)}h), possível inversão de coluna/horário`);
    if (dutyHours > 12 && !day.isNextDay && debrief !== null && report !== null && debrief > report && !/\(\+1\)/.test(raw)) {
      notes.push('jornada longa sem marcação clara de virada (+1); revisar leitura das colunas');
    }
  }

  if (isStandby(day)) {
    const standbyHours = getEffectiveStandbyHours(day);
    if (standbyHours > 12) notes.push(`sobreaviso calculado acima de 12h (${standbyHours.toFixed(1)}h); só confirmar se a janela HSB/HSBE foi lida no mesmo dia`);
    if (extractedTimes.length >= 4 && standbyHours > 6) notes.push('muitos horários extraídos no mesmo dia de HSB/HSBE; possível mistura de colunas do PDF');
  }

  if (day.legs?.length) {
    for (const leg of day.legs) {
      const dep = minutesOfDay(leg.departureTime);
      const arr = minutesOfDay(leg.arrivalTime);
      if (!leg.flightNumber || !/^LA\d{3,4}$/i.test(leg.flightNumber)) notes.push(`voo com número incompleto (${leg.flightNumber || 'sem número'})`);
      if (!leg.origin || !leg.destination || leg.origin.length !== 3 || leg.destination.length !== 3) notes.push(`rota incompleta em ${leg.flightNumber || 'voo'}`);
      if (dep === null || arr === null) notes.push(`horário inválido em ${leg.flightNumber || 'voo'}`);
      const legHours = getLegHours(leg);
      if (legHours <= 0 || legHours > 6) notes.push(`duração de trecho suspeita em ${leg.flightNumber || 'voo'} (${legHours.toFixed(1)}h)`);
    }
  }

  const confidence: TimingConfidence['confidence'] = notes.length === 0 ? 'alta' : notes.length <= 2 ? 'media' : 'baixa';
  return {
    confidence,
    status: confidence === 'alta' ? 'ok' : 'review',
    notes,
    evidence: [
      `Data: ${day.date}`,
      `Tipo: ${day.type}`,
      day.pairingCode ? `Código: ${day.pairingCode}` : '',
      day.dutyReport ? `Report: ${day.dutyReport}` : '',
      day.dutyDebrief ? `Debrief: ${day.dutyDebrief}${day.isNextDay ? ' (+1)' : ''}` : '',
      `Jornada calculada: ${dutyHours.toFixed(1)}h`,
      day.legs?.length ? `Trechos: ${day.legs.map(leg => `${leg.flightNumber} ${leg.origin}-${leg.destination} ${leg.departureTime}-${leg.arrivalTime}${leg.isNextDay ? '(+1)' : ''}`).join(' | ')}` : '',
    ].filter(Boolean).join(' · '),
  };
}


function isFalsePositiveLayoverMaximumAlert(alert: ComplianceAlert): boolean {
  const text = `${alert.title} ${alert.description} ${alert.details || ''}`.toLowerCase();
  return /pernoite|inativo|layover/.test(text) && /(maior|acima|superior|exced)/.test(text) && /20\s*h/.test(text);
}



type OperationalManualRule = {
  id: string;
  pattern: RegExp;
  title: string;
  description: (day: RosterDay, matches: string[]) => string;
  details: string;
  legalReference: string;
  confidence?: ComplianceAlert['confidence'];
};

const OPERATIONAL_CONTEXT_RULES: OperationalManualRule[] = [
  {
    id: 'pnae-pob',
    pattern: /\b(WCH(?:R|S|C)?|WCBD|BLND|DEAF|UMNR|PNAE|ATENDIMENTO\s+ESPECIAL)\b/gi,
    title: 'PNAE/atendimento especial — conferir Nimbus, P.O.B. e cockpit',
    description: (day, matches) => `${day.date}: indício de atendimento especial (${dedupe(matches).join(', ')}).`,
    details: 'Confirmar a sigla correta no sistema/Nimbus. Se houver atendimento especial adicional ou divergente e a inconsistência persistir, inserir apenas o adicional no P.O.B. e entregar ao cockpit no fechamento de portas. Em caso de necessidade identificada em voo para desembarque, informar imediatamente os pilotos.',
    legalReference: 'RBAC 121.586 · procedimento operacional de atendimento especial',
  },
  {
    id: 'poc',
    pattern: /\b(POC|CONCENTRADOR\s+PORT[ÁA]TIL\s+DE\s+OXIG[ÊE]NIO)\b/gi,
    title: 'POC — validar bateria, acomodação e restrição de assento',
    description: (day) => `${day.date}: possível passageiro com concentrador portátil de oxigênio.`,
    details: 'Verificar autonomia de bateria de 150% do tempo máximo estimado de voo, acomodação sem obstruir evacuação, sem bin/doghouse durante uso, preferência por janela e restrição para primeira fileira/saída de emergência.',
    legalReference: 'IAC 3134 · procedimento operacional de oxigênio portátil',
  },
  {
    id: 'notoc-dg',
    pattern: /\b(NOTOC|DGR|DG|ARTIGOS?\s+PERIGOSOS?|DANGEROUS\s+GOODS|MATERIAL\s+PERIGOSO|BATERIA\s+DE\s+L[ÍI]TIO)\b/gi,
    title: 'Artigos perigosos/NOTOC — ciência da cabine e reporte correto',
    description: (day, matches) => `${day.date}: indício de NOTOC/artigo perigoso (${dedupe(matches).join(', ')}).`,
    details: 'A NOTOC deve ser repassada pelo Comandante ao CSB/CF para ciência da cabine. Em discrepância/incidente com artigos perigosos, seguir o fluxo de reporte previsto e comunicar conforme procedimento operacional.',
    legalReference: 'Procedimento operacional de artigos perigosos/NOTOC',
  },
  {
    id: 'security-depa-depu',
    pattern: /\b(DEPA|DEPU|CUST[ÓO]DIA|CUSTODIAD[OA]|ESCOLTAS?)\b/gi,
    title: 'Security — DEPA/DEPU/custodiado exige briefing e acomodação específica',
    description: (day, matches) => `${day.date}: código/termo de security identificado (${dedupe(matches).join(', ')}).`,
    details: 'Conferir briefing do agente, assentos no final da cabine, escolta entre passageiro e corredor quando aplicável, embarque/desembarque conforme regra e restrição de bebidas quentes/alcoólicas para DEPA/custodiado.',
    legalReference: 'Resolução 461, art. 66 · procedimento operacional de security',
  },
  {
    id: 'pet-animal',
    pattern: /\b(PETC|PET-C|ESAN|SVAN|AVIH|ANIMAL\s+(?:DE\s+)?(?:SERVI[ÇC]O|APOIO))\b/gi,
    title: 'Animal em cabine/serviço — conferir assento, limite e obstrução',
    description: (day, matches) => `${day.date}: indício de animal em cabine/serviço (${dedupe(matches).join(', ')}).`,
    details: 'Conferir categoria do animal, peso/limite, acomodação aos pés do passageiro, sem bloquear corredores ou saída de emergência, e observações específicas de ESAN/SVAN/PETC.',
    legalReference: 'Procedimento operacional de animal em cabine/serviço',
  },
  {
    id: 'refueling-pax',
    pattern: /\b(ABASTEC(?:IMENTO|ENDO)?|REFUEL(?:ING)?|FUEL)\b/gi,
    title: 'Abastecimento com passageiros a bordo — portas e monitoramento',
    description: (day) => `${day.date}: possível abastecimento com passageiros a bordo.`,
    details: 'Confirmar porta primária 1L acoplada ao finger/escada e porta secundária 4L desobstruída, desarmada e monitorada por tripulante.',
    legalReference: 'Procedimento operacional de abastecimento com passageiros a bordo',
  },
  {
    id: 'medical-kme',
    pattern: /\b(KME|KIM|MEDAIRE|OCORR[ÊE]NCIA\s+M[ÉE]DICA|FORMUL[ÁA]RIO\s+M[ÉE]DICO)\b/gi,
    title: 'Ocorrência médica — KME/KIM, MedAire e MOR',
    description: (day, matches) => `${day.date}: indício médico (${dedupe(matches).join(', ')}).`,
    details: 'KME somente por médico com CRM/identificação ou, para enfermagem/tripulação, mediante autorização prévia do MedAire e Comandante. Formulário médico deve seguir fluxo interno e anexação ao MOR quando aplicável.',
    legalReference: 'Procedimento operacional de atendimento médico a bordo',
  },
  {
    id: 'exit-seat',
    pattern: /\b(EXIT\s+ROW|SA[ÍI]DA\s+DE\s+EMERG[ÊE]NCIA|ASSENTO\s+DE\s+SA[ÍI]DA)\b/gi,
    title: 'Assento de saída de emergência — briefing verbal obrigatório',
    description: (day) => `${day.date}: possível briefing de assento de saída de emergência.`,
    details: 'Determinar visualmente os requisitos, entregar cartão, perguntar se o passageiro é capaz e está disposto a operar a saída. Cada passageiro deve responder verbalmente; resposta negativa exige reacomodação antes do fechamento da porta.',
    legalReference: 'RBAC 121 · procedimento operacional de assento de saída de emergência',
  },
];

function normalizeOperationalText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map(item => item.toUpperCase().replace(/\s+/g, ' ').trim()))].slice(0, 6);
}

function addOperationalContextAlerts(alerts: ComplianceAlert[], day: RosterDay) {
  const raw = normalizeOperationalText(`${day.rawText || ''} ${day.pairingCode || ''} ${day.type || ''}`);
  if (!raw.trim()) return;

  OPERATIONAL_CONTEXT_RULES.forEach((rule) => {
    const matches = [...raw.matchAll(rule.pattern)].map((match) => match[0]);
    if (!matches.length) return;
    pushAlert(alerts, {
      severity: 'warning',
      title: rule.title,
      description: rule.description(day, matches),
      details: rule.details,
      legalReference: rule.legalReference,
      date: day.date,
      confidence: rule.confidence || 'media',
      classification: 'atencao',
      evidence: `Texto da escala: ${String(day.rawText || day.pairingCode || day.type || '').slice(0, 240)}`,
    });
  });
}

function hasStandbyActivationCombination(day: RosterDay): boolean {
  const raw = normalizeOperationalText(`${day.rawText || ''} ${day.pairingCode || ''} ${day.type || ''}`);
  const hasStandbyToken = /\bHSBE?\b|SOBREAVISO/.test(raw) || isStandby(day);
  const hasExplicitActivationToken = /\b(PS|EXTRA|ACIONAD[OA]|ACIONAMENTO|CALL\s*OUT|CHAMAD[OA]|VOO)\b/.test(raw);
  return hasStandbyToken && (hasExplicitActivationToken || Boolean(day.legs?.length));
}

const DUTY_LIMITS_117 = {
  // Referência segura/padrão: tripulação mínima/simples aclimatada do RBAC 117, Apêndice B, Tabela B.1.
  // Não usar 16h como limite padrão para reserva acionada. 16h só pode aparecer em contextos específicos
  // de tripulação composta/revezamento ou jornada interrompida, quando houver evidência clara na escala/GRF.
  standbyActivationSimpleCombined: 16,
};

type Rbac117SectorsBucket = '1-2' | '3-4' | '5' | '6' | '7+';
type Rbac117DutyLimit = {
  startBucket: string;
  sectorsBucket: Rbac117SectorsBucket;
  maxDutyHours: number;
  maxFlightHours: number;
  table: 'B.1';
  legalReference: string;
};

type EffectiveDutyLimit = Rbac117DutyLimit & { appliedRule: string; actChecked: boolean };

function applyMostRestrictiveDutyLimit(limit: Rbac117DutyLimit | null, profile?: LegalProfileSummary | null): EffectiveDutyLimit | null {
  if (!limit) return null;
  // Os ACTs 2025/2027 parametrizados no CrewCheck hoje são mais restritivos em
  // sobreaviso, reserva, solo entre etapas, madrugadas e limites semanais/mensais.
  // Para a duração diária da tripulação simples, o ACT remete ao limite
  // regulamentar; por isso a Tabela B.1 permanece como teto diário, e futuras
  // exceções ACT/SGRF devem entrar aqui como min(RBAC, ACT).
  return {
    ...limit,
    legalReference: profile?.actName ? `${limit.legalReference}; ${profile.actName} aplicado quando mais restritivo` : limit.legalReference,
    appliedRule: profile?.actName ? `Mais restritivo entre RBAC 117 B.1 e ${profile.actName}` : 'RBAC 117 B.1',
    actChecked: Boolean(profile?.actName),
  };
}

const RBAC117_B1_SIMPLE_TABLE: Array<{ start: number; end: number; label: string; duty: [number, number, number, number, number]; flight: [number, number, number, number, number] }> = [
  { start: 6 * 60, end: 6 * 60 + 59, label: '06h00-06h59', duty: [11, 11, 10, 9, 9], flight: [9, 9, 8, 8, 8] },
  { start: 7 * 60, end: 7 * 60 + 59, label: '07h00-07h59', duty: [13, 12, 11, 10, 9], flight: [9.5, 9, 9, 8, 8] },
  { start: 8 * 60, end: 11 * 60 + 59, label: '08h00-11h59', duty: [13, 13, 12, 11, 10], flight: [10, 9.5, 9, 9, 8] },
  { start: 12 * 60, end: 13 * 60 + 59, label: '12h00-13h59', duty: [12, 12, 11, 10, 9], flight: [9.5, 9, 9, 8, 8] },
  { start: 14 * 60, end: 15 * 60 + 59, label: '14h00-15h59', duty: [11, 11, 10, 9, 9], flight: [9, 9, 8, 8, 8] },
  { start: 16 * 60, end: 17 * 60 + 59, label: '16h00-17h59', duty: [10, 10, 9, 9, 9], flight: [8, 8, 8, 8, 8] },
  { start: 18 * 60, end: 24 * 60 + 5 * 60 + 59, label: '18h00-05h59', duty: [9, 9, 9, 9, 9], flight: [8, 8, 7, 7, 7] },
];

function getSectorsBucket(sectors: number): { bucket: Rbac117SectorsBucket; index: 0 | 1 | 2 | 3 | 4 } {
  if (sectors <= 2) return { bucket: '1-2', index: 0 };
  if (sectors <= 4) return { bucket: '3-4', index: 1 };
  if (sectors === 5) return { bucket: '5', index: 2 };
  if (sectors === 6) return { bucket: '6', index: 3 };
  return { bucket: '7+', index: 4 };
}

function getRbac117B1SimpleDutyLimit(startTime: string | null | undefined, sectors: number): Rbac117DutyLimit | null {
  const start = minutesOfDay(startTime);
  if (start === null) return null;
  const normalizedStart = start < 6 * 60 ? start + 24 * 60 : start;
  const row = RBAC117_B1_SIMPLE_TABLE.find(item => normalizedStart >= item.start && normalizedStart <= item.end);
  if (!row) return null;
  const { bucket, index } = getSectorsBucket(Math.max(1, sectors || 1));
  return {
    startBucket: row.label,
    sectorsBucket: bucket,
    maxDutyHours: row.duty[index],
    maxFlightHours: row.flight[index],
    table: 'B.1',
    legalReference: 'RBAC 117, Apêndice B, B117.7, Tabela B.1',
  };
}

function describeRbac117Limit(limit: Rbac117DutyLimit | EffectiveDutyLimit): string {
  const applied = 'appliedRule' in limit ? ` · ${limit.appliedRule}` : '';
  return `Tabela ${limit.table}: início ${limit.startBucket}, ${limit.sectorsBucket} etapa(s) → jornada máxima ${formatHoursForAlert(limit.maxDutyHours)} e voo máximo ${formatHoursForAlert(limit.maxFlightHours)}${applied}.`;
}

function addMinutesToClock(time: string, minutesToAdd: number, explicitNextDay = false): { time: string; isNextDay: boolean } | null {
  const base = minutesOfDay(time);
  if (base === null) return null;
  let total = base + minutesToAdd;
  let isNextDay = Boolean(explicitNextDay || total >= 24 * 60);
  total %= 24 * 60;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return { time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, isNextDay };
}

function getLastOperationalEndForDutyLimit(day: RosterDay): { time: string | null; isNextDay: boolean; source: string } {
  if (day.dutyDebrief) return { time: day.dutyDebrief, isNextDay: Boolean(day.isNextDay), source: 'corte/debrief publicado' };
  const lastLeg = (day.legs || [])[day.legs.length - 1];
  if (lastLeg?.arrivalTime) {
    const estimated = addMinutesToClock(lastLeg.arrivalTime, 30, Boolean(day.isNextDay || lastLeg.isNextDay));
    if (estimated) return { time: estimated.time, isNextDay: estimated.isNextDay, source: 'chegada do último trecho + 30 min de corte estimado' };
  }
  return getLastOperationalEnd(day);
}

function formatHoursForAlert(hours: number): string {
  if (!Number.isFinite(hours)) return '--';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = Math.abs(totalMinutes % 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

function getLastOperationalEnd(day: RosterDay): { time: string | null; isNextDay: boolean; source: string } {
  if (day.dutyDebrief) return { time: day.dutyDebrief, isNextDay: Boolean(day.isNextDay), source: 'corte/debrief publicado' };
  const lastLeg = (day.legs || [])[day.legs.length - 1];
  if (lastLeg?.arrivalTime) return { time: lastLeg.arrivalTime, isNextDay: Boolean(day.isNextDay || lastLeg.isNextDay), source: 'chegada do último trecho' };
  const lastWindow = [...getDayBlockingWindows(day)].sort((a, b) => (minutesOfDay(b.endTime) ?? 0) - (minutesOfDay(a.endTime) ?? 0))[0];
  return lastWindow ? { time: lastWindow.endTime, isNextDay: Boolean(lastWindow.isNextDay), source: lastWindow.label } : { time: null, isNextDay: false, source: 'sem horário final confiável' };
}

function getFirstOperationalStart(day: RosterDay): { time: string | null; source: string } {
  if (day.dutyReport) return { time: day.dutyReport, source: 'apresentação publicada' };
  const firstWindow = getDayBlockingWindows(day)[0];
  if (firstWindow?.startTime) return { time: firstWindow.startTime, source: firstWindow.label };
  const firstLeg = (day.legs || [])[0];
  return firstLeg?.departureTime ? { time: firstLeg.departureTime, source: 'decolagem do primeiro trecho' } : { time: null, source: 'sem horário inicial confiável' };
}

function getStandbyWindowForCompliance(day: RosterDay): BlockingWindow | null {
  const standby = getDayBlockingWindows(day).find(item => item.source === 'standby');
  if (standby) return standby;
  if (isStandby(day)) return makeBlockingWindow(day.dutyReport, day.dutyDebrief, 'sobreaviso', 'standby', day.isNextDay);
  const raw = `${day.rawText || ''} ${day.pairingCode || ''}`.toUpperCase();
  const afterCode = raw.replace(/.*\bHSBE?\b/, '');
  const times = [...afterCode.matchAll(/\b(\d{1,2}:\d{2})(?:\(\+1\))?\b/g)].map(match => match[0]);
  if (times.length >= 2) return makeBlockingWindow(times[0], times[1], 'sobreaviso', 'standby', times[1].includes('(+1)'));
  return null;
}

function getReserveWindowForCompliance(day: RosterDay): BlockingWindow | null {
  const reserve = getDayBlockingWindows(day).find(item => item.source === 'reserve');
  if (reserve) return reserve;
  if (isReserve(day)) return makeBlockingWindow(day.dutyReport, day.dutyDebrief, 'reserva', 'reserve', day.isNextDay);
  return null;
}

function inferCalloutMinutesForCompliance(roster: CrewRoster, actRules: ReturnType<typeof getActRulesForProfile>): number {
  const base = String(roster.base || '').toUpperCase().trim();
  // Quando o usuário configurar base com dois aeroportos no perfil, o motor deve trocar para 150 min.
  // Enquanto essa preferência não existe no PDF, BSB e bases de aeroporto único usam 90 min.
  if (/\b(SAO|CGH\/GRU|GRU\/CGH|RIO|SDU\/GIG|GIG\/SDU)\b/.test(base)) return actRules.standby.calloutMinutesMultiAirport;
  return actRules.standby.calloutMinutesDefault;
}

function addStandbyActivationDutyLimitAlerts(alerts: ComplianceAlert[], day: RosterDay, roster: CrewRoster, actRules: ReturnType<typeof getActRulesForProfile>) {
  if (!hasStandbyActivationCombination(day)) return;
  const standbyWindow = getStandbyWindowForCompliance(day);
  const end = getLastOperationalEnd(day);
  if (!standbyWindow || !end.time) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Sobreaviso acionado — cálculo de jornada incompleto',
      description: `${day.date}: há indício de acionamento durante sobreaviso, mas o início/fim confiável da jornada não foi lido.`,
      details: 'Sem horários suficientes, o CrewCheck mantém como leitura incerta e não confirma irregularidade. Confira a linha da escala e o horário real de corte.',
      legalReference: 'RBAC 117, A117.17 e B/C/E117.19 · limite combinado de sobreaviso acionado',
      date: day.date,
      confidence: 'baixa',
      classification: 'leitura_inconsistente',
    });
    return;
  }

  const calloutMinutes = inferCalloutMinutesForCompliance(roster, actRules);
  const grossHours = diffHours(standbyWindow.startTime, end.time, Boolean(standbyWindow.isNextDay || end.isNextDay));
  const regulatedHours = Math.max(0, round1(grossHours - calloutMinutes / 60));
  const remaining = round1(DUTY_LIMITS_117.standbyActivationSimpleCombined - regulatedHours);
  const details = [
    `Cálculo: início do sobreaviso ${standbyWindow.startTime} até ${end.time}${end.isNextDay ? ' (+1)' : ''}, abatendo ${calloutMinutes} min de deslocamento.`,
    `Resultado regulatório estimado: ${formatHoursForAlert(regulatedHours)} de limite combinado.`,
    `Limite usado: ${DUTY_LIMITS_117.standbyActivationSimpleCombined}h (RBAC 117). O ACT ${actRules.actName} não amplia esse limite diário, apenas regula o teto do sobreaviso isolado.`,
    'Este alerta só vira irregularidade quando há horários suficientes; caso contrário, fica como leitura incerta para evitar falso positivo.',
  ].join(' ');

  if (regulatedHours > DUTY_LIMITS_117.standbyActivationSimpleCombined) {
    pushAlert(alerts, {
      severity: 'error',
      title: 'Sobreaviso acionado acima do limite combinado de jornada',
      description: `${day.date}: SAV + jornada – deslocamento = ${formatHoursForAlert(regulatedHours)}; limite aplicado: ${DUTY_LIMITS_117.standbyActivationSimpleCombined}h.`,
      details,
      legalReference: 'RBAC 117, B/C/E117.19 · sobreaviso acionado',
      date: day.date,
      confidence: 'media',
      classification: 'confirmada',
      evidence: `SAV ${standbyWindow.startTime}-${standbyWindow.endTime}; fim ${end.time}; fonte: ${end.source}.`,
    });
  } else if (remaining <= 1) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Sobreaviso acionado próximo do limite de jornada',
      description: `${day.date}: margem estimada de ${formatHoursForAlert(remaining)} antes do limite combinado de ${DUTY_LIMITS_117.standbyActivationSimpleCombined}h.`,
      details,
      legalReference: 'RBAC 117, B/C/E117.19 · sobreaviso acionado',
      date: day.date,
      confidence: 'media',
      classification: 'atencao',
      evidence: `SAV ${standbyWindow.startTime}-${standbyWindow.endTime}; fim ${end.time}; fonte: ${end.source}.`,
    });
  }
}

function addReserveActivationDutyLimitAlerts(alerts: ComplianceAlert[], day: RosterDay, actRules: ReturnType<typeof getActRulesForProfile>, profile?: LegalProfileSummary) {
  if (!isReserve(day)) return;
  const hasActivation = Boolean(day.legs?.length) || /\b(PS|EXTRA|ACIONAD[OA]|ACIONAMENTO|CALL\s*OUT|CHAMAD[OA]|VOO|LA\d{3,4})\b/i.test(`${day.rawText || ''} ${day.pairingCode || ''}`);
  if (!hasActivation) return;
  const reserveWindow = getReserveWindowForCompliance(day);
  const end = getLastOperationalEndForDutyLimit(day);
  const start = reserveWindow?.startTime || getFirstOperationalStart(day).time;
  if (!start || !end.time) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Reserva acionada — cálculo de jornada incompleto',
      description: `${day.date}: há indício de reserva com acionamento, mas faltou horário confiável de início ou fim.`,
      details: 'Sem horários suficientes, o CrewCheck não confirma irregularidade. Confira início da reserva, apresentação do voo e corte real.',
      legalReference: 'RBAC 117, Apêndice B, B117.7; A117.19 · reserva acionada',
      date: day.date,
      confidence: 'baixa',
      classification: 'leitura_inconsistente',
    });
    return;
  }

  const sectors = Math.max(1, day.legs?.length || 1);
  const flightHours = getFlightHours(day);
  const combinedHours = round1(diffHours(start, end.time, Boolean(end.isNextDay)));
  const rbacLimit = getRbac117B1SimpleDutyLimit(start, sectors);
  // CrewCheck Fix: Apply ACT rules over RBAC 117 for reserve limit if applicable
  const actLimitHours = actRules.reserve.maxHours + 11; // ACT limits reserve to 6h, plus 11h max duty = 17h theoretical max, but RBAC is more restrictive
  const limit = applyMostRestrictiveDutyLimit(rbacLimit, profile);
  const details = [
    `Cálculo: início da reserva/apresentação ${start} até ${end.time}${end.isNextDay ? ' (+1)' : ''} (${end.source}).`,
    `Reserva acionada é analisada como jornada completa a partir do início da reserva, e não a partir do horário do acionamento/voo.`,
    limit ? describeRbac117Limit(limit) : 'Não foi possível enquadrar automaticamente a Tabela B.1 porque o horário de início não ficou confiável.',
    'O CrewCheck usa como padrão conservador a Tabela B.1 para tripulação mínima/simples aclimatada. Limites de 16h não são usados como padrão de reserva; só podem ser considerados quando houver evidência clara de tripulação composta/revezamento, GRF ou jornada interrompida aplicável.',
  ].join(' ');

  if (!limit) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Reserva acionada — limite B.1 não enquadrado automaticamente',
      description: `${day.date}: reserva + acionamento = ${formatHoursForAlert(combinedHours)}, mas o início da jornada não permitiu selecionar a faixa da Tabela B.1.`,
      details,
      legalReference: 'RBAC 117, Apêndice B, B117.7; A117.19 · reserva acionada',
      date: day.date,
      confidence: 'baixa',
      classification: 'leitura_inconsistente',
    });
    return;
  }

  const dutyRemaining = round1(limit.maxDutyHours - combinedHours);
  const flightRemaining = round1(limit.maxFlightHours - flightHours);

  if (combinedHours > limit.maxDutyHours) {
    pushAlert(alerts, {
      severity: 'error',
      title: 'Reserva acionada acima do limite de jornada RBAC 117',
      description: `${day.date}: reserva + acionamento = ${formatHoursForAlert(combinedHours)}; limite B.1 aplicado: ${formatHoursForAlert(limit.maxDutyHours)}.`,
      details,
      legalReference: limit.legalReference,
      date: day.date,
      confidence: 'alta',
      classification: 'confirmada',
      evidence: `Reserva ${start}; fim ${end.time}; etapas ${sectors}; voo ${formatHoursForAlert(flightHours)}; ${describeRbac117Limit(limit)}`,
    });
  } else if (dutyRemaining <= 1) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Reserva acionada próxima do limite de jornada RBAC 117',
      description: `${day.date}: margem estimada de ${formatHoursForAlert(dutyRemaining)} antes do limite B.1 de ${formatHoursForAlert(limit.maxDutyHours)}.`,
      details,
      legalReference: limit.legalReference,
      date: day.date,
      confidence: 'alta',
      classification: 'atencao',
      evidence: `Reserva ${start}; fim ${end.time}; etapas ${sectors}; ${describeRbac117Limit(limit)}`,
    });
  }

  if (flightHours > limit.maxFlightHours) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Reserva acionada com tempo de voo acima da Tabela B.1',
      description: `${day.date}: tempo de voo ${formatHoursForAlert(flightHours)}; limite B.1 aplicado: ${formatHoursForAlert(limit.maxFlightHours)}.`,
      details,
      legalReference: limit.legalReference,
      date: day.date,
      confidence: 'media',
      classification: 'atencao',
      evidence: `Etapas ${sectors}; ${describeRbac117Limit(limit)}`,
    });
  } else if (flightRemaining <= 0.5 && flightHours > 0) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Reserva acionada próxima do limite de tempo de voo',
      description: `${day.date}: margem estimada de ${formatHoursForAlert(flightRemaining)} antes do limite de voo B.1.`,
      details,
      legalReference: limit.legalReference,
      date: day.date,
      confidence: 'media',
      classification: 'atencao',
    });
  }
}

function getRegulatoryWorkHoursForTotals(day: RosterDay): number {
  if (isRecoveryDay(day) || isEmptyCalendarDay(day) || isNonOperationalAbsence(day)) return 0;
  if (isStandby(day) && !hasStandbyActivationCombination(day)) return 0;
  return getDutyHours(day);
}

function rollingDutyWindow(days: RosterDay[], windowDays = 7): { hours: number; startDate: string; endDate: string } {
  const sorted = sortDays(days);
  let best = { hours: 0, startDate: sorted[0]?.date || '', endDate: sorted[0]?.date || '' };
  sorted.forEach((startDay) => {
    const start = parseDate(startDay.date);
    const end = new Date(start);
    end.setDate(start.getDate() + windowDays - 1);
    const hours = sorted.reduce((sum, candidate) => {
      const current = parseDate(candidate.date);
      if (current >= start && current <= end) return sum + getRegulatoryWorkHoursForTotals(candidate);
      return sum;
    }, 0);
    if (hours > best.hours) best = { hours: round1(hours), startDate: formatDate(start), endDate: formatDate(end) };
  });
  return best;
}

function auditAlertConfidence(alerts: ComplianceAlert[], days: RosterDay[]): ComplianceAlert[] {
  const dayByDate = new Map(days.map(day => [day.date, day]));
  const timingCritical = /repouso|jornada|sobreaviso|reserva|madrugada|voo diário|pousos|trechos/i;

  return alerts
    .filter((alert) => !isFalsePositiveLayoverMaximumAlert(alert))
    .map((alert) => {
    const day = alert.date ? dayByDate.get(alert.date) : null;
    const defaultConfidence: ComplianceAlert['confidence'] = alert.severity === 'error' ? 'alta' : 'media';
    let confidence = alert.confidence || defaultConfidence;
    let classification: ComplianceAlert['classification'] = alert.severity === 'error' ? 'confirmada' : 'atencao';
    let evidence = alert.evidence;
    let details = alert.details;
    let severity = alert.severity;
    let title = alert.title;

    if (day && timingCritical.test(alert.title)) {
      const timing = getDayTimingConfidence(day);
      confidence = timing.confidence;
      evidence = timing.evidence;
      if (timing.status === 'review') {
        severity = 'warning';
        classification = 'leitura_inconsistente';
        title = alert.title.startsWith('Leitura incerta') ? alert.title : `Leitura incerta — ${alert.title}`;
        details = [
          alert.details,
          'Este item NÃO deve ser tratado como irregularidade confirmada até conferência da linha/dia da escala.',
          `Motivo da cautela: ${timing.notes.join('; ')}.`,
          `Evidência usada: ${timing.evidence}.`,
        ].filter(Boolean).join('\n');
      }
    }

    if (!day && alert.severity === 'warning') {
      classification = 'atencao';
      confidence = alert.confidence || 'media';
    }

    return {
      ...alert,
      severity,
      title,
      details,
      confidence,
      classification,
      evidence,
    };
  });
}


function sanitizeComplianceAlertsForProduction(alerts: ComplianceAlert[]): ComplianceAlert[] {
  const hiddenPatterns = [
    /tempo em solo entre etapas/i,
    /siglas não classificadas/i,
    /jornada semanal acima/i,
    /limite mensal de horas de trabalho/i,
    /jornada diária acima do teto absoluto parametrizado/i,
    /repouso entre jornadas muito justo/i,
    /número de pousos\/trechos elevado/i,
  ];

  return alerts.filter((alert) => {
    const haystack = `${alert.title} ${alert.description} ${alert.details || ''}`;
    if (hiddenPatterns.some((pattern) => pattern.test(haystack))) return false;
    // Leitura incerta é diagnóstico interno: não deve aparecer como irregularidade
    // para o usuário final, porque polui a tela e reduz confiança.
    if (alert.classification === 'leitura_inconsistente') return false;
    if (/leitura incerta/i.test(alert.title)) return false;
    return true;
  });
}

function complianceDayMonthKey(day: RosterDay): string {
  try {
    const parsed = parseDate(String(day.date || ''));
    if (Number.isFinite(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  } catch {}
  return 'unknown';
}

function flightHoursByRosterMonth(days: RosterDay[]): Array<{ key: string; flightHours: number }> {
  const map = new Map<string, number>();
  for (const day of days) {
    const key = complianceDayMonthKey(day);
    if (key === 'unknown') continue;
    map.set(key, round1((map.get(key) || 0) + getFlightHours(day)));
  }
  return Array.from(map.entries()).map(([key, flightHours]) => ({ key, flightHours })).sort((a, b) => a.key.localeCompare(b.key));
}


export function analyzeCompliance(roster: CrewRoster, roleSelection: CrewRoleSelection = 'auto'): ComplianceResult {
  let alerts: ComplianceAlert[] = [];
  const legalProfile = getLegalProfile(roster, roleSelection);
  const actRules = getActRulesForProfile(legalProfile);
  const limits = {
    ...LIMITS,
    maxFlightHoursMonth: legalProfile.flightLimit28Days,
    maxFlightHours365Days: legalProfile.flightLimit365Days,
    minDaysOffRequired: actRules.daysOff.mainParameter,
    minDaysOffFallback: actRules.daysOff.criticalFloor,
    maxStandbyMonth: actRules.standby.monthlyLimit,
    maxStandbyHours: actRules.standby.maxHours,
    maxReserveHoursOther: actRules.reserve.maxHours,
    maxNightOps168h: actRules.nightOps.maxIn168h,
    maxConsecutiveNightOps: actRules.nightOps.maxConsecutive,
  };
  const sortedDays = sortDays(roster.days);

  if (legalProfile.confidence === 'baixa') {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Função não identificada com segurança',
      description: legalProfile.inferenceReason,
      details: 'Use o seletor da tela inicial para forçar ACT de comissários ou pilotos quando o PDF não trouxer cargo/código de função claro.',
      legalReference: `${legalProfile.actName} · seleção automática`,
    });
  }

  const unknownCodes = SHOW_TECHNICAL_CODE_ALERTS ? collectUnclassifiedCodes(roster) : [];
  if (unknownCodes.length > 0) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Siglas não classificadas automaticamente',
      description: `O sistema encontrou ${unknownCodes.length} sigla(s) que não entram no cálculo de irregularidade até serem configuradas.`,
      details: unknownCodes.map(item => `${item.code} (${item.dates.join(', ')})`).join(' · '),
      legalReference: 'Glossário CrewCheck: revisar com usuário antes de transformar em regra legal.',
    });
  }

  const metrics: Metrics = {
    totalFlightHours: 0,
    maxFlightHoursMonth: limits.maxFlightHoursMonth,
    totalDutyHours: 0,
    maxDutyHoursMonth: limits.maxDutyHoursMonth,
    totalDaysOff: 0,
    minDaysOffRequired: limits.minDaysOffRequired,
    totalStandby: 0,
    maxStandbyMonth: limits.maxStandbyMonth,
    nightOperations: 0,
    maxNightOps168h: limits.maxNightOps168h,
    weekendPairs: 0,
    minWeekendPairs: limits.minWeekendPairs,
    restDays: 0,
    daysOff: 0,
    standbyCount: 0,
    reserveCount: 0,
    averageTurnaround: 0,
    maxConsecutiveNights: 0,
  };

  let restTotal = 0;
  let restCount = 0;
  let consecutiveWorkPeriods = 0;

  sortedDays.forEach((day, index) => {
    const dutyHours = getDutyHours(day);
    const flightHours = getFlightHours(day);
    const hasMadrugada = hasMadrugadaDuty(day);

    addOperationalContextAlerts(alerts, day);

    metrics.totalFlightHours += flightHours;
    metrics.totalDutyHours += getRegulatoryWorkHoursForTotals(day);

    if (isFormalDayOff(day)) {
      metrics.totalDaysOff += 1;
      metrics.daysOff += 1;
      metrics.restDays += 1;
      consecutiveWorkPeriods = 0;
    } else if (isRestExtension(day) || isLayoverOrInactive(day)) {
      metrics.restDays += 1;
      consecutiveWorkPeriods = 0;
    } else if (isActiveDuty(day)) {
      consecutiveWorkPeriods += 1;
      if (consecutiveWorkPeriods > limits.maxConsecutiveWorkPeriods) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Mais de 6 atividades consecutivas sem folga formal — revisar',
          description: `${day.date}: identificados ${consecutiveWorkPeriods} períodos consecutivos de atividade sem folga periódica.`,
          details: 'O sistema agora conta apenas atividades efetivas; DOP/DOPR/DO/DR/DOF/VC contam como folga formal; OFF e inativo/pernoite interrompem a sequência operacional, mas não entram como folga formal mensal.',
          legalReference: 'RBAC 117, Apêndice A, A117.25(a)',
          date: day.date,
        });
      }
    }

    if (isStandby(day)) {
      metrics.totalStandby += 1;
      metrics.standbyCount += 1;
      const standbyHours = getEffectiveStandbyHours(day);
      const activatedStandby = hasLinkedActivationInRoster(sortedDays, day, index);
      if (!activatedStandby && standbyHours > limits.maxStandbyHours) {
        pushAlert(alerts, {
          severity: 'error',
          title: 'Sobreaviso acima de 12 horas',
          description: `${day.date}: sobreaviso calculado de ${standbyHours.toFixed(1)}h.`,
          details: 'O cálculo do sobreaviso agora usa apenas a janela do próprio HSB/HSBE no dia, evitando somar dois dias consecutivos como se fossem um único sobreaviso.',
          legalReference: actRules.standby.legalReference,
          date: day.date,
        });
      } else if (!activatedStandby && standbyHours > 0 && standbyHours < actRules.standby.minHours) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Sobreaviso abaixo de 3 horas — revisar leitura',
          description: `${day.date}: sobreaviso calculado de ${standbyHours.toFixed(1)}h; parâmetro ACT mínimo: ${actRules.standby.minHours}h.`,
          details: 'Pode ser falha de leitura do PDF, janela incompleta ou outro código operacional confundido com HSB/HSBE. Quando houver acionamento, o CrewCheck ignora o mínimo isolado de 3h e valida apenas a regra combinada de jornada.',
          legalReference: actRules.standby.legalReference,
          date: day.date,
        });
      }
      addStandbyActivationDutyLimitAlerts(alerts, day, roster, actRules);
    }

    if (isReserve(day)) {
      metrics.reserveCount += 1;
      const activatedReserve = hasLinkedActivationInRoster(sortedDays, day, index);
      if (!activatedReserve && dutyHours > limits.maxReserveHoursOther) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Reserva acima de 6 horas',
          description: `${day.date}: reserva calculada de ${dutyHours.toFixed(1)}h.`,
          details: 'Pelo ACT, a reserva em local de trabalho tem período entre 3h e 6h; confirme se a marcação ASB/RES foi lida como reserva ou outro evento interno.',
          legalReference: actRules.reserve.legalReference,
          date: day.date,
        });
      } else if (!activatedReserve && dutyHours > 0 && dutyHours < actRules.reserve.minHours) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Reserva abaixo de 3 horas — revisar leitura',
          description: `${day.date}: reserva calculada de ${dutyHours.toFixed(1)}h; parâmetro ACT mínimo: ${actRules.reserve.minHours}h.`,
          details: 'Pode ser reserva parcial, falha de parser ou programação operacional classificada incorretamente como ASB/RES. Quando houver acionamento, o CrewCheck ignora o mínimo isolado de 3h e valida apenas a regra combinada de jornada.',
          legalReference: actRules.reserve.legalReference,
          date: day.date,
        });
      }
      addReserveActivationDutyLimitAlerts(alerts, day, actRules, legalProfile);
    }

    if (hasMadrugada) metrics.nightOperations += 1;

    // v11.0.98: tempo em solo entre etapas deixou de gerar alerta automático.
    // Ele permanece visível nos detalhes da escala, mas não entra como irregularidade
    // nem infla a jornada regulatória automática para evitar falsos positivos.

    if (isLikelySingleDayOff(sortedDays, index)) {
      const nextDay = sortedDays[index + 1];
      const nextStart = minutesOfDay(nextDay?.dutyReport);
      if (nextStart !== null && nextStart < 10 * 60 && !isTrainingDay(nextDay)) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Programação após monofolga antes das 10h',
          description: `${nextDay.date}: apresentação às ${nextDay.dutyReport} após folga simples provável em ${day.date}.`,
          details: 'O sistema identifica monofolga por aproximação quando há apenas uma folga isolada entre atividades; confirme o horário oficial de início/fim da folga publicada.',
          legalReference: actRules.daysOff.legalReference,
          date: nextDay.date,
        });
      }
    }

    if (day.type === 'VOO') {
      const breakdown = getRegulatoryDutyBreakdown(day);
      const startForLimit = getFirstOperationalStart(day).time;
      const sectorsForLimit = Math.max(1, day.legs?.length || 1);
      const b1Limit = applyMostRestrictiveDutyLimit(getRbac117B1SimpleDutyLimit(startForLimit, sectorsForLimit), legalProfile);
      // v11.1.91: regra padrão passa a usar a Tabela B.1 do RBAC 117 para tripulação mínima/simples.
      // Isso evita o erro de usar 16h como régua genérica; 16h só aparece com evidência de composta/revezamento/GRF/interrompida.
      if (breakdown.mode !== 'estimada_parser' && b1Limit) {
        const remaining = round1(b1Limit.maxDutyHours - dutyHours);
        const detail = [
          describeRbac117Limit(b1Limit),
          `Cálculo usado: jornada líquida ${formatHoursForAlert(dutyHours)}; início ${startForLimit || '--'}; ${sectorsForLimit} etapa(s).`,
          b1Limit?.appliedRule ? `Regra efetiva: ${b1Limit.appliedRule}.` : '',
          'Solo/pernoite/continuação visual não é somado automaticamente quando o parser detectar contaminação; nesse caso o alerta fica como revisão, não irregularidade confirmada.',
        ].join(' ');
        if (dutyHours > b1Limit.maxDutyHours) {
          pushAlert(alerts, {
            severity: 'error',
            title: 'Jornada acima do limite RBAC 117 — Tabela B.1',
            description: `${day.date}: jornada calculada de ${formatHoursForAlert(dutyHours)}; limite aplicado: ${formatHoursForAlert(b1Limit.maxDutyHours)}.`,
            details: detail,
            legalReference: b1Limit.legalReference,
            date: day.date,
            confidence: 'alta',
            classification: 'confirmada',
            evidence: `${day.dutyReport || '--'} até ${day.dutyDebrief || '--'} · ${day.legs.length} trecho(s).`,
          });
        } else if (remaining <= 1) {
          pushAlert(alerts, {
            severity: 'warning',
            title: 'Jornada próxima do limite RBAC 117 — Tabela B.1',
            description: `${day.date}: margem estimada de ${formatHoursForAlert(remaining)} antes do limite de ${formatHoursForAlert(b1Limit.maxDutyHours)}.`,
            details: detail,
            legalReference: b1Limit.legalReference,
            date: day.date,
            confidence: 'alta',
            classification: 'atencao',
          });
        }
      } else if (breakdown.mode !== 'estimada_parser' && dutyHours > limits.absoluteDailyDutyLimit) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Jornada diária muito acima do parâmetro — revisar leitura',
          description: `${day.date}: jornada líquida calculada de ${dutyHours.toFixed(1)}h.`,
          details: `${day.dutyReport || '--'} até ${day.dutyDebrief || '--'} · ${day.legs.length} trecho(s). Se houver pernoite/continuação, use a calculadora manual de Regulamentação para auditar o horário de apresentação e o corte real.`,
          legalReference: 'RBAC 117, Apêndice B, B117.7, Tabela B.1',
          date: day.date,
          confidence: 'baixa',
          classification: 'leitura_inconsistente',
        });
      }

      const startForFlightLimit = getFirstOperationalStart(day).time;
      const sectorsForFlightLimit = Math.max(1, day.legs?.length || 1);
      const b1FlightLimit = getRbac117B1SimpleDutyLimit(startForFlightLimit, sectorsForFlightLimit);
      if (b1FlightLimit && flightHours > b1FlightLimit.maxFlightHours) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Tempo de voo acima do limite RBAC 117 — Tabela B.1',
          description: `${day.date}: voo calculado de ${formatHoursForAlert(flightHours)}; limite aplicado: ${formatHoursForAlert(b1FlightLimit.maxFlightHours)}.`,
          details: describeRbac117Limit(b1FlightLimit),
          legalReference: b1FlightLimit.legalReference,
          date: day.date,
          confidence: 'media',
          classification: 'atencao',
        });
      }

      if ((day.legs || []).length > 6) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Número de pousos/trechos elevado',
          description: `${day.date}: ${day.legs.length} trecho(s) de voo identificados.`,
          details: 'Para tripulação mínima/simples em avião, o limite de pousos pode exigir acréscimo de repouso ou outra composição de tripulação.',
          legalReference: 'RBAC 117, Apêndice A, A117.13(a), Tabela A.1',
          date: day.date,
        });
      }
    }

    if (index > 0) {
      const previousWorkedDay = [...sortedDays.slice(0, index)]
        .reverse()
        .find(item => isActiveDuty(item) && Boolean(item.dutyDebrief));
      if (previousWorkedDay && isActiveDuty(day) && day.dutyReport && shouldEvaluateMinimumRest(previousWorkedDay, day)) {
        const rest = getRestBetween(previousWorkedDay, day);
        if (rest !== null) {
          restTotal += rest;
          restCount += 1;
          const required = requiredRestAfterDuty(getDutyHours(previousWorkedDay), previousWorkedDay, day);
          if (rest < required) {
            pushAlert(alerts, {
              severity: 'error',
              title: 'Repouso mínimo entre jornadas não atingido',
              description: `${day.date}: repouso calculado de ${rest.toFixed(1)}h; mínimo parametrizado de ${required}h após a jornada anterior.`,
              details: `Jornada anterior encerrou ${previousWorkedDay.dutyDebrief}; nova apresentação ${day.dutyReport}.`,
              legalReference: 'RBAC 117, Apêndice A, A117.23(b)',
              date: day.date,
            });
          } else if (rest < required + 1) {
            pushAlert(alerts, {
              severity: 'warning',
              title: 'Repouso entre jornadas muito justo',
              description: `${day.date}: repouso calculado de ${rest.toFixed(1)}h, apenas ${(rest - required).toFixed(1)}h acima do mínimo.`,
              legalReference: 'RBAC 117, Apêndice A, A117.23(b)',
              date: day.date,
            });
          }

          const previousDuty = getDutyHours(previousWorkedDay);
          const actAdditionalRequired = required + actRules.rest.additionalRestHours;
          if (!isActivationOrScheduleChange(previousWorkedDay) && !isActivationOrScheduleChange(day) && previousDuty > actRules.rest.additionalAfterSimpleDutyOverHours && rest < actAdditionalRequired) {
            pushAlert(alerts, {
              severity: 'warning',
              title: 'Repouso adicional do ACT após jornada acima de 10h pode não ter sido observado',
              description: `${day.date}: repouso calculado de ${rest.toFixed(1)}h após jornada anterior de ${previousDuty.toFixed(1)}h. Parâmetro ACT: +${actRules.rest.additionalRestHours}h em tripulação simples.`,
              details: 'Marcado como ponto de atenção porque o PDF nem sempre informa se a programação utilizou tripulação simples, composta ou revezamento.',
              legalReference: actRules.rest.legalReference,
              date: day.date,
            });
          }
        }
      }
    }
  });

  metrics.weekendPairs = calculateWeekendPairs(sortedDays);
  metrics.averageTurnaround = restCount > 0 ? restTotal / restCount : 0;
  metrics.maxConsecutiveNights = countMaxConsecutiveMadrugadas(sortedDays);
  const maxNightOpsWindow = countNightOpsInRolling168h(sortedDays);

  if (roster.totals?.flightHours) metrics.totalFlightHours = roster.totals.flightHours;
  // Não usar total de duty do PDF para irregularidade: em PDFs convertidos ele pode
  // incluir solo/pernoite/continuação e inflar a escala. Mantemos cálculo próprio.

  const weeklyDuty = rollingDutyWindow(sortedDays, 7);
  // v11.0.98: jornada semanal é mantida como métrica interna. Não vira alerta
  // automático porque escalas com pernoite/continuação e reservas podem distorcer
  // a janela móvel e gerar falsos positivos.

  const monthlyFlightBuckets = flightHoursByRosterMonth(sortedDays);
  const isMultiMonthRoster = monthlyFlightBuckets.length > 1;
  const monthlyBucketToEvaluate = isMultiMonthRoster
    ? monthlyFlightBuckets.reduce((best, item) => item.flightHours > best.flightHours ? item : best, { key: '', flightHours: 0 })
    : { key: `${roster.year || ''}-${String(roster.month || '').padStart(2, '0')}`, flightHours: metrics.totalFlightHours };
  const monthlyFlightHoursForAlert = monthlyBucketToEvaluate.flightHours;

  if (monthlyFlightHoursForAlert > limits.maxFlightHoursMonth) {
    pushAlert(alerts, {
      severity: 'error',
      title: 'Limite mensal de horas de voo excedido',
      description: `${monthlyFlightHoursForAlert.toFixed(1)}h de voo ${isMultiMonthRoster ? `no mês ${monthlyBucketToEvaluate.key}` : 'no mês'}. Limite aplicado pela ACT para ${legalProfile.aircraftGroupLabel}: ${limits.maxFlightHoursMonth}h/28 dias.`,
      details: isMultiMonthRoster ? `A escala visual pode estar com mês atual + subsequente anexado. O CrewCheck avaliou cada mês separadamente e não somou os meses para gerar este alerta.` : undefined,
      legalReference: actRules.flightLimits.legalReference,
    });
  } else if (monthlyFlightHoursForAlert > limits.maxFlightHoursMonth * 0.9) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Horas de voo próximas do limite mensal',
      description: `${monthlyFlightHoursForAlert.toFixed(1)}h de voo ${isMultiMonthRoster ? `no mês ${monthlyBucketToEvaluate.key}` : ''}, equivalente a ${((monthlyFlightHoursForAlert / limits.maxFlightHoursMonth) * 100).toFixed(0)}% do limite parametrizado.`,
      details: isMultiMonthRoster ? 'Cálculo separado por mês para evitar falso positivo ao visualizar escala atual + subsequente.' : undefined,
      legalReference: actRules.flightLimits.legalReference,
    });
  }

  // v11.0.98: limite mensal de jornada/trabalho fica como métrica, não como
  // irregularidade confirmada automática. O objetivo principal do módulo é validar
  // jornada por programação, repouso real, reserva/sobreaviso com acionamento e
  // madrugada, evitando travar a confiança com totais mensais contaminados.

  if (metrics.totalDaysOff < limits.minDaysOffFallback) {
    pushAlert(alerts, {
      severity: 'error',
      title: 'Quantidade mensal de folgas abaixo do patamar mínimo',
      description: `${metrics.totalDaysOff} folga(s) identificada(s). Parâmetro principal: ${limits.minDaysOffRequired}; piso de exceção usado como crítico: ${limits.minDaysOffFallback}.`,
      legalReference: 'RBAC 117, Apêndice A, A117.25(e)',
    });
  } else if (metrics.totalDaysOff < limits.minDaysOffRequired) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Quantidade mensal de folgas abaixo do parâmetro principal',
      description: `${metrics.totalDaysOff} folga(s) identificada(s). Parâmetro principal usado pelo sistema: ${limits.minDaysOffRequired}.`,
      details: 'Pode haver redução para 9 em hipótese específica; confirmar ACT, enquadramento e proporcionalidade.',
      legalReference: 'RBAC 117, Apêndice A, A117.25(e)',
    });
  }

  if (metrics.totalDaysOff === 9) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Escala publicada com 9 folgas — verificar adesão e indenização ACT',
      description: `${legalProfile.roleLabel}: o ACT prevê indenização quando o aeronauta aderir voluntariamente ao programa e a escala mensal for publicada com 9 folgas.`,
      details: `Referência de indenização: ${legalProfile.nineDaysOffCompensation}.`,
      legalReference: actRules.daysOff.legalReference,
    });
  }

  if (metrics.totalStandby > limits.maxStandbyMonth) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Sobreavisos acima do limite mensal parametrizado',
      description: `${metrics.totalStandby} sobreaviso(s) identificados no mês. Limite usado pelo sistema: ${limits.maxStandbyMonth}.`,
      legalReference: actRules.standby.legalReference,
    });
  }

  if (maxNightOpsWindow > limits.maxNightOps168h) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Madrugadas em 168h — revisar janela real',
      description: `Foram identificadas até ${maxNightOpsWindow} operações com voo em madrugada em janela móvel de 168h.`,
      details: 'O sistema conta voo que toca 00:00–06:00 e sobreaviso que começa na madrugada; folga, reserva sem voo e voo sem madrugada quebram sequência. Mantido como atenção para evitar falso positivo.',
      legalReference: actRules.nightOps.legalReference,
      confidence: 'media',
      classification: 'atencao',
    });
  }

  if (metrics.maxConsecutiveNights > limits.maxConsecutiveNightOps) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Madrugadas consecutivas — revisar sequência real',
      description: `Foram identificadas ${metrics.maxConsecutiveNights} madrugadas consecutivas por voo efetivo.`,
      details: 'Folga, pernoite/inativo, reserva sem voo e voo sem madrugada quebram a sequência; sobreaviso só conta quando começa na madrugada.',
      legalReference: actRules.nightOps.legalReference,
      confidence: 'media',
      classification: 'atencao',
    });
  }

  if (metrics.weekendPairs < limits.minWeekendPairs && metrics.totalDaysOff < limits.minDaysOffRequired) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Poucas folgas com sábado e domingo consecutivos',
      description: `${metrics.weekendPairs} fim(ns) de semana completo(s) com folga.`,
      details: 'O critério exato varia pelo enquadramento operacional; foi mantido como ponto de atenção.',
      legalReference: 'RBAC 117, Apêndice A, A117.25(f)',
    });
  }

  alerts = sanitizeComplianceAlertsForProduction(auditAlertConfidence(alerts, sortedDays));

  const loadAnalysis = analyzeDayLoads(roster);
  const errorCount = alerts.filter(alert => alert.severity === 'error').length;
  const warningCount = alerts.filter(alert => alert.severity === 'warning').length;
  const legalScore = Math.max(0, Math.min(100, 100 - errorCount * 18 - warningCount * 6));
  const overallStatus = errorCount > 0 ? 'violation' : warningCount > 0 ? 'warning' : 'compliant';
  const summary = errorCount > 0
    ? `Foram encontradas ${errorCount} irregularidade(s) e ${warningCount} ponto(s) de atenção. Escala classificada como ${loadAnalysis.grade.toLowerCase()} (${loadAnalysis.intensityScore}/100 de puxada).`
    : warningCount > 0
      ? `Sem irregularidade crítica automática, mas com ${warningCount} ponto(s) de atenção. Escala ${loadAnalysis.grade.toLowerCase()} (${loadAnalysis.intensityScore}/100 de puxada).`
      : `A escala não apresentou alertas nos parâmetros automáticos. Intensidade ${loadAnalysis.grade.toLowerCase()} (${loadAnalysis.intensityScore}/100).`;

  return {
    engineVersion: COMPLIANCE_ENGINE_VERSION,
    alerts,
    metrics: {
      ...metrics,
      totalFlightHours: round1(metrics.totalFlightHours),
      totalDutyHours: round1(metrics.totalDutyHours),
      averageTurnaround: round1(metrics.averageTurnaround),
    },
    overallStatus,
    score: legalScore,
    summary,
    loadAnalysis,
    legalProfile,
  };
}

export function analyzeDayLoads(roster: CrewRoster): LoadAnalysis {
  const sortedDays = sortDays(roster.days);
  const days: DayLoadAnalysis[] = sortedDays.map((day, index) => {
    const previousWorkedDay = [...sortedDays.slice(0, index)]
      .reverse()
      .find(item => isActiveDuty(item) && Boolean(item.dutyDebrief) && shouldEvaluateMinimumRest(item, day));
    const nextWorkedDay = sortedDays
      .slice(index + 1)
      .find(item => isActiveDuty(item) && Boolean(item.dutyReport) && shouldEvaluateMinimumRest(day, item));
    const restBefore = previousWorkedDay ? getRestBetween(previousWorkedDay, day) : null;
    const restAfter = nextWorkedDay && isActiveDuty(day) ? getRestBetween(day, nextWorkedDay) : null;
    const dutyHours = getDutyHours(day);
    const flightHours = getFlightHours(day);
    const sectors = day.legs?.length || 0;
    const night = hasMadrugadaDuty(day) || (day.legs || []).some(isNightLeg);
    const early = startsInEarlyWindow(day);
    const late = finishesLate(day);
    const off = isDayOff(day);
    const reasons: string[] = [];

    let score = 0;
    if (isFormalDayOff(day)) {
      score = 4;
      reasons.push('folga formal publicada (DO/DR/DOF/DOP/VC e equivalentes)');
    } else if (isRestExtension(day)) {
      score = 6;
      reasons.push('OFF: extensão de descanso/repouso');
    } else if (isLayoverOrInactive(day)) {
      score = 10;
      reasons.push('inativo/pernoite fora de base');
    } else if (isEmptyCalendarDay(day)) {
      score = 12;
      reasons.push('dia sem programação lida no PDF; conferir escala oficial antes de usar como folga');
    } else if (isReserve(day) || isStandby(day)) {
      score += 18;
      reasons.push('reserva/sobreaviso exige disponibilidade');
    } else if (isTrainingOrGround(day)) {
      score += 16;
      reasons.push('atividade de solo/treinamento');
    }

    if (day.type === 'VOO') {
      score += 14;
      reasons.push('atividade de voo');
    }
    if (dutyHours > 0) {
      score += dutyHours * 3.0;
      reasons.push(`${dutyHours.toFixed(1)}h de jornada`);
    }
    if (flightHours > 0) {
      score += flightHours * 1.8;
      reasons.push(`${flightHours.toFixed(1)}h de voo`);
    }
    if (sectors > 0) {
      score += sectors <= 2 ? sectors * 2.5 : 5 + (sectors - 2) * 7.5;
      reasons.push(`${sectors} perna(s)`);
      if (sectors > 3) reasons.push('mais de 3 pernas no dia aumenta a puxada');
    }
    if (night) {
      score += sectors <= 2 ? 6 : 12;
      reasons.push(sectors <= 2 ? 'madrugada operacional normal' : 'madrugada com múltiplas pernas');
    }
    const longGroundIntervals = day.legs?.length > 1 ? getGroundIntervals(day).filter((interval) => interval.minutes >= 150) : [];
    if (longGroundIntervals.length) {
      reasons.push(`solo entre etapas ignorado no cálculo regulatório (${longGroundIntervals.length} intervalo(s))`);
    }

    if (early) {
      score += sectors <= 2 ? 6 : 10;
      reasons.push('apresentação muito cedo');
    }
    if (late) {
      score += sectors <= 2 ? 6 : 10;
      reasons.push('término tarde ou no dia seguinte');
    }
    if (restBefore !== null) {
      if (restBefore < 12) {
        score += 26;
        reasons.push(`repouso anterior curto (${restBefore.toFixed(1)}h)`);
      } else if (restBefore < 16) {
        score += 12;
        reasons.push(`repouso anterior justo (${restBefore.toFixed(1)}h)`);
      } else if (restBefore >= 24) {
        score -= 6;
        reasons.push(`repouso anterior bom (${restBefore.toFixed(1)}h)`);
      }
    }
    if (restAfter !== null && restAfter < 12) {
      score += 12;
      reasons.push(`repouso posterior curto (${restAfter.toFixed(1)}h)`);
    }

    score = clamp(Math.round(score), 0, 100);
    const gymScore = clamp(Math.round(100 - score + (off ? 20 : 0) + (restBefore && restBefore > 18 ? 8 : 0)), 0, 100);

    return {
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      type: day.type,
      label: dayLabel(day),
      fatigueScore: score,
      loadLabel: loadLabel(score),
      dutyHours: round1(dutyHours),
      flightHours: round1(flightHours),
      dutyStartTime: getPrimaryBlockingWindow(day)?.startTime || day.dutyReport || null,
      dutyEndTime: getPrimaryBlockingWindow(day)?.endTime || day.dutyDebrief || null,
      isDutyNextDay: Boolean(getPrimaryBlockingWindow(day)?.isNextDay || day.isNextDay),
      sectors,
      restBefore,
      restAfter,
      isNightDuty: night,
      isEarlyStart: early,
      isLateFinish: late,
      isDayOff: off,
      gymScore,
      reasons: reasons.length ? reasons.slice(0, 5) : ['sem atividade relevante identificada'],
      blockedWindows: getDayBlockingWindows(day),
    };
  });

  const workedDays = days.filter(day => !day.isDayOff || day.fatigueScore > 10);
  const averageScore = workedDays.length ? workedDays.reduce((sum, day) => sum + day.fatigueScore, 0) / workedDays.length : 0;
  const hardBonus = days.filter(day => day.fatigueScore >= 78).length * 2;
  const intensityScore = clamp(Math.round(averageScore + hardBonus), 0, 100);
  const recoveryScore = clamp(100 - intensityScore, 0, 100);
  const hardestDays = [...days].sort((a, b) => b.fatigueScore - a.fatigueScore).slice(0, 6);
  const easiestDays = [...days]
    .filter(day => day.gymScore >= 45)
    .sort((a, b) => b.gymScore - a.gymScore || a.fatigueScore - b.fatigueScore)
    .slice(0, 8);

  return {
    intensityScore,
    recoveryScore,
    grade: scaleGrade(intensityScore),
    summary: makeLoadSummary(intensityScore, hardestDays),
    hardestDays,
    easiestDays,
    days,
  };
}

export function getGymRecommendations(roster: CrewRoster, _roleSelection: CrewRoleSelection = 'auto'): GymRecommendation[] {
  const load = analyzeDayLoads(roster);
  const chronological = [...load.days].sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

  return chronological.map((day, index): GymRecommendation => {
    const dayNumber = Number(day.date.split('/')[0]);
    const previous = chronological[index - 1] || null;
    const next = chronological[index + 1] || null;
    const previousHeavy = Boolean(previous && previous.fatigueScore >= 70);
    const nextHeavy = Boolean(next && next.fatigueScore >= 70);
    const previousNight = Boolean(previous?.isNightDuty || previous?.isLateFinish);
    const nextEarly = Boolean(next?.isEarlyStart || (next?.restBefore !== null && next?.restBefore !== undefined && next.restBefore < 14));
    const recoveryAfterHardDuty = previousHeavy || previousNight || (day.restBefore !== null && day.restBefore < 16);
    const protectSleep = nextEarly || nextHeavy || (day.restAfter !== null && day.restAfter < 14);

    if (day.type === 'OTHER' && day.dutyHours === 0 && day.flightHours === 0 && day.sectors === 0) {
      return makeGymRecommendation(day, {
        dayNumber,
        dayType: day.dayOfWeek,
        availability: 'limited',
        priority: 'low',
        startTime: '19:00',
        endTime: '19:25',
        duration: '20–25min',
        reason: 'Dia incluído para completar a escala, mas sem programação lida no PDF. Não trate como folga confirmada; use apenas para mobilidade leve após conferir a escala oficial.',
      });
    }

    if (day.type === 'LAYOVER') {
      const station = day.label.replace(/^Inativo\/Pernoite\s*·?\s*/i, '') || 'fora de base';
      const lightOnly = recoveryAfterHardDuty || protectSleep;
      return makeGymRecommendation(day, {
        dayNumber,
        dayType: day.dayOfWeek,
        availability: lightOnly ? 'moderate' : 'good',
        priority: lightOnly ? 'medium' : 'medium',
        startTime: lightOnly ? '17:30' : '10:00',
        endTime: lightOnly ? '18:15' : '11:15',
        duration: lightOnly ? '45min' : '1h15',
        reason: `Pernoite/inativo em ${station}. ${lightOnly ? 'A prioridade é recuperar sono e preservar a próxima jornada; faça mobilidade, caminhada e treino técnico leve.' : 'Boa janela para treino moderado no hotel, cardio leve e mobilidade, mantendo margem para deslocamento e descanso.'}`,
      });
    }

    if (day.type === 'OFF') {
      const lightOnly = recoveryAfterHardDuty || protectSleep;
      return makeGymRecommendation(day, {
        dayNumber,
        dayType: day.dayOfWeek,
        availability: lightOnly ? 'moderate' : 'good',
        priority: 'medium',
        startTime: lightOnly ? '10:00' : '09:00',
        endTime: lightOnly ? '10:50' : '10:15',
        duration: lightOnly ? '50min' : '1h15',
        reason: `OFF/extensão de descanso. ${lightOnly ? 'Use como recuperação ativa, porque há jornada pesada próxima ou descanso justo.' : 'Bom para treino moderado, sem tratar como folga formal mensal.'}`,
      });
    }

    if (day.type === 'DO' || day.type === 'DOF' || day.type === 'DR') {
      const isMiddleOfRestBlock = Boolean(previous?.isDayOff && next?.isDayOff);
      const firstAfterHeavy = recoveryAfterHardDuty && !isMiddleOfRestBlock;
      const protectNext = protectSleep && !isMiddleOfRestBlock;
      const fullTraining = isMiddleOfRestBlock || (!firstAfterHeavy && !protectNext && day.gymScore >= 75);

      return makeGymRecommendation(day, {
        dayNumber,
        dayType: day.dayOfWeek,
        availability: fullTraining ? 'ideal' : 'good',
        priority: fullTraining ? 'high' : 'medium',
        startTime: fullTraining ? '08:30' : '09:30',
        endTime: fullTraining ? '10:30' : '10:30',
        duration: fullTraining ? '2h' : '1h',
        reason: `Folga formal (${day.type}). ${fullTraining ? 'É uma das melhores janelas da escala para treino completo, especialmente por estar dentro/ao lado de bloco de recuperação.' : 'Boa para treino moderado; ajuste a carga conforme a jornada anterior e a próxima programação.'}`,
      });
    }

    if (day.type === 'OTHER' && day.isDayOff) {
      return makeGymRecommendation(day, {
        dayNumber,
        dayType: day.dayOfWeek,
        availability: 'moderate',
        priority: 'medium',
        startTime: '10:00',
        endTime: '11:00',
        duration: '1h',
        reason: 'Dia sem programação lida no PDF. Use como janela moderada somente após conferir se não há atividade publicada em outro sistema.',
      });
    }

    if (day.gymScore >= 72 && !day.isNightDuty && !day.isLateFinish && !protectSleep) {
      const start = day.isEarlyStart ? '18:30' : '17:30';
      return makeGymRecommendation(day, {
        dayNumber,
        dayType: day.dayOfWeek,
        availability: 'good',
        priority: 'medium',
        startTime: start,
        endTime: addHours(start, 1.15),
        duration: '1h10',
        reason: `Dia operacional mais leve (${day.fatigueScore}/100). Treino moderado é viável: ${day.reasons.join(', ')}.`,
      });
    }

    if (day.gymScore >= 52 && !day.isNightDuty) {
      const morningWindow = !day.isEarlyStart && !protectSleep;
      return makeGymRecommendation(day, {
        dayNumber,
        dayType: day.dayOfWeek,
        availability: 'moderate',
        priority: 'medium',
        startTime: morningWindow ? '07:30' : '18:00',
        endTime: morningWindow ? '08:20' : '18:45',
        duration: '45–50min',
        reason: `Treino leve/moderado. Evite carga máxima: ${day.reasons.join(', ')}.`,
      });
    }

    const shortRecovery = day.isNightDuty || day.isLateFinish || day.isEarlyStart || day.fatigueScore >= 65;
    return makeGymRecommendation(day, {
      dayNumber,
      dayType: day.dayOfWeek,
      availability: 'limited',
      priority: 'low',
      startTime: shortRecovery ? '20:00' : '19:00',
      endTime: shortRecovery ? '20:25' : '19:30',
      duration: shortRecovery ? '20–25min' : '30min',
      reason: `Evitar treino pesado (${day.fatigueScore}/100). Priorize sono, hidratação, mobilidade, alongamento e caminhada leve. Motivos: ${day.reasons.join(', ')}.`,
    });
  });
}

function makeGymRecommendation(
  day: DayLoadAnalysis,
  data: Omit<GymRecommendation, 'date' | 'suggestedDuration' | 'suggestedTime' | 'recoveryScore' | 'loadScore'>
): GymRecommendation {
  const guidance = buildGymGuidance(day, data);
  return {
    date: day.date,
    suggestedDuration: data.duration,
    suggestedTime: `${data.startTime}–${data.endTime}`,
    recoveryScore: day.gymScore,
    loadScore: day.fatigueScore,
    confidence: data.confidence || guidance.confidence,
    planType: data.planType || guidance.planType,
    focus: data.focus || guidance.focus,
    intensity: data.intensity || guidance.intensity,
    caution: data.caution || guidance.caution,
    ...data,
  };
}

function buildGymGuidance(day: DayLoadAnalysis, data: { priority: 'high' | 'medium' | 'low'; availability: GymRecommendation['availability'] }) {
  if (day.type === 'OTHER') {
    return {
      confidence: 'baixa' as const,
      planType: 'mobilidade' as const,
      focus: 'Apenas mobilidade leve até confirmar se o dia realmente não tem programação.',
      intensity: 'Baixa',
      caution: 'Dia criado para completar a escala; não trate como folga sem conferir a escala oficial.',
    };
  }
  if (day.type === 'LAYOVER') {
    return {
      confidence: 'media' as const,
      planType: day.fatigueScore <= 25 ? 'moderado' as const : 'recuperativo' as const,
      focus: 'Treino de hotel: mobilidade, caminhada inclinada, core, elásticos e força sem exaustão.',
      intensity: day.fatigueScore <= 25 ? 'Moderada controlada' : 'Baixa/moderada',
      caution: 'Considere deslocamento, alimentação, check-in, sono e próxima apresentação antes de elevar a carga.',
    };
  }
  if (['DO', 'DOF', 'DR'].includes(day.type)) {
    return {
      confidence: 'alta' as const,
      planType: data.priority === 'high' ? 'completo' as const : 'moderado' as const,
      focus: data.priority === 'high' ? 'Treino completo: força principal, acessórios, cardio leve e mobilidade.' : 'Treino moderado com ênfase em técnica, core e recuperação ativa.',
      intensity: data.priority === 'high' ? 'Moderada/alta controlada' : 'Moderada',
      caution: 'Mesmo em folga formal, reduza a carga se houver sono ruim, dor muscular ou jornada pesada no dia anterior.',
    };
  }
  if (day.type === 'OFF') {
    return {
      confidence: 'alta' as const,
      planType: 'recuperativo' as const,
      focus: 'Recuperação ativa: mobilidade, caminhada leve, core e alongamento.',
      intensity: 'Baixa/moderada',
      caution: 'OFF é extensão de descanso; não use como dia de treino máximo se o objetivo for recuperar sono.',
    };
  }
  if (day.fatigueScore >= 65 || data.priority === 'low') {
    return {
      confidence: 'alta' as const,
      planType: 'evitar' as const,
      focus: 'Sono, hidratação, mobilidade, liberação miofascial leve e caminhada curta.',
      intensity: 'Muito baixa',
      caution: 'Evite musculação pesada, HIIT, corrida intensa e treino longo neste dia.',
    };
  }
  return {
    confidence: 'alta' as const,
    planType: data.priority === 'medium' ? 'moderado' as const : 'recuperativo' as const,
    focus: 'Treino funcional curto, força técnica, core e mobilidade sem prejudicar o descanso.',
    intensity: data.priority === 'medium' ? 'Moderada' : 'Baixa',
    caution: 'Proteja o sono antes de madrugadas, apresentações cedo e dias com muitos trechos.',
  };
}

function extractEndFromLoad(_day: DayLoadAnalysis): string {
  // Sem guardar a hora final no DayLoadAnalysis, escolhemos janela conservadora no fim da tarde.
  return '17:00';
}

function sortDays(days: RosterDay[]): RosterDay[] {
  return [...days].sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());
}

function dayLabel(day: RosterDay): string {
  if (isFormalDayOff(day)) return 'Folga formal';
  if (isRestExtension(day)) return 'OFF · extensão de descanso';
  if (isLayoverOrInactive(day)) return day.hotel ? `Inativo/Pernoite · ${day.hotel}` : 'Inativo/Pernoite';
  if (day.type === 'VOO') return day.legs.map(leg => `${leg.origin}-${leg.destination}`).join(' / ') || 'Voo';
  if (isStandby(day)) return `${day.type} · Sobreaviso/Reserva`;
  if ((day.pairingCode || '').toUpperCase() === 'MT') return 'Meeting · reunião operacional';
  if (isTrainingOrGround(day)) return day.pairingCode ? `Treinamento/solo · ${day.pairingCode}` : 'Treinamento/solo';
  return day.pairingCode || day.type || 'Atividade';
}

function loadLabel(score: number): DayLoadAnalysis['loadLabel'] {
  if (score >= 75) return 'Muito puxado';
  if (score >= 55) return 'Puxado';
  if (score >= 30) return 'Moderado';
  return 'Leve';
}

function scaleGrade(score: number): LoadAnalysis['grade'] {
  if (score >= 80) return 'Muito pesada';
  if (score >= 65) return 'Pesada';
  if (score >= 45) return 'Moderada';
  if (score >= 25) return 'Boa';
  return 'Excelente';
}

function makeLoadSummary(score: number, hardestDays: DayLoadAnalysis[]): string {
  const main = scaleGrade(score).toLowerCase();
  const top = hardestDays[0];
  if (!top) return `Escala ${main}, sem dias críticos identificados.`;
  return `Escala ${main}. A classificação de puxada considera sequência, mais de 3 pernas, voo efetivo, madrugada operacional e repouso; tempo em solo entre etapas não gera irregularidade automática. Dia de maior carga: ${top.date} (${top.label}), nota ${top.fatigueScore}/100.`;
}

function addHours(time: string, hours: number): string {
  const base = minutesOfDay(time) ?? 0;
  const total = base + Math.round(hours * 60);
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
