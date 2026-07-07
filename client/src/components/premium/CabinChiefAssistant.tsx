
import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  Download,
  Droplets,
  Bell,
  MapPin,
  FileText,
  MessageSquarePlus,
  Plane,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Trash2,
  Users,
  Waves,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CrewRoster } from '@/lib/pdfParser';
import { crewcheckAuthHeader } from '@/lib/authClient';

type CabinChiefAssistantProps = {
  bundle: { roster: CrewRoster } | null;
  onBack: () => void;
  onOpenRoster: () => void;
  initialFocus?: 'chief' | 'medical';
};

type FlightOption = {
  id: string;
  date: string;
  dayOfWeek?: string;
  flightNumber: string;
  route: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  aircraft?: string | null;
  workType?: string | null;
  isExtra?: boolean;
  dutyReport?: string | null;
  dutyDebrief?: string | null;
};

type TimelineEntry = {
  key: string;
  label: string;
  value?: string;
  note?: string;
};

type WaterState = {
  startNotes: string;
  endNotes: string;
  qtaStart: string;
  qtaEnd: string;
  qtuStart: string;
  qtuEnd: string;
};

type TankConfigState = {
  waterTankCount: string;
  wasteTankCount: string;
  waterLabel: string;
  wasteLabel: string;
  waterTankNames: string;
  wasteTankNames: string;
  requirePassengerCount: boolean;
  enableWasteTracking: boolean;
  enableWasteTankCount: boolean;
  readingMode: 'percent' | 'fraction';
};

type MedicalOccurrenceState = Record<string, string | boolean>;

type OccurrenceEntry = {
  id: string;
  time: string;
  type: string;
  text: string;
};

type PassengerState = {
  approx: string;
  exact: string;
};

type GeneralFlightState = {
  seatsAtLanding: string;
  minors: string;
  maas: string;
  wheelchairs: string;
  wheelchairType: string;
  wchr: string;
  wchs: string;
  wchc: string;
  blnd: string;
  deaf: string;
  meda: string;
  comments: string;
};

type ImprovementSuggestion = {
  name: string;
  role: string;
  contact: string;
  text: string;
};

type CabinLogState = {
  flightId?: string;
  activeAsChief: boolean;
  timeline: Record<string, TimelineEntry>;
  water: WaterState;
  tankConfig: TankConfigState;
  medical: MedicalOccurrenceState;
  passengers: PassengerState;
  general: GeneralFlightState;
  occurrences: OccurrenceEntry[];
  notes: string;
  serviceNotes: string;
  reportType: 'normal' | 'occurrence' | 'delay' | 'service' | 'water';
  checklist: Record<string, boolean>;
  improvement: ImprovementSuggestion;
};

const STORAGE_KEY = 'crewcheck_cabin_chief_assistant_v10892';
const HISTORY_KEY = 'crewcheck_cabin_chief_pdf_history_v10892';
const WATER_LEARNING_KEY = 'crewcheck_cabin_chief_water_learning_v10892';
const SUGGESTIONS_KEY = 'crewcheck_internal_improvement_suggestions_v10882';

function defaultTankConfig(): TankConfigState {
  return {
    waterTankCount: '1',
    wasteTankCount: '1',
    waterLabel: 'QTA / Água potável',
    wasteLabel: 'QTU / Rejeitos',
    waterTankNames: 'Tanque principal',
    wasteTankNames: 'Tanque de rejeitos',
    requirePassengerCount: false,
    enableWasteTracking: false,
    enableWasteTankCount: false,
    readingMode: 'percent',
  };
}

function defaultWaterState(): WaterState {
  return { startNotes: '', endNotes: '', qtaStart: '', qtaEnd: '', qtuStart: '', qtuEnd: '' };
}

function defaultGeneralFlightState(): GeneralFlightState {
  return { seatsAtLanding: '', minors: '', maas: '', wheelchairs: '', wheelchairType: '', wchr: '', wchs: '', wchc: '', blnd: '', deaf: '', meda: '', comments: '' };
}

function defaultMedicalOccurrence(): MedicalOccurrenceState {
  return {
    name: '', address: '', phone: '', sexM: false, sexF: false, age: '', occurrenceDateTime: '', flight: '', originDestination: '', seat: '', typeClinical: false, typeTrauma: false,
    safeYes: false, safeNo: false, glovesYes: false, glovesNo: false, consciousYes: false, consciousNo: false, orientedYes: false, orientedNo: false, confusedYes: false, confusedNo: false,
    circulationYes: false, circulationNo: false, askedHelpYes: false, askedHelpNo: false, bleedingYes: false, bleedingNo: false, bleedingWhere: '', whatWasDone: '', chiefComplaint: '', cervicalYes: false, cervicalNo: false,
    breathingNormal: false, breathingSuperficial: false, breathingDeep: false, breathingSlow: false, breathingFast: false, breathingDifficult: false,
    pulseNormal: false, pulseSlow: false, pulseFast: false, pulseFull: false, pulseThin: false, bpm: '', skinHot: false, skinCold: false, skinWet: false, skinDry: false, skinPale: false, skinRed: false,
    pupilsEqual: false, pupilsUnequal: false, pupilsDilated: false, pupilsConstricted: false, warmYes: false, warmNo: false, oxygenYes: false, oxygenNo: false,
    allergies: '', medication: '', history: '', lastMeal: '', environment: '', needsHelpYes: false, needsHelpNo: false, acceptsHelpYes: false, acceptsHelpNo: false,
    commanderSent: false, medicalTeamSent: false, aqdAttached: false, notes: '',
  };
}

const TIMELINE_STEPS: Array<{ key: string; label: string; group: string; hint: string; auto?: 'report' | 'departure' | 'arrival' }> = [
  { key: 'report', label: 'Apresentação tripulação', group: 'Decolagem', hint: 'Horário de apresentação da tripulação.', auto: 'report' },
  { key: 'crewBoard', label: 'Embarque tripulação', group: 'Decolagem', hint: 'Quando a tripulação entrou/assumiu a aeronave.' },
  { key: 'cleaningEnd', label: 'Fim da limpeza', group: 'Decolagem', hint: 'Cabine pronta para o embarque.' },
  { key: 'boardingStart', label: 'Primeiro passageiro', group: 'Decolagem', hint: 'Primeiro passageiro embarcando.' },
  { key: 'boardingEnd', label: 'Último passageiro', group: 'Decolagem', hint: 'Último passageiro embarcado.' },
  { key: 'seatingEnd', label: 'Fim acomodação', group: 'Decolagem', hint: 'Todos acomodados e cabine pronta.' },
  { key: 'doorClose', label: 'Fechamento de porta', group: 'Decolagem', hint: 'Porta fechada.' },
  { key: 'takeoff', label: 'Decolagem', group: 'Decolagem', hint: 'Pode ser preenchida automaticamente ou manualmente.', auto: 'departure' },
  { key: 'landing', label: 'Pouso', group: 'Aterrissagem', hint: 'Pode ser preenchido automaticamente ou manualmente.', auto: 'arrival' },
  { key: 'deboardingStart', label: 'Início desembarque', group: 'Aterrissagem', hint: 'Primeiros passageiros desembarcando.' },
  { key: 'crewDeboard', label: 'Desembarque tripulação', group: 'Aterrissagem', hint: 'Tripulação liberada / desembarque concluído.' },
];

const CHECKLIST_ITEMS = [
  ['form', 'Formulário de check-in da escala conferido/preenchido'],
  ['passengers', 'Quantidade aproximada de passageiros anotada, se disponível'],
  ['waterStart', 'Medição inicial de água registrada'],
  ['waterEnd', 'Medição final de água registrada'],
  ['briefing', 'Briefing de cabine conferido'],
  ['specials', 'Passageiros especiais / prioridades conferidos'],
  ['service', 'Serviço e materiais conferidos'],
  ['delays', 'Atrasos/ocorrências anotados'],
  ['reportReady', 'Relatório pronto para transcrever no sistema da empresa'],
] as const;

const WATER_LEVELS = ['0%', '12.5%', '25%', '37.5%', '50%', '62.5%', '75%', '87.5%', '100%'];
const WATER_FRACTIONS = ['0', '1/2', '5/8', '3/4', '7/8', 'F'];
const PASSENGER_PRESETS = ['Não informado', 'Até 80', '81–120', '121–160', '161–190', '191+'];
const OCCURRENCE_TYPES = ['Operacional', 'Pontualidade', 'Cabine', 'Catering', 'Bagagem', 'Passageiro', 'Água', 'Segurança', 'Outro'];

function loadCabinLog(): CabinLogState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('crewcheck_cabin_chief_assistant_v10880') || 'null');
    if (parsed && typeof parsed === 'object') return {
      activeAsChief: Boolean(parsed.activeAsChief ?? true),
      flightId: parsed.flightId || '',
      timeline: parsed.timeline || {},
      water: {
        startNotes: parsed.water?.startNotes || '',
        endNotes: parsed.water?.endNotes || '',
        qtaStart: parsed.water?.qtaStart || '',
        qtaEnd: parsed.water?.qtaEnd || '',
        qtuStart: parsed.water?.qtuStart || '',
        qtuEnd: parsed.water?.qtuEnd || '',
      },
      tankConfig: { ...defaultTankConfig(), ...(parsed.tankConfig || {}) },
      medical: { ...defaultMedicalOccurrence(), ...(parsed.medical || {}) },
      passengers: {
        approx: parsed.passengers?.approx || '',
        exact: parsed.passengers?.exact || '',
      },
      general: { ...defaultGeneralFlightState(), ...(parsed.general || {}) },
      occurrences: Array.isArray(parsed.occurrences) ? parsed.occurrences : [],
      notes: parsed.notes || '',
      serviceNotes: parsed.serviceNotes || '',
      reportType: parsed.reportType || 'normal',
      checklist: parsed.checklist || {},
      improvement: {
        name: parsed.improvement?.name || '',
        role: parsed.improvement?.role || '',
        contact: parsed.improvement?.contact || '',
        text: parsed.improvement?.text || '',
      },
    };
  } catch {}
  return {
    activeAsChief: true,
    timeline: {},
    water: defaultWaterState(),
    tankConfig: defaultTankConfig(),
    medical: defaultMedicalOccurrence(),
    passengers: { approx: '', exact: '' },
    general: defaultGeneralFlightState(),
    occurrences: [],
    notes: '',
    serviceNotes: '',
    reportType: 'normal',
    checklist: {},
    improvement: { name: '', role: '', contact: '', text: '' },
  };
}

function saveCabinLog(value: CabinLogState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch {}
}

