import type { CrewRoster, RosterDay, FlightLeg } from './pdfParser';
import type { GymRecommendation } from './complianceEngine';
import type { RoutineSuggestion } from './routinePlanner';
import { findRosterCodes, getRosterCodeDefinition, rosterCodeTitle } from './rosterCodes';

export type CalendarExportMode = 'all' | 'flights' | 'flights-rest' | 'duties' | 'rest' | 'gym' | 'routine';
export type CalendarTitleFormat = 'route-flight' | 'flight-route';

export interface CalendarExportOptions {
  mode?: CalendarExportMode;
  titleFormat?: CalendarTitleFormat;
  includeReminders?: boolean;
  flightReminderMinutes?: number[];
  dutyReminderMinutes?: number[];
  gymReminderMinutes?: number[];
  routineReminderMinutes?: number[];
  routineSuggestions?: RoutineSuggestion[];
  includeFinancialNotes?: boolean;
  /**
   * v11.1.92: padrão limpo, sem criar compromissos separados para rotina/tripulação/check-in.
   * 'operational-detailed': formato operacional validado para o Google Calendar — um evento por
   * jornada (C/I→C/O), um evento por etapa, atividades (HSB/ASB/treinamento) e folgas/férias com o
   * código publicado. Sem eventos auxiliares (check-in/verificação) e com fuso de cada aeroporto.
   */
  calendarStyle?: 'roster-cards' | 'legacy-detailed' | 'operational-detailed';
}


const DEFAULT_OPTIONS: Required<CalendarExportOptions> = {
  mode: 'all',
  titleFormat: 'route-flight',
  includeReminders: true,
  flightReminderMinutes: [120, 30],
  dutyReminderMinutes: [120, 30],
  gymReminderMinutes: [60],
  routineReminderMinutes: [60],
  routineSuggestions: [],
  includeFinancialNotes: false,
  calendarStyle: 'roster-cards',
};

const AIRPORT_META: Record<string, { city: string; airport?: string; timezone?: string }> = {
  BSB: { city: 'Brasília', airport: 'Brasília', timezone: 'America/Sao_Paulo' },
  GYN: { city: 'Goiânia', airport: 'Goiânia', timezone: 'America/Sao_Paulo' },
  GRU: { city: 'Guarulhos', airport: 'Guarulhos', timezone: 'America/Sao_Paulo' },
  CGH: { city: 'São Paulo', airport: 'Congonhas', timezone: 'America/Sao_Paulo' },
  VCP: { city: 'Campinas', airport: 'Viracopos', timezone: 'America/Sao_Paulo' },
  NAT: { city: 'Natal', airport: 'Natal', timezone: 'America/Fortaleza' },
  MCZ: { city: 'Maceió', airport: 'Maceió', timezone: 'America/Maceio' },
  FOR: { city: 'Fortaleza', airport: 'Fortaleza', timezone: 'America/Fortaleza' },
  CNF: { city: 'Belo Horizonte', airport: 'Confins', timezone: 'America/Sao_Paulo' },
  PMW: { city: 'Palmas', airport: 'Palmas', timezone: 'America/Araguaina' },
  FLN: { city: 'Florianópolis', airport: 'Florianópolis', timezone: 'America/Sao_Paulo' },
  MAB: { city: 'Marabá', airport: 'Marabá', timezone: 'America/Belem' },
  CPV: { city: 'Campina Grande', airport: 'Campina Grande', timezone: 'America/Fortaleza' },
  JPA: { city: 'João Pessoa', airport: 'João Pessoa', timezone: 'America/Fortaleza' },
  EZE: { city: 'Buenos Aires / Ezeiza', airport: 'Ezeiza', timezone: 'America/Argentina/Buenos_Aires' },
  VIX: { city: 'Vitória', airport: 'Vitória', timezone: 'America/Sao_Paulo' },
  SSA: { city: 'Salvador', airport: 'Salvador', timezone: 'America/Bahia' },
  GIG: { city: 'Rio de Janeiro', airport: 'Galeão', timezone: 'America/Sao_Paulo' },
  SDU: { city: 'Rio de Janeiro', airport: 'Santos Dumont', timezone: 'America/Sao_Paulo' },
  REC: { city: 'Recife', airport: 'Recife', timezone: 'America/Recife' },
  AJU: { city: 'Aracaju', airport: 'Aracaju', timezone: 'America/Maceio' },
  BEL: { city: 'Belém', airport: 'Belém', timezone: 'America/Belem' },
  SLZ: { city: 'São Luís', airport: 'São Luís', timezone: 'America/Fortaleza' },
  CGB: { city: 'Cuiabá', airport: 'Cuiabá', timezone: 'America/Cuiaba' },
  POA: { city: 'Porto Alegre', airport: 'Porto Alegre', timezone: 'America/Sao_Paulo' },
  CUR: { city: 'Curitiba', airport: 'Curitiba', timezone: 'America/Sao_Paulo' },
  CWB: { city: 'Curitiba', airport: 'Afonso Pena', timezone: 'America/Sao_Paulo' },
  OPS: { city: 'Sinop', airport: 'Sinop', timezone: 'America/Cuiaba' },
  ROO: { city: 'Rondonópolis', airport: 'Rondonópolis', timezone: 'America/Cuiaba' },
  AFL: { city: 'Alta Floresta', airport: 'Alta Floresta', timezone: 'America/Cuiaba' },
  CGR: { city: 'Campo Grande', airport: 'Campo Grande', timezone: 'America/Campo_Grande' },
  MAO: { city: 'Manaus', airport: 'Manaus', timezone: 'America/Manaus' },
  BVB: { city: 'Boa Vista', airport: 'Boa Vista', timezone: 'America/Boa_Vista' },
  PVH: { city: 'Porto Velho', airport: 'Porto Velho', timezone: 'America/Porto_Velho' },
  RBR: { city: 'Rio Branco', airport: 'Rio Branco', timezone: 'America/Rio_Branco' },
  STM: { city: 'Santarém', airport: 'Santarém', timezone: 'America/Santarem' },
  MCP: { city: 'Macapá', airport: 'Macapá', timezone: 'America/Belem' },
  THE: { city: 'Teresina', airport: 'Teresina', timezone: 'America/Fortaleza' },
  IMP: { city: 'Imperatriz', airport: 'Imperatriz', timezone: 'America/Fortaleza' },
  JDO: { city: 'Juazeiro do Norte', airport: 'Juazeiro do Norte', timezone: 'America/Fortaleza' },
  IOS: { city: 'Ilhéus', airport: 'Ilhéus', timezone: 'America/Bahia' },
  BPS: { city: 'Porto Seguro', airport: 'Porto Seguro', timezone: 'America/Bahia' },
  FEN: { city: 'Fernando de Noronha', airport: 'Fernando de Noronha', timezone: 'America/Noronha' },
  IGU: { city: 'Foz do Iguaçu', airport: 'Foz do Iguaçu', timezone: 'America/Sao_Paulo' },
  LDB: { city: 'Londrina', airport: 'Londrina', timezone: 'America/Sao_Paulo' },
  NVT: { city: 'Navegantes', airport: 'Navegantes', timezone: 'America/Sao_Paulo' },
  JOI: { city: 'Joinville', airport: 'Joinville', timezone: 'America/Sao_Paulo' },
  UDI: { city: 'Uberlândia', airport: 'Uberlândia', timezone: 'America/Sao_Paulo' },
  AEP: { city: 'Buenos Aires / Aeroparque', airport: 'Aeroparque', timezone: 'America/Argentina/Buenos_Aires' },
  COR: { city: 'Córdoba', airport: 'Córdoba', timezone: 'America/Argentina/Cordoba' },
  MVD: { city: 'Montevidéu', airport: 'Carrasco', timezone: 'America/Montevideo' },
  ASU: { city: 'Assunção', airport: 'Silvio Pettirossi', timezone: 'America/Asuncion' },
  SCL: { city: 'Santiago', airport: 'Santiago', timezone: 'America/Santiago' },
  LIM: { city: 'Lima', airport: 'Jorge Chávez', timezone: 'America/Lima' },
  BOG: { city: 'Bogotá', airport: 'El Dorado', timezone: 'America/Bogota' },
  MDE: { city: 'Medellín', airport: 'José María Córdova', timezone: 'America/Bogota' },
  UIO: { city: 'Quito', airport: 'Mariscal Sucre', timezone: 'America/Guayaquil' },
  GYE: { city: 'Guayaquil', airport: 'José Joaquín de Olmedo', timezone: 'America/Guayaquil' },
  LPB: { city: 'La Paz', airport: 'El Alto', timezone: 'America/La_Paz' },
  VVI: { city: 'Santa Cruz de la Sierra', airport: 'Viru Viru', timezone: 'America/La_Paz' },
  MIA: { city: 'Miami', airport: 'Miami', timezone: 'America/New_York' },
  MCO: { city: 'Orlando', airport: 'Orlando', timezone: 'America/New_York' },
  JFK: { city: 'Nova York', airport: 'John F. Kennedy', timezone: 'America/New_York' },
  LAX: { city: 'Los Angeles', airport: 'Los Angeles', timezone: 'America/Los_Angeles' },
  CUN: { city: 'Cancún', airport: 'Cancún', timezone: 'America/Cancun' },
  MEX: { city: 'Cidade do México', airport: 'Benito Juárez', timezone: 'America/Mexico_City' },
  PTY: { city: 'Cidade do Panamá', airport: 'Tocumen', timezone: 'America/Panama' },
  LIS: { city: 'Lisboa', airport: 'Humberto Delgado', timezone: 'Europe/Lisbon' },
  MAD: { city: 'Madri', airport: 'Adolfo Suárez Madrid-Barajas', timezone: 'Europe/Madrid' },
  BCN: { city: 'Barcelona', airport: 'Barcelona-El Prat', timezone: 'Europe/Madrid' },
  CDG: { city: 'Paris', airport: 'Charles de Gaulle', timezone: 'Europe/Paris' },
  LHR: { city: 'Londres', airport: 'Heathrow', timezone: 'Europe/London' },
  FCO: { city: 'Roma', airport: 'Fiumicino', timezone: 'Europe/Rome' },
  FRA: { city: 'Frankfurt', airport: 'Frankfurt', timezone: 'Europe/Berlin' },
};

