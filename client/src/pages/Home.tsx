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
  Map,
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

type ZeroView =
  | 'cockpit' | 'roster' | 'alerts' | 'departure' | 'settings' | 'maintenance' | 'import' | 'features'
  | 'radar' | 'weather' | 'perdiem' | 'salary' | 'reports' | 'calendar' | 'exports' | 'routine' | 'database' | 'crew' | 'load' | 'wakeup' | 'hotels';

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

const DEFAULT_VERSION = '13.2.0';
const CREWCHECK_UI_CORE_NOTE = 'v13.2.0-hotfix: PR #1 reforçado com próxima programação vigente, diárias/salário reais, despertador e hotéis sem voltar layout antigo';
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
function city(code?: string) {
  const map: Record<string, string> = {
    FOR: 'Fortaleza', GRU: 'São Paulo', BSB: 'Brasília', PMW: 'Palmas', CGH: 'São Paulo', SDU: 'Rio de Janeiro',
    GIG: 'Rio de Janeiro', CNF: 'Belo Horizonte', REC: 'Recife', SSA: 'Salvador', CWB: 'Curitiba', POA: 'Porto Alegre',
    BEL: 'Belém', MAO: 'Manaus', NAT: 'Natal', MCZ: 'Maceió', SLZ: 'São Luís', THE: 'Teresina', AJU: 'Aracaju', VIX: 'Vitória',
  };
  return map[String(code || '').toUpperCase()] || safe(code, 'Aeroporto');
}
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
  try { return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(roster.year || 2026, (roster.month || 7) - 1, 1)); }
  catch { return 'Julho 2026'; }
}
function dayTitle(day: RosterDay) {
  const d = parseDate(day);
  return `${weekday(d)} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
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
  const legs: ZeroLeg[] = [];
  const days = Array.isArray(roster.days) ? roster.days : [];
  days.forEach((day, dayIndex) => {
    const d = parseDate(day);
    const dayLegs = Array.isArray(day.legs) ? day.legs : [];
    if (dayLegs.length) {
      dayLegs.forEach((leg: FlightLeg, legIndex: number) => {
        const anyLeg = leg as any;
        const presentation = time((day as any).dutyReport || anyLeg.presentationTime || anyLeg.reportTime || anyLeg.departureTime, time(anyLeg.departureTime, '—'));
        const departure = time(anyLeg.departureTime || (day as any).departureTime, presentation);
        const arrival = time(anyLeg.arrivalTime || (day as any).dutyDebrief || (day as any).arrivalTime, '—');
        const origin = safe(anyLeg.origin || anyLeg.from || (day as any).origin, roster.base || '—');
        const destination = safe(anyLeg.destination || anyLeg.to || (day as any).destination, roster.base || '—');
        const flightNumber = safe(anyLeg.flightNumber || anyLeg.flight || (day as any).pairingCode, 'VOO');
        legs.push({
          id: `${dayIndex}-${legIndex}-${flightNumber}`,
          day, leg, kind: 'flight', date: d,
          title: `${flightNumber} · ${origin} → ${destination}`,
          subtitle: `Apres. ${presentation} · Chegada ${arrival}${anyLeg.isNextDay || (day as any).isNextDay ? ' +1' : ''} · ${city(origin)} → ${city(destination)}`,
          origin, destination, flightNumber, presentation, departure, arrival,
          aircraft: safe(anyLeg.aircraft || anyLeg.aircraftType || anyLeg.equipment, '—'),
          registration: safe(anyLeg.registration || anyLeg.tailNumber || anyLeg.matricula, '—'),
          gate: safe(anyLeg.gate || (day as any).gate, 'A confirmar'),
          terminal: safe(anyLeg.terminal || (day as any).terminal, 'Terminal a confirmar'),
          status: safe(anyLeg.status || (day as any).status, 'Programado'),
          hotel: safe((day as any).hotel || anyLeg.hotel, ''),
          crew: Array.isArray(anyLeg.crew) ? anyLeg.crew.map((c:any) => safe(c.name || c.employeeName || c.role || c, '')).filter(Boolean) : [],
          routine: [
            `Despertador ${addMinutesToTime(presentation, -90)}`,
            anyLeg.hotel || (day as any).hotel ? `Hotel ${safe(anyLeg.hotel || (day as any).hotel)}` : '',
            `Descanso após chegada ${arrival}`,
            `Academia/restaurante/mercado/farmácia/lavanderia em ${city(destination)}`,
          ].filter(Boolean),
          timeRange: `${departure} → ${arrival}`,

        });
      });
      return;
    }
    const type = String((day as any).type || '').toUpperCase();
    const base = safe((day as any).base || (day as any).airport || (day as any).hotel, roster.base || '—');
    if ((day as any).hotel || type.includes('LAYOVER') || type.includes('HOTEL') || type.includes('PERNOITE')) {
      legs.push({ id: `${dayIndex}-hotel`, day, kind: 'stay', date: d, title: `Estadia diurna · ${base}`, subtitle: `Hotel/pernoite em ${safe((day as any).hotel || city(base), city(base))}`, origin: base, destination: base, flightNumber: 'HOTEL', presentation: time((day as any).dutyReport || (day as any).startTime, '—'), departure: time((day as any).startTime || (day as any).dutyReport, '—'), arrival: time((day as any).endTime || (day as any).dutyDebrief, '—'), hotel: safe((day as any).hotel, ''), status: safe((day as any).status, 'Pernoite'), routine: [`Descanso em ${safe((day as any).hotel || city(base), city(base))}`, `Academia/restaurante/mercado/farmácia/lavanderia em ${city(base)}`], timeRange: safe((day as any).duration || (day as any).dutyHours, 'Pernoite') });
    } else if (type && !['DO', 'OFF', 'FOLGA'].includes(type)) {
      legs.push({ id: `${dayIndex}-duty`, day, kind: 'duty', date: d, title: safe((day as any).pairingCode || type, 'Programação'), subtitle: safe((day as any).description || (day as any).rawText, 'Programação operacional'), origin: base, destination: base, flightNumber: safe((day as any).pairingCode || type, 'DUTY'), presentation: time((day as any).dutyReport, '—'), departure: time((day as any).startTime, time((day as any).dutyReport, '—')), arrival: time((day as any).endTime, time((day as any).dutyDebrief, '—')), timeRange: `${time((day as any).startTime || (day as any).dutyReport, '—')} → ${time((day as any).endTime || (day as any).dutyDebrief, '—')}` });
    }
  });
  return legs.sort((a, b) => {
    const ad = a.date?.getTime?.() || 0;
    const bd = b.date?.getTime?.() || 0;
    if (ad !== bd) return ad - bd;
    return String(a.departure || a.presentation).localeCompare(String(b.departure || b.presentation));
  });
}

function eventStartDateTime(event: ZeroLeg): Date {
  const base = new Date(event.date);
  const raw = event.presentation !== '—' ? event.presentation : event.departure;
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  if (m) base.setHours(Number(m[1]), Number(m[2]), 0, 0);
  else base.setHours(0, 0, 0, 0);
  return base;
}
function eventEndDateTime(event: ZeroLeg): Date {
  const start = eventStartDateTime(event);
  const raw = event.arrival !== '—' ? event.arrival : event.departure !== '—' ? event.departure : event.presentation;
  const m = String(raw || '').match(/(\d{1,2}):(\d{2})/);
  const end = new Date(event.date);
  if (m) {
    end.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (end.getTime() < start.getTime()) end.setDate(end.getDate() + 1);
  } else {
    end.setTime(start.getTime() + (event.kind === 'stay' ? 12 : 6) * 60 * 60 * 1000);
  }
  return end;
}
function isOperationalEvent(event: ZeroLeg) {
  if (event.placeholder) return false;
  const code = `${event.flightNumber} ${(event.day as any)?.type || ''} ${(event.day as any)?.pairingCode || ''}`.toUpperCase();
  if (/(^|\s)(DO|DOF|DOP|OFF|FOLGA|FÉRIAS|FERIAS|EAD)(\s|$)/.test(code)) return false;
  if (code.includes('SOBREAVISO') && !/(VOO|RESERVA|ACION|CHAMAD|LA\d+)/.test(code)) return false;
  return ['flight', 'duty', 'stay'].includes(event.kind);
}
function eventIsNow(event: ZeroLeg, now = new Date()) {
  const start = eventStartDateTime(event).getTime();
  const end = eventEndDateTime(event).getTime() + 2 * 60 * 60 * 1000;
  return now.getTime() >= start - 30 * 60 * 1000 && now.getTime() <= end;
}
function nextFlight(events: ZeroLeg[]) {
  const now = new Date();
  const real = events
    .filter(isOperationalEvent)
    .sort((a, b) => eventStartDateTime(a).getTime() - eventStartDateTime(b).getTime());
  return real.find((e) => eventIsNow(e, now))
    || real.find((e) => eventStartDateTime(e).getTime() >= now.getTime() - 2 * 60 * 60 * 1000)
    || real[0]
    || placeholderLeg();
}
function currentDayAnchor(events: ZeroLeg[]) {
  const now = new Date();
  const current = events.find((e) => isOperationalEvent(e) && eventIsNow(e, now));
  if (current) return current;
  const today = events
    .filter(isOperationalEvent)
    .find((e) => e.date.getFullYear() === now.getFullYear() && e.date.getMonth() === now.getMonth() && e.date.getDate() === now.getDate());
  return today || nextFlight(events);
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
  const items: Array<[ZeroView, string, any]> = [['cockpit','Cockpit',HomeIcon],['roster','Roster',CalendarDays],['alerts','Alerts',Bell],['load','Carga',BriefcaseBusiness],['settings','Menu',Menu]];
  return <nav className="cz-bottom-nav">{items.map(([v, label, Icon]) => {
    const isMenu = v === 'settings';
    return <button key={v} className={(view===v || (isMenu && ['settings','features','exports','calendar','database','routine','crew','radar','weather','perdiem','salary','reports','wakeup','hotels'].includes(view))) ? 'active' : ''} onClick={() => isMenu ? openMenu() : setView(v)}><Icon size={23}/><span>{label}</span>{v==='alerts' && <em>3</em>}</button>;
  })}</nav>;
}
function KpiCard({ icon: Icon, title, value, detail, tone = '' }: { icon: any; title: string; value: string; detail: string; tone?: string }) {
  return <article className={`cz-kpi ${tone}`}><span><Icon size={24}/></span><div><small>{title}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}
function FlightCard({ event, compact = false }: { event: ZeroLeg; compact?: boolean }) {
  const d = event.date;
  return <article className={`cz-flight-card ${compact ? 'compact' : ''}`}>
    <div className="cz-flight-head"><div className="cz-airline"><span className="cz-latam-mark">▰</span><strong>LATAM</strong><em>{event.flightNumber}</em></div><div className="cz-date-chip"><CalendarDays size={19}/><b>{dateChip(d)}</b><small>{weekday(d)}</small></div></div>
    <div className="cz-route"><div><strong>{event.origin}</strong><span>{city(event.origin)}</span></div><div className="cz-route-arc"><i/><Plane size={25}/><i/></div><div><strong>{event.destination}</strong><span>{city(event.destination)}</span></div></div>
    <div className="cz-time-trio"><div><span>Apresentação</span><strong>{event.presentation}</strong><small>◷ Local</small></div><div><span>Decolagem</span><strong>{event.departure}</strong><small>◷ Prevista</small></div><div><span>Chegada</span><strong>{event.arrival}</strong><small>◷ Prevista</small></div></div>
    {!compact && <div className="cz-info-duo"><div><Lock size={25}/><span>Portão</span><strong>{safe(event.gate, 'A confirmar')}</strong><small>{safe(event.terminal, 'Terminal a confirmar')}</small></div><div><Plane size={25}/><span>Status</span><strong className="ok">{safe(event.status, 'Programado')}</strong><small>{safe(event.aircraft, 'Aeronave a confirmar')} · {safe(event.registration, 'Matrícula a confirmar')}</small></div></div>}
    {!compact && Boolean(event.crew?.length) && <div className="cz-crew-line"><UserRound size={18}/><span>Tripulação</span><strong>{event.crew?.slice(0, 4).join(', ')}</strong></div>}
    {!compact && Boolean(event.hotel) && <div className="cz-crew-line"><Hotel size={18}/><span>Hotel</span><strong>{event.hotel}</strong></div>}
    {!compact && Boolean(event.routine?.length) && <div className="cz-routine-strip">{event.routine?.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>}
    {!compact && <div className="cz-roster-actions"><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'weather' }))}><CloudSun/> Meteorologia</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'radar' }))}><Radar/> Radar</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'routine' }))}><Dumbbell/> Rotina</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'wakeup' }))}><Bell/> Despertador</button></div>}
  </article>;
}
function SmartCard({ event, setView }: { event: ZeroLeg; setView: (v: ZeroView) => void }) {
  if (event.placeholder) {
    return <article className="cz-smart-card" onClick={() => setView('import')}><div className="cz-smart-title"><span><Upload size={26}/></span><div><h2>Importar escala real</h2><p>PDF oficial de julho</p></div><ChevronRight/></div><div className="cz-smart-content"><strong>PDF</strong><em>REAL</em><p>Nenhum dado fictício será usado.</p><div><small>Status</small><b>Aguardando escala</b></div></div></article>;
  }
  return <article className="cz-smart-card" onClick={() => setView('departure')}><div className="cz-smart-title"><span><Car size={26}/></span><div><h2>Saída Inteligente</h2><p>Recomendado para sua programação</p></div><ChevronRight/></div><div className="cz-smart-content"><strong>{event.presentation !== '—' ? event.presentation : 'Calcular'}</strong><em>TOMTOM</em><p>Localização atual / hotel → {event.origin}</p><div><small>Tempo real</small><b>API/Trânsito</b></div></div></article>;
}


function MenuDrawer({ open, close, view, setView, actions }: { open: boolean; close: () => void; view: ZeroView; setView: (v: ZeroView) => void; actions: QuickActions }) {
  if (!open) return null;
  const nav: Array<[ZeroView, string, string, any]> = [
    ['cockpit','Cockpit','Próxima programação',HomeIcon], ['roster','Escala completa','Todos os dias e eventos',CalendarDays], ['alerts','Irregularidades','RBAC/ACT',AlertTriangle], ['load','Carga de trabalho','Jornada/carga/limites',BriefcaseBusiness], ['departure','Saída Inteligente','TomTom/hotel',Car],
    ['radar','Radar de voos','Portão e status',Radar], ['weather','Meteorologia','METAR/TAF/Defesa Civil',CloudSun], ['wakeup','Despertador','Alarmes inteligentes',Bell], ['hotels','Hotéis','Pernoite e entorno',Hotel], ['perdiem','Diárias','Semanal/mensal',BriefcaseBusiness], ['salary','Salário','Previsões e adicionais',DollarSign],
    ['reports','Relatórios','Indicadores premium',FileText], ['routine','Rotina','Academia e descanso',ShieldCheck], ['crew','Crew / Chefe','Tripulação e adicional',UserRound], ['calendar','Calendário','Google/ICS',CalendarDays],
    ['exports','Exportar','PDF e compartilhamento',Share2], ['database','Histórico','Banco e sync',Database], ['settings','Configurações','Perfil completo',Settings], ['maintenance','Manutenção','Prévia admin',Lock],
  ];
  const jump = (v: ZeroView) => { setView(v); close(); };
  return <div className="cz-menu-overlay" role="dialog" aria-modal="true">
    <button className="cz-menu-backdrop" onClick={close} aria-label="Fechar menu" />
    <aside className="cz-menu-panel">
      <header><div><span className="cz-logo"><Plane size={24}/></span><strong>Menu CrewCheck</strong><small>Todos os sistemas funcionais</small></div><button onClick={close}><X/></button></header>
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
  const loaded = !event.placeholder && events.length > 0;
  const alertCount = Number((compliance as any)?.alerts?.length || 0);
  return <><Brand onMenu={openMenu}/><section className="cz-title"><small>Cockpit</small><i/></section><section className="cz-kpi-row"><KpiCard icon={ShieldCheck} title="Status RBAC" value={loaded ? 'Analisado' : 'Aguardando'} detail={loaded ? 'Escala real' : 'Importe PDF'}/><KpiCard icon={CalendarDays} title="Eventos" value={String(loaded ? events.length : 0)} detail="Escala carregada" tone="blue"/><KpiCard icon={Bell} title="Alerts" value={String(alertCount)} detail="Confirmados" tone="pink"/></section><section className="cz-section-head"><h2>Próxima Programação</h2><button onClick={() => setView(loaded ? 'roster' : 'import')}>{loaded ? 'Ver todas' : 'Importar'} <ChevronRight size={18}/></button></section>{loaded ? <FlightCard event={event}/> : <article className="cz-empty-real"><Upload/><h2>Nenhuma escala real carregada</h2><p>Suba o PDF oficial de julho para reativar escala completa, detalhes, diárias, radar, rotina, hotéis, academias, trânsito e saída inteligente com dados reais.</p><button onClick={onUpload}>Importar PDF agora</button></article>}<SmartCard event={event} setView={setView}/><section className="cz-shortcuts cz-shortcuts-full"><button onClick={() => setView('features')}><Settings/><strong>Funcionalidades</strong><small>Central completa</small></button><button onClick={() => setView('load')}><BriefcaseBusiness/><strong>Carga</strong><small>Jornada e limites</small></button><button onClick={() => setView('radar')}><Radar/><strong>Radar</strong><small>Gate e status</small></button><button onClick={() => setView('weather')}><CloudSun/><strong>Meteorologia</strong><small>METAR/TAF</small></button><button onClick={() => setView('perdiem')}><BriefcaseBusiness/><strong>Diárias</strong><small>Semanal/mensal</small></button><button onClick={() => setView('salary')}><DollarSign/><strong>Salário</strong><small>Ganhos previstos</small></button><button onClick={() => setView('reports')}><FileText/><strong>Relatórios</strong><small>Indicadores</small></button><button onClick={() => setView('routine')}><Dumbbell/><strong>Rotina</strong><small>Academias/hotéis</small></button><button onClick={onUpload}><Upload/><strong>Importar PDF</strong><small>Escala oficial</small></button></section></>;
}
function Roster({ roster, events, setView }: { roster: CrewRoster; events: ZeroLeg[]; setView: (v: ZeroView) => void }) {
  const days = Array.isArray(roster.days) ? [...roster.days].sort((a,b)=>parseDate(a).getTime()-parseDate(b).getTime()) : [];
  const first = currentDayAnchor(events);
  const [selected, setSelected] = useState<ZeroLeg | null>(null);
  const hasRoster = days.length > 0;
  return <><Brand back/><section className="cz-panel-head"><h1>Escala completa</h1><p>{safe(roster.crewName, 'Tripulante')} · {hasRoster ? monthLong(roster) : 'sem escala real'} · Base {safe(roster.base, '—')}</p></section>{hasRoster ? <><section className="cz-roster-date"><span>{weekday(first.date)}</span><strong>{pad2(first.date.getDate())}</strong><em>{new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(first.date).replace('.','').toUpperCase()}</em><b>{first.date.toDateString() === new Date().toDateString() ? 'Hoje' : 'Próximo evento'}</b></section><section className="cz-money-row"><div><BriefcaseBusiness/><span>Eventos</span><strong>{events.length}</strong></div><div><DollarSign/><span>Dias</span><strong>{days.length}</strong></div></section><section className="cz-roster-actions"><button onClick={() => setView('import')}><Upload/> Importar PDF</button><button onClick={() => setView('exports')}><Share2/> Exportar</button><button onClick={() => setView('calendar')}><CalendarDays/> Calendário</button></section><section className="cz-stack-list">{events.map(e => <article className={`cz-roster-card ${e.kind === 'stay' ? 'stay' : ''}`} key={e.id} onClick={() => setSelected(e)}><div className="cz-roster-main"><span className="cz-roster-icon">{e.kind === 'flight' ? <Plane/> : e.kind === 'stay' ? <Hotel/> : <BriefcaseBusiness/>}</span><div className="cz-roster-copy"><h3>{e.title}</h3><p>{e.subtitle}</p></div><ChevronDown className="cz-roster-chevron"/></div><strong className="cz-roster-time">{e.timeRange}</strong></article>)}</section><section className="cz-complete-days"><h2>Todos os dias publicados</h2>{days.map((day, index) => { const dayEvents = events.filter(e => e.day === day); const d = parseDate(day); return <article key={`${day.date}-${index}`} onClick={() => dayEvents[0] && setSelected(dayEvents[0])}><header><strong>{weekday(d)} {pad2(d.getDate())}/{pad2(d.getMonth()+1)}</strong><span>{safe((day as any).type || (day as any).pairingCode, '—')}</span></header><p>{safe((day as any).pairingCode || (day as any).description || (day as any).rawText || (day as any).hotel, 'Dia publicado sem observação textual')}</p><small>Apresentação {time((day as any).dutyReport || (day as any).startTime)} · Término {time((day as any).dutyDebrief || (day as any).endTime)} · Voos {(day.legs || []).length}</small></article>; })}</section></> : <article className="cz-empty-real"><Upload/><h2>Escala real não carregada</h2><p>Os dados fictícios foram removidos. Use o botão de importar para carregar o PDF oficial e abrir os detalhes reais.</p><button onClick={() => setView('import')}>Importar escala PDF</button></article>}{selected && <section className="cz-detail-modal" role="dialog" aria-modal="true"><button className="cz-detail-backdrop" onClick={() => setSelected(null)} aria-label="Fechar detalhes"/><article><header><div><small>Detalhes da escala</small><h2>{selected.title}</h2><p>{dayTitle(selected.day)}</p></div><button onClick={() => setSelected(null)}><X/></button></header><div className="cz-detail-grid"><div><span>Apresentação</span><strong>{selected.presentation}</strong></div><div><span>Decolagem/Início</span><strong>{selected.departure}</strong></div><div><span>Chegada/Fim</span><strong>{selected.arrival}</strong></div><div><span>Trecho</span><strong>{selected.origin} → {selected.destination}</strong></div><div><span>Tipo</span><strong>{safe((selected.day as any).type, selected.kind)}</strong></div><div><span>Código</span><strong>{selected.flightNumber}</strong></div><div><span>Aeronave</span><strong>{safe(selected.aircraft, '—')}</strong></div><div><span>Matrícula</span><strong>{safe(selected.registration, '—')}</strong></div><div><span>Portão/Terminal</span><strong>{safe(selected.gate, '—')} · {safe(selected.terminal, '—')}</strong></div><div><span>Status</span><strong>{safe(selected.status, 'Programado')}</strong></div><div><span>Hotel</span><strong>{safe(selected.hotel, '—')}</strong></div></div><p>{selected.subtitle}</p>{Boolean(selected.crew?.length) && <p>Tripulação: {selected.crew?.join(', ')}</p>}<footer><button onClick={() => setView('departure')}><Car/> Saída inteligente</button><button onClick={() => setView('radar')}><Radar/> Radar</button><button onClick={() => setView('weather')}><CloudSun/> Meteorologia</button></footer></article></section>}</>;
}
function Alerts({ compliance }: { compliance: ComplianceResult | null }) {
  const alerts = ((compliance as any)?.alerts || []);
  const list = alerts.slice(0, 12);
  return <><Brand back/><section className="cz-panel-head"><h1>Irregularidades e alertas</h1><p>RBAC 117, ACT, repouso, jornada, sobreaviso, reserva e acionamentos. Sem alertas fictícios.</p></section>{list.length ? <section className="cz-alert-stack">{list.map((a: any, idx: number) => <article className={a.severity === 'error' ? 'danger' : 'warn'} key={`${a.title}-${idx}`}><AlertTriangle/><div><h2>{a.title}</h2><p>{a.description}</p><span>{a.severity === 'error' ? 'Confirmada' : 'Atenção'}</span><b>Confiança: {a.severity === 'error' ? 'alta' : 'média'}</b></div><ChevronRight/></article>)}</section> : <article className="cz-empty-real"><ShieldCheck/><h2>Nenhuma irregularidade confirmada</h2><p>Carregue a escala real para que o motor regulatório refaça a análise completa.</p></article>}<article className="cz-alert-detail"><h2>Detalhes regulatórios <b>{list.length ? 'Ativo' : 'Aguardando escala'}</b></h2><div><p><strong>O que o sistema avalia</strong>Jornada, repouso, madrugadas, limites, reserva, sobreaviso, acionamento, pernoite e alterações.</p><p><strong>Dados usados</strong>Somente a escala importada ou sincronizada. Dados demonstrativos foram removidos.</p></div><footer><button>Ensinar falso positivo</button><button>Ver base regulatória</button></footer></article></>;
}
function Departure({ event }: { event: ZeroLeg }) {
  if (event.placeholder) return <><Brand back/><article className="cz-empty-real"><Car/><h2>Saída Inteligente aguardando escala real</h2><p>Importe o PDF para calcular saída com TomTom, trânsito real, origem/hotel, aeroporto e pós-pouso até o hotel.</p></article></>;
  return <><Brand back/><section className="cz-departure"><article className="cz-depart-hero"><span>SAÍDA RECOMENDADA</span><strong>{event.presentation !== '—' ? event.presentation : 'Calcular'}</strong><em>TOMTOM</em><h2>Localização atual / hotel → {event.origin}</h2><p>Próxima programação · apresentação {event.presentation}</p></article><div className="cz-depart-kpis"><div><Clock/>Chegar<strong>{event.presentation}</strong></div><div><Clock/>Trânsito<strong>Real/API</strong></div><div><ShieldCheck/>Status<strong>Monitorando</strong></div></div><article className="cz-map-card"><header><b>TomTom</b><span>principal</span></header><div className="cz-map-canvas"><i/><em/><b/><span className="cz-map-label cz-map-label-a">Origem/hotel</span><span className="cz-map-label cz-map-label-b">{event.origin}</span><small className="cz-map-road">Trânsito real quando API estiver configurada</small></div><ul><li><Radar/><span><strong>Localização dinâmica <b>ativa</b></strong><small>Ajustes em tempo real com base no tráfego.</small></span></li><li><Plane/><span><strong>Ao chegar no aeroporto</strong><small>Pausar monitoramento até o pouso.</small></span></li><li><Car/><span><strong>Após pouso</strong><small>Estimar tempo até o hotel automaticamente.</small></span></li></ul><footer><button><Map/> Abrir mapa</button><button><Menu/> Ver detalhes</button></footer></article></section></>;
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
  return <><Brand back/><section className="cz-settings"><article className="cz-profile"><UserRound/><div><h2>{user?.name || 'Bruno Saraiva'}</h2><p>{safe((user as any)?.role, 'Tripulante')}</p><span>Premium</span><b>Beta</b></div><ChevronRight/></article><h3>Operacional</h3><ToggleSetting icon={Radar} label="TomTom como API principal" storageKey="crewcheck_tomtom_primary"/><ToggleSetting icon={Map} label="Atualizar localização em rota" storageKey="crewcheck_live_location"/><ToggleSetting icon={Plane} label="Pausar ao chegar no aeroporto" storageKey="crewcheck_pause_at_airport"/><ToggleSetting icon={Building2} label="Após pouso calcular tempo até hotel" storageKey="crewcheck_after_landing_hotel"/><ToggleSetting icon={CloudSun} label="Atualização de meteorologia" storageKey="crewcheck_weather_hourly" detail="A cada 60 min"/><ToggleSetting icon={Sun} label="Modo claro premium" storageKey="crewcheck_light_premium" defaultOn={false}/><h3>Perfil</h3><FieldSetting icon={Globe2} label="País do telefone" storageKey="crewcheck_phone_country" placeholder="Brasil +55"/><FieldSetting icon={Phone} label="Telefone do despertador" storageKey="crewcheck_wakeup_phone" placeholder="61996071663"/><FieldSetting icon={Building2} label="Base virtual" storageKey="crewcheck_virtual_base" placeholder="Ex.: BSB / CGH / GRU"/><ToggleSetting icon={GraduationCap} label="Sou instrutor" storageKey="crewcheck_instructor" defaultOn={false}/><h3>Notificações e concierge</h3><ToggleSetting icon={Bell} label="Notificações via Telegram" storageKey="crewcheck_telegram_notifications"/><ToggleSetting icon={Car} label="Alertas de trânsito e saída" storageKey="crewcheck_traffic_alerts"/><ToggleSetting icon={Wifi} label="Concierge operacional" storageKey="crewcheck_concierge"/><section className="cz-settings-actions"><button onClick={saveProfile}><Save/> Salvar perfil</button><button onClick={() => setView('features')}><Settings/> Central funcional</button><button onClick={actions.replayIntro}><PlayCircle/> Reexibir introdução</button><button onClick={actions.openActive}><RotateCcw/> Abrir escala ativa</button><button onClick={actions.logout}><LogOut/> Sair</button>{admin && <button onClick={() => setView('maintenance')}><Lock/> Prévia manutenção</button>}{admin && <button onClick={() => enableMaintenance(true)}><Lock/> Ativar manutenção</button>}{admin && <button onClick={() => enableMaintenance(false)}><ShieldCheck/> Desativar manutenção</button>}</section></section></>;
}

function FeatureHub({ bundle, events, setBundle, setView, actions }: { bundle: BundleState; events: ZeroLeg[]; setBundle: (b: BundleState) => void; setView: (v: ZeroView) => void; actions: QuickActions }) {
  const compliance = currentCompliance(bundle);
  const gym = currentGym(bundle);
  return <><Brand back/><section className="cz-panel-head"><h1>Central funcional</h1><p>Todos os motores antigos religados no novo layout: parser, RBAC/ACT, diárias, salário, radar, meteorologia, exportação, calendário e histórico.</p></section><section className="cz-feature-grid"><button onClick={actions.upload}><Upload/><strong>Importar escala</strong><small>PDF AIMS / CrewRoster</small></button><button onClick={() => setView('roster')}><CalendarDays/><strong>Escala completa</strong><small>{events.length} eventos detectados</small></button><button onClick={() => setView('alerts')}><AlertTriangle/><strong>Irregularidades</strong><small>{(compliance as any)?.alerts?.length || 0} alertas</small></button><button onClick={() => setView('load')}><BriefcaseBusiness/><strong>Carga</strong><small>Jornada e limites</small></button><button onClick={() => setView('departure')}><Car/><strong>Saída Inteligente</strong><small>TomTom / hotel / pós-pouso</small></button><button onClick={() => setView('wakeup')}><Bell/><strong>Despertador Inteligente</strong><small>Antes da apresentação</small></button><button onClick={() => setView('radar')}><Radar/><strong>Radar de voos</strong><small>Portão e status</small></button><button onClick={() => setView('weather')}><CloudSun/><strong>Meteorologia</strong><small>METAR/TAF e Defesa Civil</small></button><button onClick={() => setView('perdiem')}><BriefcaseBusiness/><strong>Diárias</strong><small>Semanal e mensal</small></button><button onClick={() => setView('salary')}><DollarSign/><strong>Salário</strong><small>Chefe/instrutor/ganhos</small></button><button onClick={() => setView('routine')}><ShieldCheck/><strong>Rotina</strong><small>Academia e descanso</small></button><button onClick={() => setView('hotels')}><Hotel/><strong>Hotéis</strong><small>Pernoite e entorno</small></button><button onClick={() => setView('crew')}><UserRound/><strong>Crew / Chefe</strong><small>Tripulação e adicional</small></button><button onClick={() => setView('calendar')}><CalendarDays/><strong>Calendário</strong><small>Google Calendar / ICS</small></button><button onClick={() => setView('exports')}><FileText/><strong>Exportar</strong><small>PDF, WhatsApp, e-mail</small></button><button onClick={() => setView('settings')}><Settings/><strong>Configurações</strong><small>Perfil completo</small></button><button onClick={() => setView('database')}><Database/><strong>Histórico</strong><small>Sincronização e offline</small></button></section><section className="cz-toolbox"><h2>Ações rápidas</h2><div className="cz-tool-actions"><button onClick={actions.pdf}>Gerar PDF</button><button onClick={actions.ics}>Gerar ICS</button><button onClick={actions.whatsapp}>WhatsApp</button><button onClick={actions.telegram}>Telegram</button><button onClick={actions.email}>E-mail</button><button onClick={actions.copy}>Copiar resumo</button><button onClick={actions.google}>Google Calendar</button><button onClick={actions.save}>Salvar histórico</button><button onClick={actions.openActive}>Abrir ativa</button></div></section><section className="cz-mini-status"><p><strong>Fonte:</strong> {bundle.source}</p><p><strong>Eventos:</strong> {events.length} · <strong>Alertas:</strong> {(compliance as any)?.alerts?.length || 0} · <strong>Academia:</strong> {gym.length}</p></section></>;
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
function ImportPanel({ onUpload }: { onUpload: () => void }) { return <><Brand/><section className="cz-import"><Upload size={56}/><h1>Importar escala oficial</h1><p>Envie o PDF da escala para preencher Cockpit, Roster, Alertas, Diárias e Saída Inteligente no novo visual.</p><button onClick={onUpload}>Escolher PDF</button></section></>; }

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
  const [showIntro, setShowIntro] = useState(() => storage.get('crewcheck_intro_seen_v1278', '0') !== '1');
  const events = useMemo(() => buildLegs(bundle.roster), [bundle.roster]);
  const event = nextFlight(events);
  const compliance = currentCompliance(bundle);
  const gym = currentGym(bundle);

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
      const roster = await parsePDF(file);
      const newCompliance = saveRoster(roster, file.name);
      setBundle({ roster, compliance: newCompliance, source: file.name });
      setView('roster');
      toast.success('Escala real importada e detalhes liberados.');
      setLocation('/result');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui interpretar o PDF.');
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
    {view === 'settings' && <SettingsView setView={setView} actions={actions}/>}
    {view === 'maintenance' && <MaintenancePreview/>}
    {view === 'import' && <ImportPanel onUpload={actions.upload}/>}
    {view === 'features' && <FeatureHub bundle={bundle} events={events} setBundle={setBundle} setView={setView} actions={actions}/>}
    {view === 'radar' && <RadarView event={event}/>}
    {view === 'weather' && <WeatherView event={event}/>}
    {view === 'perdiem' && <PerDiemView bundle={bundle}/>}
    {view === 'salary' && <SalaryView bundle={bundle}/>}
    {view === 'reports' && <ReportsView bundle={bundle}/>}
    {view === 'load' && <LoadView bundle={bundle}/>}
    {view === 'calendar' && <CalendarToolsView actions={actions}/>}
    {view === 'exports' && <ExportToolsView actions={actions}/>}
    {view === 'routine' && <RoutineView bundle={bundle}/>}
    {view === 'wakeup' && <WakeupView event={event}/>}
    {view === 'hotels' && <HotelsView events={events}/>}
    {view === 'database' && <DatabaseView setBundle={setBundle} setView={setView}/>}
    {view === 'crew' && <CrewToolsView bundle={bundle}/>}
    <BottomNav view={view} setView={setView} openMenu={() => setDrawer(true)}/>
  </main>;
}