function parseRosterDate(value: string): Date {
  const [day, month, year] = String(value || '').split(/[\/.-]/).map(Number);
  const date = new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function withTime(date: Date, time?: string | null) {
  const copy = new Date(date);
  const [h, m] = String(time || '').replace('(+1)', '').split(':').map(Number);
  if (Number.isFinite(h)) copy.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  return copy;
}

function flightDateTime(date: string, time?: string | null, fallbackHour = 0) {
  const base = parseRosterDate(date);
  const raw = String(time || '').trim();
  const plus = /\(\+\s*(\d+)\)/i.exec(raw);
  const clean = raw.replace(/\(\+\s*\d+\)/i, '').trim();
  const [h, m] = clean.split(':').map(Number);
  if (Number.isFinite(h)) base.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  else base.setHours(fallbackHour, 0, 0, 0);
  if (plus) base.setDate(base.getDate() + Number(plus[1] || 0));
  return base;
}

function flightReportWindow(flight: FlightOption) {
  const departure = flightDateTime(flight.date, flight.departureTime, 12);
  const arrival = flightDateTime(flight.date, flight.arrivalTime, 13);
  if (arrival.getTime() < departure.getTime()) arrival.setDate(arrival.getDate() + 1);
  const report = flight.dutyReport ? flightDateTime(flight.date, flight.dutyReport, departure.getHours()) : new Date(departure.getTime() - 70 * 60_000);
  const start = new Date(Math.min(report.getTime(), departure.getTime() - 90 * 60_000));
  const end = new Date(arrival.getTime() + 150 * 60_000);
  return { start, departure, arrival, end };
}

function bestFlightForReport(flights: FlightOption[], now = new Date()) {
  if (!flights.length) return undefined;
  const sorted = [...flights].sort((a, b) => flightReportWindow(a).departure.getTime() - flightReportWindow(b).departure.getTime());
  const active = sorted.find((flight) => {
    const win = flightReportWindow(flight);
    return now.getTime() >= win.start.getTime() && now.getTime() <= win.end.getTime();
  });
  if (active) return active;
  return sorted.find((flight) => flightReportWindow(flight).end.getTime() >= now.getTime()) || sorted[sorted.length - 1];
}

function reportFlightPhase(flight?: FlightOption) {
  if (!flight) return { label: 'Sem escala', tone: 'bg-slate-300/10 text-slate-200 border-white/10', helper: 'Importe uma escala para selecionar o voo.' };
  const now = Date.now();
  const win = flightReportWindow(flight);
  if (now < win.start.getTime()) return { label: 'A seguir', tone: 'bg-blue-300/10 text-blue-100 border-blue-200/20', helper: 'Próximo voo pelo horário da escala.' };
  if (now < win.departure.getTime()) return { label: 'Pré-voo', tone: 'bg-cyan-300/10 text-cyan-100 border-cyan-200/20', helper: 'Dentro da janela de preparação.' };
  if (now < win.arrival.getTime()) return { label: 'Em voo', tone: 'bg-emerald-300/10 text-emerald-100 border-emerald-200/20', helper: 'Voo atual estimado pela escala.' };
  if (now < win.end.getTime()) return { label: 'Pós-pouso', tone: 'bg-amber-300/10 text-amber-100 border-amber-200/20', helper: 'Momento ideal para finalizar gerais e relatório.' };
  return { label: 'Finalizado', tone: 'bg-slate-300/10 text-slate-200 border-white/10', helper: 'Voo finalizado conforme escala.' };
}

const REPORT_AIRPORT_COORDS: Record<string, [number, number]> = {
  BSB: [-15.8697, -47.9208], GRU: [-23.4356, -46.4731], CGH: [-23.6261, -46.6564], VCP: [-23.0074, -47.1345], GIG: [-22.8099, -43.2506], SDU: [-22.9105, -43.1631],
  CNF: [-19.6244, -43.9719], POA: [-29.9944, -51.1714], CWB: [-25.5285, -49.1758], FLN: [-27.6705, -48.5525], VIX: [-20.2581, -40.2864], GYN: [-16.6320, -49.2207],
  REC: [-8.1265, -34.9236], FOR: [-3.7763, -38.5326], NAT: [-5.7681, -35.3761], BEL: [-1.3793, -48.4763], MAO: [-3.0386, -60.0497], MCP: [0.0507, -51.0722],
  MCZ: [-9.5108, -35.7917], JPA: [-7.1484, -34.9507], AJU: [-10.9840, -37.0703], SSA: [-12.9086, -38.3225], IOS: [-14.8159, -39.0332], BPS: [-16.4386, -39.0809],
  PMW: [-10.2915, -48.3569], SLZ: [-2.5854, -44.2341], THE: [-5.0599, -42.8235], CGB: [-15.6529, -56.1167], CGR: [-20.4687, -54.6725], PVH: [-8.7093, -63.9023], RBR: [-9.8689, -67.8981], BVB: [2.8414, -60.6922],
  MIA: [25.7933, -80.2906], LAX: [33.9416, -118.4085], JFK: [40.6413, -73.7781], MEX: [19.4361, -99.0719], SCL: [-33.3929, -70.7858], EZE: [-34.8222, -58.5358], AEP: [-34.5592, -58.4156], LIM: [-12.0219, -77.1143], BOG: [4.7016, -74.1469], CDG: [49.0097, 2.5479], MAD: [40.4983, -3.5676], LIS: [38.7742, -9.1342], FCO: [41.8003, 12.2389], LHR: [51.4700, -0.4543], FRA: [50.0379, 8.5622], AMS: [52.3105, 4.7683]
};

function distanceKmFromCoords(aLat: number, aLon: number, bLat: number, bLon: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function specialLandingAlerts(general: GeneralFlightState): string[] {
  return [
    Number(general.seatsAtLanding || 0) > 0 ? `${general.seatsAtLanding} cadeira(s) no desembarque` : '',
    Number(general.minors || 0) > 0 ? `${general.minors} menor(es)` : '',
    Number(general.maas || 0) > 0 ? `${general.maas} MAAS` : '',
    Number(general.wheelchairs || 0) > 0 ? `${general.wheelchairs} WCH${general.wheelchairType ? ` · ${general.wheelchairType}` : ''}` : '',
    Number(general.wchr || 0) > 0 ? `${general.wchr} WCHR` : '',
    Number(general.wchs || 0) > 0 ? `${general.wchs} WCHS` : '',
    Number(general.wchc || 0) > 0 ? `${general.wchc} WCHC` : '',
    Number(general.blnd || 0) > 0 ? `${general.blnd} BLND` : '',
    Number(general.deaf || 0) > 0 ? `${general.deaf} DEAF` : '',
    Number(general.meda || 0) > 0 ? `${general.meda} MEDA` : '',
  ].filter(Boolean);
}

function formatNow() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function getFlightOptions(roster?: CrewRoster | null): FlightOption[] {
  const days = roster?.days || [];
  return days.flatMap((day) => {
    const date = parseRosterDate(day.date);
    return (day.legs || []).map((leg, legIndex) => ({
      id: `${day.date}-${leg.flightNumber}-${leg.origin}-${leg.destination}-${leg.departureTime}-${legIndex}`,
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      flightNumber: leg.flightNumber,
      route: `${leg.origin} → ${leg.destination}`,
      origin: leg.origin,
      destination: leg.destination,
      departureTime: leg.departureTime,
      arrivalTime: leg.arrivalTime,
      aircraft: leg.aircraftType || null,
      workType: leg.workType || null,
      isExtra: String(leg.workType || '').toUpperCase() === 'PS',
      dutyReport: legIndex === 0 ? day.dutyReport : null,
      dutyDebrief: legIndex === (day.legs || []).length - 1 ? day.dutyDebrief : null,
    }));
  }).sort((a, b) => withTime(parseRosterDate(a.date), a.departureTime).getTime() - withTime(parseRosterDate(b.date), b.departureTime).getTime());
}

function upcomingFlight(flights: FlightOption[]) {
  return bestFlightForReport(flights);
}

function parseWaterPercent(value?: string) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'F' || /FULL/.test(raw)) return 100;
  const fractionMap: Record<string, number> = { '1/2': 50, '5/8': 62.5, '3/4': 75, '7/8': 87.5 };
  if (fractionMap[raw] !== undefined) return fractionMap[raw];
  const clean = raw.replace(',', '.');
  const match = clean.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, number));
}

function averageDefined(values: Array<number | null>) {
  const valid = values.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return valid.length ? valid.reduce((sum, item) => sum + item, 0) / valid.length : null;
}

function passengerNumber(passengers: PassengerState) {
  const exact = Number(String(passengers.exact || '').replace(/\D/g, ''));
  if (Number.isFinite(exact) && exact > 0) return exact;
  const approx = passengers.approx;
  if (approx === 'Até 80') return 70;
  if (approx === '81–120') return 100;
  if (approx === '121–160') return 140;
  if (approx === '161–190') return 175;
  if (approx === '191+') return 200;
  return null;
}

function waterMetrics(log: CabinLogState) {
  const start = averageDefined([parseWaterPercent(log.water.qtaStart)]);
  const end = averageDefined([parseWaterPercent(log.water.qtaEnd)]);
  const pax = passengerNumber(log.passengers);
  const consumed = start !== null && end !== null ? Math.max(0, start - end) : null;
  const perPassenger = consumed !== null && pax ? consumed / pax : null;
  const prediction = predictWaterEnd(log, start, pax);
  return { start, end, pax, consumed, perPassenger, prediction };
}

function loadWaterLearning() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WATER_LEARNING_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWaterLearning(sample: { aircraft?: string | null; route?: string; pax?: number | null; consumed?: number | null; perPassenger?: number | null }) {
  if (!sample.consumed && !sample.perPassenger) return;
  try {
    const history = loadWaterLearning();
    history.unshift({ ...sample, at: new Date().toISOString() });
    localStorage.setItem(WATER_LEARNING_KEY, JSON.stringify(history.slice(0, 60)));
  } catch {}
}

function predictWaterEnd(log: CabinLogState, start: number | null, pax: number | null) {
  if (start === null) return null;
  const history = loadWaterLearning();
  const learned = history.map((item) => Number(item.perPassenger || 0)).filter((value) => value > 0 && value < 1);
  const baselinePerPassenger = learned.length
    ? learned.slice(0, 20).reduce((sum, item) => sum + item, 0) / Math.min(20, learned.length)
    : 0.06; // ponto percentual por passageiro como estimativa conservadora local
  const people = pax || 150;
  const expectedConsumed = Math.min(65, Math.max(4, baselinePerPassenger * people));
  return Math.max(0, Math.round((start - expectedConsumed) * 10) / 10);
}

function operationalAiSummary(flight: FlightOption | undefined, log: CabinLogState): string[] {
  const tips: string[] = [];
  const metrics = waterMetrics(log);
  if (!flight) return ['Importe ou abra uma escala para o assistente sugerir o próximo voo.'];
  if (log.activeAsChief) tips.push('Modo chefe ativo: acompanhe horários, água, passageiros especiais e ocorrências antes de transcrever no sistema oficial.');
  if (flight.isExtra) tips.push('Voo extra/PS: confirme se há formulário de check-in da escala aplicável para esta apresentação.');
  if (!log.water.qtaStart) tips.push('Registre a água inicial antes da saída.');
  if (metrics.start !== null && metrics.end === null && metrics.prediction !== null) tips.push(`Se esquecer a medição final, a previsão atual sugere terminar próximo de ${metrics.prediction}% com base no histórico local e passageiros informados.`);
  if (!metrics.pax) tips.push('Passageiros é opcional: informe uma faixa aproximada ou número exato para melhorar a previsão de consumo de água.');
  if (Number(log.general.minors || 0) > 0) tips.push(`Há ${log.general.minors} menor(es) registrado(s): o app poderá lembrar no pouso.`);
  if (Number(log.general.maas || 0) > 0 || Number(log.general.wheelchairs || 0) > 0) tips.push('MAAS/cadeirantes informados: confira a coordenação no desembarque.');
  if (!log.timeline.report?.value) tips.push('Comece pela apresentação da tripulação e embarque da tripulação.');
  if (log.timeline.landing?.value && !log.water.qtaEnd) tips.push('Após o pouso/chegada, registre a água final e finalize os gerais do voo.');
  if (log.occurrences.length) tips.push(`${log.occurrences.length} ocorrência(s) registrada(s): revise antes de exportar ou compartilhar o relatório.`);
  if (!tips.length) tips.push('Tudo essencial está encaminhado. Mantenha apenas conferência com os registros oficiais.');
  return tips;
}