const DEFAULT_CALENDAR_TIME_ZONE = 'America/Sao_Paulo';

/** Fuso IANA do aeroporto; desconhecido → horário de Brasília (padrão operacional). */
export function airportTimeZone(code?: string | null, strict = false): string {
  const airport = String(code || '').trim().toUpperCase();
  const zone = AIRPORT_META[airport]?.timezone;
  if (zone) return zone;
  if (strict && airport) {
    throw new Error(`Fuso horário desconhecido para o aeroporto ${airport}. Atualize o CrewCheck antes de sincronizar esta escala com o Google Calendar.`);
  }
  return DEFAULT_CALENDAR_TIME_ZONE;
}

const CREWCONNECT_COLORS = {
  pairing: '#6f72c9',
  flight: '#9aa5df',
  positioning: '#858585',
  reserve: '#ea5038',
  standby: '#e74f37',
  training: '#ff7248',
  meeting: '#ff7a50',
  rest: '#67c58d',
  layover: '#52aaa0',
  vacation: '#0b8043',
  routine: '#0e7490',
};

function pairingRoute(day: RosterDay): string {
  const legs = day.legs || [];
  if (!legs.length) return day.pairingCode || day.type || 'Programação';
  const points = [legs[0].origin];
  for (const leg of legs) {
    if (points[points.length - 1] !== leg.destination) points.push(leg.destination);
  }
  return points.join('-');
}

function buildPairingSummary(day: RosterDay): string {
  const report = pairingStartTime(day);
  const route = pairingRoute(day);
  return report ? `Apres. ${report} · ${route}` : route;
}

function buildDutyCalendarSummary(day: RosterDay): string {
  const start = day.dutyReport || '';
  const label = getDutySummary(day);
  return start ? `${start} · ${label}` : label;
}

function pairingStartTime(day: RosterDay): string {
  return day.dutyReport || day.legs?.[0]?.departureTime || '00:00';
}

function pairingEndTime(day: RosterDay): string {
  return day.dutyDebrief || day.legs?.[day.legs.length - 1]?.arrivalTime || pairingStartTime(day);
}

function pairingArrivesNextDay(day: RosterDay): boolean {
  return Boolean(day.isNextDay) || arrivesNextDay(pairingStartTime(day), pairingEndTime(day));
}

function dayHasPositioning(day: RosterDay): boolean {
  return Boolean(day.legs?.some((leg) => isPositioningLeg(leg)) || String(day.pairingCode || day.type || '').toUpperCase() === 'PS');
}

function calendarColorForFlightLeg(leg: FlightLeg): string {
  return isPositioningLeg(leg) ? CREWCONNECT_COLORS.positioning : CREWCONNECT_COLORS.flight;
}

function requiresScaleCheckin(day: RosterDay, base?: string): boolean {
  const text = `${day.type || ''} ${day.pairingCode || ''} ${day.rawText || ''}`.toUpperCase();
  const isReserve = /\b(ASB|RES|RESERVA|AIRPORT\s*STAND)\b/.test(text);
  if (isReserve) return true;
  const firstLeg = day.legs?.[0];
  const homeBase = String(base || day.base || '').toUpperCase();
  const startsAtBase = Boolean(firstLeg?.origin && homeBase && firstLeg.origin.toUpperCase() === homeBase);
  const hasPositioning = dayHasPositioning(day);
  const looksTraining = /\b(CBF|EMER|CRM|C\d{2,3}F|TREIN|TRAIN|CHECK|SIMULADOR|EAD)\b/.test(text);
  return Boolean(startsAtBase && hasPositioning && !looksTraining);
}


function financialCalendarNote(day: RosterDay, enabled?: boolean): string {
  if (!enabled) return '';
  const data: any = day as any;
  const pieces: string[] = [];
  const perDiem = Number(data.perDiemTotal ?? data.perDiemValue ?? data.perDiem ?? data.dailyTotal ?? data.dailyValue);
  const gains = Number(data.estimatedGains ?? data.gainsTotal ?? data.dayGains ?? data.salaryEstimate);
  if (Number.isFinite(perDiem) && perDiem > 0) pieces.push(`Diárias previstas: R$ ${perDiem.toFixed(2).replace('.', ',')}`);
  if (Number.isFinite(gains) && gains > 0) pieces.push(`Ganhos previstos: R$ ${gains.toFixed(2).replace('.', ',')}`);
  if (!pieces.length) return '';
  return ['','💰 Previsão CrewCheck', ...pieces, 'Valores estimados. Confirme sempre no demonstrativo oficial.'].join('\n');
}

