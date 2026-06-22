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
  if (typeof day.flyingHours === 'number') return day.flyingHours;
  return (day.legs || []).reduce((sum, leg) => sum + getLegHours(leg), 0);
}

function getLegHours(leg: FlightLeg): number {
  if (typeof leg.duration === 'number') return leg.duration;
  return diffHours(leg.departureTime, leg.arrivalTime, Boolean(leg.isNextDay));
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
  if (typeof day.dutyHours === 'number') return day.dutyHours;
  if (!day.dutyReport || !day.dutyDebrief) return 0;
  return diffHours(day.dutyReport, day.dutyDebrief, day.isNextDay);
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
  const dep = parseTime(leg.departureTime);
  const arr = parseTime(leg.arrivalTime);
  const depNight = dep ? dep.hours >= 18 || dep.hours < 6 : false;
  const arrNight = arr ? arr.hours >= 18 || arr.hours < 6 : false;
  return depNight || arrNight || Boolean(leg.isNextDay);
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

function shouldEvaluateMinimumRest(prev: RosterDay, next: RosterDay): boolean {
  // CBF + EMER, cursos sequenciais, check + voo e outras atividades do mesmo dia
  // são subprogramações de um mesmo bloco operacional/agenda. Não devem gerar
  // falso positivo de repouso mínimo de 12h entre elas.
  if (prev.date === next.date) return false;

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

function countNightOpsInRolling168h(days: RosterDay[]): number {
  const nightDates = days
    .filter(day => hasMadrugadaDuty(day))
    .map(day => parseDate(day.date).getTime())
    .sort((a, b) => a - b);

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
  let current = 0;
  let max = 0;
  for (const day of days) {
    if (hasMadrugadaDuty(day)) {
      current += 1;
      max = Math.max(max, current);
    } else if (isActiveDuty(day) || isRecoveryDay(day)) {
      current = 0;
    }
  }
  return max;
}

function hasMadrugadaDuty(day: RosterDay): boolean {
  if (!isActiveDuty(day)) return false;
  if (day.legs?.some(leg => Boolean(leg.isNextDay))) return true;
  const report = minutesOfDay(day.dutyReport);
  const debrief = minutesOfDay(day.dutyDebrief);
  if (report === null || debrief === null) return (day.legs || []).some(isNightLeg);
  if (day.isNextDay) return true;
  return report < 6 * 60 || debrief <= 6 * 60;
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
  // MT é reunião com a chefia (Meeting), não treinamento/check.
  if (code === 'MT') return false;
  return isTrainingOrGround(day);
}

function collectUnclassifiedCodes(roster: CrewRoster): Array<{ code: string; dates: string[] }> {
  const known = new Set([
    'DO', 'DR', 'DOF', 'OFF', 'HSB', 'HSBE', 'ASB', 'RES', 'CRM', 'CBF', 'EMER', 'MT', 'C32F',
    'NS', 'NSJ', 'IJ', 'DM',
    'VOO', 'LA', 'OP', 'PS', 'DH', 'CC', 'CCM', 'CP', 'CM', 'FO', 'CMT', 'CMD',
    'BSB', 'GRU', 'CGH', 'VCP', 'NAT', 'MCZ', 'FOR', 'CNF', 'PMW', 'FLN', 'MAB', 'CPV', 'GYN', 'JPA', 'EZE',
    'SDC', 'ACY', 'REP', 'DEB', 'UTC', 'FH', 'RANK', 'AERO', 'TAM', 'SNA', 'INATIVO',
    'DIA', 'EM', 'NA', 'NO', 'APOS', 'APÓS', 'ESCALA', 'BRANCO', 'PERNOITE', 'PROGRAMACAO', 'PROGRAMAÇÃO', 'LIDA', 'PDF', 'PARA', 'ESTE', 'SEM', 'BASE',
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
  const dutyHours = getDutyHours(day);
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

function auditAlertConfidence(alerts: ComplianceAlert[], days: RosterDay[]): ComplianceAlert[] {
  const dayByDate = new Map(days.map(day => [day.date, day]));
  const timingCritical = /repouso|jornada|sobreaviso|reserva|madrugada|solo entre etapas|tempo em solo|voo diário|pousos|trechos/i;

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

  const unknownCodes = collectUnclassifiedCodes(roster);
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

    metrics.totalFlightHours += flightHours;
    metrics.totalDutyHours += dutyHours;

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
      if (standbyHours > limits.maxStandbyHours) {
        pushAlert(alerts, {
          severity: 'error',
          title: 'Sobreaviso acima de 12 horas',
          description: `${day.date}: sobreaviso calculado de ${standbyHours.toFixed(1)}h.`,
          details: 'O cálculo do sobreaviso agora usa apenas a janela do próprio HSB/HSBE no dia, evitando somar dois dias consecutivos como se fossem um único sobreaviso.',
          legalReference: actRules.standby.legalReference,
          date: day.date,
        });
      }
    }

    if (isReserve(day)) {
      metrics.reserveCount += 1;
      if (dutyHours > limits.maxReserveHoursOther) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Reserva acima de 6 horas',
          description: `${day.date}: reserva calculada de ${dutyHours.toFixed(1)}h.`,
          details: 'Pelo ACT, a reserva em local de trabalho tem período entre 3h e 6h; confirme se a marcação ASB/RES foi lida como reserva ou outro evento interno.',
          legalReference: actRules.reserve.legalReference,
          date: day.date,
        });
      }
    }

    if (hasMadrugada) metrics.nightOperations += 1;

    if (day.legs?.length > 1) {
      getGroundIntervals(day).forEach((interval) => {
        const maxGround = interval.period === 'noturno' ? actRules.groundBetweenLegs.maxNightMinutes : actRules.groundBetweenLegs.maxDayMinutes;
        if (interval.minutes > maxGround) {
          pushAlert(alerts, {
            severity: 'warning',
            title: 'Tempo em solo entre etapas acima do ACT',
            description: `${day.date}: intervalo de ${interval.minutes}min entre ${interval.previousArrival} e ${interval.nextDeparture}; limite ${interval.period}: ${maxGround}min.`,
            details: 'O ACT diferencia período diurno e noturno conforme horário da base contratual; confirmar fuso/base se houver divergência.',
            legalReference: actRules.groundBetweenLegs.legalReference,
            date: day.date,
          });
        }
      });
    }

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
      if (dutyHours > limits.absoluteDailyDutyLimit) {
        pushAlert(alerts, {
          severity: 'error',
          title: 'Jornada diária acima do teto absoluto parametrizado',
          description: `${day.date}: jornada calculada de ${dutyHours.toFixed(1)}h.`,
          details: `${day.dutyReport || '--'} até ${day.dutyDebrief || '--'} · ${day.legs.length} trecho(s).`,
          legalReference: 'RBAC 117, Apêndice A, A117.15',
          date: day.date,
        });
      } else if (dutyHours > limits.maxDailyDutyHoursComposite) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Jornada diária acima de 14h — verificar tipo de tripulação/GRF',
          description: `${day.date}: jornada calculada de ${dutyHours.toFixed(1)}h.`,
          details: 'Pode ser regular apenas em hipóteses específicas, tripulação/revezamento, extensão registrada, ACT/manual aplicável ou GRF aprovado.',
          legalReference: 'RBAC 117, Apêndice A, A117.15; Lei 13.475/2017',
          date: day.date,
        });
      } else if (dutyHours > limits.maxDailyDutyHoursSimpleAttention) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Jornada superior a 11h — ponto de atenção',
          description: `${day.date}: jornada calculada de ${dutyHours.toFixed(1)}h.`,
          details: 'O limite aplicável depende do tipo de tripulação e do enquadramento operacional; revisar se a escala indica tripulação composta/revezamento.',
          legalReference: 'RBAC 117, Apêndice A, Tabelas A.4 e A.5',
          date: day.date,
        });
      }

      if (flightHours > limits.maxDailyFlightHoursSimple) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Tempo de voo diário acima de 8h — verificar enquadramento',
          description: `${day.date}: tempo de voo calculado de ${flightHours.toFixed(1)}h.`,
          details: 'A validação exata depende do tipo de tripulação, classe da aeronave, ACT/manual e autorização operacional.',
          legalReference: 'RBAC 117, Apêndice A, A117.13, Tabelas A.1 e A.2',
          date: day.date,
        });
      }

      if ((day.legs || []).length > limits.maxDailyLandingsSimple) {
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
  if (roster.totals?.dutyHours) metrics.totalDutyHours = roster.totals.dutyHours;

  if (metrics.totalFlightHours > limits.maxFlightHoursMonth) {
    pushAlert(alerts, {
      severity: 'error',
      title: 'Limite mensal de horas de voo excedido',
      description: `${metrics.totalFlightHours.toFixed(1)}h de voo no mês. Limite aplicado pela ACT para ${legalProfile.aircraftGroupLabel}: ${limits.maxFlightHoursMonth}h/28 dias.`,
      legalReference: actRules.flightLimits.legalReference,
    });
  } else if (metrics.totalFlightHours > limits.maxFlightHoursMonth * 0.9) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Horas de voo próximas do limite mensal',
      description: `${metrics.totalFlightHours.toFixed(1)}h de voo, equivalente a ${((metrics.totalFlightHours / limits.maxFlightHoursMonth) * 100).toFixed(0)}% do limite parametrizado.`,
      legalReference: actRules.flightLimits.legalReference,
    });
  }

  if (metrics.totalDutyHours > limits.maxDutyHoursMonth) {
    pushAlert(alerts, {
      severity: 'error',
      title: 'Limite mensal de horas de trabalho excedido',
      description: `${metrics.totalDutyHours.toFixed(1)}h de jornada no mês. Limite usado pelo sistema: ${limits.maxDutyHoursMonth}h.`,
      legalReference: 'RBAC 117, Apêndice A, A117.15(i) / Lei 13.475/2017',
    });
  } else if (metrics.totalDutyHours > limits.maxDutyHoursMonth * 0.9) {
    pushAlert(alerts, {
      severity: 'warning',
      title: 'Horas de trabalho próximas do limite mensal',
      description: `${metrics.totalDutyHours.toFixed(1)}h de jornada, equivalente a ${((metrics.totalDutyHours / limits.maxDutyHoursMonth) * 100).toFixed(0)}% do limite parametrizado.`,
      legalReference: 'RBAC 117, Apêndice A, A117.15(i) / Lei 13.475/2017',
    });
  }

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
      severity: 'error',
      title: 'Operações na madrugada acima do limite em janela de 168h',
      description: `Foram identificadas até ${maxNightOpsWindow} madrugadas em uma janela móvel de 168h.`,
      legalReference: actRules.nightOps.legalReference,
    });
  }

  if (metrics.maxConsecutiveNights > limits.maxConsecutiveNightOps) {
    pushAlert(alerts, {
      severity: 'error',
      title: 'Mais de 2 madrugadas consecutivas',
      description: `Foram identificadas ${metrics.maxConsecutiveNights} madrugadas consecutivas.`,
      legalReference: actRules.nightOps.legalReference,
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

  alerts = auditAlertConfidence(alerts, sortedDays);

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
      score += Math.min(18, longGroundIntervals.reduce((sum, interval) => sum + Math.max(0, interval.minutes - 120) / 30, 0));
      reasons.push(`tempo em solo elevado (${longGroundIntervals.length} intervalo(s))`);
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
  if ((day.pairingCode || '').toUpperCase() === 'MT') return 'Meeting · reunião com a chefia';
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
  return `Escala ${main}. A classificação de puxada considera principalmente sequência, mais de 3 pernas, tempo em solo e repouso; duas pernas na madrugada são tratadas como rotina operacional normal. Dia de maior carga: ${top.date} (${top.label}), nota ${top.fatigueScore}/100.`;
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