function occurrenceLines(log: CabinLogState) {
  return log.occurrences.length
    ? log.occurrences.map((item) => `${item.time} · ${item.type}: ${item.text}`).join('\n')
    : 'Nenhuma ocorrência registrada.';
}

function buildReportText(flight: FlightOption | undefined, log: CabinLogState) {
  const metrics = waterMetrics(log);
  const otpLines = TIMELINE_STEPS
    .map((step) => log.timeline[step.key]?.value ? `${step.label}: ${log.timeline[step.key].value}${log.timeline[step.key].note ? ` — ${log.timeline[step.key].note}` : ''}` : '')
    .filter(Boolean)
    .join('\n');
  const specialAlerts = specialLandingAlerts(log.general).join(' · ');

  return [
    'CrewCheck — Relatório Premium de Voo',
    flight ? `Voo: ${flight.flightNumber} · ${flight.route} · ${flight.date}` : 'Voo: não selecionado',
    flight?.aircraft ? `Aeronave: ${flight.aircraft}` : '',
    log.passengers.exact || log.passengers.approx ? `Passageiros: ${log.passengers.exact || log.passengers.approx}` : 'Passageiros: não informado',
    '',
    'RELATÓRIO OTP',
    otpLines || 'Nenhum horário registrado ainda.',
    '',
    'GERAIS DO VOO',
    `Configuração de água: ${log.tankConfig.waterLabel || 'QTA'} x${log.tankConfig.waterTankCount || '1'}${log.tankConfig.enableWasteTracking ? ` · ${log.tankConfig.wasteLabel || 'QTU'} x${log.tankConfig.wasteTankCount || '1'}` : ''}`,
    `Água início: ${log.water.qtaStart || '—'}${log.tankConfig.enableWasteTracking ? ` · QTU ${log.water.qtuStart || '—'}` : ''}${log.water.startNotes ? ` · ${log.water.startNotes}` : ''}`,
    `Água fim: ${log.water.qtaEnd || '—'}${log.tankConfig.enableWasteTracking ? ` · QTU ${log.water.qtuEnd || '—'}` : ''}${log.water.endNotes ? ` · ${log.water.endNotes}` : ''}`,
    metrics.consumed !== null ? `Consumo estimado de água: ${metrics.consumed.toFixed(1)} p.p.${metrics.perPassenger !== null ? ` · ${metrics.perPassenger.toFixed(3)} por passageiro` : ''}` : 'Consumo estimado de água: insuficiente para cálculo.',
    metrics.end === null && metrics.prediction !== null ? `Previsão final de água: ~${metrics.prediction}% (estimativa local)` : '',
    log.general.seatsAtLanding ? `Cadeiras no desembarque: ${log.general.seatsAtLanding}` : '',
    specialAlerts ? `Atenções no pouso: ${specialAlerts}` : 'Atenções no pouso: nenhuma informada.',
    log.general.comments ? `Comentários gerais do voo: ${log.general.comments}` : '',
    '',
    'OCORRÊNCIAS',
    occurrenceLines(log),
    '',
    log.serviceNotes ? `Serviço / cabine:\n${log.serviceNotes}` : '',
    log.notes ? `Observações adicionais:\n${log.notes}` : '',
    '',
    '#CREWCHECK #RELATORIOOTP #GERAISDOVOO',
  ].filter((line) => line !== '').join('\n');
}

function requestLocalNotification(title: string, body: string) {
  try {
    const native = (window as any).CrewCheckNative || (window as any).CrewCheckPremium;
    if (native?.notify) { native.notify(title, body); return; }
    if ('Notification' in window) {
      if (Notification.permission === 'granted') new Notification(title, { body, tag: 'crewcheck-cabin-chief' });
      else if (Notification.permission === 'default') Notification.requestPermission().then((p) => p === 'granted' && new Notification(title, { body }));
    }
  } catch {}
}

function safeFilename(value: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'voo';
}

function registerPdfHistory(flight: FlightOption | undefined, filename: string) {
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    history.unshift({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      filename,
      flightNumber: flight?.flightNumber || '',
      date: flight?.date || new Date().toLocaleDateString('pt-BR'),
      route: flight?.route || '',
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 80)));
  } catch {}
}