function buildCheckinDescription(roster: CrewRoster, day: RosterDay): string {
  return [
    '✨ CrewCheck · lembrete premium',
    '',
    'Preencher o Formulário de Check-in da escala.',
    '',
    `Tripulante: ${titleCase(roster.crewName)}`,
    `Data: ${day.date}`,
    `Atividade: ${day.pairingCode || day.type || 'Programação'}`,
    day.dutyReport ? `Apresentação/Início: ${day.dutyReport}` : '',
    day.legs?.length ? `Rota: ${pairingRoute(day)}` : '',
    '',
    'Quando usar: reserva/ASB ou apresentação na base para voo extra/PS, exceto casos de treinamento.',
    '',
    '#CREWCHECK #CHECKIN_ESCALA',
  ].filter(Boolean).join('\n');
}

function addDisplayMinutes(time: string, minutesToAdd: number): string {
  const [h, m] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(h)) return time || '00:15';
  const total = (((h * 60 + (Number.isFinite(m) ? m : 0) + minutesToAdd) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function generateICalendar(roster: CrewRoster, gymRecommendations?: GymRecommendation[], options?: CalendarExportOptions): string {
  const cfg = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const monthStr = String(roster.month).padStart(2, '0');
  const uidBase = `crewcheck-${roster.year}-${monthStr}-${cfg.mode}-${stableRosterCalendarSuffix(roster)}@crewcheck.local`;
  const crewName = titleCase(roster.crewName);
  const calendarLabel = calendarModeLabel(cfg.mode);

  let ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CrewCheck Premium//Roster Calendar//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-TIMEZONE:America/Sao_Paulo',
    `X-WR-CALNAME:${escapeIcal(`CrewCheck · ${calendarLabel} · ${crewName} · ${monthName(roster.month)}/${roster.year}`)}`,
    `X-WR-CALDESC:${escapeIcal('Escala premium exportada pelo CrewCheck com rotas, horários locais, cidades, atividades e lembretes.')}`,
  ].join('\n') + '\n';

  const operational = cfg.calendarStyle === 'operational-detailed';
  const usedKeys = new Map<string, number>();
  const uniqueKey = (key: string): string => {
    const seen = usedKeys.get(key) || 0;
    usedKeys.set(key, seen + 1);
    return seen ? `${key}#${seen + 1}` : key;
  };

  roster.days.forEach((day, dayIndex) => {
    const isoDate = isoDateKey(day.date);
    if (shouldExportFlights(cfg.mode) && day.legs && day.legs.length > 0) {
      const pairingUid = `${uidBase}-pairing-${dayIndex}`;
      const timeline = buildDayTimeline(day, operational);
      const pairingEndNextDay = timeline.endOffset > 0;
      const allPositioning = day.legs.every((leg) => isPositioningLeg(leg));
      const pairingColor = operational
        ? (allPositioning ? CREWCONNECT_COLORS.positioning : CREWCONNECT_COLORS.pairing)
        : (dayHasPositioning(day) ? CREWCONNECT_COLORS.positioning : CREWCONNECT_COLORS.pairing);
      ical += buildEvent({
        uid: pairingUid,
        key: uniqueKey(`pairing|${isoDate}`),
        now,
        start: formatDateTimeForIcal(day.date, pairingStartTime(day), timeline.startOffset),
        end: formatDateTimeForIcal(day.date, pairingEndTime(day), timeline.endOffset),
        startTimeZone: timeline.startTimeZone,
        endTimeZone: timeline.endTimeZone,
        summary: operational ? pairingRoute(day) : buildPairingSummary(day),
        description: buildPairingDescription(roster, day, pairingEndNextDay) + financialCalendarNote(day, cfg.includeFinancialNotes),
        location: buildPairingLocation(day),
        categories: (operational ? allPositioning : dayHasPositioning(day)) ? 'CrewCheck,Pairing,Positioning' : 'CrewCheck,Pairing',
        transparency: 'OPAQUE',
        alarms: cfg.includeReminders ? cfg.flightReminderMinutes : [],
        color: pairingColor,
      });

      if (shouldExportDetailedLegs(cfg.mode, cfg.calendarStyle)) day.legs.forEach((leg, legIndex) => {
        const uid = `${uidBase}-flight-${dayIndex}-${legIndex}`;
        const legTimes = timeline.legs[legIndex];
        const endNextDay = legTimes.arrivalOffset > legTimes.departureOffset;

        ical += buildEvent({
          uid,
          key: uniqueKey(`leg|${isoDate}|${normalizeFlightNumber(leg.flightNumber)}|${leg.origin}-${leg.destination}`),
          now,
          start: formatDateTimeForIcal(day.date, leg.departureTime, legTimes.departureOffset),
          end: formatDateTimeForIcal(day.date, leg.arrivalTime, legTimes.arrivalOffset),
          startTimeZone: airportTimeZone(leg.origin, operational),
          endTimeZone: airportTimeZone(leg.destination, operational),
          summary: operational ? buildOperationalLegSummary(leg) : buildFlightSummary(leg, cfg.titleFormat, legIndex === 0 ? pairingStartTime(day) : ''),
          description: buildFlightDescription(roster, day, leg, endNextDay, legTimes) + financialCalendarNote(day, cfg.includeFinancialNotes),
          location: buildFlightLocation(leg),
          categories: isPositioningLeg(leg) ? 'CrewCheck,Flight,Positioning' : 'CrewCheck,Flight',
          transparency: 'OPAQUE',
          alarms: operational ? [] : cfg.includeReminders ? cfg.flightReminderMinutes : [],
          color: calendarColorForFlightLeg(leg),
        });
      });

      if (shouldExportCheckin(cfg.mode, cfg.calendarStyle) && requiresScaleCheckin(day, roster.base)) {
        const checkinStart = pairingStartTime(day);
        ical += buildEvent({
          uid: `${uidBase}-checkin-flight-${dayIndex}`,
          key: uniqueKey(`checkin|${isoDate}`),
          now,
          start: formatDateTimeForIcal(day.date, checkinStart),
          end: formatDateTimeForIcal(day.date, addDisplayMinutes(checkinStart, 15)),
          startTimeZone: timeline.startTimeZone,
          endTimeZone: timeline.startTimeZone,
          summary: 'Check-in escala',
          description: buildCheckinDescription(roster, day),
          location: `${roster.base || day.legs?.[0]?.origin || 'Base'} · Formulário de Check-in da escala`,
          categories: 'CrewCheck,Checkin,Form',
          transparency: 'TRANSPARENT',
          alarms: cfg.includeReminders ? [120, 30, 5] : [],
          color: '#facc15',
        });
      }
    }

    if (shouldExportDuties(cfg.mode, cfg.calendarStyle) && day.dutyReport && day.dutyDebrief && !isUnreliableZeroDuty(day) && !isRestDay(day) && (!day.legs || day.legs.length === 0)) {
      const uid = `${uidBase}-duty-${dayIndex}`;
      const endNextDay = Boolean(day.isNextDay) || arrivesNextDay(day.dutyReport, day.dutyDebrief);
      const dutyTimeZone = airportTimeZone(day.base || roster.base, operational);
      ical += buildEvent({
        uid,
        key: uniqueKey(`duty|${isoDate}`),
        now,
        start: formatDateTimeForIcal(day.date, day.dutyReport),
        end: formatDateTimeForIcal(day.date, day.dutyDebrief, endNextDay ? 1 : 0),
        startTimeZone: dutyTimeZone,
        endTimeZone: dutyTimeZone,
        summary: operational ? getDutySummary(day) : buildDutyCalendarSummary(day),
        description: buildDutyDescription(roster, day, endNextDay) + financialCalendarNote(day, cfg.includeFinancialNotes),
        location: buildDutyLocation(day),
        categories: dutyCategories(day),
        transparency: 'OPAQUE',
        alarms: cfg.includeReminders ? cfg.dutyReminderMinutes : [],
        color: calendarColorForDay(day),
      });

      if (shouldExportCheckin(cfg.mode, cfg.calendarStyle) && requiresScaleCheckin(day, roster.base)) {
        ical += buildEvent({
          uid: `${uidBase}-checkin-duty-${dayIndex}`,
          key: uniqueKey(`checkin|${isoDate}`),
          now,
          start: formatDateTimeForIcal(day.date, day.dutyReport),
          end: formatDateTimeForIcal(day.date, addDisplayMinutes(day.dutyReport, 15)),
          startTimeZone: dutyTimeZone,
          endTimeZone: dutyTimeZone,
          summary: 'Check-in escala',
          description: buildCheckinDescription(roster, day),
          location: `${roster.base || day.base || 'Base'} · Formulário de Check-in da escala`,
          categories: 'CrewCheck,Checkin,Form',
          transparency: 'TRANSPARENT',
          alarms: cfg.includeReminders ? [120, 30, 5] : [],
          color: '#facc15',
        });
      }
    }

    // Formato operacional: HSB/ASB/treinamento publicados sem horário confiável continuam no
    // calendário como evento de dia inteiro com o código publicado (antes eram omitidos).
    if (operational && shouldExportDuties(cfg.mode, cfg.calendarStyle) && isUntimedPublishedActivity(day)) {
      ical += buildAllDayEvent({
        uid: `${uidBase}-duty-${dayIndex}`,
        key: uniqueKey(`activity|${isoDate}`),
        now,
        date: day.date,
        summary: getDutySummary(day),
        description: buildDutyDescription(roster, day, false),
        categories: dutyCategories(day),
        color: calendarColorForDay(day),
      });
    }

    if (shouldExportRest(cfg.mode, cfg.calendarStyle) && isRestDay(day)) {
      const uid = `${uidBase}-rest-${dayIndex}`;
      const vacation = isVacationDay(day);
      ical += buildAllDayEvent({
        uid,
        key: uniqueKey(`rest|${isoDate}`),
        now,
        date: day.date,
        summary: getRestSummary(day),
        description: buildRestDescription(roster, day),
        categories: day.type === 'LAYOVER' ? 'CrewCheck,Layover' : vacation ? 'CrewCheck,Vacation' : 'CrewCheck,Rest',
        color: vacation ? CREWCONNECT_COLORS.vacation : calendarColorForDay(day),
      });
    }
  });

  if (shouldExportGym(cfg.mode) && gymRecommendations?.length) {
    gymRecommendations.forEach((gym, index) => {
      ical += buildEvent({
        uid: `${uidBase}-gym-${index}`,
        now,
        start: formatDateTimeForIcal(gym.date, gym.startTime),
        end: formatDateTimeForIcal(gym.date, gym.endTime),
        summary: gym.priority === 'high' ? 'Academia · Treino recomendado' : gym.priority === 'medium' ? 'Academia · Treino moderado' : 'Academia · Recuperação ativa',
        description: [
          'Plano de condicionamento sugerido pelo CrewCheck.',
          '',
          `Prioridade: ${gym.priority === 'high' ? 'Alta' : gym.priority === 'medium' ? 'Média' : 'Leve'}`,
          `Janela sugerida: ${gym.suggestedTime}`,
          `Recomendação: ${gym.reason}`,
          '',
          'Sugestão: ajuste intensidade conforme sono, hidratação, alimentação e fadiga percebida.',
        ].join('\n'),
        location: 'Academia',
        categories: 'CrewCheck,Gym',
        transparency: 'TRANSPARENT',
        alarms: cfg.includeReminders ? cfg.gymReminderMinutes : [],
      });
    });
  }

  if (shouldExportRoutine(cfg.mode) && cfg.routineSuggestions?.length) {
    cfg.routineSuggestions.forEach((item, index) => {
      const recovery = item.category === 'recovery';
      const meal = item.category === 'meal';
      ical += buildEvent({
        uid: `${uidBase}-${meal ? 'meal' : recovery ? 'recovery' : 'routine'}-${index}`,
        now,
        start: formatDateTimeForIcal(item.date, item.startTime),
        end: formatDateTimeForIcal(item.date, item.endTime),
        summary: `${meal ? 'Alimentação' : recovery ? 'Recuperação' : 'Rotina'} · ${item.activityName}`,
        description: [
          meal ? 'Janela de alimentação/diária protegida pelo CrewCheck.' : recovery ? 'Janela de descanso/recuperação sugerida pelo CrewCheck.' : 'Rotina inteligente sugerida pelo CrewCheck.',
          '',
          `Tipo: ${recovery ? 'recuperação' : item.activityType}`,
          meal ? 'Tipo: alimentação/diária' : recovery ? 'Intensidade: baixa/protetiva' : `Intensidade: ${item.intensity}`,
          meal ? 'Adequação: janela protegida de alimentação' : recovery ? 'Adequação: proteção de sono e recuperação' : `Adequação: ${item.suitability} (${item.score}/100)`,
          `Motivo: ${item.reason}`,
          `${recovery ? 'Orientação' : 'Cuidado'}: ${item.caution}`,
        ].join('\n'),
        location: item.activityName,
        categories: meal ? 'CrewCheck,Meal' : recovery ? 'CrewCheck,Recovery' : 'CrewCheck,Routine',
        transparency: 'TRANSPARENT',
        alarms: cfg.includeReminders ? cfg.routineReminderMinutes : [],
        color: meal ? '#f59e0b' : recovery ? '#7c3aed' : ['musculacao','corrida','caminhada','crossfit'].includes(item.activityType) ? '#22c55e' : '#0f8d96',
      });
    });
  }

  return `${ical}END:VCALENDAR`;
}

function isPositioningLeg(leg: FlightLeg): boolean {
  return String(leg.workType || '').toUpperCase() === 'PS';
}

function calendarColorForDay(day: RosterDay): string {
  if (day.legs?.length) return dayHasPositioning(day) ? CREWCONNECT_COLORS.positioning : CREWCONNECT_COLORS.pairing;
  const code = getRosterCodeDefinition(day.pairingCode)?.code || findRosterCodes(`${day.pairingCode || ''} ${day.type || ''} ${day.rawText || ''}`)[0] || day.type;
  const category = getRosterCodeDefinition(code)?.category;
  if (category === 'DAY_OFF') return CREWCONNECT_COLORS.rest;
  if (category === 'SIMULATOR' || category === 'GROUND_DUTY') return CREWCONNECT_COLORS.training;
  if (category === 'TRANSPORT') return CREWCONNECT_COLORS.positioning;
  if (category === 'RESERVE') return CREWCONNECT_COLORS.reserve;
  if (category === 'STANDBY' || category === 'DAY_MARKER') return CREWCONNECT_COLORS.standby;
  if (category === 'MEETING' || category === 'MEDICAL') return CREWCONNECT_COLORS.meeting;
  if (day.type === 'LAYOVER') return CREWCONNECT_COLORS.layover;
  return CREWCONNECT_COLORS.routine;
}

function buildEvent(args: {
  uid: string;
  /** Identidade operacional estável (data/voo/rota), usada pelo upsert idempotente do Google. */
  key?: string;
  now: string;
  start: string;
  end: string;
  summary: string;
  description: string;
  location?: string;
  categories: string;
  transparency: 'OPAQUE' | 'TRANSPARENT';
  alarms?: number[];
  color?: string;
  /** Fuso IANA do início (aeroporto de origem / apresentação). */
  startTimeZone?: string;
  /** Fuso IANA do fim (aeroporto de destino / liberação). */
  endTimeZone?: string;
}): string {
  const alarmBlock = (args.alarms || []).map((minutes) => buildAlarm(minutes)).join('');
  const colorLine = args.color ? `COLOR:${args.color}\nX-APPLE-CALENDAR-COLOR:${args.color}\n` : '';
  const keyLine = args.key ? `X-CREWCHECK-KEY:${escapeIcal(args.key)}\n` : '';
  const startZone = args.startTimeZone || DEFAULT_CALENDAR_TIME_ZONE;
  const endZone = args.endTimeZone || startZone;
  return `BEGIN:VEVENT\nUID:${args.uid}\n${keyLine}DTSTAMP:${args.now}\n${colorLine}DTSTART;TZID=${startZone}:${args.start}\nDTEND;TZID=${endZone}:${args.end}\nSUMMARY:${escapeIcal(args.summary)}\nDESCRIPTION:${escapeIcal(args.description)}\nLOCATION:${escapeIcal(args.location || '')}\nCATEGORIES:${escapeIcal(args.categories)}\nSTATUS:CONFIRMED\nTRANSP:${args.transparency}\nX-MICROSOFT-CDO-BUSYSTATUS:${args.transparency === 'OPAQUE' ? 'BUSY' : 'FREE'}\n${alarmBlock}END:VEVENT\n`;
}

function buildAlarm(minutesBefore: number): string {
  return `BEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:${escapeIcal('Lembrete CrewCheck')}\nTRIGGER:-PT${Math.max(1, Math.round(minutesBefore))}M\nEND:VALARM\n`;
}

function buildAllDayEvent(args: {
  uid: string;
  key?: string;
  now: string;
  date: string;
  summary: string;
  description: string;
  categories: string;
  color?: string;
}): string {
  const start = formatDateForIcal(args.date);
  const end = formatDateForIcal(args.date, 1);
  const colorLine = args.color ? `COLOR:${args.color}\nX-APPLE-CALENDAR-COLOR:${args.color}\n` : '';
  const keyLine = args.key ? `X-CREWCHECK-KEY:${escapeIcal(args.key)}\n` : '';
  return `BEGIN:VEVENT\nUID:${args.uid}\n${keyLine}DTSTAMP:${args.now}\n${colorLine}DTSTART;VALUE=DATE:${start}\nDTEND;VALUE=DATE:${end}\nSUMMARY:${escapeIcal(args.summary)}\nDESCRIPTION:${escapeIcal(args.description)}\nCATEGORIES:${escapeIcal(args.categories)}\nSTATUS:CONFIRMED\nTRANSP:TRANSPARENT\nX-MICROSOFT-CDO-BUSYSTATUS:FREE\nEND:VEVENT\n`;
}

function buildPairingDescription(roster: CrewRoster, day: RosterDay, endNextDay: boolean): string {
  const route = pairingRoute(day);
  const legs = day.legs || [];
  const timeline = buildDayTimeline(day);
  const startAirport = legs[0]?.origin || day.base || roster.base;
  const endAirport = legs[legs.length - 1]?.destination || day.base || roster.base;
  return [
    route,
    '',
    `Apresentação: ${pairingStartTime(day)} LOCAL (${startAirport})`,
    '',
    'C/I:',
    `  ${toUtcLabel(day.date, pairingStartTime(day), timeline.startOffset, timeline.startTimeZone)} (${pairingStartTime(day)} LOCAL)`,
    `  ${pairingStartTime(day)} ${timeline.startTimeZone}`,
    'C/O:',
    `  ${toUtcLabel(day.date, pairingEndTime(day), timeline.endOffset, timeline.endTimeZone)} (${pairingEndTime(day)} LOCAL${endNextDay ? ' +1' : ''})`,
    `  ${pairingEndTime(day)} ${timeline.endTimeZone}`,
    `Liberação: ${pairingEndTime(day)} LOCAL (${endAirport})${endNextDay ? ' +1' : ''}`,
    '-----------',
    '',
    'Voos:',
    ...legs.map((leg, index) => {
      const times = timeline.legs[index];
      const depZone = airportTimeZone(leg.origin);
      const arrZone = airportTimeZone(leg.destination);
      const zones = depZone === arrZone ? (depZone === DEFAULT_CALENDAR_TIME_ZONE ? '' : ` (${depZone})`) : ` (${depZone} → ${arrZone})`;
      return `  ${leg.flightNumber}: ${leg.origin}-${leg.destination} ${leg.departureTime}–${leg.arrivalTime}${times.arrivalOffset > times.departureOffset ? ' (+1)' : ''}${zones} · ${workTypeCode(leg)}${leg.aircraftType ? ` · Aircraft: ${leg.aircraftType}` : ''}${isPositioningLeg(leg) ? ' · PS/Extra' : ''}`;
    }),
    '',
    ...buildCrewDescriptionLines(roster, legs[0] || ({} as FlightLeg)),
    '',
    `Crew: (${roster.crewId || 'sem BP'}) ${titleCase(roster.crewName)}`,
    `Base: ${roster.base} · ${cityOnly(roster.base)}`,
    'Notes:',
    `  Aircraft: ${Array.from(new Set(legs.map((leg) => leg.aircraftType).filter(Boolean))).join(', ') || 'não informado'}`,
    '#CREWCHECK',
  ].filter(Boolean).join('\n');
}

function buildPairingLocation(day: RosterDay): string {
  const legs = day.legs || [];
  if (!legs.length) return buildDutyLocation(day);
  return `${airportLabel(legs[0].origin)} → ${airportLabel(legs[legs.length - 1].destination)}`;
}

function buildFlightSummary(leg: FlightLeg, format: CalendarTitleFormat, presentationTime = ''): string {
  const route = `${leg.origin}-${leg.destination}`;
  const prefix = isPositioningLeg(leg) ? '🧍 EXTRA · ' : '';
  const base = format === 'flight-route' ? `${leg.flightNumber} · ${route}` : `${route} · ${leg.flightNumber}`;
  return prefix + (presentationTime ? `Apres. ${presentationTime} · ${base}` : base);
}

function buildOperationalLegSummary(leg: FlightLeg): string {
  const base = `${leg.origin}-${leg.destination} ${leg.flightNumber}`;
  return isPositioningLeg(leg) ? `${base} · PS` : base;
}

function workTypeCode(leg: FlightLeg): string {
  return String(leg.workType || 'OP').trim().toUpperCase() || 'OP';
}

function buildFlightDescription(roster: CrewRoster, day: RosterDay, leg: FlightLeg, endNextDay: boolean, legTimes?: LegTimeline): string {
  const workType = translateWorkType(leg.workType || 'OP');
  const departureOffset = legTimes?.departureOffset || 0;
  const arrivalOffset = legTimes?.arrivalOffset ?? (endNextDay ? 1 : 0);
  const originZone = airportTimeZone(leg.origin);
  const destinationZone = airportTimeZone(leg.destination);
  const timeline = buildDayTimeline(day);
  const releaseAirport = day.legs?.[day.legs.length - 1]?.destination || day.base || roster.base;
  return [
    `${leg.flightNumber}: ${leg.origin}-${leg.destination}`,
    day.dutyReport ? `Apresentação da jornada: ${day.dutyReport} LOCAL (${day.legs?.[0]?.origin || day.base || roster.base})` : '',
    '',
    `${leg.origin}:`,
    `  ${toUtcLabel(day.date, leg.departureTime, departureOffset, originZone)} (${leg.departureTime} LOCAL${departureOffset ? ' +1' : ''})`,
    `  ${leg.departureTime} ${originZone}`,
    `${leg.destination}:`,
    `  ${toUtcLabel(day.date, leg.arrivalTime, arrivalOffset, destinationZone)} (${leg.arrivalTime} LOCAL${endNextDay || arrivalOffset > departureOffset ? ' +1' : ''})`,
    `  ${leg.arrivalTime} ${destinationZone}`,
    '',
    ...buildCrewDescriptionLines(roster, leg),
    '',
    `Crew: (${roster.crewId || 'sem BP'}) ${titleCase(roster.crewName)}`,
    'Notes:',
    leg.aircraftType ? `  Aircraft: ${leg.aircraftType}` : '',
    isPositioningLeg(leg) ? '  Work type: PS · Posicionamento / voo extra / passageiro' : `  Work type: ${workTypeCode(leg)} · ${workType}`,
    day.dutyReport ? `  Pairing C/I: ${day.dutyReport}` : '',
    day.dutyDebrief ? `  Pairing C/O: ${day.dutyDebrief}${timeline.endOffset > 0 ? ' (+1)' : ''}` : '',
    day.dutyDebrief ? `  Liberação: ${day.dutyDebrief} LOCAL (${releaseAirport})${timeline.endOffset > 0 ? ' +1' : ''}` : '',
    '#CREWCHECK',
  ].filter(Boolean).join('\n');
}


function buildCrewDescriptionLines(roster: CrewRoster, leg: FlightLeg): string[] {
  const crew = Array.isArray(leg.crew) ? leg.crew : [];
  if (!crew.length) return ['Tripulação: não informada no PDF/exportação.'];
  const lead = leg.ccmLead;
  const current = crew.find((member: any) => Boolean(member.isCurrentCrew));
  const ccmStatus = leg.ccmBonusStatus === 'confirmed'
    ? 'Gratificação CCM: aplicável ao tripulante da escala (primeiro CCM listado).'
    : leg.ccmBonusStatus === 'not_applicable'
      ? 'Gratificação CCM: não aplicável ao tripulante da escala (outro CCM aparece antes).'
      : 'Gratificação CCM: pendente de confirmação.';
  return [
    '',
    'Tripulação do voo:',
    ...crew.map((member: any) => `${member.role}: ${titleCase(String(member.name || ''))}${member.isCurrentCrew ? ' (você)' : ''}`),
    lead ? `Chefe efetivo: ${titleCase(lead.name)} (primeiro CCM listado)` : 'Chefe efetivo: não identificado',
    current ? `Seu registro na tripulação: ${current.role} · ${titleCase(current.name)}` : `Tripulante da escala: ${titleCase(roster.crewName)}`,
    ccmStatus,
  ];
}

function buildFlightLocation(leg: FlightLeg): string {
  return `${airportLabel(leg.origin)} → ${airportLabel(leg.destination)}`;
}

function buildDutyDescription(roster: CrewRoster, day: RosterDay, endNextDay: boolean): string {
  const activity = translateDutyType(day);
  return [
    activity,
    '',
    `Data: ${displayDate(day.date)}`,
    `Horário: ${day.dutyReport} → ${day.dutyDebrief}${endNextDay ? ' (+1)' : ''}`,
    `Local: ${buildDutyLocation(day)}`,
    day.dutyHours != null ? `Jornada estimada: ${formatDecimalHours(day.dutyHours)}` : '',
    day.pairingCode ? `Código/programação: ${day.pairingCode}` : '',
    '',
    `Crew: (${roster.crewId || 'sem BP'}) ${titleCase(roster.crewName)}`,
    `Base: ${roster.base} · ${cityOnly(roster.base)}`,
    `Função: ${roster.rank || 'Tripulante'}`,
    '#CREWCHECK',
  ].filter(Boolean).join('\n');
}

function buildDutyLocation(day: RosterDay): string {
  if (day.type === 'ASB') return `${day.base} · ${cityOnly(day.base)} · Airport Stand By`;
  if (day.type === 'HSB' || day.type === 'HSBE') return `${day.base} · ${cityOnly(day.base)} · Home Stand By`;
  if (/^C\d{2,3}F$/i.test(day.pairingCode || '') || /\bC\d{2,3}F\b/i.test(day.rawText || '')) return `${day.base} · ${cityOnly(day.base)} · Centro de treinamento / check`;
  const rosterCode = getRosterCode(day);
  if (rosterCode === 'NS' || rosterCode === 'NSJ' || (rosterCode.endsWith('J') && rosterCode !== 'IJ')) return `${day.base} · ${cityOnly(day.base)} · Justificativa / não comparecimento`;
  if (rosterCode === 'IJ') return `${day.base} · ${cityOnly(day.base)} · Interrupção de jornada`;
  if (rosterCode === 'DM') return `${day.base} · ${cityOnly(day.base)} · Dispensa médica`;
  return `${day.base} · ${cityOnly(day.base)}`;
}

/** Código publicado do dia (pairingCode tem prioridade sobre o tipo normalizado pelo parser). */
function publishedDayCode(day: RosterDay): string {
  const published = String(day.pairingCode || '').trim().toUpperCase();
  if (published && getRosterCodeDefinition(published)) return published;
  return String(day.type || published || '').trim().toUpperCase();
}

function isVacationDay(day: RosterDay): boolean {
  return publishedDayCode(day) === 'VC';
}

function getRestSummary(day: RosterDay): string {
  if (day.type === 'LAYOVER') return `Inativo / pernoite${day.hotel ? ` · ${day.hotel}` : ''}`;
  // O parser normaliza VC/OFF/DOP para o tipo 'DO'; o rótulo do calendário preserva o código publicado.
  const code = publishedDayCode(day);
  if (code === 'VC') return 'VC · Férias';
  if (code === 'OFF') return 'OFF · Extensão do descanso';
  if (code === 'DOF') return 'DOF · Folga';
  if (code === 'DR') return 'DR · Descanso regulamentar';
  if (code === 'DO') return 'DO · Folga';
  const definition = getRosterCodeDefinition(code);
  if (definition?.category === 'DAY_OFF') return `${code} · ${definition.description}`;
  return 'DO · Folga';
}

function buildRestDescription(roster: CrewRoster, day: RosterDay): string {
  const code = publishedDayCode(day);
  return [
    day.type === 'LAYOVER'
      ? 'Dia tratado como inativo / pernoite entre programações, sem apontamento automático de irregularidade.'
      : code === 'VC'
        ? 'Férias registradas na escala (VC).'
        : explainRestType(code === 'OFF' || code === 'DOF' || code === 'DR' || code === 'DO' ? code as RosterDay['type'] : day.type),
    '',
    `Data: ${displayDate(day.date)}`,
    day.type === 'LAYOVER' ? `Local: ${day.hotel || cityOnly(day.base)}` : `Base: ${roster.base} · ${cityOnly(roster.base)}`,
    `Crew: (${roster.crewId || 'sem BP'}) ${titleCase(roster.crewName)}`,
    '#CREWCHECK',
  ].filter(Boolean).join('\n');
}

function getDutySummary(day: RosterDay): string {
  if (day.type === 'HSB') return 'HSB · Home Stand By';
  if (day.type === 'HSBE') return 'HSBE · Home Stand By Extra';
  if (day.type === 'ASB') return 'ASB · Airport Stand By';
  if (/^C\d{2,3}F$/i.test(day.pairingCode || '') || /\bC\d{2,3}F\b/i.test(day.rawText || '')) return `${day.pairingCode || 'C32F'} · Check de competência A32F`;
  if (day.pairingCode === 'CBF') return 'CBF · EAD - Combate ao Fogo';
  if (day.pairingCode === 'EMER') return 'EMER · EAD - Emergências Gerais';
  if (day.pairingCode === 'MT') return 'MT · Meeting / reunião operacional';
  const rosterCode = getRosterCode(day);
  if (rosterCode === 'NS') return 'NS · Não comparecimento';
  if (rosterCode === 'NSJ') return 'NSJ · Não comparecimento justificado';
  if (rosterCode.endsWith('J') && rosterCode !== 'IJ') return `${rosterCode} · Justificado`;
  if (rosterCode === 'IJ') return 'IJ · Interrupção de jornada';
  if (rosterCode === 'DM') return 'DM · Dispensa médica';
  if (day.type === 'CRM') return 'CRM · Corporate Resource Management';
  if (day.type === 'OTHER' && day.pairingCode) return `${day.pairingCode} · Atividade programada`;
  return `${day.type} · Atividade`;
}

function isUnreliableZeroDuty(day: RosterDay): boolean {
  const code = String(day.pairingCode || day.type || '').toUpperCase();
  return /^(HSB|HSBE|ASB|RES)$/.test(code) && Boolean(day.dutyReport) && day.dutyReport === day.dutyDebrief;
}

function isRestDay(day: RosterDay): boolean {
  return ['OFF', 'DO', 'DOF', 'DR', 'LAYOVER'].includes(day.type) || getRosterCodeDefinition(day.pairingCode || '')?.category === 'DAY_OFF';
}

function shouldExportFlights(mode: CalendarExportMode): boolean {
  return mode === 'all' || mode === 'flights' || mode === 'flights-rest';
}

function shouldExportDetailedLegs(mode: CalendarExportMode, style?: CalendarExportOptions['calendarStyle']): boolean {
  // v11.1.92: por padrão o Google/ICS fica igual à tela de Escala: um evento principal por programação.
  // Voos individuais, check-in, rotina e tripulação entram na descrição do card principal, sem poluir o calendário.
  if (style === 'operational-detailed') return shouldExportFlights(mode);
  if (style === 'legacy-detailed') return mode === 'all' || mode === 'flights';
  return mode === 'flights';
}

function shouldExportCheckin(mode: CalendarExportMode, style?: CalendarExportOptions['calendarStyle']): boolean {
  return style === 'legacy-detailed' && (mode === 'all' || mode === 'flights' || mode === 'duties');
}

function shouldExportDuties(mode: CalendarExportMode, style?: CalendarExportOptions['calendarStyle']): boolean {
  // Formato operacional: "voos + folgas" também leva HSB/ASB/treinamentos publicados.
  if (style === 'operational-detailed' && mode === 'flights-rest') return true;
  return mode === 'all' || mode === 'duties';
}

function shouldExportRest(mode: CalendarExportMode, _style?: CalendarExportOptions['calendarStyle']): boolean {
  return mode === 'all' || mode === 'rest' || mode === 'flights-rest';
}

function dutyCategories(day: RosterDay): string {
  const code = publishedDayCode(day);
  if (/^(HSBE?|ASB|RES)$/.test(code) || /^(HSBE?|ASB|RES)$/.test(String(day.type || ''))) return 'CrewCheck,Duty,Standby';
  return 'CrewCheck,Duty';
}

function isUntimedPublishedActivity(day: RosterDay): boolean {
  if (day.legs?.length || isRestDay(day)) return false;
  const hasReliableTimes = Boolean(day.dutyReport && day.dutyDebrief && !isUnreliableZeroDuty(day));
  if (hasReliableTimes) return false;
  if (['HSB', 'HSBE', 'ASB', 'RES', 'CRM'].includes(day.type)) return true;
  const code = String(day.pairingCode || '').trim().toUpperCase();
  return Boolean(code && getRosterCodeDefinition(code) && getRosterCodeDefinition(code)?.category !== 'DAY_OFF');
}

function shouldExportGym(mode: CalendarExportMode): boolean {
  return mode === 'gym';
}

function shouldExportRoutine(mode: CalendarExportMode): boolean {
  return mode === 'routine';
}

function calendarModeLabel(mode: CalendarExportMode): string {
  if (mode === 'flights') return 'Voos detalhados';
  if (mode === 'flights-rest') return 'Voos + folgas';
  if (mode === 'duties') return 'Atividades';
  if (mode === 'rest') return 'Folgas e repousos';
  if (mode === 'gym') return 'Academia';
  if (mode === 'routine') return 'Rotina inteligente';
  return 'Escala limpa';
}

function stableRosterCalendarSuffix(roster: CrewRoster): string {
  const days = Array.isArray(roster.days) ? roster.days : [];
  const first = days[0]?.date || 'sem-data';
  const last = days[days.length - 1]?.date || first;
  const seed = `${roster.crewId || roster.crewName || 'crew'}|${roster.base || ''}|${roster.year}-${roster.month}|${days.length}|${first}|${last}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(36);
}

function arrivesNextDay(start: string, end: string): boolean {
  return minutesOfDay(end) <= minutesOfDay(start);
}

function minutesOfDay(time: string): number {
  const [hour, minute] = time.replace('(+1)', '').split(':').map(Number);
  return hour * 60 + minute;
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function parseDate(dateStr: string, fallback = new Date()): Date {
  const raw = String(dateStr || '').trim();
  const safeFallback = isValidDate(fallback) ? fallback : new Date();
  if (!raw) return safeFallback;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
    return isValidDate(date) ? date : safeFallback;
  }
  const br = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (br) {
    const yearRaw = br[3] ? Number(br[3]) : safeFallback.getFullYear();
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const date = new Date(year, Number(br[2]) - 1, Number(br[1]), 12, 0, 0, 0);
    return isValidDate(date) ? date : safeFallback;
  }
  const monthMap: Record<string, number> = { JAN: 1, JANEIRO: 1, FEV: 2, FEVEREIRO: 2, MAR: 3, MARCO: 3, MARÇO: 3, ABR: 4, ABRIL: 4, MAI: 5, MAIO: 5, JUN: 6, JUNHO: 6, JUL: 7, JULHO: 7, AGO: 8, AGOSTO: 8, SET: 9, SETEMBRO: 9, OUT: 10, OUTUBRO: 10, NOV: 11, NOVEMBRO: 11, DEZ: 12, DEZEMBRO: 12 };
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const textual = normalized.match(/(?:DOM|SEG|TER|QUA|QUI|SEX|SAB)?\s*(\d{1,2})\s+([A-Z]{3,9})(?:\s+(\d{4}))?/);
  if (textual) {
    const month = monthMap[textual[2]];
    const year = textual[3] ? Number(textual[3]) : safeFallback.getFullYear();
    if (month) {
      const date = new Date(year, month - 1, Number(textual[1]), 12, 0, 0, 0);
      return isValidDate(date) ? date : safeFallback;
    }
  }
  const parsed = new Date(raw);
  return isValidDate(parsed) ? parsed : safeFallback;
}

type CalendarYmd = { year: number; month: number; day: number };

function rosterYmd(dateStr: string, addDays = 0): CalendarYmd {
  const date = parseDate(dateStr);
  // Aritmética em UTC: independe do fuso/horário de verão do aparelho.
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + addDays, 12, 0, 0, 0));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

function parseClock(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = String(timeStr || '').replace('(+1)', '').split(':').map(Number);
  return { hours: Number.isFinite(hours) ? hours : 0, minutes: Number.isFinite(minutes) ? minutes : 0 };
}

function isoDateKey(dateStr: string): string {
  const ymd = rosterYmd(dateStr);
  return `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`;
}

function formatDateForIcal(dateStr: string, addDays = 0): string {
  const ymd = rosterYmd(dateStr, addDays);
  return `${ymd.year}${String(ymd.month).padStart(2, '0')}${String(ymd.day).padStart(2, '0')}`;
}

function formatDateTimeForIcal(dateStr: string, timeStr: string, addDays = 0): string {
  const ymd = rosterYmd(dateStr, addDays);
  const { hours, minutes } = parseClock(timeStr);
  return `${ymd.year}${String(ymd.month).padStart(2, '0')}${String(ymd.day).padStart(2, '0')}T${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}00`;
}

function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - utcMs;
}

/** Converte data/hora local de um aeroporto (fuso IANA) para epoch UTC sem depender do fuso do aparelho. */
export function zonedLocalTimeToUtcMs(dateStr: string, timeStr: string, addDays = 0, timeZone = DEFAULT_CALENDAR_TIME_ZONE): number {
  const ymd = rosterYmd(dateStr, addDays);
  const { hours, minutes } = parseClock(timeStr);
  const guess = Date.UTC(ymd.year, ymd.month - 1, ymd.day, hours, minutes, 0, 0);
  let zone = timeZone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = DEFAULT_CALENDAR_TIME_ZONE; }
  const firstOffset = timeZoneOffsetMs(guess, zone);
  const candidate = guess - firstOffset;
  const secondOffset = timeZoneOffsetMs(candidate, zone);
  return secondOffset === firstOffset ? candidate : guess - secondOffset;
}

type LegTimeline = { departureOffset: number; arrivalOffset: number };
type DayTimeline = { startOffset: number; endOffset: number; startTimeZone: string; endTimeZone: string; legs: LegTimeline[] };

/**
 * Linha do tempo da jornada com dia relativo (+0/+1…) de cada horário LOCAL publicado.
 * Etapas consecutivas partem do aeroporto onde a anterior chegou (mesmo fuso), então a virada
 * do dia é detectada comparando horários locais do mesmo aeroporto; partida→chegada usa UTC real.
 */
function buildDayTimeline(day: RosterDay, strictTimeZones = false): DayTimeline {
  const legs = day.legs || [];
  const startTimeZone = airportTimeZone(legs[0]?.origin || day.base, strictTimeZones);
  const endTimeZone = airportTimeZone(legs[legs.length - 1]?.destination || day.base, strictTimeZones);
  const report = day.dutyReport || legs[0]?.departureTime || '00:00';
  const result: LegTimeline[] = [];
  let previousTime = report;
  let previousOffset = 0;
  for (const leg of legs) {
    const departureOffset = previousOffset + (minutesOfDay(leg.departureTime) < minutesOfDay(previousTime) ? 1 : 0);
    const departureUtc = zonedLocalTimeToUtcMs(day.date, leg.departureTime, departureOffset, airportTimeZone(leg.origin, strictTimeZones));
    let arrivalOffset = departureOffset;
    while (arrivalOffset < departureOffset + 2 && zonedLocalTimeToUtcMs(day.date, leg.arrivalTime, arrivalOffset, airportTimeZone(leg.destination, strictTimeZones)) <= departureUtc) arrivalOffset += 1;
    if (leg.isNextDay && arrivalOffset === 0) arrivalOffset = 1;
    result.push({ departureOffset, arrivalOffset });
    previousTime = leg.arrivalTime;
    previousOffset = arrivalOffset;
  }
  const debrief = day.dutyDebrief || legs[legs.length - 1]?.arrivalTime || report;
  let endOffset = legs.length
    ? previousOffset + (minutesOfDay(debrief) < minutesOfDay(previousTime) ? 1 : 0)
    : (arrivesNextDay(report, debrief) ? 1 : 0);
  if (day.isNextDay && endOffset === 0) endOffset = 1;
  return { startOffset: 0, endOffset, startTimeZone, endTimeZone, legs: result };
}

function normalizeFlightNumber(value: string): string {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function escapeIcal(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function airportLabel(code: string): string {
  const meta = AIRPORT_META[code];
  if (!meta) return code;
  return `${code} · ${meta.city}`;
}

function cityOnly(code: string): string {
  return AIRPORT_META[code]?.city || code;
}

function monthName(month: number): string {
  return ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][month - 1] || String(month);
}

function displayDate(dateStr: string): string {
  const date = parseDate(dateStr);
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function toUtcLabel(dateStr: string, timeStr: string, addDays = 0, timeZone = DEFAULT_CALENDAR_TIME_ZONE): string {
  const utc = new Date(zonedLocalTimeToUtcMs(dateStr, timeStr, addDays, timeZone));
  return `${String(utc.getUTCHours()).padStart(2, '0')}:${String(utc.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function formatDecimalHours(value: number): string {
  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function translateWorkType(type: string): string {
  const normalized = (type || '').toUpperCase();
  if (normalized === 'OP') return 'Operacional';
  if (normalized === 'PS') return 'Posicionamento';
  if (normalized === 'DH') return 'Deadhead / deslocamento';
  return normalized || 'Operacional';
}

function getRosterCode(day: RosterDay): string {
  const source = `${day.pairingCode || ''} ${day.type || ''} ${day.rawText || ''}`.toUpperCase();
  return source.match(/\b(NSJ|IJ|NS|DM|[A-Z]{1,4}J)\b/)?.[1] || '';
}

function translateDutyType(day: RosterDay): string {
  if (day.type === 'ASB') return 'ASB · Airport Stand By';
  if (day.type === 'HSB') return 'HSB · Home Stand By';
  if (day.type === 'HSBE') return 'HSBE · Home Stand By Extra';
  if (/^C\d{2,3}F$/i.test(day.pairingCode || '') || /\bC\d{2,3}F\b/i.test(day.rawText || '')) return 'C32F · Check de competência A32F';
  if (day.pairingCode === 'CBF') return 'CBF · EAD - Combate ao Fogo';
  if (day.pairingCode === 'EMER') return 'EMER · EAD - Emergências Gerais';
  if (day.pairingCode === 'MT') return 'MT · Meeting / reunião operacional';
  const rosterCode = getRosterCode(day);
  if (rosterCode === 'NS') return 'NS · Não comparecimento';
  if (rosterCode === 'NSJ') return 'NSJ · Não comparecimento justificado';
  if (rosterCode.endsWith('J') && rosterCode !== 'IJ') return `${rosterCode} · Justificado`;
  if (rosterCode === 'IJ') return 'IJ · Interrupção de jornada';
  if (rosterCode === 'DM') return 'DM · Dispensa médica';
  if (day.type === 'CRM') return 'CRM · Corporate Resource Management';
  return day.pairingCode || day.type;
}

function explainRestType(type: RosterDay['type']): string {
  if (type === 'DO') return 'Folga formal registrada na escala (DO).';
  if (type === 'DOF') return 'Folga formal registrada na escala (DOF).';
  if (type === 'DR') return 'Descanso regulamentar registrado na escala (DR).';
  if (type === 'OFF') return 'Extensão do descanso registrada na escala (OFF).';
  return `Dia de descanso registrado como ${type}.`;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function downloadCalendarFile(ical: string, filename: string = 'crew-roster.ics'): void {
  const element = document.createElement('a');
  const file = new Blob([ical], { type: 'text/calendar;charset=utf-8' });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(element.href);
}
