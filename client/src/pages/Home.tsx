import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Car,
  ChevronDown,
  ChevronRight,
  Clock,
  CloudSun,
  DollarSign,
  FileText,
  Home as HomeIcon,
  Lock,
  LogOut,
  Map as MapIcon,
  Menu,
  Moon,
  Plane,
  Radar,
  Settings,
  ShieldCheck,
  Sun,
  Upload,
  UserRound,
  Wifi,
  X,
  Database,
  Mail,
  Share2,
  Copy,
  Send,
  Save,
  RotateCcw,
  Building2,
  Phone,
  Globe2,
  GraduationCap,
  ToggleRight,
  PlayCircle,
  Dumbbell,
  Hotel,
} from 'lucide-react';
import { analyzeCompliance, analyzeDayLoads, getGymRecommendations, type ComplianceResult } from '@/lib/complianceEngine';
import { parsePDF, type CrewRoster, type FlightLeg, type RosterDay } from '@/lib/pdfParser';
import { getStoredUser, logout } from '@/lib/authClient';
import { exportReport } from '@/lib/pdfExport';
import { generateICalendar, downloadCalendarFile } from '@/lib/calendarExport';
import { shareToWhatsApp, shareToTelegram, copyToClipboard } from '@/lib/sharing';
import { buildRoutineSuggestions, defaultRoutineActivities } from '@/lib/routinePlanner';
import { sendRosterByEmail } from '@/lib/emailClient';
import { connectGoogleCalendar, syncRosterToGoogleCalendar, loadGoogleCalendarSettings, googleCalendarIntegrationDiagnostics } from '@/lib/googleCalendarSync';
import { saveRosterAnalysis, listSavedRosters, openSavedRoster, openActiveRoster, getDatabaseStatus } from '@/lib/databaseClient';
import { airportCity } from '@/lib/airports';
import { buildCanonicalRosterEvents, normalizeRosterDays, selectNextRosterEvent, rosterCounters, type CanonicalRosterEvent } from '@/lib/canonicalRoster';

type ZeroView =
  | 'cockpit' | 'roster' | 'alerts' | 'departure' | 'settings' | 'maintenance' | 'import' | 'features'
  | 'radar' | 'weather' | 'perdiem' | 'salary' | 'reports' | 'calendar' | 'exports' | 'routine' | 'database' | 'crew' | 'load' | 'wakeup' | 'hotels' | 'presentation' | 'map' | 'mycar' | 'iflight';

type ZeroLeg = {
  id: string;
  day: RosterDay;
  leg?: FlightLeg;
  kind: 'flight' | 'stay' | 'duty';
  title: string;
  subtitle: string;
  date: Date;
  origin: string;
  destination: string;
  flightNumber: string;
  presentation: string;
  departure: string;
  arrival: string;
  aircraft?: string;
  registration?: string;
  gate?: string;
  terminal?: string;
  status?: string;
  hotel?: string;
  crew?: string[];
  routine?: string[];
  timeRange: string;
  placeholder?: boolean;
  canonical?: CanonicalRosterEvent;
  presentationSource?: string;
};

type BundleState = { roster: CrewRoster; compliance: ComplianceResult | null; source: string };
type QuickActions = {
  upload: () => void;
  pdf: () => void;
  ics: () => void;
  whatsapp: () => void;
  telegram: () => void;
  copy: () => void;
  email: () => void;
  google: () => void;
  save: () => void;
  openActive: () => void;
  logout: () => void;
  replayIntro: () => void;
};

const DEFAULT_VERSION = '13.5.2';
const CREWCHECK_UI_CORE_NOTE = 'v13.5.2: importacao PDF resiliente com fallback seguro no servidor';
const ADMIN_EMAILS = ['bmedeiros1987@gmail.com', 'bruno@crewcheck.local'];

const storage = {
  get(key: string, fallback = '') {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch {}
  },
};