function loadPdfHistory(): Array<{ id: string; filename: string; flightNumber: string; date: string; route: string; createdAt: string }> {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


function boolMark(value: unknown) { return value ? 'X' : ''; }
function medText(medical: MedicalOccurrenceState, key: string) { return String(medical[key] || ''); }

function drawMedicalCheckbox(doc: jsPDF, x: number, y: number, checked: unknown) {
  doc.rect(x, y, 5, 5);
  if (checked) {
    doc.setFont('helvetica', 'bold');
    doc.text('X', x + 1.2, y + 4.1);
    doc.setFont('helvetica', 'normal');
  }
}

function buildMedicalOccurrencePdfBlob(flight: FlightOption | undefined, log: CabinLogState) {
  const medical = { ...defaultMedicalOccurrence(), ...log.medical };
  const doc = new jsPDF('p', 'mm', 'a4');
  doc.setProperties({ title: 'Ocorrência Médica - Checklist', subject: 'Formulário de ocorrência médica', creator: 'CrewCheck' });
  const left = 12;
  const right = 198;
  let y = 12;
  doc.setLineWidth(0.35);
  doc.rect(left, y, right - left, 275);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Ocorrência Médica', 105, y + 6, { align: 'center' });
  doc.text('CHECKLIST', 105, y + 11, { align: 'center' });
  y += 15;
  doc.line(left, y, right, y);
  doc.setFontSize(9);
  doc.text('INFORMAÇÕES DO PASSAGEIRO', 105, y + 5, { align: 'center' });
  y += 10;
  doc.setFont('helvetica', 'normal');
  function line(label: string, value: string, x: number, yy: number, w: number) {
    doc.text(label, x, yy);
    doc.line(x + doc.getTextWidth(label) + 1, yy + 0.8, x + w, yy + 0.8);
    if (value) doc.text(value, x + doc.getTextWidth(label) + 2, yy - 1);
  }
  line('NOME:', medText(medical, 'name'), left + 2, y, 120);
  line('TEL:', medText(medical, 'phone'), 145, y, 50);
  y += 8;
  line('END.:', medText(medical, 'address'), left + 2, y, 182);
  y += 8;
  doc.text('SEXO: M', left + 2, y); drawMedicalCheckbox(doc, left + 20, y - 4, medical.sexM); doc.text('F', left + 34, y); drawMedicalCheckbox(doc, left + 40, y - 4, medical.sexF);
  line('IDADE:', medText(medical, 'age'), 60, y, 30);
  line('DATA / HORA DA OCORRÊNCIA:', medText(medical, 'occurrenceDateTime'), 92, y, 72);
  y += 8;
  line('VOO:', medText(medical, 'flight') || flight?.flightNumber || '', left + 2, y, 35);
  line('ORIGEM/DESTINO:', medText(medical, 'originDestination') || flight?.route || '', 48, y, 80);
  line('POLTRONA:', medText(medical, 'seat'), 137, y, 48);
  y += 8;
  doc.text('TIPO DE OCORRÊNCIA:', left + 2, y); doc.text('CLÍNICA', 55, y); drawMedicalCheckbox(doc, 72, y - 4, medical.typeClinical); doc.text('TRAUMA', 85, y); drawMedicalCheckbox(doc, 102, y - 4, medical.typeTrauma);
  y += 10;
  doc.setFont('helvetica', 'bold'); doc.text('SECOPA', 105, y, { align: 'center' }); doc.setFont('helvetica', 'normal');
  y += 8;
  const rows = [
    ['LOCAL SEGURO?', 'safeYes', 'safeNo', 'UTILIZANDO LUVAS?', 'glovesYes', 'glovesNo'],
    ['CONSCIENTE?', 'consciousYes', 'consciousNo', 'ORIENTADO?', 'orientedYes', 'orientedNo'],
    ['SINAIS DE CIRCULAÇÃO?', 'circulationYes', 'circulationNo', 'CONFUSO?', 'confusedYes', 'confusedNo'],
    ['PEDIU AJUDA?', 'askedHelpYes', 'askedHelpNo', '', '', ''],
  ];
  doc.setFont('helvetica', 'bold'); doc.text('SIM', 60, y - 5); doc.text('NÃO', 78, y - 5); doc.text('SIM', 150, y - 5); doc.text('NÃO', 172, y - 5); doc.setFont('helvetica', 'normal');
  for (const r of rows) {
    doc.text(r[0], left + 2, y); drawMedicalCheckbox(doc, 60, y - 4, medical[r[1]]); drawMedicalCheckbox(doc, 78, y - 4, medical[r[2]]);
    if (r[3]) { doc.text(r[3], 100, y); drawMedicalCheckbox(doc, 150, y - 4, medical[r[4]]); drawMedicalCheckbox(doc, 172, y - 4, medical[r[5]]); }
    y += 7;
  }
  line('HEMORRAGIAS EXTERNAS?', boolMark(medical.bleedingYes), left + 2, y, 58); doc.text('ONDE:', 105, y); doc.line(118, y + .8, 190, y + .8); if (medText(medical, 'bleedingWhere')) doc.text(medText(medical, 'bleedingWhere'), 120, y - 1);
  y += 8;
  line('O QUE FOI FEITO:', medText(medical, 'whatWasDone'), left + 2, y, 182);
  y += 10;
  doc.setFont('helvetica', 'bold'); doc.text('QUEIXA E AVALIAÇÃO SECUNDÁRIA', 105, y, { align: 'center' }); doc.setFont('helvetica', 'normal');
  y += 8;
  line('QUEIXA PRINCIPAL:', medText(medical, 'chiefComplaint'), left + 2, y, 182);
  y += 8;
  doc.text('NECESSÁRIA IMOBILIZAÇÃO CERVICAL?', left + 2, y); doc.text('SIM', 88, y); drawMedicalCheckbox(doc, 99, y - 4, medical.cervicalYes); doc.text('NÃO', 115, y); drawMedicalCheckbox(doc, 129, y - 4, medical.cervicalNo);
  y += 8;
  const checkboxRows = [
    ['RESPIRAÇÃO:', [['NORMAL','breathingNormal'],['SUPERFICIAL','breathingSuperficial'],['PROFUNDA','breathingDeep'],['LENTA','breathingSlow'],['RÁPIDA','breathingFast'],['DIFICULTOSA','breathingDifficult']]],
    ['PULSO:', [['NORMAL','pulseNormal'],['LENTO','pulseSlow'],['RÁPIDO','pulseFast'],['CHEIO','pulseFull'],['FINO','pulseThin']]],
    ['PELE:', [['QUENTE','skinHot'],['FRIA','skinCold'],['ÚMIDA','skinWet'],['SECA','skinDry'],['PÁLIDA','skinPale'],['VERMELHA','skinRed']]],
    ['PUPILAS:', [['IGUAIS','pupilsEqual'],['DESIGUAIS','pupilsUnequal'],['DILATADAS','pupilsDilated'],['CONTRAÍDAS','pupilsConstricted']]],
  ];
  for (const [label, items] of checkboxRows as any) {
    doc.text(label, left + 2, y + 4);
    let x = 45;
    for (const [txt, key] of items) { doc.text(txt, x, y); drawMedicalCheckbox(doc, x + 4, y + 2, medical[key]); x += 27; }
    if (label === 'PULSO:') line('BAT. P/MIN.:', medText(medical, 'bpm'), 160, y + 4, 30);
    y += 12;
  }
  doc.text('NECESSÁRIO AGASALHAR?', left + 2, y); doc.text('SIM', 70, y); drawMedicalCheckbox(doc, 82, y - 4, medical.warmYes); doc.text('NÃO', 98, y); drawMedicalCheckbox(doc, 112, y - 4, medical.warmNo);
  y += 7;
  doc.text('NECESSÁRIO OXIGÊNIO?', left + 2, y); doc.text('SIM', 70, y); drawMedicalCheckbox(doc, 82, y - 4, medical.oxygenYes); doc.text('NÃO', 98, y); drawMedicalCheckbox(doc, 112, y - 4, medical.oxygenNo);
  y += 9;
  line('ALERGIAS:', medText(medical, 'allergies'), left + 2, y, 182); y += 7;
  line('MEDICAÇÃO DE USO ROTINEIRO:', medText(medical, 'medication'), left + 2, y, 182); y += 7;
  line('PASSADO MÉDICO (HISTÓRICO DE DOENÇAS):', medText(medical, 'history'), left + 2, y, 182); y += 7;
  line('ÚLTIMA ALIMENTAÇÃO E LÍQUIDOS:', medText(medical, 'lastMeal'), left + 2, y, 182); y += 7;
  line('AMBIENTE (DESDE QUANDO, ONDE, COMO):', medText(medical, 'environment'), left + 2, y, 182); y += 12;
  doc.setFont('helvetica', 'bold'); doc.text('AJUDA MÉDICA', 105, y, { align: 'center' }); doc.setFont('helvetica', 'normal'); y += 7;
  doc.text('PAX NECESSITA DE AJUDA MÉDICA?', left + 2, y); doc.text('SIM', 92, y); drawMedicalCheckbox(doc, 104, y - 4, medical.needsHelpYes); doc.text('NÃO', 120, y); drawMedicalCheckbox(doc, 134, y - 4, medical.needsHelpNo); y += 7;
  doc.text('PAX ACEITA AJUDA MÉDICA?', left + 2, y); doc.text('SIM', 92, y); drawMedicalCheckbox(doc, 104, y - 4, medical.acceptsHelpYes); doc.text('NÃO', 120, y); drawMedicalCheckbox(doc, 134, y - 4, medical.acceptsHelpNo); y += 10;
  doc.setFontSize(7); doc.text('Gerado pelo CrewCheck para auxiliar o registro. Conferir e transcrever/anexar conforme procedimento oficial da empresa.', left + 2, 284);
  const filename = `Ocorrencia_Medica_${safeFilename(flight?.date || new Date().toISOString().slice(0,10))}_${safeFilename(flight?.flightNumber || 'voo')}_${safeFilename(flight?.route || 'rota')}.pdf`;
  return { doc, filename, blob: doc.output('blob') as Blob };
}


function parseReportColor(value?: string): [number, number, number] {
  const raw = String(value || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return [7, 24, 43];
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

function getChiefReportColor(): [number, number, number] {
  try { return parseReportColor(localStorage.getItem('crewcheck_chief_report_color') || '#07182b'); } catch { return [7, 24, 43]; }
}

export default function CabinChiefAssistant({ bundle, onBack, onOpenRoster, initialFocus = 'chief' }: CabinChiefAssistantProps) {
  const flights = useMemo(() => getFlightOptions(bundle?.roster), [bundle?.roster]);
  const next = useMemo(() => upcomingFlight(flights), [flights]);
  const [autoSelectFlight, setAutoSelectFlight] = useState(true);
  const [landingWatchActive, setLandingWatchActive] = useState(false);
  const [landingDistanceKm, setLandingDistanceKm] = useState<number | null>(null);
  const [landingWatchStatus, setLandingWatchStatus] = useState('');
  const [lastLandingNotificationKey, setLastLandingNotificationKey] = useState('');
  const [log, setLog] = useState<CabinLogState>(() => {
    const loaded = loadCabinLog();
    if (!loaded.flightId && next?.id) return { ...loaded, flightId: next.id };
    return loaded;
  });
  const [occurrenceDraft, setOccurrenceDraft] = useState({ type: 'Operacional', text: '' });
  const [historySearch, setHistorySearch] = useState('');
  const [history, setHistory] = useState(() => loadPdfHistory());
  const [activeReportTab, setActiveReportTab] = useState<'otp' | 'gerais' | 'medical' | 'settings'>(() => initialFocus === 'medical' ? 'medical' : 'otp');
  const [chiefQuestion, setChiefQuestion] = useState('');
  const [chiefAnswer, setChiefAnswer] = useState('');
  const [chiefLoading, setChiefLoading] = useState(false);

  const flight = flights.find((item) => item.id === log.flightId) || next;
  const flightPhase = useMemo(() => reportFlightPhase(flight), [flight?.id, flight?.date, flight?.departureTime, flight?.arrivalTime]);
  const aiTips = useMemo(() => operationalAiSummary(flight, log), [flight, log]);
  const reportText = useMemo(() => buildReportText(flight, log), [flight, log]);
  const metrics = useMemo(() => waterMetrics(log), [log]);

  useEffect(() => { saveCabinLog(log); }, [log]);
  useEffect(() => {
    if (initialFocus === 'medical') {
      setActiveReportTab('medical');
      window.setTimeout(() => document.getElementById('crewcheck-medical-checklist')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
      toast.message('Checklist médico aberto. Preencha e exporte em PDF para AQD/comandante.');
    }
  }, [initialFocus]);


  useEffect(() => {
    if (!autoSelectFlight || !next?.id) return;
    setLog((current) => current.flightId === next.id ? current : { ...current, flightId: next.id });
  }, [autoSelectFlight, next?.id]);

  useEffect(() => {
    if (!landingWatchActive || !flight?.destination) return;
    const destination = String(flight.destination || '').toUpperCase();
    const coords = REPORT_AIRPORT_COORDS[destination];
    const alerts = specialLandingAlerts(log.general);
    if (!coords) {
      setLandingWatchStatus(`Destino ${destination} sem coordenada cadastrada para alerta automático.`);
      return;
    }
    if (!alerts.length) {
      setLandingWatchStatus('Preencha MAAS, WCH ou outras assistências para ativar um lembrete útil no pouso.');
    }
    if (!navigator.geolocation) {
      setLandingWatchStatus('Geolocalização indisponível neste dispositivo.');
      return;
    }
    const watchId = navigator.geolocation.watchPosition((position) => {
      const km = distanceKmFromCoords(position.coords.latitude, position.coords.longitude, coords[0], coords[1]);
      setLandingDistanceKm(km);
      const win = flightReportWindow(flight);
      const closeEnough = km <= 8;
      const timeWindow = Date.now() >= win.arrival.getTime() - 45 * 60_000;
      setLandingWatchStatus(`${destination}: ${km.toFixed(1)} km do aeroporto · precisão ${Math.round(position.coords.accuracy || 0)} m.`);
      const key = `${flight.id}:${alerts.join('|')}`;
      if (closeEnough && timeWindow && alerts.length && key !== lastLandingNotificationKey) {
        requestLocalNotification('CrewCheck · Atenções no pouso', `Conferir no desembarque: ${alerts.join(' · ')}`);
        setLastLandingNotificationKey(key);
        setTimelineValue('landing', 'Pouso', formatNow(), 'GPS próximo ao destino');
        toast.success(`Pouso detectado próximo a ${destination}. Lembrete enviado.`);
      }
    }, (error) => {
      setLandingWatchStatus(error?.message || 'Não foi possível monitorar a localização.');
    }, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [landingWatchActive, flight?.id, flight?.destination, log.general, lastLandingNotificationKey]);


  function updateLog(nextLog: Partial<CabinLogState>) {

    setLog((current) => ({ ...current, ...nextLog }));
  }

  
  function updateMedical(key: string, value: string | boolean) {
    setLog((current) => ({ ...current, medical: { ...defaultMedicalOccurrence(), ...current.medical, [key]: value } }));
  }

  function setTimelineValue(stepKey: string, label: string, value: string, note?: string) {
    setLog((current) => ({
      ...current,
      timeline: { ...current.timeline, [stepKey]: { key: stepKey, label, value, note } },
    }));
  }

  function notifyLandingSpecials() {
    const alerts = specialLandingAlerts(log.general);
    if (!alerts.length) { toast.message('Preencha MAAS, WCH ou outras assistências antes de ativar o lembrete.'); return; }
    requestLocalNotification('CrewCheck · Atenções no pouso', `Conferir no desembarque: ${alerts.join(' · ')}`);
  }

  function toggleLandingWatch() {
    if (!flight) { toast.message('Abra uma escala para monitorar o pouso.'); return; }
    const alerts = specialLandingAlerts(log.general);
    if (!alerts.length) { toast.message('Preencha MAAS, WCH ou outras assistências antes de ativar o alerta por geolocalização.'); return; }
    setLandingWatchActive((current) => {
      const nextValue = !current;
      toast.success(nextValue ? 'Alerta de pouso por GPS ativado.' : 'Alerta de pouso por GPS pausado.');
      return nextValue;
    });
  }

  function mark(stepKey: string, label: string) {
    const value = formatNow();
    setTimelineValue(stepKey, label, value);
    if (stepKey === 'landing') notifyLandingSpecials();
    toast.success(`${label}: ${value}`);
  }

  function changeManualTime(stepKey: string, label: string, value: string) {
    setTimelineValue(stepKey, label, value, value ? 'manual' : undefined);
  }

  function clearTimelineEntry(stepKey: string) {
    setLog((current) => {
      const nextTimeline = { ...current.timeline };
      delete nextTimeline[stepKey];
      return { ...current, timeline: nextTimeline };
    });
  }

  function markOfficial(stepKey: string, label: string, time?: string | null) {
    if (!time) { toast.message('Este horário não veio na escala. Use o preenchimento manual.'); return; }
    setTimelineValue(stepKey, label, time, 'escala');
    if (stepKey === 'landing') notifyLandingSpecials();
    toast.success(`${label}: ${time}`);
  }

  function fillFromFlight() {
    if (!flight) return;
    setLog((current) => ({
      ...current,
      flightId: flight.id,
      timeline: {
        ...current.timeline,
        ...(flight.dutyReport ? { report: { key: 'report', label: 'Apresentação tripulação', value: flight.dutyReport, note: 'escala' } } : {}),
        ...(flight.departureTime ? { takeoff: { key: 'takeoff', label: 'Decolagem', value: flight.departureTime, note: 'escala' } } : {}),
        ...(flight.arrivalTime ? { landing: { key: 'landing', label: 'Pouso', value: flight.arrivalTime, note: 'escala' } } : {}),
      },
    }));
    toast.success('Horários principais preenchidos pela escala.');
  }

  function clearTimeline() {
    setLog((current) => ({ ...current, timeline: {}, water: defaultWaterState(), general: defaultGeneralFlightState(), occurrences: [], notes: '', serviceNotes: '', checklist: {} }));
    toast.success('Relatório limpo.');
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText);
      toast.success('Texto do relatório copiado.');
    } catch {
      toast.message('Não consegui copiar automaticamente. Use o texto exibido no relatório.');
    }
  }

  function buildPdfBlob() {
    const doc = new jsPDF();
    doc.setProperties({
      title: `CrewCheck Relatório Premium ${flight?.flightNumber || ''}`,
      subject: 'Relatório OTP e gerais do voo',
      creator: 'CrewCheck',
    });
    const [headerR, headerG, headerB] = getChiefReportColor();
    doc.setFillColor(headerR, headerG, headerB);
    doc.roundedRect(10, 10, 190, 24, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('CrewCheck — Relatório Premium de Voo', 14, 22);
    doc.setFontSize(10);
    doc.text(flight ? `${flight.flightNumber} · ${flight.route} · ${flight.date}` : 'Sem voo selecionado', 14, 29);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(reportText, 178);
    let y = 42;
    for (const line of lines) {
      if (y > 282) {
        doc.addPage();
        y = 18;
      }
      doc.text(line, 14, y);
      y += 5.3;
    }
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Gerado pelo CrewCheck • PDF pesquisável • compartilhar via e-mail/WhatsApp', 14, 289);
    const filename = `CrewCheck_${safeFilename(flight?.date || new Date().toISOString().slice(0,10))}_${safeFilename(flight?.flightNumber || 'voo')}_${safeFilename(flight?.route || 'rota')}.pdf`;
    return { doc, filename, blob: doc.output('blob') as Blob };
  }

  function exportPdf() {
    const { doc, filename } = buildPdfBlob();
    doc.save(filename);
    registerPdfHistory(flight, filename);
    setHistory(loadPdfHistory());
    const m = waterMetrics(log);
    if (m.consumed !== null) saveWaterLearning({ aircraft: flight?.aircraft, route: flight?.route, pax: m.pax, consumed: m.consumed, perPassenger: m.perPassenger });
    toast.success(`PDF salvo: ${filename}`);
  }

  async function shareReport() {
    const { filename, blob } = buildPdfBlob();
    const file = new File([blob], filename, { type: 'application/pdf' });
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: 'CrewCheck — Relatório Premium', text: `Relatório ${flight?.flightNumber || ''}`, files: [file] });
        registerPdfHistory(flight, filename);
        setHistory(loadPdfHistory());
        toast.success('Compartilhamento aberto.');
        return;
      }
    } catch {}
    exportPdf();
    toast.message('Compartilhamento nativo indisponível. PDF baixado para anexar manualmente.');
  }

  async function shareReportChannel(channel: 'email' | 'whatsapp') {
    try { await navigator.clipboard.writeText(reportText); } catch {}
    exportPdf();
    const subject = encodeURIComponent(`CrewCheck - Relatório ${flight?.flightNumber || ''}`);
    const body = encodeURIComponent(`Segue o relatório do voo.

O texto do relatório foi copiado e o PDF foi salvo para anexar.

${reportText.slice(0, 1500)}`);
    if (channel === 'email') window.location.href = `mailto:?subject=${subject}&body=${body}`;
    else window.open(`https://wa.me/?text=${body}`, '_blank');
  }

  function exportMedicalPdf() {
    const { doc, filename } = buildMedicalOccurrencePdfBlob(flight, log);
    doc.save(filename);
    registerPdfHistory(flight, filename);
    setHistory(loadPdfHistory());
    setLog((current) => ({ ...current, medical: { ...current.medical, aqdAttached: true } }));
    toast.success(`Checklist médico salvo: ${filename}`);
  }

  async function shareMedicalPdf() {
    const { filename, blob } = buildMedicalOccurrencePdfBlob(flight, log);
    const file = new File([blob], filename, { type: 'application/pdf' });
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: 'Ocorrência Médica - Checklist', text: `Checklist médico ${flight?.flightNumber || ''}`, files: [file] });
        registerPdfHistory(flight, filename);
        setHistory(loadPdfHistory());
        toast.success('Compartilhamento do checklist médico aberto.');
        return;
      }
    } catch {}
    exportMedicalPdf();
    toast.message('Compartilhamento nativo indisponível. PDF salvo para anexar ao AQD/e-mail/WhatsApp.');
  }

  function remindCheckin() {
    requestLocalNotification('CrewCheck · Check-in da escala', 'Lembrete: confirme/preencha o formulário de check-in da escala.');
    setLog((current) => ({ ...current, checklist: { ...current.checklist, form: true } }));
    toast.success('Lembrete de check-in disparado.');
  }

  function addOccurrence() {
    const text = occurrenceDraft.text.trim();
    if (!text) { toast.message('Digite a ocorrência antes de adicionar.'); return; }
    const entry: OccurrenceEntry = { id: `${Date.now()}`, time: formatNow(), type: occurrenceDraft.type, text };
    setLog((current) => ({ ...current, occurrences: [entry, ...current.occurrences], checklist: { ...current.checklist, delays: true } }));
    setOccurrenceDraft({ type: occurrenceDraft.type, text: '' });
    toast.success('Ocorrência registrada.');
  }

  function removeOccurrence(id: string) {
    setLog((current) => ({ ...current, occurrences: current.occurrences.filter((item) => item.id !== id) }));
    toast.success('Ocorrência removida.');
  }

  function saveSuggestion() {
    const text = log.improvement.text.trim();
    if (!text) { toast.message('Digite a sugestão antes de salvar.'); return; }
    try {
      const list = JSON.parse(localStorage.getItem(SUGGESTIONS_KEY) || '[]');
      list.unshift({ ...log.improvement, id: `${Date.now()}`, at: new Date().toISOString() });
      localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(list.slice(0, 100)));
    } catch {}
    updateLog({ improvement: { name: '', role: '', contact: '', text: '' } });
    toast.success('Sugestão salva no app. Você pode exportar depois pelo suporte.');
  }


  const filteredHistory = history.filter((item) => `${item.filename} ${item.flightNumber} ${item.date} ${item.route}`.toLowerCase().includes(historySearch.toLowerCase()));

  async function askCabinChief() {
    const question = chiefQuestion.trim();
    if (!question) { toast.message('Digite sua pergunta para o CabinChief.'); return; }
    setChiefLoading(true);
    setChiefAnswer('');
    try {
      const response = await fetch('/api/cabin-chief', {
        method: 'POST',
        headers: crewcheckAuthHeader({ 'content-type': 'application/json' }),
        body: JSON.stringify({ question, flight, report: reportText, log, aiTips, rosterSummary: (bundle?.roster as any)?.sourceFileName || '' }),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; answer?: string; message?: string; source?: string } | null;
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || 'CabinChief indisponível no momento.');
      setChiefAnswer(payload?.answer || 'Sem resposta gerada.');
    } catch (error) {
      setChiefAnswer(error instanceof Error ? error.message : 'Falha ao consultar o CabinChief.');
    } finally {
      setChiefLoading(false);
    }
  }

  return (
    <div className="crewcheck-chief-page min-h-screen px-5 pb-28 pt-7 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <button onClick={onBack} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-slate-100 active:scale-95"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.34em] text-cyan-100/65">CrewCheck Premium</p>
            <h1 className="truncate text-2xl font-black tracking-tight">Relatórios de Bordo</h1>
          </div>
          <button onClick={clearTimeline} className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-3 text-rose-100 active:scale-95"><Trash2 className="h-5 w-5" /></button>
        </div>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(34,211,238,.13),rgba(255,255,255,.055),rgba(124,58,237,.10))] shadow-2xl shadow-cyan-950/20">
          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-100/65">voo selecionado</p>
                <h2 className="mt-2 text-3xl font-black">{flight ? `${flight.flightNumber} · ${flight.route}` : 'Nenhum voo aberto'}</h2>
                <p className="mt-2 text-sm font-bold text-slate-300">{flight ? `${flight.dayOfWeek || ''} ${flight.date} · ${flight.departureTime}–${flight.arrivalTime}${flight.aircraft ? ` · A/C ${flight.aircraft}` : ''}` : 'Abra/importe uma escala para iniciar o relatório.'}</p><div className="mt-3 flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${flightPhase.tone}`}>{flightPhase.label}</span><span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-bold text-slate-200">{autoSelectFlight ? 'seleção automática pelo horário' : 'seleção manual'}</span></div><p className="mt-2 text-xs leading-5 text-slate-400">{flightPhase.helper}</p>
              </div>
              <select value={log.flightId || flight?.id || ''} onChange={(event) => { setAutoSelectFlight(false); updateLog({ flightId: event.target.value }); }} className="rounded-2xl border border-cyan-200/20 bg-[#061426] px-4 py-3 text-sm font-black text-cyan-50 outline-none">
                {flights.length ? flights.slice(0, 60).map((item) => <option key={item.id} value={item.id}>{item.date} · {item.flightNumber} · {item.route}</option>) : <option value="">Sem voo</option>}
              </select>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <button onClick={fillFromFlight} className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-left transition active:scale-95">
                <Plane className="mb-3 h-7 w-7 text-cyan-100" />
                <b>Usar dados do voo</b>
                <p className="mt-1 text-xs leading-5 text-slate-300">Preenche apresentação, decolagem e pouso quando disponíveis.</p>
              </button>
              <button onClick={() => { setAutoSelectFlight(true); if (next?.id) updateLog({ flightId: next.id }); toast.success('Seleção automática pelo horário ativada.'); }} className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-left transition active:scale-95">
                <Clock className="mb-3 h-7 w-7 text-emerald-100" />
                <b>Voo atual</b>
                <p className="mt-1 text-xs leading-5 text-slate-300">Compara horário da escala e seleciona o voo em andamento ou a seguir.</p>
              </button>
              <button onClick={remindCheckin} className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-left transition active:scale-95">
                <ClipboardList className="mb-3 h-7 w-7 text-cyan-200" />
                <b>Lembrar check-in</b>
                <p className="mt-1 text-xs leading-5 text-slate-300">Reserva/extra/base: não esquecer o formulário.</p>
              </button>
              <button onClick={onOpenRoster} className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 text-left transition active:scale-95">
                <Plane className="mb-3 h-7 w-7 text-sky-200" />
                <b>Abrir escala</b>
                <p className="mt-1 text-xs leading-5 text-slate-300">Conferência rápida com a escala oficial.</p>
              </button>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-cyan-300/15 bg-cyan-300/[0.06] p-5 shadow-xl shadow-black/20">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/25 bg-cyan-300/10"><BrainCircuit className="h-5 w-5 text-cyan-100" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/70">CabinChief IA</p>
              <h3 className="mt-1 text-xl font-black">Pergunte sobre escala, RBAC 117, cabine e relatório</h3>
              <p className="mt-1 text-sm leading-6 text-slate-300">A resposta usa o voo selecionado, o relatório em andamento e o motor seguro do servidor. Procedimentos oficiais sempre prevalecem.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <textarea value={chiefQuestion} onChange={(event) => setChiefQuestion(event.target.value)} placeholder="Ex.: Tenho descanso suficiente? O que registrar se houver MAAS/WCH? Como orientar a equipe no atraso?" className="min-h-[6rem] rounded-3xl border border-cyan-200/20 bg-[#061426] px-4 py-3 text-sm font-bold text-cyan-50 outline-none placeholder:text-cyan-100/35" />
                <button type="button" onClick={askCabinChief} disabled={chiefLoading} className="crewcheck-premium-button crewcheck-premium-button-primary rounded-3xl px-5 py-4 text-sm font-black disabled:opacity-60">{chiefLoading ? 'Consultando...' : 'Perguntar'}</button>
              </div>
              {chiefAnswer ? <div className="mt-4 whitespace-pre-line rounded-3xl border border-cyan-200/15 bg-black/20 p-4 text-sm font-semibold leading-6 text-cyan-50">{chiefAnswer}</div> : null}
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-emerald-300/15 bg-emerald-300/[0.06] p-5 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-200/25 bg-emerald-300/10"><MapPin className="h-5 w-5 text-emerald-100" /></span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-100/70">alerta de pouso</p>
                <h3 className="mt-1 text-xl font-black">Lembrete por geolocalização</h3>
                <p className="mt-1 text-sm leading-6 text-slate-300">Se houver MAAS, WCH ou assistência preenchida, o CrewCheck avisa quando você estiver próximo ao aeroporto de destino.</p>
                {landingWatchStatus && <p className="mt-2 text-xs font-bold text-emerald-100/80">{landingWatchStatus}</p>}
              </div>
            </div>
            <button onClick={toggleLandingWatch} className={`crewcheck-premium-button ${landingWatchActive ? 'crewcheck-premium-button-ghost' : 'crewcheck-premium-button-primary'} rounded-2xl px-5 py-4 text-sm font-black`}>
              <Bell className="h-4 w-4" /> {landingWatchActive ? 'Pausar alerta' : 'Ativar alerta'}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
            {specialLandingAlerts(log.general).length ? specialLandingAlerts(log.general).map((item) => <span key={item} className="rounded-full border border-emerald-200/25 bg-emerald-300/10 px-3 py-1 text-emerald-50">{item}</span>) : <span className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-slate-300">Preencha assistências em Gerais</span>}
            {landingDistanceKm !== null && <span className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-slate-200">{landingDistanceKm.toFixed(1)} km do destino</span>}
          </div>
        </section>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['medical', 'Médico', FileText],
            ['otp', 'OTP', TimerReset],
            ['gerais', 'Gerais', Droplets],
            ['settings', 'Configurações', ClipboardList],
          ].map(([key, label, Icon]) => {
            const ActiveIcon = Icon as typeof FileText;
            const active = activeReportTab === key;
            return <button key={String(key)} onClick={() => setActiveReportTab(key as any)} className={`rounded-2xl border px-3 py-3 text-sm font-black transition active:scale-95 ${active ? 'border-cyan-200 bg-cyan-200 text-[#061426] shadow-lg shadow-cyan-950/20' : 'border-white/10 bg-[#07182b] text-cyan-50'}`}><ActiveIcon className="mx-auto mb-1 h-5 w-5" />{String(label)}</button>;
          })}
        </div>

        {activeReportTab === 'otp' && <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/60">relatório otp</p><h3 className="mt-1 text-2xl font-black">Horários operacionais</h3><p className="mt-1 text-xs text-slate-400">Campos manuais com apoio automático para apresentação, decolagem e pouso.</p></div><TimerReset className="h-8 w-8 text-cyan-200" /></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {TIMELINE_STEPS.map((step) => {
              const entry = log.timeline[step.key];
              const official = step.auto === 'report' ? flight?.dutyReport : step.auto === 'departure' ? flight?.departureTime : step.auto === 'arrival' ? flight?.arrivalTime : null;
              return <div key={step.key} className="rounded-3xl border border-white/10 bg-[#07182b] p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[0.62rem] font-black uppercase tracking-[0.18em] text-cyan-100/50">{step.group}</p><h4 className="mt-1 font-black">{step.label}</h4><p className="mt-1 text-xs leading-5 text-slate-400">{step.hint}</p></div><span className="rounded-2xl bg-cyan-300/10 px-3 py-1 text-lg font-black text-cyan-50 tabular-nums">{entry?.value || '—'}</span></div>
                <input type="time" value={entry?.value || ''} onChange={(event) => changeManualTime(step.key, step.label, event.target.value)} className="mt-3 w-full rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" />
                <div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => mark(step.key, step.label)} className="rounded-2xl bg-cyan-300 px-3 py-3 text-xs font-black text-[#061426] active:scale-95"><Clock className="mr-1 inline h-4 w-4" /> Agora</button><button onClick={() => markOfficial(step.key, step.label, official)} className="rounded-2xl border border-cyan-200/20 bg-cyan-200/10 px-3 py-3 text-xs font-black text-cyan-50 active:scale-95">Auto</button><button onClick={() => clearTimelineEntry(step.key)} className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-3 py-3 text-xs font-black text-rose-100 active:scale-95">Limpar</button></div>
              </div>;
            })}
          </div>
        </section>}

        {activeReportTab === 'gerais' && <div className="mt-5 space-y-5">
          <section className="rounded-[2rem] border border-sky-300/16 bg-sky-300/[0.07] p-5 shadow-xl shadow-sky-950/10"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-sky-100/65">gerais do voo</p><h3 className="mt-1 text-2xl font-black">Água, passageiros e assistências</h3></div><Droplets className="h-8 w-8 text-sky-200" /></div><PassengerBox passengers={log.passengers} setPassengers={(passengers) => updateLog({ passengers, checklist: { ...log.checklist, passengers: true } })} /><GeneralFlightBox general={log.general} setGeneral={(general) => updateLog({ general })} onNotify={notifyLandingSpecials} /><div className="mt-4 grid gap-3"><WaterInput title="Início do voo" prefix="start" water={log.water} tankConfig={log.tankConfig} setWater={(water) => updateLog({ water, checklist: { ...log.checklist, waterStart: true } })} /><WaterInput title="Fim do voo" prefix="end" water={log.water} tankConfig={log.tankConfig} setWater={(water) => updateLog({ water, checklist: { ...log.checklist, waterEnd: true } })} /></div><div className="mt-4 rounded-3xl border border-sky-300/20 bg-[#061426] p-4"><div className="flex items-center gap-2"><Waves className="h-5 w-5 text-sky-200" /><b>Métrica de consumo</b></div><p className="mt-2 text-sm leading-6 text-slate-300">{metrics.consumed !== null ? `Consumo estimado: ${metrics.consumed.toFixed(1)} pontos percentuais${metrics.pax ? ` · ${metrics.perPassenger?.toFixed(3)} por passageiro` : ''}.` : 'Informe água inicial e final para calcular consumo.'}{metrics.end === null && metrics.prediction !== null ? ` Previsão final: ~${metrics.prediction}%.` : ''}</p></div></section>
          <section className="rounded-[2rem] border border-amber-300/15 bg-amber-300/[0.07] p-5 shadow-xl shadow-black/20"><div className="flex items-center gap-3"><MessageSquarePlus className="h-7 w-7 text-amber-200" /><div><p className="text-xs font-black uppercase tracking-[0.22em] text-amber-100/65">ocorrências manuais</p><h3 className="text-2xl font-black">Anote durante o voo</h3></div></div><div className="mt-4 grid gap-3 md:grid-cols-[14rem_1fr_auto]"><select value={occurrenceDraft.type} onChange={(event) => setOccurrenceDraft({ ...occurrenceDraft, type: event.target.value })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none">{OCCURRENCE_TYPES.map((type) => <option key={type}>{type}</option>)}</select><input value={occurrenceDraft.text} onChange={(event) => setOccurrenceDraft({ ...occurrenceDraft, text: event.target.value })} className="crewcheck-chief-input rounded-2xl border border-white/10 px-3 py-3 text-sm text-white outline-none" placeholder="Ex.: falta de item, atraso, água, passageiro, cabine..." /><button onClick={addOccurrence} className="rounded-2xl bg-amber-300 px-4 py-3 text-sm font-black text-[#1f1300]">Adicionar</button></div><div className="mt-4 space-y-2">{log.occurrences.map((item) => <div key={item.id} className="rounded-2xl border border-white/10 bg-[#07182b] p-3 text-sm"><div className="flex items-start justify-between gap-3"><div><b>{item.time} · {item.type}</b><p className="mt-1 text-slate-300">{item.text}</p></div><button onClick={() => removeOccurrence(item.id)} className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-[11px] font-black text-rose-100">Apagar</button></div></div>)}{!log.occurrences.length && <p className="rounded-2xl border border-white/10 bg-[#07182b] p-3 text-sm text-slate-400">Nenhuma ocorrência manual ainda.</p>}</div></section>
        </div>}

        {activeReportTab === 'medical' && <MedicalOccurrencePanel medical={log.medical} updateMedical={updateMedical} flight={flight} onExport={exportMedicalPdf} onShare={shareMedicalPdf} />}

        {activeReportTab === 'settings' && <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/20"><ReportSettingsPanel tankConfig={log.tankConfig} setTankConfig={(tankConfig) => updateLog({ tankConfig })} /></section>}

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/60">exportação</p><h3 className="mt-1 text-2xl font-black">PDF e compartilhamento</h3></div><div className="flex flex-wrap gap-2"><button onClick={copyReport} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-50"><Copy className="mr-2 inline h-4 w-4" /> Copiar</button><button onClick={shareReport} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-50"><Share2 className="mr-2 inline h-4 w-4" /> Compartilhar</button><button onClick={() => shareReportChannel('email')} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-50">E-mail</button><button onClick={() => shareReportChannel('whatsapp')} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-50">WhatsApp</button><button onClick={exportPdf} className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-[#061426]"><Download className="mr-2 inline h-4 w-4" /> PDF</button></div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="block"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Serviço / cabine</span><textarea value={log.serviceNotes} onChange={(event) => updateLog({ serviceNotes: event.target.value })} rows={4} className="crewcheck-chief-input mt-2 w-full rounded-2xl border border-white/10 p-3 text-sm text-white outline-none focus:border-cyan-300" placeholder="Observação de serviço..." /></label><label className="block"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Comentários adicionais</span><textarea value={log.notes} onChange={(event) => updateLog({ notes: event.target.value })} rows={4} className="crewcheck-chief-input mt-2 w-full rounded-2xl border border-white/10 p-3 text-sm text-white outline-none focus:border-cyan-300" placeholder="Comentários adicionais do relatório..." /></label></div><pre className="crewcheck-chief-report mt-4 max-h-[22rem] overflow-auto whitespace-pre-wrap rounded-3xl border border-white/10 p-4 text-xs leading-6 text-white">{reportText}</pre>
        </section>

        <section className="mt-5 rounded-[2rem] border border-cyan-300/15 bg-cyan-300/[0.06] p-5"><div className="flex items-center gap-3"><Search className="h-6 w-6 text-cyan-200" /><div><p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/65">histórico local</p><h3 className="text-xl font-black">PDFs por data e voo</h3></div></div><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} className="crewcheck-chief-input mt-4 w-full rounded-2xl border border-white/10 px-3 py-3 text-sm text-white outline-none" placeholder="Pesquisar por data, voo, rota ou arquivo..." /><div className="mt-3 space-y-2">{filteredHistory.slice(0, 8).map((item) => <div key={item.id} className="rounded-2xl border border-white/10 bg-[#07182b] p-3 text-sm"><b>{item.flightNumber || 'Voo'} · {item.date}</b><p className="mt-1 text-slate-300">{item.route} · {item.filename}</p></div>)}{!filteredHistory.length && <p className="text-sm text-slate-400">Nenhum PDF registrado ainda neste aparelho.</p>}</div></section>
      </div>
    </div>
  );
}


function MedicalCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" onClick={() => onChange(!checked)} className={`rounded-xl border px-3 py-2 text-left text-[11px] font-black transition ${checked ? 'border-rose-200 bg-rose-200 text-[#3b0712]' : 'border-white/10 bg-[#07182b] text-slate-300'}`}>{checked ? '✓ ' : ''}{label}</button>;
}

function MedicalInput({ label, value, onChange, textarea = false }: { label: string; value: string; onChange: (value: string) => void; textarea?: boolean }) {
  return <label className="block"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</span>{textarea ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="crewcheck-chief-input mt-1 w-full rounded-2xl border border-white/10 p-3 text-sm text-white outline-none focus:border-rose-200" /> : <input value={value} onChange={(e) => onChange(e.target.value)} className="crewcheck-chief-input mt-1 w-full rounded-2xl border border-white/10 px-3 py-3 text-sm text-white outline-none focus:border-rose-200" />}</label>;
}

function MedicalOccurrencePanel({ medical, updateMedical, flight, onExport, onShare }: { medical: MedicalOccurrenceState; updateMedical: (key: string, value: string | boolean) => void; flight?: FlightOption; onExport: () => void; onShare: () => void }) {
  const m = { ...defaultMedicalOccurrence(), ...medical };
  const set = (key: string, value: string | boolean) => updateMedical(key, value);
  const autoFillFlight = () => {
    set('flight', flight?.flightNumber || '');
    set('originDestination', flight?.route || '');
    set('occurrenceDateTime', new Date().toLocaleString('pt-BR'));
    toast.success('Dados do voo preenchidos no checklist médico.');
  };
  return (
    <section id="crewcheck-medical-checklist" className="mt-5 rounded-[2rem] border border-rose-300/18 bg-rose-300/[0.07] p-5 shadow-xl shadow-rose-950/10 scroll-mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><FileText className="h-7 w-7 text-rose-100" /><div><p className="text-xs font-black uppercase tracking-[0.22em] text-rose-100/70">ocorrência médica</p><h3 className="text-2xl font-black">Checklist virtual</h3><p className="mt-1 text-xs leading-5 text-slate-300">Preencha a bordo e exporte em PDF no formato do formulário para anexar ao AQD, enviar ao comandante, equipe médica ou colegas.</p></div></div>
        <div className="flex flex-wrap gap-2"><button onClick={autoFillFlight} className="rounded-2xl border border-rose-200/25 bg-rose-200/10 px-4 py-3 text-sm font-black text-rose-50">Usar voo</button><button onClick={onShare} className="rounded-2xl border border-rose-200/25 bg-rose-200/10 px-4 py-3 text-sm font-black text-rose-50"><Share2 className="mr-2 inline h-4 w-4" /> Compartilhar</button><button onClick={onExport} className="rounded-2xl bg-rose-200 px-4 py-3 text-sm font-black text-[#3b0712]"><Download className="mr-2 inline h-4 w-4" /> PDF</button></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MedicalInput label="Nome" value={String(m.name || '')} onChange={(v) => set('name', v)} />
        <MedicalInput label="Telefone" value={String(m.phone || '')} onChange={(v) => set('phone', v)} />
        <MedicalInput label="Idade" value={String(m.age || '')} onChange={(v) => set('age', v)} />
        <MedicalInput label="Poltrona" value={String(m.seat || '')} onChange={(v) => set('seat', v)} />
        <MedicalInput label="Voo" value={String(m.flight || '')} onChange={(v) => set('flight', v)} />
        <MedicalInput label="Origem/Destino" value={String(m.originDestination || '')} onChange={(v) => set('originDestination', v)} />
        <MedicalInput label="Data/hora ocorrência" value={String(m.occurrenceDateTime || '')} onChange={(v) => set('occurrenceDateTime', v)} />
        <MedicalInput label="Endereço" value={String(m.address || '')} onChange={(v) => set('address', v)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-[#07182b] p-4"><b className="text-sm">Identificação rápida</b><div className="mt-3 grid grid-cols-2 gap-2"><MedicalCheckbox label="Sexo M" checked={Boolean(m.sexM)} onChange={(v) => set('sexM', v)} /><MedicalCheckbox label="Sexo F" checked={Boolean(m.sexF)} onChange={(v) => set('sexF', v)} /><MedicalCheckbox label="Clínica" checked={Boolean(m.typeClinical)} onChange={(v) => set('typeClinical', v)} /><MedicalCheckbox label="Trauma" checked={Boolean(m.typeTrauma)} onChange={(v) => set('typeTrauma', v)} /></div></div>
        <div className="rounded-3xl border border-white/10 bg-[#07182b] p-4"><b className="text-sm">SECOPA</b><div className="mt-3 grid grid-cols-2 gap-2"><MedicalCheckbox label="Local seguro" checked={Boolean(m.safeYes)} onChange={(v) => set('safeYes', v)} /><MedicalCheckbox label="Luvas" checked={Boolean(m.glovesYes)} onChange={(v) => set('glovesYes', v)} /><MedicalCheckbox label="Consciente" checked={Boolean(m.consciousYes)} onChange={(v) => set('consciousYes', v)} /><MedicalCheckbox label="Orientado" checked={Boolean(m.orientedYes)} onChange={(v) => set('orientedYes', v)} /><MedicalCheckbox label="Sinais circulação" checked={Boolean(m.circulationYes)} onChange={(v) => set('circulationYes', v)} /><MedicalCheckbox label="Pediu ajuda" checked={Boolean(m.askedHelpYes)} onChange={(v) => set('askedHelpYes', v)} /></div></div>
        <div className="rounded-3xl border border-white/10 bg-[#07182b] p-4"><b className="text-sm">Ajuda médica</b><div className="mt-3 grid grid-cols-2 gap-2"><MedicalCheckbox label="Precisa ajuda" checked={Boolean(m.needsHelpYes)} onChange={(v) => set('needsHelpYes', v)} /><MedicalCheckbox label="Aceita ajuda" checked={Boolean(m.acceptsHelpYes)} onChange={(v) => set('acceptsHelpYes', v)} /><MedicalCheckbox label="AQD anexado" checked={Boolean(m.aqdAttached)} onChange={(v) => set('aqdAttached', v)} /><MedicalCheckbox label="Enviado comandante" checked={Boolean(m.commanderSent)} onChange={(v) => set('commanderSent', v)} /></div></div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><MedicalInput label="Queixa principal" value={String(m.chiefComplaint || '')} onChange={(v) => set('chiefComplaint', v)} textarea /><MedicalInput label="O que foi feito" value={String(m.whatWasDone || '')} onChange={(v) => set('whatWasDone', v)} textarea /><MedicalInput label="Alergias" value={String(m.allergies || '')} onChange={(v) => set('allergies', v)} /><MedicalInput label="Medicação de uso rotineiro" value={String(m.medication || '')} onChange={(v) => set('medication', v)} /><MedicalInput label="Histórico de doenças" value={String(m.history || '')} onChange={(v) => set('history', v)} /><MedicalInput label="Última alimentação/líquidos" value={String(m.lastMeal || '')} onChange={(v) => set('lastMeal', v)} /></div>
    </section>
  );
}



function ReportSettingsPanel({ tankConfig, setTankConfig }: { tankConfig: TankConfigState; setTankConfig: (config: TankConfigState) => void }) {
  const [color, setColor] = useState(() => {
    try { return localStorage.getItem('crewcheck_chief_report_color') || '#07182b'; } catch { return '#07182b'; }
  });
  const [fields, setFields] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('crewcheck_chief_report_fields') || '{}') || {};
    } catch { return {}; }
  });
  const saveColor = (next: string) => {
    setColor(next);
    try { localStorage.setItem('crewcheck_chief_report_color', next); } catch {}
    toast.success('Cor do relatório salva.');
  };
  const toggleField = (key: string) => {
    const next = { ...fields, [key]: fields[key] === false };
    setFields(next);
    try { localStorage.setItem('crewcheck_chief_report_fields', JSON.stringify(next)); } catch {}
  };
  const fieldList = [
    ['otp', 'Relatório OTP'],
    ['water', 'Água / QTA'],
    ['assist', 'Assistências'],
    ['occurrences', 'Ocorrências'],
    ['comments', 'Comentários'],
  ];
  return (
    <div>
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/60">configurações</p><h3 className="mt-1 text-2xl font-black">Métricas dos relatórios</h3><p className="mt-1 text-sm leading-6 text-slate-300">Ajuste campos, cor e tanques sem poluir o relatório principal.</p></div><ClipboardList className="h-8 w-8 text-cyan-200" /></div>
      <div className="mt-5 rounded-3xl border border-white/10 bg-[#07182b] p-4">
        <b>Cor do PDF</b>
        <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr]">
          <input type="color" value={color} onChange={(event) => saveColor(event.target.value)} className="h-12 w-full rounded-2xl border border-white/10 bg-[#061426] p-1" />
          <input value={color} onChange={(event) => saveColor(event.target.value)} className="crewcheck-chief-input rounded-2xl border border-white/10 px-3 py-3 text-sm text-white outline-none" placeholder="#07182b" />
        </div>
      </div>
      <div className="mt-4 rounded-3xl border border-white/10 bg-[#07182b] p-4">
        <b>Campos do relatório</b>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {fieldList.map(([key, label]) => <button key={key} onClick={() => toggleField(key)} className={`rounded-2xl border px-3 py-3 text-left text-sm font-black ${fields[key] === false ? 'border-white/10 bg-[#061426] text-slate-400' : 'border-cyan-300/25 bg-cyan-300/10 text-cyan-50'}`}>{fields[key] === false ? 'Oculto · ' : 'Ativo · '}{label}</button>)}
        </div>
      </div>
      <TankConfigBox tankConfig={tankConfig} setTankConfig={setTankConfig} />
    </div>
  );
}