function pad2(n: number) { return String(n).padStart(2, '0'); }
function safe(value: unknown, fallback = '—') { const text = String(value ?? '').trim(); return text || fallback; }
function city(code?: string) { return airportCity(code); }
function addMinutesToTime(value: string, minutes: number) {
  const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return '—';
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]) + minutes, 0, 0);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function time(value?: string | null, fallback = '—') {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2})[:hH](\d{2})/);
  return match ? `${pad2(Number(match[1]))}:${match[2]}` : fallback;
}
function parseDate(day?: RosterDay): Date {
  const rawAny = String((day as any)?.date || (day as any)?.data || '').trim();
  const monthNames: Record<string, number> = { JAN:1, FEV:2, FEB:2, MAR:3, ABR:4, APR:4, MAI:5, MAY:5, JUN:6, JUL:7, AGO:8, AUG:8, SET:9, SEP:9, OUT:10, OCT:10, NOV:11, DEZ:12, DEC:12 };
  let m = rawAny.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  m = rawAny.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?/);
  if (m) {
    const inferredYear = Number((day as any)?.year || (m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date().getFullYear()));
    return new Date(inferredYear, Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  }
  m = rawAny.toUpperCase().match(/^(\d{1,2})\s*([A-ZÇ]{3})\s*(\d{2,4})?/);
  if (m && monthNames[m[2]]) {
    const inferredYear = Number((day as any)?.year || (m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date().getFullYear()));
    return new Date(inferredYear, monthNames[m[2]] - 1, Number(m[1]), 12, 0, 0);
  }
  const dayNumber = Number((day as any)?.dayNumber || (day as any)?.day || String(rawAny).slice(0,2) || 0);
  const month = Number((day as any)?.month || (day as any)?.mes || 0);
  const year = Number((day as any)?.year || (day as any)?.ano || new Date().getFullYear());
  if (dayNumber > 0 && month > 0) return new Date(year, month - 1, dayNumber, 12, 0, 0);
  return new Date(year, Math.max(0, month - 1), 1, 12, 0, 0);
}
function dateChip(date: Date) { return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`; }
function weekday(date: Date) { return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', '').toUpperCase(); }
function monthLong(roster: CrewRoster) {
  try {
    const firstDate = Array.isArray(roster.days) && roster.days.length
      ? parseDate([...roster.days].sort((a, b) => parseDate(a).getTime() - parseDate(b).getTime())[0])
      : null;
    const month = firstDate && !Number.isNaN(firstDate.getTime()) ? firstDate.getMonth() + 1 : (roster.month || 7);
    const year = firstDate && !Number.isNaN(firstDate.getTime()) ? firstDate.getFullYear() : (roster.year || 2026);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
  } catch {
    return 'Julho 2026';
  }
}
function dayTitle(day: RosterDay) {
  const d = parseDate(day);
  return `${weekday(d)} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

type PresentationLearningRule = {
  key: string;
  label: string;
  presentation: string;
  samples: number;
  confidence: number;
  lastUsedAt: string;
  updatedAt: string;
  source: 'manual' | 'aprendido';
};
const PRESENTATION_RULES_KEY = 'crewcheck_presentation_rules_v1341';
const PRESENTATION_OVERRIDES_KEY = 'crewcheck_presentation_overrides_v1341';

function parseTimeStrict(value?: string | null): string | null {
  const match = String(value || '').trim().match(/^(\d{1,2})[:hH](\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}
function readJsonRecord<T>(key: string): Record<string, T> {
  try {
    const parsed = JSON.parse(storage.get(key, '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
function writeJsonRecord<T>(key: string, value: Record<string, T>) {
  storage.set(key, JSON.stringify(value));
}
function presentationLearningKey(event: Pick<ZeroLeg, 'hotel' | 'origin' | 'destination' | 'day'>): string {
  const hotel = String(event.hotel || (event.day as any)?.hotel || '').trim();
  if (hotel) return `hotel:${hotel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`;
  const base = String((event.day as any)?.base || event.origin || event.destination || '').trim().toUpperCase();
  const cityName = city(base);
  return `local:${base || cityName}`.toLowerCase();
}
function presentationLearningLabel(event: Pick<ZeroLeg, 'hotel' | 'origin' | 'destination' | 'day'>): string {
  const hotel = String(event.hotel || (event.day as any)?.hotel || '').trim();
  if (hotel) return hotel;
  const base = String((event.day as any)?.base || event.origin || event.destination || '').trim().toUpperCase();
  return `${base || 'Local'} · ${city(base)}`;
}
function presentationOverrideKey(event: ZeroLeg): string {
  const d = event.canonical ? new Date(event.canonical.startDateTime) : event.date;
  return [dateChip(d), event.flightNumber, event.origin, event.destination, event.departure].join('|');
}
function loadPresentationRules() {
  return readJsonRecord<PresentationLearningRule>(PRESENTATION_RULES_KEY);
}
function loadPresentationOverrides() {
  return readJsonRecord<{ presentation: string; updatedAt: string; label: string }>(PRESENTATION_OVERRIDES_KEY);
}
function managedPresentationForEvent(event: ZeroLeg): { presentation: string; source: string } {
  if (event.placeholder) return { presentation: event.presentation, source: 'Escala' };
  if (!event.presentation || event.presentation === '—' || event.presentation === 'Conexão/Solo') return { presentation: event.presentation, source: 'Escala' };
  const override = loadPresentationOverrides()[presentationOverrideKey(event)];
  if (override?.presentation) return { presentation: override.presentation, source: 'Manual desta programação' };
  const rule = loadPresentationRules()[presentationLearningKey(event)];
  if (rule?.presentation) return { presentation: rule.presentation, source: `Aprendido: ${rule.label}` };
  return { presentation: event.presentation, source: 'Escala publicada' };
}
function savePresentationOverride(event: ZeroLeg, presentation: string, saveAsLearning = false) {
  const clean = parseTimeStrict(presentation);
  if (!clean) throw new Error('Informe um horário válido no formato HH:MM.');
  const overrides = loadPresentationOverrides();
  overrides[presentationOverrideKey(event)] = { presentation: clean, updatedAt: new Date().toISOString(), label: rosterEventTitle(event) };
  writeJsonRecord(PRESENTATION_OVERRIDES_KEY, overrides);

  if (saveAsLearning) {
    const rules = loadPresentationRules();
    const key = presentationLearningKey(event);
    const previous = rules[key];
    const samples = (previous?.samples || 0) + 1;
    rules[key] = {
      key,
      label: presentationLearningLabel(event),
      presentation: clean,
      samples,
      confidence: Math.min(0.98, 0.55 + samples * 0.08),
      lastUsedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'manual',
    };
    writeJsonRecord(PRESENTATION_RULES_KEY, rules);
  }
}
function clearPresentationOverride(event: ZeroLeg) {
  const overrides = loadPresentationOverrides();
  delete overrides[presentationOverrideKey(event)];
  writeJsonRecord(PRESENTATION_OVERRIDES_KEY, overrides);
}
function clearPresentationLearning(event: ZeroLeg) {
  const rules = loadPresentationRules();
  delete rules[presentationLearningKey(event)];
  writeJsonRecord(PRESENTATION_RULES_KEY, rules);
}
function applyPresentationManagement(event: ZeroLeg): ZeroLeg {
  const managed = managedPresentationForEvent(event);
  if (!managed.presentation || managed.presentation === event.presentation) {
    return { ...event, presentationSource: managed.source };
  }
  const updatedRoutine = Array.isArray(event.routine)
    ? event.routine.map((item) => item.startsWith('Despertador ') ? `Despertador ${addMinutesToTime(managed.presentation, -90)}` : item)
    : event.routine;
  const updatedSubtitle = String(event.subtitle || '').replace(/Apres\. \d{2}:\d{2}/, `Apres. ${managed.presentation}`);
  return {
    ...event,
    presentation: managed.presentation,
    presentationSource: managed.source,
    subtitle: updatedSubtitle,
    routine: updatedRoutine,
  };
}
function promptPresentation(event: ZeroLeg, saveAsLearning = false) {
  const current = managedPresentationForEvent(event).presentation || event.presentation || '';
  const label = saveAsLearning ? 'Salvar como padrão deste hotel/local' : 'Alterar somente esta programação';
  const next = window.prompt(`${label}\nInforme o horário no formato HH:MM`, current === 'Conexão/Solo' ? event.departure : current);
  if (!next) return false;
  savePresentationOverride(event, next, saveAsLearning);
  return true;
}

function programDateLabel(event: ZeroLeg): string {
  const d = event.canonical ? new Date(event.canonical.startDateTime) : event.date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 'Data a confirmar';
  return `${weekday(d)} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;
}


type ImportGuardianDecision = {
  ok: boolean;
  summaryText: string;
  toastText: string;
  hasFuture: boolean;
  periodLabel: string;
};

function monthNameBR(month?: number | null): string {
  const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const index = Number(month || 0) - 1;
  return names[index] || 'Mês a confirmar';
}
function rosterPeriodFromDays(roster: CrewRoster): { month: number; year: number } {
  const days = Array.isArray(roster.days) ? roster.days : [];
  const counts = new Map<string, { month: number; year: number; score: number }>();
  for (const day of days) {
    const month = Number((day as any).month || roster.month || 0);
    const year = Number((day as any).year || roster.year || 0);
    if (!month || !year) continue;
    const key = `${month}|${year}`;
    const current = counts.get(key) || { month, year, score: 0 };
    current.score += Math.max(1, Array.isArray((day as any).legs) ? (day as any).legs.length : 1);
    counts.set(key, current);
  }
  const best = [...counts.values()].sort((a, b) => b.score - a.score)[0];
  return best || { month: Number(roster.month || new Date().getMonth() + 1), year: Number(roster.year || new Date().getFullYear()) };
}
function rosterPeriodLabel(roster: CrewRoster): string {
  const period = rosterPeriodFromDays(roster);
  return `${monthNameBR(period.month)}/${period.year}`;
}
function currentPeriodLabel(): string {
  const now = new Date();
  return `${monthNameBR(now.getMonth() + 1)}/${now.getFullYear()}`;
}
function isCurrentRosterPeriod(roster: CrewRoster): boolean {
  const period = rosterPeriodFromDays(roster);
  const now = new Date();
  return period.month === now.getMonth() + 1 && period.year === now.getFullYear();
}
function chronologicalNextRosterLeg(events: ZeroLeg[], now = new Date()): ZeroLeg | null {
  const real = events
    .filter((event) => !event.placeholder && isOperationalEvent(event))
    .sort((a, b) => eventStartDateTime(a).getTime() - eventStartDateTime(b).getTime());

  const active = real.find((event) => eventStartDateTime(event).getTime() <= now.getTime() && eventEndDateTime(event).getTime() >= now.getTime());
  if (active) return active;

  return real.find((event) => eventStartDateTime(event).getTime() > now.getTime()) || null;
}
function importGuardianSummary(roster: CrewRoster, sourceFileName: string): ImportGuardianDecision {
  const events = buildLegs(roster);
  const flights = events.filter((event) => event.kind === 'flight').length;
  const days = Array.isArray(roster.days) ? roster.days.length : 0;
  const activities = events.filter((event) => event.kind !== 'flight' && event.canonical?.kind !== 'rest').length;
  const rest = events.filter((event) => event.canonical?.kind === 'rest').length;
  const future = chronologicalNextRosterLeg(events);
  const periodLabel = rosterPeriodLabel(roster);
  const lines = [
    'CrewCheck detectou esta escala:',
    '',
    `Arquivo: ${sourceFileName}`,
    `Período: ${periodLabel}`,
    `Tripulante: ${safe(roster.crewName, 'Tripulante')}`,
    `Base: ${safe(roster.base, '—')}`,
    `Dias publicados: ${days}`,
    `Voos: ${flights}`,
    `Atividades: ${activities}`,
    `Folgas/descanso: ${rest}`,
    future ? `Próxima programação: ${rosterEventTitle(future)} · ${programDateLabel(future)} · ${safe(future.departure, '—')} → ${safe(future.arrival, '—')}` : 'Próxima programação: nenhuma programação futura detectada',
  ];

  if (!isCurrentRosterPeriod(roster)) {
    lines.push('', `Atenção: o período detectado é ${periodLabel}, mas o período atual é ${currentPeriodLabel()}.`);
  }
  if (!future) {
    lines.push('', 'Atenção: esta escala não possui evento operacional futuro após agora.');
  }
  lines.push('', 'Deseja ativar esta escala no CrewCheck?');

  return {
    ok: true,
    summaryText: lines.join('\n'),
    toastText: future ? `Escala ${periodLabel} importada.` : `Escala ${periodLabel} importada sem programação futura.`,
    hasFuture: Boolean(future),
    periodLabel,
  };
}
function confirmRosterImport(roster: CrewRoster, sourceFileName: string): ImportGuardianDecision {
  const decision = importGuardianSummary(roster, sourceFileName);
  const days = Array.isArray(roster.days) ? roster.days.length : 0;
  if (!days) {
    return {
      ...decision,
      ok: false,
      summaryText: 'O arquivo foi lido, mas nenhuma data de escala foi detectada. Verifique se é o PDF oficial da escala.',
      toastText: 'Nenhuma data de escala detectada.',
    };
  }

  const confirmed = window.confirm(decision.summaryText);
  return { ...decision, ok: confirmed };
}

function emptyRoster(): CrewRoster {
  return {
    crewName: getStoredUser()?.name || 'Tripulante',
    crewId: 'sem-escala',
    base: storage.get('crewcheck_virtual_base', 'BSB'),
    rank: 'Tripulante',
    airline: 'LATAM',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    rawText: '',
    days: [] as any,
  } as CrewRoster;
}

function placeholderLeg(): ZeroLeg {
  const now = new Date();
  return {
    id: 'placeholder-import',
    day: { date: `${pad2(now.getDate())}/${pad2(now.getMonth()+1)}/${now.getFullYear()}`, dayNumber: now.getDate(), month: now.getMonth()+1, year: now.getFullYear(), type: 'IMPORTAR', legs: [] } as any,
    kind: 'duty',
    title: 'Importe sua escala real',
    subtitle: 'Nenhum dado fictício será exibido. Envie o PDF oficial para ativar Cockpit, escala completa, diárias, salário, rotina e alertas.',
    date: now,
    origin: safe(storage.get('crewcheck_virtual_base', 'BSB'), 'BSB'),
    destination: safe(storage.get('crewcheck_virtual_base', 'BSB'), 'BSB'),
    flightNumber: 'IMPORTAR',
    presentation: '—',
    departure: '—',
    arrival: '—',
    timeRange: 'Aguardando PDF',
    placeholder: true,
  };
}

function neutralCompliance(roster: CrewRoster): ComplianceResult {
  return {
    isCompliant: true,
    score: Array.isArray(roster.days) && roster.days.length ? 100 : 0,
    alerts: [],
    warnings: [],
    summary: Array.isArray(roster.days) && roster.days.length ? 'Nenhuma irregularidade confirmada.' : 'Carregue uma escala real para análise regulatória.',
  } as any;
}

function analyzeSafe(roster: CrewRoster): ComplianceResult {
  try {
    if (!Array.isArray(roster.days) || !roster.days.length) return neutralCompliance(roster);
    return analyzeCompliance(roster);
  } catch { return neutralCompliance(roster); }
}
function loadRoster(): BundleState {
  const candidates = [
    () => sessionStorage.getItem('crewcheck_roster'),
    () => localStorage.getItem('crewcheck_latest_roster_bundle'),
    () => localStorage.getItem('crewcheck_roster_sync_latest_v108134'),
    () => localStorage.getItem('crewcheck_last_roster'),
  ];
  for (const read of candidates) {
    try {
      const raw = read();
      if (!raw) continue;
      const payload = JSON.parse(raw);
      const roster = payload?.roster ? payload.roster as CrewRoster : payload as CrewRoster;
      if (Array.isArray(roster.days) && roster.days.length) {
        const compliance = payload?.compliance || analyzeSafe(roster);
        const source = payload?.sourceFileName || payload?.source || sessionStorage.getItem('crewcheck_source_file') || 'Escala ativa';
        return { roster, compliance, source };
      }
    } catch {}
  }
  const roster = emptyRoster();
  return { roster, compliance: neutralCompliance(roster), source: 'Nenhuma escala carregada' };
}
function saveRoster(roster: CrewRoster, source: string): ComplianceResult {
  const compliance = analyzeSafe(roster);
  try {
    sessionStorage.setItem('crewcheck_roster', JSON.stringify(roster));
    sessionStorage.setItem('crewcheck_compliance', JSON.stringify(compliance));
    sessionStorage.setItem('crewcheck_source_file', source);
    localStorage.setItem('crewcheck_latest_roster_bundle', JSON.stringify({ roster, compliance, sourceFileName: source, updatedAt: new Date().toISOString(), source: 'crewcheck-v1278-ui-safe-functional-core' }));
    localStorage.setItem('crewcheck_last_roster', JSON.stringify(roster));
    window.dispatchEvent(new CustomEvent('crewcheck:roster-updated', { detail: { roster, compliance, source } }));
  } catch {}
  return compliance;
}
function currentCompliance(bundle: BundleState) { return bundle.compliance || analyzeSafe(bundle.roster); }
function currentGym(bundle: BundleState) { try { return getGymRecommendations(bundle.roster); } catch { return []; } }

function buildLegs(roster: CrewRoster): ZeroLeg[] {
  const normalized = normalizeRosterDays(roster);
  const canonicalEvents = buildCanonicalRosterEvents(normalized);

  const legs = canonicalEvents.map((event): ZeroLeg => {
    const day = event.publishedDay;
    const leg = event.leg;
    const d = event.startDateTime ? new Date(event.startDateTime) : parseDate(day);

    if (event.kind === 'flight' && leg) {
      const anyLeg = leg as any;
      const suffix = event.isNextDay ? ' +1' : '';
      const workType = safe(anyLeg.workType || (leg as any).workType, 'OP');
      const title = `${event.flightNumber} ${workType}`;
      const subtitle = event.showPresentation
        ? `Apres. ${event.presentation} · ${event.departure} → ${event.arrival}${suffix} · ${city(event.origin)} → ${city(event.destination)}`
        : `Conexão/Solo ${event.groundBeforeMinutes ?? '—'} min · ${event.departure} → ${event.arrival}${suffix} · ${city(event.origin)} → ${city(event.destination)}`;

      return {
        id: event.id,
        day,
        leg,
        kind: 'flight',
        date: d,
        title,
        subtitle,
        origin: event.origin,
        destination: event.destination,
        flightNumber: event.flightNumber,
        presentation: event.showPresentation ? event.presentation : 'Conexão/Solo',
        departure: event.departure,
        arrival: event.arrival,
        aircraft: safe(anyLeg.aircraft || anyLeg.aircraftType || anyLeg.equipment, 'A confirmar'),
        registration: safe(anyLeg.registration || anyLeg.tailNumber || anyLeg.matricula, 'A confirmar'),
        gate: safe(anyLeg.gate || (day as any).gate, 'A confirmar'),
        terminal: safe(anyLeg.terminal || (day as any).terminal, 'A confirmar'),
        status: safe(anyLeg.status || (day as any).status, 'Programado'),
        hotel: safe((day as any).hotel || anyLeg.hotel, ''),
        crew: Array.isArray(anyLeg.crew) ? anyLeg.crew.map((c:any) => safe(c.name || c.employeeName || c.role || c, '')).filter(Boolean) : [],
        routine: [
          event.showPresentation ? `Despertador ${addMinutesToTime(event.presentation, -90)}` : '',
          anyLeg.hotel || (day as any).hotel ? `Hotel ${safe(anyLeg.hotel || (day as any).hotel)}` : '',
          `Descanso após chegada ${event.arrival}`,
          `Academia/restaurante/mercado/farmácia/lavanderia em ${city(event.destination)}`,
        ].filter(Boolean),
        timeRange: `${event.departure} → ${event.arrival}${suffix}`,
        canonical: event,
      };
    }

    const base = safe((day as any).base || (day as any).airport || (day as any).hotel || event.origin, roster.base || '—');
    const kind = event.kind === 'stay' ? 'stay' : 'duty';
    return {
      id: event.id,
      day,
      kind,
      date: d,
      title: kind === 'stay' ? `Estadia diurna · ${base}` : safe((day as any).pairingCode || (day as any).type || event.flightNumber, 'Programação'),
      subtitle: kind === 'stay' ? `Hotel/pernoite em ${safe((day as any).hotel || city(base), city(base))}` : safe((day as any).description || (day as any).rawText, 'Programação operacional'),
      origin: base,
      destination: base,
      flightNumber: event.flightNumber,
      presentation: event.presentation,
      departure: event.departure,
      arrival: event.arrival,
      hotel: safe((day as any).hotel, ''),
      timeRange: `${event.departure} → ${event.arrival}`,
      canonical: event,
    };
  });

  return legs.map(applyPresentationManagement).sort((a, b) => (a.canonical ? new Date(a.canonical.startDateTime).getTime() : a.date.getTime()) - (b.canonical ? new Date(b.canonical.startDateTime).getTime() : b.date.getTime()));
}

function eventStartDateTime(event: ZeroLeg): Date {
  return event.canonical ? new Date(event.canonical.startDateTime) : new Date(event.date);
}
function eventEndDateTime(event: ZeroLeg): Date {
  return event.canonical ? new Date(event.canonical.endDateTime) : eventStartDateTime(event);
}
function isOperationalEvent(event: ZeroLeg) {
  if (event.placeholder) return false;
  if (event.canonical?.kind === 'rest') return false;
  const code = `${event.flightNumber} ${(event.day as any)?.type || ''} ${(event.day as any)?.pairingCode || ''}`.toUpperCase();
  if (/(^|\s)(DO|DOF|DOP|OFF|FOLGA|FÉRIAS|FERIAS|EAD)(\s|$)/.test(code)) return false;
  if (code.includes('SOBREAVISO') && !/(VOO|RESERVA|ACION|CHAMAD|LA\d+)/.test(code)) return false;
  return ['flight', 'duty', 'stay'].includes(event.kind);
}
function eventIsNow(event: ZeroLeg, now = new Date()) {
  const start = eventStartDateTime(event).getTime();
  const end = eventEndDateTime(event).getTime();
  return now.getTime() >= start && now.getTime() <= end;
}
function noFutureLeg(events: ZeroLeg[]): ZeroLeg {
  const base = events.find((e) => !e.placeholder) || placeholderLeg();
  const today = new Date();
  return {
    ...base,
    id: 'no-future-canonical-event',
    placeholder: true,
    kind: 'duty',
    date: today,
    title: 'Nenhuma programação futura',
    subtitle: 'A escala carregada não possui evento operacional futuro após agora. Se houver divergência, confira o período importado ou reimporte o PDF oficial.',
    origin: safe((base as any).origin, '—'),
    destination: safe((base as any).destination, '—'),
    flightNumber: '—',
    presentation: '—',
    departure: '—',
    arrival: '—',
    timeRange: '—',
    canonical: undefined,
  };
}
function nextFlight(events: ZeroLeg[]) {
  const canonicalEvents = events
    .filter((event) => !event.placeholder && isOperationalEvent(event))
    .map((event) => event.canonical)
    .filter(Boolean) as CanonicalRosterEvent[];

  const selected = selectNextRosterEvent(canonicalEvents);
  if (selected) {
    const found = events.find((event) => event.canonical?.id === selected.id);
    if (found) return found;
  }

  const chronological = chronologicalNextRosterLeg(events);
  if (chronological) return chronological;

  return noFutureLeg(events);
}
function nextRealFlight(events: ZeroLeg[]) {
  const canonicalFlights = events
    .filter((event) => event.kind === 'flight' && !event.placeholder)
    .map((event) => event.canonical)
    .filter(Boolean) as CanonicalRosterEvent[];

  const selected = selectNextRosterEvent(canonicalFlights);
  if (selected) {
    const found = events.find((event) => event.canonical?.id === selected.id);
    if (found) return found;
  }

  return nextFlight(events);
}
function currentDayAnchor(events: ZeroLeg[]) {
  return nextFlight(events);
}


type AirportMapPoint = { code: string; lat: number; lon: number; label?: string };
const AIRPORT_MAP_POINTS: Record<string, AirportMapPoint> = {
  BSB:{code:'BSB',lat:-15.8711,lon:-47.9186}, GRU:{code:'GRU',lat:-23.4356,lon:-46.4731}, CGH:{code:'CGH',lat:-23.6261,lon:-46.6564}, VCP:{code:'VCP',lat:-23.0074,lon:-47.1345},
  SDU:{code:'SDU',lat:-22.9105,lon:-43.1631}, GIG:{code:'GIG',lat:-22.8099,lon:-43.2506}, CNF:{code:'CNF',lat:-19.6244,lon:-43.9719}, CWB:{code:'CWB',lat:-25.5317,lon:-49.1761},
  POA:{code:'POA',lat:-29.9944,lon:-51.1714}, FLN:{code:'FLN',lat:-27.6705,lon:-48.5525}, SSA:{code:'SSA',lat:-12.9086,lon:-38.3225}, REC:{code:'REC',lat:-8.1265,lon:-34.9236},
  FOR:{code:'FOR',lat:-3.7763,lon:-38.5326}, BEL:{code:'BEL',lat:-1.3793,lon:-48.4763}, MAO:{code:'MAO',lat:-3.0386,lon:-60.0497}, MAB:{code:'MAB',lat:-5.3686,lon:-49.1380},
  SLZ:{code:'SLZ',lat:-2.5854,lon:-44.2341}, NAT:{code:'NAT',lat:-5.7681,lon:-35.3761}, MCZ:{code:'MCZ',lat:-9.5108,lon:-35.7917}, AJU:{code:'AJU',lat:-10.9840,lon:-37.0703},
  PMW:{code:'PMW',lat:-10.2915,lon:-48.3569}, THE:{code:'THE',lat:-5.0599,lon:-42.8235}, VIX:{code:'VIX',lat:-20.2581,lon:-40.2864}, GYN:{code:'GYN',lat:-16.6320,lon:-49.2207},
  CGB:{code:'CGB',lat:-15.6529,lon:-56.1167}, CGR:{code:'CGR',lat:-20.4687,lon:-54.6725}, BVB:{code:'BVB',lat:2.8463,lon:-60.6901}, MCP:{code:'MCP',lat:0.0507,lon:-51.0722},
  RBR:{code:'RBR',lat:-9.8689,lon:-67.8981}, PVH:{code:'PVH',lat:-8.7093,lon:-63.9023}, IOS:{code:'IOS',lat:-14.8159,lon:-39.0332}, JPA:{code:'JPA',lat:-7.1458,lon:-34.9486},
};
function airportPoint(code?: string | null): AirportMapPoint | null {
  const key = String(code || '').trim().toUpperCase();
  return AIRPORT_MAP_POINTS[key] || null;
}
function projectSouthAmerica(point: AirportMapPoint): { x: number; y: number } {
  const minLon = -82, maxLon = -30, minLat = -35, maxLat = 14;
  const x = ((point.lon - minLon) / (maxLon - minLon)) * 100;
  const y = ((maxLat - point.lat) / (maxLat - minLat)) * 100;
  return { x: Math.max(3, Math.min(97, x)), y: Math.max(3, Math.min(97, y)) };
}
function routeDistanceKm(a: AirportMapPoint, b: AirportMapPoint): number {
  const rad = (value: number) => value * Math.PI / 180;
  const r = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s1 + s2));
}
function monthlyRouteData(events: ZeroLeg[]) {
  const segments = events
    .filter((event) => event.kind === 'flight' && !event.placeholder)
    .map((event) => ({ event, from: airportPoint(event.origin), to: airportPoint(event.destination) }))
    .filter((item): item is { event: ZeroLeg; from: AirportMapPoint; to: AirportMapPoint } => Boolean(item.from && item.to));
  const destinations = new Map<string, AirportMapPoint & { count: number }>();
  segments.forEach(({ from, to }) => {
    [from, to].forEach((point) => {
      const current = destinations.get(point.code) || { ...point, count: 0 };
      current.count += 1;
      destinations.set(point.code, current);
    });
  });
  const totalKm = Math.round(segments.reduce((sum, segment) => sum + routeDistanceKm(segment.from, segment.to), 0));
  return { segments, destinations: [...destinations.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)), totalKm };
}
function openMapRoute(event: ZeroLeg) {
  const airport = encodeURIComponent(`${safe(event.origin, 'BSB')} aeroporto`);
  const origin = encodeURIComponent(event.hotel || 'Localização atual');
  window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${airport}&travelmode=driving`, '_blank', 'noopener,noreferrer');
}
function openRoadNetwork(event: ZeroLeg) {
  const point = airportPoint(event.origin) || airportPoint(event.destination) || AIRPORT_MAP_POINTS.BSB;
  const query = `[out:json][timeout:25];(way["highway"](around:4500,${point.lat},${point.lon});node["amenity"~"parking|fuel|taxi"](around:4500,${point.lat},${point.lon}););out geom;`;
  window.open(`https://overpass-turbo.eu/?Q=${encodeURIComponent(query)}&R`, '_blank', 'noopener,noreferrer');
}
function RouteVisual({ event, compact = false }: { event: ZeroLeg; compact?: boolean }) {
  const destination = `${safe(event.origin, 'Aeroporto')} · ${city(event.origin)}`;
  const origin = event.hotel ? `Hotel · ${event.hotel}` : 'Localização atual / hotel';
  return <div className={`cz-route-visual ${compact ? 'compact' : ''}`}>
    <svg viewBox="0 0 360 170" role="img" aria-label="Representação visual do trajeto hotel aeroporto">
      <defs>
        <linearGradient id="czRouteGradient" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#a855f7"/><stop offset="52%" stopColor="#6366f1"/><stop offset="100%" stopColor="#22d3ee"/></linearGradient>
        <filter id="czRouteGlow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M62 112 C126 155, 234 155, 298 112" fill="none" stroke="url(#czRouteGradient)" strokeWidth="12" strokeLinecap="round" opacity=".95" filter="url(#czRouteGlow)"/>
      <circle cx="72" cy="78" r="30" fill="#a855f7" filter="url(#czRouteGlow)"/>
      <circle cx="288" cy="78" r="30" fill="#22d3ee" filter="url(#czRouteGlow)"/>
      <text x="72" y="130" textAnchor="middle">Origem</text>
      <text x="288" y="130" textAnchor="middle">Aeroporto</text>
    </svg>
    {!compact && <div className="cz-route-visual-copy"><strong>{origin}</strong><span>→</span><strong>{destination}</strong><small>Mapa apenas visual para rota. Tempo de trânsito fica separado quando o serviço estiver configurado.</small></div>}
  </div>;
}

function isAdmin() {
  const u = getStoredUser();
  const role = String((u as any)?.role || storage.get('crewcheck_role')).toLowerCase();
  const email = String(u?.email || '').toLowerCase();
  return role.includes('admin') || ADMIN_EMAILS.includes(email);
}

function Brand({ back, onMenu }: { back?: boolean; onMenu?: () => void }) {
  const click = onMenu || (back ? (() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' }))) : (() => window.dispatchEvent(new Event('crewcheck:open-menu'))));
  return <header className="cz-brand-row">
    <button className="cz-menu-btn" onClick={click} aria-label={back ? 'Voltar' : 'Menu'}>{back ? '←' : <Menu size={28}/>}</button>
    <div className="cz-brand-lockup"><span className="cz-logo"><Plane size={26}/></span><div><strong>CrewCheck</strong><small>ROSTER INTELLIGENCE</small></div><div className="cz-pills"><span>Premium</span><b>Beta</b></div></div>
  </header>;
}
function BottomNav({ view, setView, openMenu }: { view: ZeroView; setView: (v: ZeroView) => void; openMenu: () => void }) {
  const items: Array<[ZeroView, string, any]> = [['cockpit','Cockpit',HomeIcon],['roster','Escala',CalendarDays],['alerts','Alertas',Bell],['load','Carga',BriefcaseBusiness],['settings','Menu',Menu]];
  return <nav className="cz-bottom-nav">{items.map(([v, label, Icon]) => {
    const isMenu = v === 'settings';
    return <button key={v} className={(view===v || (isMenu && ['settings','features','exports','calendar','database','routine','crew','radar','weather','perdiem','salary','reports','wakeup','hotels','presentation','map','car','mycar','iflight'].includes(view))) ? 'active' : ''} onClick={() => isMenu ? openMenu() : setView(v)}><Icon size={23}/><span>{label}</span>{v==='alerts' && <em>3</em>}</button>;
  })}</nav>;
}
function KpiCard({ icon: Icon, title, value, detail, tone = '' }: { icon: any; title: string; value: string; detail: string; tone?: string }) {
  return <article className={`cz-kpi ${tone}`}><span><Icon size={24}/></span><div><small>{title}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}
function FlightCard({ event, compact = false }: { event: ZeroLeg; compact?: boolean }) {
  const d = event.canonical ? new Date(event.canonical.startDateTime) : event.date;
  return <article className={`cz-flight-card ${compact ? 'compact' : ''}`}>
    <div className="cz-flight-head"><div className="cz-airline"><span className="cz-latam-mark">▰</span><strong>LATAM</strong><em>{event.flightNumber}</em></div><div className="cz-date-chip"><CalendarDays size={16}/><b>{dateChip(d)}</b><small>{weekday(d)}</small></div></div>
    <div className="cz-route"><div><strong>{event.origin}</strong><span>{city(event.origin)}</span></div><div className="cz-route-arc"><i/><Plane size={20}/><i/></div><div><strong>{event.destination}</strong><span>{city(event.destination)}</span></div></div>
    <div className="cz-flight-pills"><span><b>Apresentação</b>{event.presentation}</span><span><b>METAR/TAF Origem</b>{event.origin}</span><span><b>METAR/TAF Destino</b>{event.destination}</span><span><b>Alerta meteo até pouso</b>{event.arrival}</span></div>
    <div className="cz-time-trio"><div><span>Apresentação</span><strong>{event.presentation}</strong><small>◷ Local</small></div><div><span>Decolagem</span><strong>{event.departure}</strong><small>◷ Prevista</small></div><div><span>Chegada</span><strong>{event.arrival}</strong><small>◷ Prevista</small></div></div>
    {!compact && <div className="cz-info-duo"><div><Lock size={25}/><span>Portão</span><strong>{safe(event.gate, 'A confirmar')}</strong><small>{safe(event.terminal, 'A confirmar')}</small></div><div><Plane size={25}/><span>Status</span><strong className="ok">{safe(event.status, 'Programado')}</strong><small>Aeronave: {safe(event.aircraft, 'A confirmar')} · Matrícula: {safe(event.registration, 'A confirmar')}</small></div></div>}
    {!compact && Boolean(event.crew?.length) && <div className="cz-crew-line"><UserRound size={18}/><span>Tripulação</span><strong>{event.crew?.slice(0, 4).join(', ')}</strong></div>}
    {!compact && Boolean(event.hotel) && <div className="cz-crew-line"><Hotel size={18}/><span>Hotel</span><strong>{event.hotel}</strong></div>}
    {!compact && Boolean(event.routine?.length) && <div className="cz-routine-strip">{event.routine?.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>}
    {!compact && <div className="cz-roster-actions"><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'weather' }))}><CloudSun/> Meteorologia</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'radar' }))}><Radar/> Radar</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'map' }))}><MapIcon/> Mapa</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'routine' }))}><Dumbbell/> Rotina</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'wakeup' }))}><Bell/> Despertador</button></div>}
  </article>;
}
function SmartCard({ event, setView }: { event: ZeroLeg; setView: (v: ZeroView) => void }) {
  if (event.placeholder) {
    return <article className="cz-smart-card" onClick={() => setView('import')}><div className="cz-smart-title"><span><Upload size={26}/></span><div><h2>Importar escala real</h2><p>PDF oficial de julho</p></div><ChevronRight/></div><div className="cz-smart-content"><strong>PDF</strong><em>REAL</em><p>Nenhum dado fictício será usado.</p><div><small>Status</small><b>Aguardando escala</b></div></div></article>;
  }
  return <article className="cz-smart-card" onClick={() => setView('departure')}><div className="cz-smart-title"><span><Car size={26}/></span><div><h2>Saída Inteligente</h2><p>Recomendado para sua programação</p></div><ChevronRight/></div><div className="cz-smart-content"><strong>{event.presentation !== '—' ? event.presentation : 'Calcular'}</strong><em>ROTA</em><p>Localização atual / hotel → {event.origin}</p><div><small>Tempo real</small><b>Trânsito</b></div></div></article>;
}


function MenuDrawer({ open, close, view, setView, actions }: { open: boolean; close: () => void; view: ZeroView; setView: (v: ZeroView) => void; actions: QuickActions }) {
  if (!open) return null;
  const nav: Array<[ZeroView, string, string, any]> = [
    ['cockpit','Cockpit','Próxima programação',HomeIcon], ['roster','Escala completa','Todos os dias e eventos',CalendarDays], ['alerts','Irregularidades','RBAC/ACT',AlertTriangle], ['load','Carga de trabalho','Jornada/carga/limites',BriefcaseBusiness], ['departure','Saída Inteligente','Rota/hotel',Car], ['mycar','Meu carro','Estacionamento e rota',Car], ['iflight','Push iFlight','Importação assistida',Upload],
    ['radar','Radar de voos','Portão e status',Radar], ['weather','Meteorologia','METAR/TAF e alertas',CloudSun], ['wakeup','Despertador','Alarmes inteligentes',Bell], ['presentation','Gerenciador de apresentação','Hotel/local e ajuste manual',Clock], ['hotels','Hotéis','Pernoite e entorno',Hotel], ['perdiem','Diárias','Semanal/mensal',BriefcaseBusiness], ['salary','Salário','Previsões e adicionais',DollarSign],
    ['reports','Relatórios','Indicadores premium',FileText], ['routine','Rotina','Academia e descanso',ShieldCheck], ['crew','Crew / Chefe','Tripulação e adicional',UserRound], ['calendar','Calendário','Google/ICS',CalendarDays],
    ['exports','Exportar','PDF e compartilhamento',Share2], ['database','Histórico','Banco e sync',Database], ['settings','Configurações','Perfil completo',Settings], ['maintenance','Manutenção','Prévia admin',Lock],
  ];
  const jump = (v: ZeroView) => { setView(v); close(); };
  return <div className="cz-menu-overlay" role="dialog" aria-modal="true">
    <button className="cz-menu-backdrop" onClick={close} aria-label="Fechar menu" />
    <aside className="cz-menu-panel">
      <header><div><span className="cz-logo"><Plane size={24}/></span><strong>Menu CrewCheck</strong><small>Todos os sistemas funcionais · Versão {DEFAULT_VERSION}</small></div><button onClick={close}><X/></button></header>
      <section className="cz-menu-section"><h3>Navegação</h3>{nav.map(([v, label, desc, Icon]) => <button key={v} className={view === v ? 'active' : ''} onClick={() => jump(v)}><Icon/><span><strong>{label}</strong><small>{desc}</small></span><ChevronRight/></button>)}</section>
      <section className="cz-menu-section"><h3>Ações rápidas</h3>
        <button onClick={() => { actions.upload(); close(); }}><Upload/><span><strong>Importar escala PDF</strong><small>AIMS/CrewRoster</small></span><ChevronRight/></button>
        <button onClick={() => { actions.pdf(); close(); }}><FileText/><span><strong>Exportar PDF</strong><small>Relatório completo</small></span><ChevronRight/></button>
        <button onClick={() => { actions.ics(); close(); }}><CalendarDays/><span><strong>Baixar ICS</strong><small>Arquivo calendário</small></span><ChevronRight/></button>
        <button onClick={() => { actions.google(); close(); }}><CalendarDays/><span><strong>Google Calendar</strong><small>Sincronizar agenda</small></span><ChevronRight/></button>
        <button onClick={() => { actions.whatsapp(); close(); }}><Send/><span><strong>WhatsApp</strong><small>Compartilhar resumo</small></span><ChevronRight/></button>
        <button onClick={() => { actions.telegram(); close(); }}><Send/><span><strong>Telegram</strong><small>Compartilhar resumo</small></span><ChevronRight/></button>
        <button onClick={() => { actions.email(); close(); }}><Mail/><span><strong>E-mail</strong><small>Enviar relatório</small></span><ChevronRight/></button>
        <button onClick={() => { actions.copy(); close(); }}><Copy/><span><strong>Copiar resumo</strong><small>Área de transferência</small></span><ChevronRight/></button>
        <button onClick={() => { actions.save(); close(); }}><Save/><span><strong>Salvar histórico</strong><small>Banco/offline</small></span><ChevronRight/></button>
        <button onClick={() => { actions.openActive(); close(); }}><RotateCcw/><span><strong>Abrir escala ativa</strong><small>Última sincronizada</small></span><ChevronRight/></button>
        <button className="danger" onClick={() => { actions.logout(); close(); }}><LogOut/><span><strong>Sair</strong><small>Encerrar sessão</small></span><ChevronRight/></button>
      </section>
    </aside>
  </div>;
}