function TankConfigBox({ tankConfig, setTankConfig }: { tankConfig: TankConfigState; setTankConfig: (config: TankConfigState) => void }) {
  const isAdmin = localStorage.getItem('crewcheck_admin_mode') === '1' || localStorage.getItem('crewcheck_role') === 'admin';
  const update = (patch: Partial<TankConfigState>) => setTankConfig({ ...tankConfig, ...patch });
  return (
    <div className="mt-4 rounded-3xl border border-white/10 bg-[#07182b] p-4">
      <div className="flex items-center gap-2"><Droplets className="h-5 w-5 text-sky-200" /><b>Configuração de tanques</b><span className="rounded-full bg-sky-300/10 px-2 py-1 text-[10px] font-black text-sky-100">premium</span></div>
      <p className="mt-2 text-xs leading-5 text-slate-400">Padrão: 1 QTA em porcentagem. QTU começa desabilitado, mas pode ser ativado em configurações.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input value={tankConfig.waterTankCount} onChange={(e) => update({ waterTankCount: e.target.value.replace(/\D/g, '').slice(0, 2) || '1' })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="Qtd. QTA" inputMode="numeric" />
        <select value={tankConfig.readingMode} onChange={(e) => update({ readingMode: e.target.value as 'percent' | 'fraction' })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none"><option value="percent">Leitura em porcentagem</option><option value="fraction">Leitura em fração</option></select>
        <input value={tankConfig.waterLabel} onChange={(e) => update({ waterLabel: e.target.value })} className="crewcheck-chief-input rounded-2xl border border-white/10 px-3 py-3 text-sm text-white outline-none" placeholder="Nome do QTA" />
        <input value={tankConfig.waterTankNames} onChange={(e) => update({ waterTankNames: e.target.value })} className="crewcheck-chief-input rounded-2xl border border-white/10 px-3 py-3 text-sm text-white outline-none" placeholder="Nome(s) do(s) tanque(s) de água" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => update({ enableWasteTracking: !tankConfig.enableWasteTracking })} className={`rounded-2xl border px-3 py-2 text-xs font-black ${tankConfig.enableWasteTracking ? 'border-sky-200 bg-sky-200 text-[#061426]' : 'border-white/10 bg-[#061426] text-sky-50'}`}>{tankConfig.enableWasteTracking ? 'QTU habilitado' : 'Habilitar QTU'}</button>
        {tankConfig.enableWasteTracking && <button onClick={() => update({ enableWasteTankCount: !tankConfig.enableWasteTankCount })} className={`rounded-2xl border px-3 py-2 text-xs font-black ${tankConfig.enableWasteTankCount ? 'border-sky-200 bg-sky-200 text-[#061426]' : 'border-white/10 bg-[#061426] text-sky-50'}`}>{tankConfig.enableWasteTankCount ? 'Qtd. QTU ativa' : 'Ativar qtd. QTU'}</button>}
      </div>
      {tankConfig.enableWasteTracking && <div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={tankConfig.wasteLabel} onChange={(e) => update({ wasteLabel: e.target.value })} className="crewcheck-chief-input rounded-2xl border border-white/10 px-3 py-3 text-sm text-white outline-none" placeholder="Nome do QTU" /> <input value={tankConfig.wasteTankNames} onChange={(e) => update({ wasteTankNames: e.target.value })} className="crewcheck-chief-input rounded-2xl border border-white/10 px-3 py-3 text-sm text-white outline-none" placeholder="Nome(s) do(s) tanque(s) de rejeitos" />{tankConfig.enableWasteTankCount && <input value={tankConfig.wasteTankCount} onChange={(e) => update({ wasteTankCount: e.target.value.replace(/\D/g, '').slice(0, 2) || '1' })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none sm:col-span-2" placeholder="Qtd. QTU" inputMode="numeric" />}</div>}
      {isAdmin && <button onClick={() => update({ requirePassengerCount: !tankConfig.requirePassengerCount })} className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-100">Admin: {tankConfig.requirePassengerCount ? 'passageiros obrigatórios' : 'passageiros opcionais'}</button>}
    </div>
  );
}

function PassengerBox({ passengers, setPassengers }: { passengers: PassengerState; setPassengers: (passengers: PassengerState) => void }) {
  return (
    <div className="mt-4 rounded-3xl border border-white/10 bg-[#07182b] p-4">
      <div className="flex items-center gap-2"><Users className="h-5 w-5 text-cyan-200" /><b>Passageiros por voo</b><span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-black text-cyan-100">opcional</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
        <select value={passengers.approx || 'Não informado'} onChange={(e) => setPassengers({ ...passengers, approx: e.target.value === 'Não informado' ? '' : e.target.value })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none">
          {PASSENGER_PRESETS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <input value={passengers.exact} onChange={(e) => setPassengers({ ...passengers, exact: e.target.value.replace(/\D/g, '').slice(0, 3) })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="Nº exato" inputMode="numeric" />
        <button onClick={() => setPassengers({ approx: '', exact: '' })} className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-xs font-black text-rose-100">Limpar</button>
      </div>
    </div>
  );
}

function GeneralFlightBox({ general, setGeneral, onNotify }: { general: GeneralFlightState; setGeneral: (general: GeneralFlightState) => void; onNotify: () => void }) {
  const set = (patch: Partial<GeneralFlightState>) => setGeneral({ ...general, ...patch });
  return (
    <div className="mt-4 rounded-3xl border border-white/10 bg-[#07182b] p-4">
      <div className="flex items-center justify-between gap-2"><div><b>Assistências e desembarque</b><p className="mt-1 text-xs text-slate-400">Separado de OTP para deixar o formulário mais objetivo.</p></div><button onClick={onNotify} className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[11px] font-black text-amber-100">Testar lembrete</button></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input value={general.seatsAtLanding} onChange={(e) => set({ seatsAtLanding: e.target.value.replace(/\D/g, '').slice(0, 3) })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="Nº de cadeiras no desembarque" inputMode="numeric" />
        <input value={general.minors} onChange={(e) => set({ minors: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="Menores" inputMode="numeric" />
        <input value={general.maas} onChange={(e) => set({ maas: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="MAAS" inputMode="numeric" />
        <input value={general.wheelchairs} onChange={(e) => set({ wheelchairs: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="Cadeirantes" inputMode="numeric" />
        <input value={general.wheelchairType} onChange={(e) => set({ wheelchairType: e.target.value })} className="crewcheck-chief-input rounded-2xl border border-white/10 px-3 py-3 text-sm text-white outline-none" placeholder="Tipo de cadeira (manual, WCHR, etc.)" />
        <input value={general.wchr} onChange={(e) => set({ wchr: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="WCHR" inputMode="numeric" />
        <input value={general.wchs} onChange={(e) => set({ wchs: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="WCHS" inputMode="numeric" />
        <input value={general.wchc} onChange={(e) => set({ wchc: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="WCHC" inputMode="numeric" />
        <input value={general.blnd} onChange={(e) => set({ blnd: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="BLND" inputMode="numeric" />
        <input value={general.deaf} onChange={(e) => set({ deaf: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="DEAF" inputMode="numeric" />
        <input value={general.meda} onChange={(e) => set({ meda: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" placeholder="MEDA" inputMode="numeric" />
        <button onClick={() => set(defaultGeneralFlightState())} className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-xs font-black text-rose-100">Limpar gerais</button>
      </div>
      <textarea value={general.comments} onChange={(e) => set({ comments: e.target.value })} rows={3} className="crewcheck-chief-input mt-3 w-full rounded-2xl border border-white/10 p-3 text-sm text-white outline-none" placeholder="Comentários adicionais dos gerais do voo..." />
    </div>
  );
}

function WaterInput({ title, prefix, water, tankConfig, setWater }: { title: string; prefix: 'start' | 'end'; water: WaterState; tankConfig: TankConfigState; setWater: (water: WaterState) => void }) {
  const qtaKey = prefix === 'start' ? 'qtaStart' : 'qtaEnd';
  const qtuKey = prefix === 'start' ? 'qtuStart' : 'qtuEnd';
  const notesKey = prefix === 'start' ? 'startNotes' : 'endNotes';
  const update = (key: keyof WaterState, value: string) => setWater({ ...water, [key]: value });
  const levels = tankConfig.readingMode === 'fraction' ? WATER_FRACTIONS : WATER_LEVELS;
  return (
    <div className="rounded-3xl border border-white/10 bg-[#07182b] p-4">
      <div className="flex items-center justify-between gap-2"><h4 className="font-black">{title}</h4><button onClick={() => setWater({ ...water, [qtaKey]: '', [qtuKey]: '', [notesKey]: '' })} className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-[11px] font-black text-rose-100">Limpar</button></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-sky-300/20 bg-[#061426] p-3"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-100/65">{tankConfig.waterLabel}</p><select value={water[qtaKey]} onChange={(e) => update(qtaKey, e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#08111f] px-3 py-3 text-sm font-black text-white outline-none"><option value="">Selecionar</option>{levels.map((value) => <option key={value} value={value}>{value}</option>)}</select><div className="mt-2 flex flex-wrap gap-1.5">{levels.map((value) => <button key={value} onClick={() => update(qtaKey, value)} className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${water[qtaKey] === value ? 'border-sky-200 bg-sky-200 text-[#061426]' : 'border-sky-300/20 bg-sky-300/10 text-sky-50'}`}>{value}</button>)}</div></div>
        {tankConfig.enableWasteTracking ? <div className="rounded-2xl border border-sky-300/20 bg-[#061426] p-3"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-100/65">{tankConfig.wasteLabel}</p><select value={water[qtuKey]} onChange={(e) => update(qtuKey, e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#08111f] px-3 py-3 text-sm font-black text-white outline-none"><option value="">Selecionar</option>{levels.map((value) => <option key={value} value={value}>{value}</option>)}</select><div className="mt-2 flex flex-wrap gap-1.5">{levels.map((value) => <button key={value} onClick={() => update(qtuKey, value)} className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${water[qtuKey] === value ? 'border-sky-200 bg-sky-200 text-[#061426]' : 'border-sky-300/20 bg-sky-300/10 text-sky-50'}`}>{value}</button>)}</div></div> : <div className="rounded-2xl border border-dashed border-sky-300/18 bg-[#061426] p-3 text-sm text-slate-300">QTU desabilitado. Ative nas configurações se quiser registrar rejeitos.</div>}
      </div>
      <input value={water[notesKey]} onChange={(e) => update(notesKey, e.target.value)} className="mt-3 w-full rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm text-white outline-none focus:border-sky-300" placeholder="Observação rápida" />
    </div>
  );
}