function Cockpit({ events, compliance, setView, onUpload, openMenu }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {
  const event = nextFlight(events);
  const loaded = events.some((event) => !event.placeholder);
  const alertCount = Number((compliance as any)?.alerts?.length || 0);
  const counters = loaded && events[0]?.day ? {
    days: new Set(events.map((e) => e.day.date)).size,
    flights: events.filter((e) => e.kind === 'flight').length,
    activities: events.filter((e) => e.kind !== 'flight' && e.canonical?.kind !== 'rest').length,
    rest: events.filter((e) => e.canonical?.kind === 'rest').length,
  } : { days: 0, flights: 0, activities: 0, rest: 0 };

  return <><Brand onMenu={openMenu}/><section className="cz-title"><small>Cockpit</small><i/></section><section className="cz-kpi-row"><KpiCard icon={CalendarDays} title="Dias publicados" value={String(counters.days)} detail="Datas reais"/><KpiCard icon={Plane} title="Voos" value={String(counters.flights)} detail="Pernas detectadas" tone="blue"/><KpiCard icon={BriefcaseBusiness} title="Atividades" value={String(counters.activities)} detail={`Folgas ${counters.rest}`} tone="blue"/><KpiCard icon={Bell} title="Alertas" value={String(alertCount)} detail="Confirmados" tone="pink"/></section><section className="cz-money-row"><div onClick={() => setView('perdiem')}><BriefcaseBusiness/><span>Diárias</span><strong>Abrir</strong></div><div onClick={() => setView('salary')}><DollarSign/><span>Salário</span><strong>Financeiro</strong></div></section><section className="cz-section-head"><h2>Próxima Programação</h2><button onClick={() => setView(loaded ? 'roster' : 'import')}>{loaded ? 'Ver todas' : 'Importar'} <ChevronRight size={18}/></button></section>{loaded && !event.placeholder ? <FlightCard event={event}/> : <article className="cz-empty-real"><Upload/><h2>{loaded ? 'Nenhuma programação futura' : 'Nenhuma escala real carregada'}</h2><p>{loaded ? 'A escala foi carregada, mas não há evento operacional futuro após agora. Confira se o período importado está correto.' : 'Suba o PDF oficial de julho para reativar escala completa, detalhes, diárias, radar, rotina, hotéis, academias, trânsito e saída inteligente com dados reais.'}</p><button onClick={onUpload}>Importar PDF agora</button></article>}<SmartCard event={event} setView={setView}/><section className="cz-shortcuts cz-shortcuts-full"><button onClick={() => setView('features')}><Settings/><strong>Funcionalidades</strong><small>Central completa</small></button><button onClick={() => setView('load')}><BriefcaseBusiness/><strong>Carga</strong><small>Jornada e limites</small></button><button onClick={() => setView('radar')}><Radar/><strong>Radar</strong><small>Gate e status</small></button><button onClick={() => setView('weather')}><CloudSun/><strong>Meteorologia</strong><small>METAR/TAF</small></button><button onClick={() => setView('perdiem')}><BriefcaseBusiness/><strong>Diárias</strong><small>Semanal/mensal</small></button><button onClick={() => setView('salary')}><DollarSign/><strong>Salário</strong><small>Ganhos previstos</small></button><button onClick={() => setView('reports')}><FileText/><strong>Relatórios</strong><small>Indicadores</small></button><button onClick={() => setView('routine')}><Dumbbell/><strong>Rotina</strong><small>Academias/hotéis</small></button><button onClick={onUpload}><Upload/><strong>Importar PDF</strong><small>Escala oficial</small></button></section></>;
}

function rosterCode(day?: RosterDay): string {
  return String((day as any)?.pairingCode || (day as any)?.type || '').trim().toUpperCase();
}
function rosterCodeLabel(code: string): string {
  const normalized = String(code || '').trim().toUpperCase();
  const labels: Record<string, string> = {
    DR: 'Descanso regulamentar',
    DO: 'Folga',
    DOF: 'Folga',
    DOP: 'Folga programada',
    OFF: 'Folga',
    FERIAS: 'Férias',
    FÉRIAS: 'Férias',
    HSB: 'Sobreaviso',
    SA: 'Sobreaviso',
    RES: 'Reserva',
    RSV: 'Reserva',
    RCFI: 'Treinamento',
    CRM: 'Treinamento',
    EAD: 'Treinamento EAD',
    MT: 'Reunião',
  };
  return labels[normalized] || normalized || 'Atividade';
}
function rosterTimeRange(day: RosterDay, fallback?: ZeroLeg): string {
  const start = time((day as any).dutyReport || (day as any).startTime || fallback?.departure || fallback?.presentation, '');
  const end = time((day as any).dutyDebrief || (day as any).endTime || fallback?.arrival, '');
  if (start && end) return `${start} → ${end}`;
  if (start) return `Início ${start}`;
  if (end) return `Fim ${end}`;
  return '';
}
function rosterDaySummary(day: RosterDay, dayEvents: ZeroLeg[]): string {
  const flights = dayEvents.filter((event) => event.kind === 'flight').length;
  const code = rosterCode(day);
  const label = rosterCodeLabel(code);
  const range = rosterTimeRange(day, dayEvents[0]);
  if (flights > 0) {
    const plural = flights === 1 ? 'voo' : 'voos';
    const pieces = [`${flights} ${plural}`];
    if (code) pieces.push(code);
    if (range) pieces.push(range);
    return pieces.join(' · ');
  }
  if (['DR', 'DO', 'DOF', 'DOP', 'OFF', 'FERIAS', 'FÉRIAS'].includes(code)) return label;
  if (['HSB', 'SA', 'RES', 'RSV'].includes(code)) return range ? `${label} · ${range}` : label;
  return range ? `${label} · ${range}` : label;
}
function rosterEventTitle(event: ZeroLeg): string {
  if (event.kind === 'flight') return event.title;
  const code = rosterCode(event.day);
  if (code === 'DR') return 'Descanso';
  return rosterCodeLabel(code);
}
function rosterEventLine(event: ZeroLeg): string {
  if (event.kind === 'flight') return `${event.origin} → ${event.destination} · ${event.timeRange} · ${city(event.origin)} → ${city(event.destination)}`;
  const code = rosterCode(event.day);
  const label = rosterCodeLabel(code);
  const range = rosterTimeRange(event.day, event);
  const base = safe(event.origin || (event.day as any)?.base, 'BSB');
  if (['DR', 'DO', 'DOF', 'DOP', 'OFF', 'FERIAS', 'FÉRIAS'].includes(code)) return `${label} · Sem programação operacional · Base ${base} · ${city(base)}`;
  if (['HSB', 'SA'].includes(code)) return `${label}${range ? ` · ${range}` : ''} · Base ${base} · ${city(base)}`;
  if (['RES', 'RSV'].includes(code)) return `${label}${range ? ` · ${range}` : ''} · Base ${base} · ${city(base)}`;
  return `${label}${range ? ` · ${range}` : ''} · ${city(base)}`;
}

function inlineEventEndDateTime(event: ZeroLeg): Date {
  if (event.canonical?.endDateTime) return new Date(event.canonical.endDateTime);
  const base = new Date(event.date);
  const raw = event.arrival || event.departure || event.presentation;
  const match = String(raw || '').match(/(\d{1,2}):(\d{2})/);
  if (match) base.setHours(Number(match[1]), Number(match[2]), 0, 0);
  else base.setHours(23, 59, 0, 0);
  if (base.getTime() < eventStartDateTime(event).getTime()) base.setDate(base.getDate() + 1);
  return base;
}
function inlineDurationLabel(event: ZeroLeg): string {
  const start = eventStartDateTime(event).getTime();
  const end = inlineEventEndDateTime(event).getTime();
  const total = Math.max(0, Math.round((end - start) / 60000));
  if (!total) return 'Duração a confirmar';
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}
function inlinePresentationSource(event: ZeroLeg): string {
  try { return managedPresentationForEvent(event).source || event.presentationSource || 'Escala publicada'; }
  catch { return event.presentationSource || 'Escala publicada'; }
}
function RosterInlineDetails({ event, setView }: { event: ZeroLeg; setView: (v: ZeroView) => void }) {
  const isFlight = event.kind === 'flight';
  const presentation = event.presentation === 'Conexão/Solo' ? event.departure : event.presentation;
  const base = safe(event.origin || (event.day as any)?.base, 'BSB');
  const route = isFlight ? `${event.origin} → ${event.destination}` : `${base} · ${city(base)}`;
  const date = programDateLabel(event);
  const source = inlinePresentationSource(event);
  const detailStyle = {
    margin: '-8px 0 18px 0',
    border: '1px solid rgba(126, 200, 255, .22)',
    background: 'linear-gradient(180deg, rgba(7, 19, 39, .94), rgba(5, 14, 29, .98))',
    borderRadius: 24,
    padding: 16,
    boxShadow: '0 22px 55px rgba(0,0,0,.28)',
  } as React.CSSProperties;

  return <section className="cz-inline-detail" style={detailStyle}>
    <header className="cz-day-group-head" style={{ marginBottom: 12 }}>
      <span className="cz-day-headline"><strong>{date}</strong>{' · '}{rosterEventTitle(event)}{' · '}{route}</span>
    </header>
    <div className="cz-detail-grid">
      <div><span>Apresentação</span><strong>{safe(presentation, 'A confirmar')}</strong></div>
      <div><span>Decolagem/Início</span><strong>{safe(event.departure, 'A confirmar')}</strong></div>
      <div><span>Chegada/Fim</span><strong>{safe(event.arrival, 'A confirmar')}</strong></div>
      <div><span>Duração</span><strong>{inlineDurationLabel(event)}</strong></div>
      <div><span>Fonte apresentação</span><strong>{source}</strong></div>
      <div><span>Status</span><strong>{safe(event.status, 'Programado')}</strong></div>
      <div><span>Aeronave</span><strong>{safe(event.aircraft, 'A confirmar')}</strong></div>
      <div><span>Matrícula</span><strong>{safe(event.registration, 'A confirmar')}</strong></div>
      <div><span>Portão/Terminal</span><strong>{safe(event.gate, 'A confirmar')} · {safe(event.terminal, 'A confirmar')}</strong></div>
      <div><span>Hotel</span><strong>{safe(event.hotel, '—')}</strong></div>
    </div>
    <RosterInlineWeatherBlock event={event}/>
    {Boolean(event.crew?.length) && <p className="cz-mini-status"><strong>Tripulação:</strong> {event.crew?.slice(0, 8).join(' · ')}</p>}
    {Boolean(event.routine?.length) && <div className="cz-routine-strip">{event.routine?.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>}
    <div className="cz-tool-actions" style={{ marginTop: 14 }}>
      <button onClick={() => setView('presentation')}><Clock/> Gerenciador de apresentação</button>
      <button onClick={() => setView('departure')}><Car/> Saída</button>
      <button onClick={() => setView('radar')}><Radar/> Radar</button>
      <button onClick={() => setView('weather')}><CloudSun/> Meteo</button>
      <button onClick={() => setView('map')}><MapIcon/> Mapa</button>
      <button onClick={() => setView('perdiem')}><BriefcaseBusiness/> Diárias</button>
      <button onClick={() => setView('salary')}><DollarSign/> Salário</button>
    </div>
  </section>;
}

function airportIcao(code?: string): string {
  const map: Record<string, string> = {
    BSB:'SBBR', GRU:'SBGR', CGH:'SBSP', GIG:'SBGL', SDU:'SBRJ', CNF:'SBCF', CWB:'SBCT', POA:'SBPA', FOR:'SBFZ', SSA:'SBSV', REC:'SBRF', BEL:'SBBE', MAO:'SBEG', NAT:'SBSG', SLZ:'SBSL', PMW:'SBPJ', CXJ:'SBCX', RAO:'SBRP', VCP:'SBKP', MAB:'SBMA', THE:'SBTE', AJU:'SBAR', VIX:'SBVT', MCZ:'SBMO'
  };
  return map[String(code || '').toUpperCase()] || String(code || 'SB').toUpperCase();
}
function weatherStoredReport(airport: string, kind: 'metar' | 'taf'): string {
  const code = String(airport || '').toUpperCase();
  const icao = airportIcao(code);
  const key = `crewcheck_${kind}_${code}`;
  const fallback = kind === 'metar'
    ? `${icao} METAR aguardando atualização oficial · vento/visibilidade/teto monitorados`
    : `${icao} TAF tendência operacional: avaliar vento, chuva, teto e visibilidade`;
  return storage.get(key, fallback);
}
function weatherLooksWorse(report: string): boolean {
  const value = String(report || '').toUpperCase();
  return /\b(SPECI|TS|CB|RA|SHRA|FG|BR|BKN00|OVC00|WS|TEMPO|BECMG)\b/.test(value);
}
function compactWeatherLine(event: ZeroLeg): string {
  if (event.kind === 'flight') return `${airportIcao(event.origin)} METAR · ${airportIcao(event.destination)} TAF`;
  const base = safe(event.destination || event.origin || (event.day as any)?.base, 'BSB');
  return `Previsão ${city(base)} · atualização automática`;
}
function RosterEventChips({ event }: { event: ZeroLeg }) {
  const presentation = event.presentation === 'Conexão/Solo' ? event.departure : event.presentation;
  const isStay = event.kind === 'stay' || Boolean(event.hotel);
  return <div className="cz-roster-linked-chips" onClick={(click) => click.stopPropagation()}>
    <span><Clock size={14}/> Apresentação {safe(presentation, 'A confirmar')}</span>
    {isStay && <span><Hotel size={14}/> {safe(event.hotel, `Hotel em ${city(event.destination || event.origin)}`)}</span>}
    <span><CloudSun size={14}/> {compactWeatherLine(event)}</span>
    {event.kind === 'flight' && <span><Radar size={14}/> Alertas até pouso</span>}
  </div>;
}
function RosterInlineWeatherBlock({ event }: { event: ZeroLeg }) {
  const isFlight = event.kind === 'flight';
  const cityTarget = city(event.destination || event.origin);
  return <section className="cz-weather-inline">
    <header><CloudSun/><strong>{isFlight ? 'Meteorologia do voo' : 'Meteorologia do pernoite'}</strong><span>{cityTarget}</span></header>
    {isFlight ? <div className="cz-weather-metar-grid">
      <article><small>Origem · METAR</small><strong>{airportIcao(event.origin)}</strong><p>{weatherStoredReport(event.origin, 'metar')}</p></article>
      <article><small>Destino · TAF chegada</small><strong>{airportIcao(event.destination)}</strong><p>{weatherStoredReport(event.destination, 'taf')}</p></article>
    </div> : <div className="cz-weather-metar-grid">
      <article><small>Hotel/pernoite</small><strong>{safe(event.hotel, cityTarget)}</strong><p>Previsão local, chuva, vento e temperatura para descanso, deslocamento e apresentação.</p></article>
      <article><small>Apresentação</small><strong>{safe(event.presentation, 'A confirmar')}</strong><p>Use o Gerenciador de Apresentação para ajustar hotel, horário e padrão aprendido.</p></article>
    </div>}
    <footer><span>Notifica piora somente em novo METAR ou SPECI até o pouso.</span></footer>
  </section>;
}
function timelineStateClass(event: ZeroLeg): string {
  const now = new Date().getTime();
  const start = eventStartDateTime(event).getTime();
  const end = eventEndDateTime(event).getTime();
  if (now >= start && now <= end) return 'now';
  if (start > now) return 'future';
  return 'past';
}
function financeSnapshot(roster: CrewRoster) {
  const events = buildLegs(roster);
  const perdiem = calculatePerDiem(events);
  const salary = calculateSalary(events, roster);
  return { perdiem, salary };
}
function notifyCrewCheck(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  } catch {}
  toast.message(`${title}: ${body}`);
}
function useWeatherLandingMonitor(event: ZeroLeg) {
  useEffect(() => {
    if (!event || event.placeholder || event.kind !== 'flight') return;
    if (storage.get('crewcheck_weather_landing_alerts', '1') === '0') return;
    const airport = String(event.destination || '').toUpperCase();
    if (!airport) return;
    const signatureKey = `crewcheck_weather_signature_${airport}_${event.id}`;
    const check = () => {
      const report = storage.get(`crewcheck_latest_weather_report_${airport}`, '');
      const upper = String(report || '').toUpperCase();
      if (!upper.startsWith('METAR') && !upper.startsWith('SPECI')) return;
      const signature = `${airport}|${upper}`;
      const previous = storage.get(signatureKey, '');
      if (previous && previous !== signature && weatherLooksWorse(upper)) {
        notifyCrewCheck('Meteorologia mudou', `${airport}: novo ${upper.startsWith('SPECI') ? 'SPECI' : 'METAR'} com atenção operacional até o pouso.`);
      }
      storage.set(signatureKey, signature);
    };
    try { navigator.geolocation?.getCurrentPosition((pos) => storage.set('crewcheck_last_geo', `${pos.coords.latitude},${pos.coords.longitude}`), () => {}, { enableHighAccuracy: false, timeout: 2500 }); } catch {}
    check();
    const timer = window.setInterval(check, 60000);
    return () => window.clearInterval(timer);
  }, [event?.id, event?.destination, event?.kind]);
}

function Roster({ roster, events, setView }: { roster: CrewRoster; events: ZeroLeg[]; setView: (v: ZeroView) => void }) {
  const normalizedRoster = normalizeRosterDays(roster);
  const days = Array.isArray(normalizedRoster.days) ? normalizedRoster.days : [];
  const groupedEvents = days
    .map((day) => ({ day, events: events.filter((event) => event.day.date === day.date) }))
    .filter((group) => group.events.length);
  const first = currentDayAnchor(events);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const hasRoster = days.length > 0;
  const finance = financeSnapshot(normalizedRoster);

  return <><Brand back/><section className="cz-panel-head"><h1>Escala completa</h1><p>{safe(roster.crewName, 'Tripulante')} · {hasRoster ? monthLong(normalizedRoster) : 'sem escala real'} · Base {safe(roster.base, '—')}</p></section>{hasRoster ? <><section className="cz-roster-date"><span>{weekday(first.date)}</span><strong>{pad2(first.date.getDate())}</strong><em>{new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(first.date).replace('.','').toUpperCase()}</em><b>{first.date.toDateString() === new Date().toDateString() ? 'Hoje' : 'Próximo evento'}</b></section><section className="cz-money-row"><div><CalendarDays/><span>Dias</span><strong>{days.length}</strong></div><div><Plane/><span>Voos</span><strong>{events.filter(e => e.kind === 'flight').length}</strong></div><div onClick={() => setView('perdiem')}><BriefcaseBusiness/><span>Diárias</span><strong>{moneyBRL(finance.perdiem.monthly)}</strong></div><div onClick={() => setView('salary')}><DollarSign/><span>Salário</span><strong>{moneyBRL(finance.salary.gross)}</strong></div></section><section className="cz-roster-actions"><button onClick={() => setView('import')}><Upload/> Importar PDF</button><button onClick={() => setView('exports')}><Share2/> Exportar</button><button onClick={() => setView('calendar')}><CalendarDays/> Calendário</button></section><section className="cz-stack-list">{groupedEvents.map(({ day, events: dayEvents }) => { const d = parseDate(day); return <div className="cz-day-group cz-day-linked" key={day.date}><header className="cz-day-group-head"><span className="cz-day-headline"><strong>{weekday(d)} {pad2(d.getDate())}/{pad2(d.getMonth()+1)}</strong>{' · '}{rosterDaySummary(day, dayEvents)}</span></header>{dayEvents.map(e => <div className="cz-roster-expand-wrap" key={e.id}><article className={`cz-roster-card compact ${e.kind === 'stay' ? 'stay' : ''} ${timelineStateClass(e)} ${expandedId === e.id ? 'expanded' : ''}`} onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}><div className="cz-roster-main"><span className="cz-roster-icon">{e.kind === 'flight' ? <Plane/> : e.kind === 'stay' ? <Hotel/> : <BriefcaseBusiness/>}</span><div className="cz-roster-copy"><h3>{rosterEventTitle(e)}</h3><p>{rosterEventLine(e)}</p></div><ChevronDown className="cz-roster-chevron"/></div><RosterEventChips event={e}/></article>{expandedId === e.id && <RosterInlineDetails event={e} setView={setView}/>}</div>)}</div>; })}</section><section className="cz-complete-days"><h2>Todos os dias publicados</h2>{days.map((day, index) => { const dayEvents = events.filter(e => e.day.date === day.date); const d = parseDate(day); return <article key={`${day.date}-${index}`} onClick={() => dayEvents[0] && setExpandedId(expandedId === dayEvents[0].id ? null : dayEvents[0].id)}><header><strong>{weekday(d)} {pad2(d.getDate())}/{pad2(d.getMonth()+1)}</strong><span>{' · '}{rosterCodeLabel(rosterCode(day))}</span></header><p>{rosterDaySummary(day, dayEvents)}</p><small>{dayEvents.filter(e => e.kind === 'flight').length ? `Voos ${dayEvents.filter(e => e.kind === 'flight').length}` : 'Dia sem voo operacional'}</small></article>; })}</section></> : <article className="cz-empty-real"><Upload/><h2>Escala real não carregada</h2><p>Os dados fictícios foram removidos. Use o botão de importar para carregar o PDF oficial de julho e abrir os detalhes reais.</p><button onClick={() => setView('import')}>Importar escala PDF</button></article>}</>;
}

function Alerts({ compliance }: { compliance: ComplianceResult | null }) {
  const alerts = ((compliance as any)?.alerts || []);
  const list = alerts.slice(0, 12);
  return <><Brand back/><section className="cz-panel-head"><h1>Irregularidades e alertas</h1><p>RBAC 117, ACT, repouso, jornada, sobreaviso, reserva e acionamentos. Sem alertas fictícios.</p></section>{list.length ? <section className="cz-alert-stack">{list.map((a: any, idx: number) => <article className={a.severity === 'error' ? 'danger' : 'warn'} key={`${a.title}-${idx}`}><AlertTriangle/><div><h2>{a.title}</h2><p>{a.description}</p><span>{a.severity === 'error' ? 'Confirmada' : 'Atenção'}</span><b>Confiança: {a.severity === 'error' ? 'alta' : 'média'}</b></div><ChevronRight/></article>)}</section> : <article className="cz-empty-real"><ShieldCheck/><h2>Nenhuma irregularidade confirmada</h2><p>Carregue a escala real para que o motor regulatório refaça a análise completa.</p></article>}<article className="cz-alert-detail"><h2>Detalhes regulatórios <b>{list.length ? 'Ativo' : 'Aguardando escala'}</b></h2><div><p><strong>O que o sistema avalia</strong>Jornada, repouso, madrugadas, limites, reserva, sobreaviso, acionamento, pernoite e alterações.</p><p><strong>Dados usados</strong>Somente a escala importada ou sincronizada. Dados demonstrativos foram removidos.</p></div><footer><button>Ensinar falso positivo</button><button>Ver base regulatória</button></footer></article></>;
}
function Departure({ event }: { event: ZeroLeg }) {
  if (event.placeholder) return <><Brand back/><article className="cz-empty-real"><Car/><h2>Saída Inteligente aguardando escala real</h2><p>Importe o PDF para calcular saída com origem/hotel, aeroporto, rota visual e pós-pouso até o hotel.</p></article></>;
  return <><Brand back/><section className="cz-departure"><article className="cz-depart-hero"><span>SAÍDA RECOMENDADA</span><strong>{event.presentation !== '—' ? event.presentation : 'Calcular'}</strong><em>ROTA</em><h2>Localização atual / hotel → {event.origin}</h2><p>Próxima programação · apresentação {event.presentation}</p></article><div className="cz-depart-kpis"><div><Clock/>Chegar<strong>{event.presentation}</strong></div><div><Clock/>Trânsito<strong>Quando disponível</strong></div><div><ShieldCheck/>Status<strong>Monitorando</strong></div></div><article className="cz-map-card"><header><b>Rota inteligente</b><span>visual</span></header><RouteVisual event={event}/><ul><li><Radar/><span><strong>Localização dinâmica ativa</strong><small>Ajustes em tempo real quando a permissão e o serviço de tráfego estiverem disponíveis.</small></span></li><li><Plane/><span><strong>Ao chegar no aeroporto</strong><small>Pausar monitoramento até o pouso.</small></span></li><li><Car/><span><strong>Após pouso</strong><small>Estimar trajeto aeroporto → hotel automaticamente.</small></span></li></ul><footer><button onClick={() => openMapRoute(event)}><MapIcon/> Abrir mapa</button><button onClick={() => openRoadNetwork(event)}><Menu/> Malha viária</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'map' }))}><Globe2/> Mapa do mês</button></footer></article></section></>;
}

function MonthlyMapView({ events }: { events: ZeroLeg[] }) {
  const data = monthlyRouteData(events);
  const currentMonth = events.find((event) => !event.placeholder)?.date || new Date();
  return <><Brand back/><section className="cz-panel-head"><h1>Mapa do mês</h1><p>{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentMonth)} · {data.segments.length} trecho(s) · {data.totalKm.toLocaleString('pt-BR')} km estimados</p></section><section className="cz-month-map-card"><header><div><strong>Destinos e rotas</strong><span>Representação visual dos aeroportos publicados na escala.</span></div><button onClick={() => toast.info('Mapa visual de rotas. Trânsito em tempo real fica separado da rota.')}>Como funciona</button></header><svg className="cz-month-map" viewBox="0 0 100 100" role="img" aria-label="Mapa visual dos destinos do mês"><defs><linearGradient id="czMonthRoute" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#a855f7"/><stop offset="100%" stopColor="#22d3ee"/></linearGradient><filter id="czMonthGlow"><feGaussianBlur stdDeviation="1.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect x="0" y="0" width="100" height="100" rx="6"/><path d="M55 8 C70 18 76 33 71 48 C84 58 82 78 65 91 C50 98 36 86 38 70 C25 62 24 42 35 30 C39 20 43 12 55 8 Z" className="cz-brazil-shape"/>{data.segments.map((segment, index) => { const from = projectSouthAmerica(segment.from); const to = projectSouthAmerica(segment.to); return <line key={`${segment.event.id}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="cz-month-route-line"/>; })}{data.destinations.map((point) => { const p = projectSouthAmerica(point); return <g key={point.code} className="cz-month-airport" filter="url(#czMonthGlow)"><circle cx={p.x} cy={p.y} r={point.code === 'BSB' ? 2.4 : 1.8}/><text x={p.x + 2.3} y={p.y + 1.2}>{point.code}</text></g>; })}</svg><div className="cz-destination-strip">{data.destinations.slice(0, 14).map((point) => <span key={point.code}><b>{point.code}</b>{city(point.code)} · {point.count}</span>)}</div>{!data.segments.length && <article className="cz-empty-real"><MapIcon/><h2>Sem voos mapeáveis</h2><p>Importe a escala oficial para exibir todos os destinos do mês.</p></article>}</section></>;
}

function CarView({ event }: { event: ZeroLeg }) {
  return <><Brand back/><section className="cz-panel-head"><h1>Meu Carro</h1><p>Rotas, estacionamento, retorno ao aeroporto e pós-pouso dentro do novo layout.</p></section><section className="cz-car-grid"><article className="cz-car-card"><Car/><h2>Hotel/local → aeroporto</h2><p>{event.placeholder ? 'Aguardando escala real.' : `${event.hotel ? event.hotel : 'Localização atual'} → ${event.origin} · ${city(event.origin)}`}</p><RouteVisual event={event} compact/><div className="cz-tool-actions"><button disabled={event.placeholder} onClick={() => openMapRoute(event)}><MapIcon/> Abrir mapa</button><button disabled={event.placeholder} onClick={() => openRoadNetwork(event)}><Menu/> Malha viária</button></div></article><article className="cz-car-card"><ShieldCheck/><h2>Estacionamento e retorno</h2><p>Salve onde deixou o carro, tempo de retorno e observações do aeroporto.</p><div className="cz-tool-actions"><button onClick={() => { storage.set('crewcheck_car_note', window.prompt('Observação do carro/estacionamento') || storage.get('crewcheck_car_note','')); toast.success('Observação salva.'); }}><Save/> Salvar nota</button><button onClick={() => toast.info(storage.get('crewcheck_car_note','Nenhuma observação salva.'))}><FileText/> Ver nota</button></div></article><article className="cz-car-card"><Plane/><h2>Pós-pouso</h2><p>Ao chegar, o sistema pode abrir a rota aeroporto → hotel/casa sem misturar mapa com cálculo regulatório.</p><div className="cz-tool-actions"><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'departure' }))}><Car/> Saída Inteligente</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'hotels' }))}><Hotel/> Hotéis</button></div></article></section></>;
}

function IFlightPushView({ actions }: { actions: QuickActions }) {
  return <><Brand back/><section className="cz-panel-head"><h1>Push iFlight assistido</h1><p>Importação assistida sem salvar usuário, senha, MFA, cookies ou sessão.</p></section><section className="cz-toolbox"><h2>Ambiente seguro</h2><p>Use apenas credenciais corporativas autorizadas no portal oficial. O CrewCheck processa somente o PDF ou calendário autorizado e limpa o estado temporário ao finalizar.</p><div className="cz-tool-actions"><button onClick={actions.upload}><Upload/> Importar PDF baixado</button><button onClick={() => window.open('https://iflightla.ibsplc.aero/iflight-cwp/web/getMainPage', '_blank', 'noopener,noreferrer')}><Globe2/> Abrir portal oficial</button><button onClick={() => toast.info('O acesso automático exige ponte corporativa segura. Por LGPD, login/MFA continuam manuais.') }><ShieldCheck/> Ver política segura</button></div></section><section className="cz-mini-status"><p><strong>Permitido:</strong> login manual, MFA manual e importação do PDF autorizado.</p><p><strong>Proibido:</strong> salvar senha, SMS, MFA, cookies, token ou sessão.</p></section></>;
}


function LoadView({ bundle }: { bundle: BundleState }) {
  const compliance = currentCompliance(bundle) as any;
  const days = Array.isArray(bundle.roster.days) ? bundle.roster.days.length : 0;
  const flights = buildLegs(bundle.roster).filter(e => e.kind === 'flight').length;
  return <><Brand back/><section className="cz-panel-head"><h1>Carga de trabalho</h1><p>Jornada, carga, descanso, intensidade, academia/hotel e limites regulatórios. Este menu não abre mais a Saída Inteligente.</p></section><section className="cz-report-grid"><article><h2>Dias publicados</h2><strong>{days}</strong><p>Baseado somente na escala real importada.</p></article><article><h2>Voos</h2><strong>{flights}</strong><p>Trechos operacionais detectados.</p></article><article><h2>Score RBAC</h2><strong>{compliance.score ?? '—'}</strong><p>{compliance.summary || 'Aguardando análise.'}</p></article></section><section className="cz-toolbox"><h2>Sistemas conectados</h2><p>Rotina, academias, hotéis, trânsito real, saída inteligente, radar de voos, meteorologia, diárias, salário e relatórios usam a mesma escala ativa.</p></section></>;
}

function ToggleSetting({ icon: Icon, label, storageKey, defaultOn = true, detail }: { icon: any; label: string; storageKey: string; defaultOn?: boolean; detail?: string }) {
  const [on, setOn] = useState(() => storage.get(storageKey, defaultOn ? '1' : '0') !== '0');
  const toggle = () => { const next = !on; setOn(next); storage.set(storageKey, next ? '1' : '0'); if (storageKey === 'crewcheck_light_premium') { localStorage.setItem('crewcheck_theme_mode', next ? 'light' : 'dark'); document.documentElement.dataset.crewTheme = next ? 'light' : 'dark'; document.documentElement.classList.toggle('dark', !next); document.documentElement.style.colorScheme = next ? 'light' : 'dark'; window.dispatchEvent(new Event('crewcheck:theme-change')); } toast.success(`${label}: ${next ? 'ativado' : 'desativado'}`); };
  return <button className="cz-setting" onClick={toggle}><Icon/><div><strong>{label}</strong><small>{detail || (on ? 'Ativo' : 'Inativo')}</small></div><span className={on ? 'on' : ''}/></button>;
}
function FieldSetting({ icon: Icon, label, storageKey, placeholder }: { icon: any; label: string; storageKey: string; placeholder: string }) {
  const [value, setValue] = useState(() => storage.get(storageKey, ''));
  return <label className="cz-setting cz-field-setting"><Icon/><div><strong>{label}</strong><input value={value} onChange={(event) => { setValue(event.target.value); storage.set(storageKey, event.target.value); }} placeholder={placeholder}/></div><ChevronRight/></label>;
}
function SettingsView({ setView, actions }: { setView: (v: ZeroView) => void; actions: QuickActions }) {
  const admin = isAdmin();
  const user = getStoredUser();
  async function enableMaintenance(enabled: boolean) {
    try {
      const response = await fetch('/api/admin/maintenance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled, title: 'Site em manutenção', message: 'Estamos realizando melhorias e atualizações no CrewCheck.' }) });
      if (!response.ok) throw new Error('Falhou');
      toast.success(enabled ? 'Modo manutenção ativado.' : 'Modo manutenção desativado.');
      window.dispatchEvent(new CustomEvent('crewcheck:maintenance-updated'));
    } catch { toast.error('Não consegui alterar o modo manutenção.'); }
  }
  function saveProfile() { toast.success('Configurações salvas no CrewCheck.'); }
  return <><Brand back/><section className="cz-settings"><article className="cz-profile"><UserRound/><div><h2>{user?.name || 'Bruno Saraiva'}</h2><p>{safe((user as any)?.role, 'Tripulante')}</p><span>Premium</span><b>Beta</b><small>Versão CrewCheck {DEFAULT_VERSION}</small></div><ChevronRight/></article><h3>Operacional</h3><ToggleSetting icon={Radar} label="Mapa visual para rotas" storageKey="crewcheck_tomtom_primary"/><ToggleSetting icon={MapIcon} label="Atualizar localização em rota" storageKey="crewcheck_live_location"/><ToggleSetting icon={Plane} label="Pausar ao chegar no aeroporto" storageKey="crewcheck_pause_at_airport"/><ToggleSetting icon={Building2} label="Após pouso calcular tempo até hotel" storageKey="crewcheck_after_landing_hotel"/><ToggleSetting icon={CloudSun} label="Atualização de meteorologia" storageKey="crewcheck_weather_hourly" detail="Novo METAR/SPECI"/><ToggleSetting icon={CloudSun} label="Alertar piora até o pouso" storageKey="crewcheck_weather_landing_alerts" detail="Somente novo METAR ou SPECI"/><ToggleSetting icon={Upload} label="Push iFlight assistido" storageKey="crewcheck_iflight_push_enabled" detail="sem salvar credenciais"/><ToggleSetting icon={Sun} label="Modo claro premium" storageKey="crewcheck_light_premium" defaultOn={false}/><h3>Perfil</h3><FieldSetting icon={Globe2} label="País do telefone" storageKey="crewcheck_phone_country" placeholder="Brasil +55"/><FieldSetting icon={Phone} label="Telefone do despertador" storageKey="crewcheck_wakeup_phone" placeholder="61996071663"/><FieldSetting icon={Building2} label="Base virtual" storageKey="crewcheck_virtual_base" placeholder="Ex.: BSB / CGH / GRU"/><ToggleSetting icon={GraduationCap} label="Sou instrutor" storageKey="crewcheck_instructor" defaultOn={false}/><h3>Notificações e concierge</h3><ToggleSetting icon={Bell} label="Notificações via Telegram" storageKey="crewcheck_telegram_notifications"/><ToggleSetting icon={Car} label="Alertas de trânsito e saída" storageKey="crewcheck_traffic_alerts"/><ToggleSetting icon={Wifi} label="Concierge operacional" storageKey="crewcheck_concierge"/><section className="cz-settings-actions"><button onClick={saveProfile}><Save/> Salvar perfil</button><button onClick={() => setView('features')}><Settings/> Central funcional</button><button onClick={actions.replayIntro}><PlayCircle/> Reexibir introdução</button><button onClick={actions.openActive}><RotateCcw/> Abrir escala ativa</button><button onClick={actions.logout}><LogOut/> Sair</button>{admin && <button onClick={() => setView('maintenance')}><Lock/> Prévia manutenção</button>}{admin && <button onClick={() => enableMaintenance(true)}><Lock/> Ativar manutenção</button>}{admin && <button onClick={() => enableMaintenance(false)}><ShieldCheck/> Desativar manutenção</button>}</section></section></>;
}

function FeatureHub({ bundle, events, setBundle, setView, actions }: { bundle: BundleState; events: ZeroLeg[]; setBundle: (b: BundleState) => void; setView: (v: ZeroView) => void; actions: QuickActions }) {
  const compliance = currentCompliance(bundle);
  const gym = currentGym(bundle);
  return <><Brand back/><section className="cz-panel-head"><h1>Central funcional</h1><p>Todos os motores antigos religados no novo layout: parser, RBAC/ACT, diárias, salário, radar, meteorologia, exportação, calendário e histórico. Versão {DEFAULT_VERSION}.</p></section><section className="cz-feature-grid"><button onClick={actions.upload}><Upload/><strong>Importar escala</strong><small>PDF AIMS / CrewRoster</small></button><button onClick={() => setView('roster')}><CalendarDays/><strong>Escala completa</strong><small>{events.length} eventos detectados</small></button><button onClick={() => setView('alerts')}><AlertTriangle/><strong>Irregularidades</strong><small>{(compliance as any)?.alerts?.length || 0} alertas</small></button><button onClick={() => setView('load')}><BriefcaseBusiness/><strong>Carga</strong><small>Jornada e limites</small></button><button onClick={() => setView('departure')}><Car/><strong>Saída Inteligente</strong><small>Rota / hotel / pós-pouso</small></button><button onClick={() => setView('mycar')}><Car/><strong>Meu carro</strong><small>Estacionamento e rota</small></button><button onClick={() => setView('iflight')}><Upload/><strong>Push iFlight</strong><small>Importação assistida</small></button><button onClick={() => setView('wakeup')}><Bell/><strong>Despertador Inteligente</strong><small>Antes da apresentação</small></button><button onClick={() => setView('radar')}><Radar/><strong>Radar de voos</strong><small>Portão e status</small></button><button onClick={() => setView('weather')}><CloudSun/><strong>Meteorologia</strong><small>METAR/TAF e Defesa Civil</small></button><button onClick={() => setView('perdiem')}><BriefcaseBusiness/><strong>Diárias</strong><small>Semanal e mensal</small></button><button onClick={() => setView('salary')}><DollarSign/><strong>Salário</strong><small>Chefe/instrutor/ganhos</small></button><button onClick={() => setView('routine')}><ShieldCheck/><strong>Rotina</strong><small>Academia e descanso</small></button><button onClick={() => setView('hotels')}><Hotel/><strong>Hotéis</strong><small>Pernoite e entorno</small></button><button onClick={() => setView('crew')}><UserRound/><strong>Crew / Chefe</strong><small>Tripulação e adicional</small></button><button onClick={() => setView('calendar')}><CalendarDays/><strong>Calendário</strong><small>Google Calendar / ICS</small></button><button onClick={() => setView('exports')}><FileText/><strong>Exportar</strong><small>PDF, WhatsApp, e-mail</small></button><button onClick={() => setView('settings')}><Settings/><strong>Configurações</strong><small>Perfil completo</small></button><button onClick={() => setView('database')}><Database/><strong>Histórico</strong><small>Sincronização e offline</small></button></section><section className="cz-toolbox"><h2>Ações rápidas</h2><div className="cz-tool-actions"><button onClick={actions.pdf}>Gerar PDF</button><button onClick={actions.ics}>Gerar ICS</button><button onClick={actions.whatsapp}>WhatsApp</button><button onClick={actions.telegram}>Telegram</button><button onClick={actions.email}>E-mail</button><button onClick={actions.copy}>Copiar resumo</button><button onClick={actions.google}>Google Calendar</button><button onClick={actions.save}>Salvar histórico</button><button onClick={actions.openActive}>Abrir ativa</button></div></section><section className="cz-mini-status"><p><strong>Fonte:</strong> {bundle.source}</p><p><strong>Eventos:</strong> {events.length} · <strong>Alertas:</strong> {(compliance as any)?.alerts?.length || 0} · <strong>Academia:</strong> {gym.length}</p></section></>;
}

function RadarView({ event }: { event: ZeroLeg }) {
  const [state, setState] = useState<any>(null);
  useEffect(() => { let alive = true; fetch(`/api/radar-health?airport=${encodeURIComponent(event.origin)}&type=departure`, { cache: 'no-store' }).then(r => r.json()).then(p => alive && setState(p)).catch(() => alive && setState({ ok: false, message: 'Radar em espera.' })); return () => { alive = false; }; }, [event.origin]);
  return <><Brand back/><section className="cz-panel-head"><h1>Radar de voos</h1><p>Status operacional para {event.flightNumber} · {event.origin} → {event.destination}.</p></section><section className="cz-radar-screen"><article><Radar/><h2>{event.flightNumber}</h2><p>{event.origin} → {event.destination}</p><strong>Portão: {safe(event.gate, 'A confirmar')} · {safe(event.terminal, 'Terminal a confirmar')}</strong><span>Status: {safe(event.status, 'Monitorando')}</span></article><article><Plane/><h2>Fonte operacional</h2><p>Radar, portão, status e remoção de voos finalizados.</p><strong>{state?.ok ? 'Fonte ativa' : 'Fonte em espera'}</strong><span>{state?.message || state?.source || 'Radar pronto.'}</span></article></section></>;
}
function WeatherView({ event }: { event: ZeroLeg }) {
  const [weather, setWeather] = useState<any>(null);
  const airports = [event.origin, event.destination].filter(Boolean).join(',');
  useEffect(() => {
    let alive = true;
    fetch(`/api/aviation-weather?airports=${encodeURIComponent(airports)}&v=1278`, { cache: 'no-store' })
      .then(r => r.json())
      .then(p => alive && setWeather(p))
      .catch((error) => alive && setWeather({ ok: false, message: error?.message || 'Falha METAR/TAF' }));
    return () => { alive = false; };
  }, [airports]);
  const origin = weather?.stations?.[event.origin] || weather?.stations?.[weather?.originIcao] || weather?.origin || {};
  const dest = weather?.stations?.[event.destination] || weather?.stations?.[weather?.destinationIcao] || weather?.destination || origin || {};
  return <><Brand back/><section className="cz-panel-head"><h1>Meteorologia</h1><p>METAR, TAF, Defesa Civil e concierge meteorológico. Fonte AviationWeather.gov com cache operacional de 60 minutos.</p></section><section className="cz-weather-grid"><article><CloudSun/><h2>{event.origin}</h2><strong>METAR</strong><p>{origin?.metar || weather?.metar || weather?.message || 'Aguardando METAR da fonte oficial.'}</p><small>{origin?.icao || weather?.originIcao || 'Aeroporto origem'}</small></article><article><Wifi/><h2>{event.destination}</h2><strong>TAF</strong><p>{dest?.taf || weather?.taf || 'Previsão será exibida quando disponível.'}</p><small>{dest?.icao || weather?.destinationIcao || 'Aeroporto destino'}</small></article></section>{!weather?.ok && <article className="cz-empty-real"><CloudSun/><h2>METAR/TAF indisponível agora</h2><p>Confira rede do Render. O endpoint interno /api/aviation-weather foi restaurado nesta versão.</p></article>}</>;
}
function moneyBRL(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function overlapsWindow(start: Date, end: Date, hourStart: number, hourEnd: number) {
  const a = new Date(start); a.setHours(hourStart, 0, 0, 0);
  const b = new Date(start); b.setHours(hourEnd, 0, 0, 0);
  if (hourEnd <= hourStart) b.setDate(b.getDate() + 1);
  return start.getTime() < b.getTime() && end.getTime() > a.getTime();
}
function durationHours(event: ZeroLeg) {
  const start = eventStartDateTime(event).getTime();
  const end = eventEndDateTime(event).getTime();
  return Math.max(0, (end - start) / 36e5);
}
function currentWeekBounds() {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start); end.setDate(start.getDate() + 7);
  return { start, end };
}
function calculatePerDiem(events: ZeroLeg[]) {
  const mealRate = Number(storage.get('crewcheck_perdiem_meal_brl', '68.40')) || 68.4;
  const breakfastRate = Number(storage.get('crewcheck_perdiem_breakfast_brl', String(mealRate * 0.25))) || mealRate * 0.25;
  const rows: Array<{ date: string; label: string; value: number; source: string }> = [];
  const seen = new Set<string>();
  const add = (event: ZeroLeg, label: string, value: number, source: string) => {
    const key = `${dateChip(event.date)}-${label}-${event.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ date: dateChip(event.date), label, value, source });
  };
  events.filter(isOperationalEvent).forEach((event) => {
    const start = eventStartDateTime(event);
    const end = new Date(eventEndDateTime(event).getTime() + 30 * 60 * 1000);
    const international = [event.origin, event.destination].some((a) => !['BSB','GRU','CGH','SDU','GIG','CNF','REC','SSA','CWB','POA','BEL','MAO','FOR','PMW','NAT','MCZ','SLZ','THE','AJU','VIX'].includes(String(a || '').toUpperCase()));
    if (international && event.kind === 'flight') {
      add(event, 'Internacional', 88.2 * Number(storage.get('crewcheck_usd_brl', '5.20')), 'USD 88,20 convertido');
      return;
    }
    if (event.kind === 'stay' || event.hotel) {
      add(event, 'Almoço pernoite', mealRate, 'Pernoite/hotel');
      add(event, 'Jantar pernoite', mealRate, 'Pernoite/hotel');
      return;
    }
    if (overlapsWindow(start, end, 5, 8)) add(event, 'Café', breakfastRate, '05:00–08:00');
    if (overlapsWindow(start, end, 11, 13)) add(event, 'Almoço', mealRate, '11:00–13:00');
    if (overlapsWindow(start, end, 19, 20)) add(event, 'Jantar', mealRate, '19:00–20:00');
    if (overlapsWindow(start, end, 0, 1)) add(event, 'Ceia', mealRate, '00:00–01:00');
  });
  const { start, end } = currentWeekBounds();
  const monthly = rows.reduce((sum, row) => sum + row.value, 0);
  const weekly = rows.filter((row) => {
    const [d, m] = row.date.split('/').map(Number);
    const date = new Date(new Date().getFullYear(), m - 1, d, 12, 0, 0);
    return date >= start && date < end;
  }).reduce((sum, row) => sum + row.value, 0);
  return { rows, monthly, weekly, mealRate, breakfastRate };
}
function calculateSalary(events: ZeroLeg[], roster: CrewRoster) {
  const sectorRate = Number(storage.get('crewcheck_salary_sector_brl', '76.37')) || 76.37;
  const chiefRate = Number(storage.get('crewcheck_salary_chief_brl', '45')) || 45;
  const instructorRate = Number(storage.get('crewcheck_salary_instructor_brl', '60')) || 60;
  const basePay = Number(storage.get('crewcheck_salary_base_brl', '0')) || 0;
  const flightEvents = events.filter((e) => e.kind === 'flight');
  const sectors = flightEvents.length;
  const blockHours = flightEvents.reduce((sum, event) => sum + durationHours(event), 0);
  const userName = `${getStoredUser()?.name || roster.crewName || ''}`.toLowerCase().split(/\s+/)[0] || '';
  const chiefSectors = flightEvents.filter((event) => userName && String(event.crew?.[0] || '').toLowerCase().includes(userName)).length;
  const instructor = storage.get('crewcheck_instructor', '0') !== '0';
  const nightHours = flightEvents.reduce((sum, event) => {
    const start = eventStartDateTime(event);
    const end = eventEndDateTime(event);
    let cursor = new Date(start);
    let night = 0;
    while (cursor < end) {
      const next = new Date(Math.min(cursor.getTime() + 30 * 60 * 1000, end.getTime()));
      const h = cursor.getHours();
      if (h >= 22 || h < 5) night += (next.getTime() - cursor.getTime()) / 36e5;
      cursor = next;
    }
    return sum + night;
  }, 0);
  const production = sectors * sectorRate;
  const chief = chiefSectors * chiefRate;
  const instructorPay = instructor ? sectors * instructorRate : 0;
  const night = nightHours * (sectorRate * 0.2);
  const gross = basePay + production + chief + instructorPay + night;
  const inss = Math.min(gross * 0.11, 908.85);
  const irrf = gross > 4664.68 ? gross * 0.275 - 896 : gross > 2826.65 ? gross * 0.15 - 354.8 : gross > 2259.2 ? gross * 0.075 - 169.44 : 0;
  const fgts = gross * 0.08;
  const net = Math.max(0, gross - inss - Math.max(0, irrf));
  return { sectors, blockHours, chiefSectors, nightHours, production, chief, instructorPay, night, gross, inss, irrf: Math.max(0, irrf), fgts, net };
}
function PerDiemView({ bundle }: { bundle: BundleState }) {
  const events = buildLegs(bundle.roster);
  const forecast = calculatePerDiem(events);
  return <><Brand back/><section className="cz-panel-head"><h1>Diárias</h1><p>Previsão por janelas reais LT: café, almoço, jantar, ceia, pernoite e internacional.</p></section><section className="cz-finance-grid"><KpiCard icon={BriefcaseBusiness} title="Previsão mensal" value={moneyBRL(forecast.monthly)} detail={`${forecast.rows.length} eventos de diária`}/><KpiCard icon={CalendarDays} title="Semana atual" value={moneyBRL(forecast.weekly)} detail="fechamento operacional"/><KpiCard icon={Plane} title="Refeição base" value={moneyBRL(forecast.mealRate)} detail={`Café ${moneyBRL(forecast.breakfastRate)}`}/></section><section className="cz-finance-table"><h2>Itens previstos</h2>{forecast.rows.length ? forecast.rows.slice(0, 18).map((row, i) => <div className="cz-finance-row" key={`${row.date}-${row.label}-${i}`}><span>{row.date}</span><strong>{row.label}</strong><small>{row.source}</small><b>{moneyBRL(row.value)}</b></div>) : <article className="cz-empty-real"><BriefcaseBusiness/><h2>Sem diárias detectadas</h2><p>Carregue uma escala com voos, reservas ou pernoites para calcular automaticamente.</p></article>}</section></>;
}
function SalaryView({ bundle }: { bundle: BundleState }) {
  const events = buildLegs(bundle.roster);
  const compliance = currentCompliance(bundle);
  const salary = calculateSalary(events, bundle.roster);
  return <><Brand back/><section className="cz-panel-head"><h1>Salário</h1><p>Previsão com setores, chefe de cabine, instrutor, noturno, INSS, IRRF e FGTS estimados.</p></section><section className="cz-finance-grid"><KpiCard icon={DollarSign} title="Bruto estimado" value={moneyBRL(salary.gross)} detail={`${salary.sectors} setores`}/><KpiCard icon={ShieldCheck} title="Líquido estimado" value={moneyBRL(salary.net)} detail="após descontos estimados"/><KpiCard icon={UserRound} title="Chefe/Instrutor" value={moneyBRL(salary.chief + salary.instructorPay)} detail={`${salary.chiefSectors} setores chefe`}/></section><section className="cz-finance-table"><h2>Composição</h2><div className="cz-finance-row"><span>Produtividade</span><strong>{salary.sectors} setores</strong><small>{salary.blockHours.toFixed(1)} h bloco</small><b>{moneyBRL(salary.production)}</b></div><div className="cz-finance-row"><span>Chefe</span><strong>1º CCM</strong><small>somente quando aplicável</small><b>{moneyBRL(salary.chief)}</b></div><div className="cz-finance-row"><span>Instrutor</span><strong>Perfil</strong><small>{storage.get('crewcheck_instructor','0') !== '0' ? 'ativo' : 'inativo'}</small><b>{moneyBRL(salary.instructorPay)}</b></div><div className="cz-finance-row"><span>Noturno</span><strong>{salary.nightHours.toFixed(1)} h</strong><small>estimado</small><b>{moneyBRL(salary.night)}</b></div><div className="cz-finance-row muted"><span>INSS</span><strong>estimado</strong><small>não substitui holerite</small><b>-{moneyBRL(salary.inss)}</b></div><div className="cz-finance-row muted"><span>IRRF</span><strong>estimado</strong><small>faixas simplificadas</small><b>-{moneyBRL(salary.irrf)}</b></div><div className="cz-finance-row"><span>FGTS</span><strong>informativo</strong><small>8% estimado</small><b>{moneyBRL(salary.fgts)}</b></div></section><section className="cz-toolbox"><h2>Alertas de impacto</h2><p>{String((compliance as any).alerts?.length || 0)} alertas regulatórios podem impactar análise operacional.</p></section></>;
}
function ReportsView({ bundle }: { bundle: BundleState }) {
  const compliance = currentCompliance(bundle);
  return <><Brand back/><section className="cz-panel-head"><h1>Relatórios</h1><p>Indicadores premium de jornada, repouso, horas, carga, academia, rotina e alertas.</p></section><section className="cz-report-grid"><article><h2>Conformidade</h2><strong>{(compliance as any).score ?? '—'}/100</strong><p>{(compliance as any).summary || 'Resumo indisponível'}</p></article><article><h2>Carga</h2><strong>{(compliance as any).loadAnalysis?.intensityScore ?? '—'}</strong><p>Índice de intensidade da escala.</p></article><article><h2>Alertas</h2><strong>{(compliance as any).alerts?.length || 0}</strong><p>Itens confirmados e para revisão.</p></article></section></>;
}
function CalendarToolsView({ actions }: { actions: QuickActions }) {
  return <><Brand back/><section className="cz-panel-head"><h1>Calendário</h1><p>Exportação Connect Crew Lounge, ICS, Google Calendar e notas operacionais.</p></section><section className="cz-toolbox"><h2>Ações</h2><div className="cz-tool-actions"><button onClick={actions.ics}>Baixar ICS</button><button onClick={actions.google}>Sincronizar Google</button><button onClick={() => toast.info('Notas operacionais são incluídas quando aplicável.')}>Ver notas</button></div></section><section className="cz-diagnostics">{googleCalendarIntegrationDiagnostics().map((d: any) => <p key={d.label}><strong>{d.label}</strong><span>{d.value}</span></p>)}</section></>;
}
function ExportToolsView({ actions }: { actions: QuickActions }) {
  return <><Brand back/><section className="cz-panel-head"><h1>Exportar e compartilhar</h1><p>PDF, WhatsApp, Telegram, copiar resumo, e-mail e arquivo de calendário.</p></section><section className="cz-toolbox"><div className="cz-tool-actions"><button onClick={actions.pdf}>PDF</button><button onClick={actions.whatsapp}>WhatsApp</button><button onClick={actions.telegram}>Telegram</button><button onClick={actions.copy}>Copiar</button><button onClick={actions.email}>E-mail</button><button onClick={actions.ics}>ICS</button><button onClick={actions.google}>Google Calendar</button></div></section></>;
}
function WakeupView({ event }: { event: ZeroLeg }) {
  const wake = event.presentation !== '—' ? addMinutesToTime(event.presentation, -90) : 'Calcular';
  const leave = event.presentation !== '—' ? addMinutesToTime(event.presentation, -55) : 'Calcular';
  const sleep = wake !== '—' && wake !== 'Calcular' ? addMinutesToTime(wake, -450) : 'Calcular';
  const mode = storage.get('crewcheck_alarm_mode', 'Ligação + Telegram');
  const setMode = (next: string) => { storage.set('crewcheck_alarm_mode', next); toast.success(`Despertador: ${next}`); window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'wakeup' })); };
  return <><Brand back/><section className="cz-panel-head"><h1>Despertador Inteligente</h1><p>Planejamento baseado na próxima apresentação real, sem armazenar credenciais ou dados sensíveis.</p></section><section className="cz-finance-grid"><KpiCard icon={Bell} title="Dormir" value={sleep} detail="7h30 antes de acordar"/><KpiCard icon={Bell} title="Acordar" value={wake} detail="90 min antes"/><KpiCard icon={Car} title="Sair" value={leave} detail={`${event.hotel ? 'Hotel' : 'Origem'} → ${event.origin}`}/></section><section className="cz-toolbox"><h2>Como notificar</h2><div className="cz-tool-actions cz-wakeup-options">{['Ligação + Telegram','Somente ligação','Somente Telegram','Ligação'].map((item) => <button className={mode === item ? 'active' : ''} key={item} onClick={() => setMode(item)}>{item}</button>)}</div><p>Confirmação de acordado, repetição escalonada e provedor VOIP ficam configuráveis por plano, sem expor nome de API ao usuário.</p></section><section className="cz-mini-status"><p><strong>Próxima programação:</strong> {event.title}</p><p><strong>Apresentação:</strong> {event.presentation} · <strong>Status:</strong> {safe(event.status, 'Programado')}</p></section></>;
}
function PresentationManagerView({ events }: { events: ZeroLeg[] }) {
  const [version, setVersion] = useState(0);
  const rules = loadPresentationRules();
  const overrides = loadPresentationOverrides();
  const now = new Date();
  const operationalEvents = events
    .filter((event) => !event.placeholder && isOperationalEvent(event))
    .sort((a, b) => eventStartDateTime(a).getTime() - eventStartDateTime(b).getTime());
  const upcoming = operationalEvents.filter((event) => eventEndDateTime(event).getTime() >= now.getTime()).slice(0, 18);
  const visibleUpcoming = upcoming.length ? upcoming : operationalEvents.slice(0, 18);
  const ruleList = Object.values(rules).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 12);
  const refresh = () => setVersion((value) => value + 1);

  function edit(event: ZeroLeg, learning = false) {
    try {
      if (promptPresentation(event, learning)) {
        toast.success(learning ? 'Padrão de apresentação salvo para este hotel/local.' : 'Apresentação manual salva para esta programação.');
        refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui salvar a apresentação.');
    }
  }

  function clearEvent(event: ZeroLeg) {
    clearPresentationOverride(event);
    toast.success('Ajuste manual removido desta programação.');
    refresh();
  }

  function clearRule(event: ZeroLeg) {
    clearPresentationLearning(event);
    toast.success('Aprendizado deste hotel/local removido.');
    refresh();
  }

  return <><Brand back/><section className="cz-panel-head"><h1>Gerenciador de Apresentação</h1><p>Aprende horários por hotel/local e permite ajuste manual quando a escala vier incompleta ou diferente do padrão.</p></section><section className="cz-finance-grid"><KpiCard icon={Clock} title="Hotéis/locais" value={String(Object.keys(rules).length)} detail="padrões aprendidos"/><KpiCard icon={ToggleRight} title="Ajustes manuais" value={String(Object.keys(overrides).length)} detail="por programação"/><KpiCard icon={ShieldCheck} title="Fonte" value="Local" detail="sem credenciais ou sessão"/></section><section className="cz-toolbox"><h2>Próximas programações</h2><p>Toque em “Alterar” para corrigir apenas a programação. Use “Aprender hotel/local” para salvar como padrão para próximas escalas.</p></section><section className="cz-stack-list">{visibleUpcoming.length ? visibleUpcoming.map((event) => { const managed = managedPresentationForEvent(event); return <article className="cz-roster-card compact" key={`pm-${event.id}-${version}`}><div className="cz-roster-main"><span className="cz-roster-icon">{event.kind === 'flight' ? <Plane/> : <BriefcaseBusiness/>}</span><div className="cz-roster-copy"><h3>{rosterEventTitle(event)}</h3><p>{programDateLabel(event)} · Apresentação {managed.presentation || '—'} · {managed.source}</p><small>{presentationLearningLabel(event)} · {event.origin} → {event.destination}</small></div><ChevronRight className="cz-roster-chevron"/></div><div className="cz-tool-actions"><button onClick={() => edit(event, false)}>Alterar</button><button onClick={() => edit(event, true)}>Aprender hotel/local</button><button onClick={() => clearEvent(event)}>Limpar ajuste</button><button onClick={() => clearRule(event)}>Limpar aprendizado</button></div></article>; }) : <article className="cz-empty-real"><Clock/><h2>Nenhuma programação operacional</h2><p>Importe uma escala real para gerenciar apresentações por hotel/local.</p></article>}</section><section className="cz-toolbox"><h2>Padrões aprendidos</h2>{ruleList.length ? ruleList.map((rule) => <p key={rule.key}><strong>{rule.label}</strong><span>{rule.presentation} · {Math.round(rule.confidence * 100)}% confiança · {rule.samples} amostra(s)</span></p>) : <p>Nenhum padrão aprendido ainda. O sistema aprende quando você salva uma apresentação como padrão do hotel/local.</p>}</section></>;
}

function HotelsView({ events }: { events: ZeroLeg[] }) {
  const stays = events.filter((e) => e.kind === 'stay' || e.hotel);
  return <><Brand back/><section className="cz-panel-head"><h1>Hotéis</h1><p>Pernoites, descanso e entorno operacional detectados na escala real.</p></section><section className="cz-stack-list">{stays.length ? stays.map((e) => <article className="cz-roster-card" key={`hotel-${e.id}`}><div className="cz-roster-main"><span className="cz-roster-icon"><Hotel/></span><div className="cz-roster-copy"><h3>{safe(e.hotel, `Hotel em ${city(e.destination)}`)}</h3><p>{dateChip(e.date)} · {e.origin} → {e.destination}</p><small>{safe((e.day as any).hotelAddress || (e.day as any).address, 'Endereço será exibido quando vier na escala/base de hotéis')}</small></div><ChevronRight className="cz-roster-chevron"/></div><div className="cz-routine-strip"><span>Descanso</span><span>Wake-up</span><span>Academia</span><span>Restaurante</span><span>Mercado</span><span>Farmácia</span><span>Lavanderia</span></div></article>) : <article className="cz-empty-real"><Hotel/><h2>Nenhum hotel detectado</h2><p>Quando o parser encontrar pernoites/hotéis ou pernoite diurno, eles aparecerão aqui sem dados mockados.</p></article>}</section></>;
}
function RoutineView({ bundle }: { bundle: BundleState }) {
  let suggestions: any[] = [];
  try { suggestions = buildRoutineSuggestions(analyzeDayLoads(bundle.roster).days, defaultRoutineActivities()).slice(0, 8); } catch {}
  return <><Brand back/><section className="cz-panel-head"><h1>Rotina inteligente</h1><p>Academia, recuperação, alimentação e descanso em função da carga de escala.</p></section><section className="cz-stack-list">{suggestions.length ? suggestions.map((s:any, i:number) => <article className="cz-roster-card" key={i}><div className="cz-roster-main"><span className="cz-roster-icon"><ShieldCheck/></span><div className="cz-roster-copy"><h3>{s.title || s.activity || 'Sugestão de rotina'}</h3><p>{s.reason || s.description || 'Ajustado pela escala.'}</p></div></div><strong className="cz-roster-time">{s.suggestedTime || s.duration || '—'}</strong></article>) : <article className="cz-roster-card"><div className="cz-roster-copy"><h3>Rotina pronta</h3><p>Carregue uma escala para receber recomendações completas.</p></div></article>}</section></>;
}
function DatabaseView({ setBundle, setView }: { setBundle: (b: BundleState) => void; setView: (v: ZeroView) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  useEffect(() => { listSavedRosters(24).then(setItems).catch(() => setItems([])); getDatabaseStatus().then(setStatus).catch(() => setStatus({ message: 'Offline/local' })); }, []);
  async function open(item:any) { try { const data = item?.id ? await openSavedRoster(item.id) : await openActiveRoster(); if (data?.roster) { const c = data.compliance || analyzeSafe(data.roster); setBundle({ roster: data.roster, compliance: c, source: item?.sourceFileName || 'Histórico' }); saveRoster(data.roster, item?.sourceFileName || 'Histórico'); setView('cockpit'); toast.success('Escala aberta.'); } } catch { toast.error('Não consegui abrir o histórico.'); } }
  return <><Brand back/><section className="cz-panel-head"><h1>Histórico e sincronização</h1><p>{status?.message || 'Banco de escalas, offline-first e retomada da escala ativa.'}</p></section><section className="cz-stack-list">{items.length ? items.map((it:any) => <article className="cz-roster-card" key={it.id}><div className="cz-roster-copy"><h3>{it.sourceFileName || `Escala ${it.month}/${it.year}`}</h3><p>{it.createdAt || 'Histórico CrewCheck'}</p></div><button onClick={() => open(it)}>Abrir</button></article>) : <article className="cz-roster-card"><div className="cz-roster-copy"><h3>Nenhum histórico listado</h3><p>Salve a escala na Central funcional para sincronizar.</p></div></article>}</section></>;
}
function CrewToolsView({ bundle }: { bundle: BundleState }) {
  const firstCrew = (bundle.roster.days || []).flatMap((d:any) => d.legs || []).flatMap((l:any) => l.crew || []).slice(0, 8);
  return <><Brand back/><section className="cz-panel-head"><h1>Crew e chefe de cabine</h1><p>Tripulação, adicional de chefe, instrutor e apoio operacional.</p></section><section className="cz-stack-list">{firstCrew.length ? firstCrew.map((c:any, i:number) => <article className="cz-roster-card" key={i}><div className="cz-roster-copy"><h3>{c.name || c.employeeName || 'Tripulante'}</h3><p>{c.role || c.function || 'Crew'}</p></div><strong className="cz-roster-time">{i===0 ? 'Chefe efetivo' : 'Tripulante'}</strong></article>) : <article className="cz-roster-card"><div className="cz-roster-copy"><h3>Regra preservada</h3><p>Quando houver lista de CCM, o primeiro CCM listado é considerado chefe efetivo do voo para fins de adicional.</p></div></article>}</section></>;
}
function MaintenancePreview() { return <><Brand/><section className="cz-maintenance"><article><div className="cz-maint-illu"><Settings size={72}/><Plane size={64}/></div><h1>Site em manutenção</h1><p>Estamos realizando melhorias e atualizações no CrewCheck. Em breve o sistema estará disponível novamente.</p><span><ShieldCheck/> Modo ativado pelo administrador</span><div><Lock/> Apenas administradores podem acessar o painel durante a manutenção.</div><button>Acessar painel admin <ChevronRight/></button><button>Ver status</button><a>Voltar mais tarde</a></article><section><h2>Status da operação <b>Em andamento</b></h2><div><p><CalendarDays/>Escala em atualização</p><p><Bell/>Alertas em revisão</p><p><CloudSun/>Meteorologia sincronizando</p></div></section></section></> }
function ImportPanel({ onUpload }: { onUpload: () => void }) { return <><Brand/><section className="cz-import"><Upload size={56}/><h1>Importar escala oficial</h1><p>Envie o PDF da escala. Antes de salvar, o CrewCheck valida período, tripulante, base, dias, voos e próxima programação para evitar ativar o mês errado.</p><button onClick={onUpload}>Escolher PDF</button></section></>; }

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      result ? resolve(result) : reject(new Error('PDF vazio ou indisponível no dispositivo.'));
    };
    reader.onerror = () => reject(reader.error || new Error('Falha ao preparar o PDF.'));
    reader.readAsDataURL(file);
  });
}

function sanitizePdfImportError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  const message = raw.replace(/\s+/g, ' ').trim();
  if (!message) return 'Não consegui interpretar o PDF.';
  if (/connector|constructor|worker|pdfjs|setting up fake worker|globalworkeroptions|hl/i.test(message)) {
    return 'O leitor local do navegador falhou. Tentei a leitura alternativa segura, mas o PDF ainda não pôde ser interpretado.';
  }
  return message;
}

async function parsePDFOnServer(file: File): Promise<CrewRoster> {
  const dataBase64 = await fileToDataUrl(file);
  const response = await fetch('/api/parse-pdf', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name || 'escala.pdf', dataBase64 }),
  });
  let payload: any = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.detail || payload?.message || 'Leitura alternativa do PDF indisponível.');
  }
  const roster = payload?.roster;
  if (!roster || !Array.isArray(roster.days)) {
    throw new Error('A leitura alternativa não retornou uma escala válida.');
  }
  return roster as CrewRoster;
}

async function parsePDFResilient(file: File): Promise<{ roster: CrewRoster; source: 'local' | 'server-fallback' }> {
  try {
    return { roster: await parsePDF(file), source: 'local' };
  } catch (localError) {
    storage.set('crewcheck_last_pdf_local_error', sanitizePdfImportError(localError));
    const roster = await parsePDFOnServer(file);
    return { roster, source: 'server-fallback' };
  }
}

function OpeningVideo({ onDone }: { onDone: () => void }) {
  const finish = () => { storage.set('crewcheck_intro_seen_v1278', '1'); onDone(); };
  return <section className="cz-opening-video"><video src="/assets/opening/crewcheck-opening.mp4" autoPlay muted playsInline onEnded={finish}/><div><span><Plane/> CrewCheck</span><h1>Roster Intelligence</h1><p>Escala real, rotina, hotéis, academias, trânsito, radar, meteorologia e saída inteligente em um cockpit premium.</p><button onClick={finish}>Entrar no app <ChevronRight/></button></div></section>;
}

function normalizeInitialView(value: string | null): ZeroView {
  if (value === 'roster' || value === 'results' || value === 'result') return 'roster';
  if (value === 'alerts' || value === 'irregularities') return 'alerts';
  if (value === 'manual' || value === 'departure' || value === 'smartDeparture') return 'departure';
  if (value === 'settings') return 'settings';
  if (value === 'import') return 'import';
  if (value === 'features') return 'features';
  if (value === 'radar') return 'radar';
  if (value === 'weather' || value === 'meteo') return 'weather';
  if (value === 'perdiem' || value === 'diarias') return 'perdiem';
  if (value === 'salary' || value === 'salario') return 'salary';
  if (value === 'reports' || value === 'relatorios') return 'reports';
  if (value === 'load' || value === 'carga') return 'load';
  if (value === 'calendar') return 'calendar';
  if (value === 'exports') return 'exports';
  if (value === 'routine') return 'routine';
  if (value === 'wakeup' || value === 'despertador') return 'wakeup';
  if (value === 'hotels' || value === 'hoteis') return 'hotels';
  if (value === 'presentation' || value === 'apresentacao') return 'presentation';
  if (value === 'map' || value === 'mapa') return 'map';
  if (value === 'mycar' || value === 'meucarro' || value === 'carro' || value === 'car') return 'mycar';
  if (value === 'iflight' || value === 'push-iflight') return 'iflight';
  if (value === 'database') return 'database';
  if (value === 'crew') return 'crew';
  return 'cockpit';
}

export default function Home() {
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<ZeroView>(() => normalizeInitialView(sessionStorage.getItem('crewcheck_force_view_once') || sessionStorage.getItem('crewcheck_initial_view')));
  const [bundle, setBundle] = useState<BundleState>(loadRoster());
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const events = useMemo(() => buildLegs(bundle.roster), [bundle.roster]);
  const event = nextFlight(events);
  const flightEvent = nextRealFlight(events);
  const compliance = currentCompliance(bundle);
  const gym = currentGym(bundle);
  useWeatherLandingMonitor(flightEvent);

  useEffect(() => {
    const mode = storage.get('crewcheck_theme_mode', storage.get('crewcheck_light_premium', '0') === '1' ? 'light' : 'dark');
    const effective = mode === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.crewTheme = effective;
    document.documentElement.classList.toggle('dark', effective === 'dark');
    document.documentElement.style.colorScheme = effective;
    storage.set('crewcheck_last_loaded_version', DEFAULT_VERSION);
    const open = () => setDrawer(true);
    const setViewFromEvent = (event: Event) => { const next = (event as CustomEvent).detail; if (next) setView(normalizeInitialView(String(next))); };
    const syncTheme = () => {
      const next = storage.get('crewcheck_theme_mode', 'dark') === 'light' || storage.get('crewcheck_light_premium', '0') === '1' ? 'light' : 'dark';
      document.documentElement.dataset.crewTheme = next;
      document.documentElement.classList.toggle('dark', next === 'dark');
      document.documentElement.style.colorScheme = next;
    };
    const forced = sessionStorage.getItem('crewcheck_force_view_once');
    if (forced) { setView(normalizeInitialView(forced)); sessionStorage.removeItem('crewcheck_force_view_once'); }
    window.addEventListener('crewcheck:open-menu', open);
    window.addEventListener('crewcheck:set-view', setViewFromEvent as EventListener);
    window.addEventListener('crewcheck:theme-change', syncTheme);
    return () => { window.removeEventListener('crewcheck:open-menu', open); window.removeEventListener('crewcheck:set-view', setViewFromEvent as EventListener); window.removeEventListener('crewcheck:theme-change', syncTheme); };
  }, []);

  async function handleFile(inputEvent: ChangeEvent<HTMLInputElement>) {
    const file = inputEvent.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parsePDFResilient(file);
      const roster = parsed.roster;
      const decision = confirmRosterImport(roster, file.name);
      if (!decision.ok) {
        toast.message(decision.toastText || 'Importação cancelada.');
        return;
      }
      const newCompliance = saveRoster(roster, file.name);
      storage.set('crewcheck_last_import_guardian_summary', decision.summaryText);
      storage.set('crewcheck_last_import_guardian_period', decision.periodLabel);
      storage.set('crewcheck_last_pdf_import_source', parsed.source);
      setBundle({ roster, compliance: newCompliance, source: file.name });
      sessionStorage.setItem('crewcheck_force_view_once', 'roster');
      setView('roster');
      toast.success(`${decision.toastText || 'Escala real importada e detalhes liberados.'}${parsed.source === 'server-fallback' ? ' Leitura alternativa concluída.' : ''}`);
      if (!decision.hasFuture) toast.error('A escala importada não possui programação futura após agora.');
      setLocation('/result');
    } catch (error) {
      toast.error(sanitizePdfImportError(error));
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function copyCurrentSummarySilently() {
    try { await copyToClipboard(bundle.roster, compliance); return true; } catch { return false; }
  }

  const actions: QuickActions = {
    upload: () => fileRef.current?.click(),
    pdf: () => { try { const pdf = exportReport(bundle.roster, compliance, gym); pdf.download(); toast.success(`PDF gerado: ${pdf.fileName}`); } catch { toast.error('Não consegui gerar o PDF agora.'); } },
    ics: () => { try { const ics = generateICalendar(bundle.roster, gym); downloadCalendarFile(ics, `crewcheck-${bundle.roster.year}-${String(bundle.roster.month).padStart(2,'0')}.ics`); toast.success('Arquivo ICS gerado.'); } catch { toast.error('Não consegui gerar o ICS.'); } },
    whatsapp: () => { try { copyCurrentSummarySilently(); shareToWhatsApp(bundle.roster, compliance); toast.success('Resumo enviado para o WhatsApp.'); } catch { toast.error('Não consegui abrir WhatsApp.'); } },
    telegram: () => { try { copyCurrentSummarySilently(); shareToTelegram(bundle.roster, compliance); toast.success('Resumo enviado para o Telegram. Se abrir no navegador, use Compartilhar/Abrir no app.'); } catch { toast.error('Não consegui abrir Telegram.'); } },
    copy: () => { copyToClipboard(bundle.roster, compliance).then(ok => ok ? toast.success('Resumo copiado.') : toast.error('Não consegui copiar.')); },
    email: () => { const to = window.prompt('Enviar relatório para qual e-mail?') || ''; if (!to.trim()) return; sendRosterByEmail({ to, roster: bundle.roster, compliance, gym }).then(()=>toast.success('E-mail enviado/solicitado.')).catch(()=>{ const subject = encodeURIComponent('Relatório CrewCheck'); const body = encodeURIComponent('Segue resumo CrewCheck. O PDF pode ser gerado no botão Exportar PDF.'); window.location.href = `mailto:${to}?subject=${subject}&body=${body}`; toast.message('Abrindo app de e-mail como fallback.'); }); },
    google: async () => { try { await connectGoogleCalendar(); const result = await syncRosterToGoogleCalendar(bundle.roster, loadGoogleCalendarSettings(), { gymRecommendations: gym }); toast.success(`Google Calendar: ${(result as any).total || (result as any).created + (result as any).updated || 0} eventos sincronizados.`); } catch { try { googleCalendarIntegrationDiagnostics?.(); } catch {} toast.error('Google Calendar indisponível. Confira login/permissões e ENV do Render.'); } },
    save: () => { saveRosterAnalysis({ roster: bundle.roster, compliance, gym, sourceFileName: bundle.source } as any).then(()=>toast.success('Escala salva no histórico.')).catch(()=>toast.error('Não consegui salvar no histórico agora.')); },
    openActive: () => { openActiveRoster().then(active => { if (active?.roster) { const c = active.compliance || analyzeSafe(active.roster); setBundle({ roster: active.roster, compliance: c, source: 'Escala ativa do banco' }); saveRoster(active.roster, 'Escala ativa do banco'); setView('cockpit'); toast.success('Escala ativa carregada.'); } else { toast.message('Nenhuma escala ativa encontrada. Use Importar escala.'); setView('import'); } }).catch(()=>{ toast.error('Não encontrei escala ativa sincronizada.'); setView('import'); }); },
    logout: () => { logout().finally(() => { window.location.href = '/login'; }); },
    replayIntro: () => { storage.set('crewcheck_intro_seen_v1278', '0'); setShowIntro(true); },
  };

  return <main className="cz-app" data-version={DEFAULT_VERSION} data-view={view}>
    <div className="cz-wallpaper"/>
    <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={handleFile}/>
    {busy && <div className="cz-busy"><Plane/><strong>Interpretando escala...</strong></div>}
    {showIntro && <OpeningVideo onDone={() => setShowIntro(false)}/>}
    <MenuDrawer open={drawer} close={() => setDrawer(false)} view={view} setView={setView} actions={actions}/>
    {view === 'cockpit' && <Cockpit events={events} compliance={compliance} setView={setView} onUpload={actions.upload} openMenu={() => setDrawer(true)}/>}
    {view === 'roster' && <Roster roster={bundle.roster} events={events} setView={setView}/>}
    {view === 'alerts' && <Alerts compliance={compliance}/>}
    {view === 'departure' && <Departure event={event}/>}
    {view === 'mycar' && <CarView event={event}/>}
    {view === 'iflight' && <IFlightPushView actions={actions}/>}
    {view === 'settings' && <SettingsView setView={setView} actions={actions}/>}
    {view === 'maintenance' && <MaintenancePreview/>}
    {view === 'import' && <ImportPanel onUpload={actions.upload}/>}
    {view === 'features' && <FeatureHub bundle={bundle} events={events} setBundle={setBundle} setView={setView} actions={actions}/>}
    {view === 'radar' && <RadarView event={flightEvent}/>}
    {view === 'weather' && <WeatherView event={flightEvent}/>}
    {view === 'perdiem' && <PerDiemView bundle={bundle}/>}
    {view === 'salary' && <SalaryView bundle={bundle}/>}
    {view === 'reports' && <ReportsView bundle={bundle}/>}
    {view === 'load' && <LoadView bundle={bundle}/>}
    {view === 'calendar' && <CalendarToolsView actions={actions}/>}
    {view === 'exports' && <ExportToolsView actions={actions}/>}
    {view === 'routine' && <RoutineView bundle={bundle}/>}
    {view === 'wakeup' && <WakeupView event={event}/>}
    {view === 'hotels' && <HotelsView events={events}/>}
    {view === 'presentation' && <PresentationManagerView events={events}/>}
    {view === 'map' && <MonthlyMapView events={events}/>}
    {view === 'database' && <DatabaseView setBundle={setBundle} setView={setView}/>}
    {view === 'crew' && <CrewToolsView bundle={bundle}/>}
    <BottomNav view={view} setView={setView} openMenu={() => setDrawer(true)}/>
  </main>;
}
