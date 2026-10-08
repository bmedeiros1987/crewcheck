import { rosterDisplayCompare, rosterDisplayIso, rosterInstantIso, rosterLabelDate, rosterStrictInstant, ROSTER_DISPLAY_TIME_ZONE } from '@/lib/rosterDisplayDate';
import { useEffect, useMemo, useState } from 'react';
import { summarizeForecastRows } from '@/lib/financialForecastPeriods';
import { peekPendingNavigationContext } from '@/lib/navigationContext';
import { consumePendingRosterFocus } from '@/lib/rosterFocus';
import {
  Banknote,
  BedDouble,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Clock,
  Coffee,
  Dumbbell,
  GraduationCap,
  Home,
  Hotel,
  LayoutGrid,
  List,
  MapPin,
  Moon,
  Plane,
  RotateCcw,
  Route,
  ShieldCheck,
  Sparkles,
  Table2,
  Utensils,
  WalletCards,
} from 'lucide-react';
import { V139Header } from '@/components/v139/Shell';
import { AimsRosterTable } from './AimsRosterTable';
import { CalendarRosterView } from './CalendarRosterView';
import '@/components/v139/v139.css';
import '@/launch-v13-9-1.css';
import { setPendingNavigationContext } from '@/lib/navigationContext';
import '@/components/v1397/roster-premium.css';
import { useRosterLayout } from './useRosterLayout';
import './roster-layout.css';

type RosterEvent = {
  id: string;
  operationalTimeZone?: string;
  kind?: string;
  title?: string;
  subtitle?: string;
  date?: Date | string;
  day?: Record<string, any>;
  leg?: Record<string, any>;
  origin?: string;
  destination?: string;
  flightNumber?: string;
  presentation?: string;
  departure?: string;
  arrival?: string;
  hotel?: string;
  routine?: string[];
  canonical?: { date?: string; publishedDay?: { date?: string; type?: string; pairingCode?: string }; kind?: string; startDateTime?: string; endDateTime?: string; groundBeforeMinutes?: number; showPresentation?: boolean };
};

type ProgramMode = 'operating' | 'extra' | 'stay' | 'rest' | 'journey-rest' | 'reserve' | 'standby' | 'training' | 'duty';

type PerDiemItem = {
  eventId?: string;
  iso: string;
  label: string;
  value: number;
  currency: string;
  convertedBRL: number | null;
  airport?: string;
};

type FlightEarningItem = {
  id: string;
  km: number;
  dayKm: number;
  nightKm: number;
  dayRateApplied: number;
  nightRateApplied: number;
  total: number;
  payRule?: string;
};

type RosterFinance = {
  perdiem?: {
    rows?: PerDiemItem[];
    monthly?: number | null;
    monthlySummary?: ReturnType<typeof summarizeForecastRows>;
    currencySummary?: string;
    pendingCurrencies?: string[];
  };
  salary?: {
    rows?: FlightEarningItem[];
    kmTotal?: number;
    production?: number;
    configured?: boolean;
  };
};

function dateOf(event: RosterEvent) {
  return rosterStrictInstant(event.canonical?.startDateTime || event.date) || new Date(NaN);
}

function isoFromDate(value: Date) {
  return rosterInstantIso(value, ROSTER_DISPLAY_TIME_ZONE) || '';
}

function isoOf(event: RosterEvent) {
  return rosterDisplayIso(event) || '';
}

function monthOf(event: RosterEvent) {
  return isoOf(event).slice(0, 7);
}

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function formatDate(date: Date | null) {
  if (!date || !Number.isFinite(date.getTime())) return 'Data não confirmada';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: ROSTER_DISPLAY_TIME_ZONE, weekday: 'long', day: '2-digit', month: 'long' }).format(date);
}

function duration(event: RosterEvent) {
  if (event.canonical?.kind === 'journey-rest') {
    const minutes = Number((event.canonical as any).restMinutes);
    return Number.isFinite(minutes) ? Math.max(0, minutes / 60) : 0;
  }
  const start = new Date(event.canonical?.startDateTime || 0);
  const end = new Date(event.canonical?.endDateTime || 0);
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? Math.max(0, (end.getTime() - start.getTime()) / 3600000) : 0;
}

function eventCode(event: RosterEvent) {
  return `${event.day?.type || ''} ${event.day?.pairingCode || ''} ${event.title || ''} ${event.flightNumber || ''}`.toUpperCase();
}

function workMode(event: RosterEvent): ProgramMode {
  const code = eventCode(event);
  if (event.canonical?.kind === 'journey-rest') return 'journey-rest';
  if (event.kind === 'stay' || /PERNOITE|ESTADIA|DESCANSO_BASE_CONTINUIDADE/.test(code)) return 'stay';
  if (event.canonical?.kind === 'rest') return 'rest';
  if (event.kind === 'flight') {
    const work = `${event.leg?.workType || ''} ${event.title || ''}`.toUpperCase();
    return /(^|\s)(PS|PAX|DH|EXTRA|PASSAGEIRO)(\s|$)/.test(work) ? 'extra' : 'operating';
  }
  if (/\b(ASB|RES|RESERVA|RSV)\b/.test(code)) return 'reserve';
  if (/\b(HSB|HSBE|SOBREAVISO)\b/.test(code)) return 'standby';
  if (/\b(CRM|TREIN|TRAIN|SIM|CHECK|CBF|EMER)\b/.test(code)) return 'training';
  return 'duty';
}

function cardTitle(event: RosterEvent, mode: ProgramMode) {
  const code = String(event.day?.type || event.day?.pairingCode || '').toUpperCase();
  if (mode === 'rest') {
    if (/(DO|DOF|DOP|OFF)/.test(code)) return `Folga publicada${code ? ` · ${code}` : ''}`;
    return `Descanso publicado${code ? ` · ${code}` : ''}`;
  }
  if (mode === 'stay') {
    const location = event.destination || event.origin || event.day?.base || '';
    return /DESCANSO_BASE/.test(code) ? `Descanso entre jornadas na base · ${location}` : `Pernoite em ${location || 'localidade'}`;
  }
  if (mode === 'journey-rest') return 'Repouso entre jornadas';
  if (mode === 'operating' || mode === 'extra') return `${event.flightNumber || 'Voo'} · ${event.origin || '—'} → ${event.destination || '—'}`;
  if (mode === 'reserve') return `Reserva · ${event.day?.pairingCode || event.day?.type || event.title || 'programação publicada'}`;
  if (mode === 'standby') return `Sobreaviso · ${event.day?.pairingCode || event.day?.type || event.title || 'programação publicada'}`;
  if (mode === 'training') return `Treinamento · ${event.day?.pairingCode || event.day?.type || event.title || 'programação publicada'}`;
  return String(event.day?.pairingCode || event.day?.type || event.title || 'Programação');
}

const modeMeta: Record<ProgramMode, { label: string; shortLabel: string }> = {
  operating: { label: 'Voo tripulando', shortLabel: 'Tripulando' },
  extra: { label: 'Voo de deslocamento ou extra', shortLabel: 'Extra' },
  stay: { label: 'Pernoite ou descanso', shortLabel: 'Pernoite' },
  rest: { label: 'Folga ou descanso publicado', shortLabel: 'Folga' },
  'journey-rest': { label: 'Repouso entre jornadas · não operacional', shortLabel: 'Repouso' },
  reserve: { label: 'Reserva presencial', shortLabel: 'Reserva' },
  standby: { label: 'Sobreaviso', shortLabel: 'Sobreaviso' },
  training: { label: 'Treinamento', shortLabel: 'Treinamento' },
  duty: { label: 'Programação operacional', shortLabel: 'Programação' },
};

const paletteA11y: Partial<Record<ProgramMode, string>> = {
  operating: 'Verde · voo tripulando',
  extra: 'Cinza · deslocamento/extra',
  stay: 'Roxo · pernoite ou descanso',
  'journey-rest': 'Azul · repouso entre jornadas, não operacional',
};

function modeIcon(mode: ProgramMode, atBase = false) {
  if (mode === 'operating' || mode === 'extra') return <Plane/>;
  if (mode === 'stay') return atBase ? <Home/> : <BedDouble/>;
  if (mode === 'reserve') return <BriefcaseBusiness/>;
  if (mode === 'standby') return <Moon/>;
  if (mode === 'training') return <GraduationCap/>;
  if (mode === 'journey-rest') return <Moon/>;
  return <ShieldCheck/>;
}

function mealIcon(label: string) {
  if (/café/i.test(label)) return <Coffee/>;
  if (/ceia/i.test(label)) return <Moon/>;
  return <Utensils/>;
}

function money(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'Não calculável';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function currencyMoney(value: number, currency = 'BRL') {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

function readableHours(value: number) {
  const total = Math.round(value * 60);
  if (!total) return '—';
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours ? `${hours}h` : ''}${minutes ? ` ${minutes}min` : ''}`.trim();
}

function publishedClock(value?: string | null) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` : '';
}

function publishedProgramWindow(event: RosterEvent) {
  return {
    start: publishedClock(event.day?.dutyReport || event.day?.startTime || event.departure),
    end: publishedClock(event.day?.dutyDebrief || event.day?.endTime || event.arrival),
  };
}

export default function RosterLaunchView({ events, finance, financeMonth, setView }: { events: RosterEvent[]; finance?: RosterFinance; financeMonth?: string; setView: (view: any) => void }) {
  const { layout, zoom, choose, chooseZoom, message } = useRosterLayout();
  const allOrdered = useMemo(() => [...events]
    .filter((event) => !event.id?.includes('placeholder'))
    .sort(rosterDisplayCompare), [events]);
  const months = useMemo(() => Array.from(new Set(allOrdered.map(monthOf).filter(Boolean))).sort(), [allOrdered]);
  const currentMonth = isoFromDate(new Date()).slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(() => months.includes(currentMonth) ? currentMonth : months[0] || currentMonth);
  const [selectedDay, setSelectedDay] = useState('');
  const [focusedEventId,setFocusedEventId] = useState<string>();
  const [pendingRosterFocusIso, setPendingRosterFocusIso] = useState<string | null>(null);
  const [rosterFocusStatus, setRosterFocusStatus] = useState('');
  useEffect(() => {
    if (months.length && !months.includes(selectedMonth)) setSelectedMonth(months.includes(currentMonth) ? currentMonth : months[0]);
  }, [months.join('|'), selectedMonth, currentMonth]);
  useEffect(() => {
    const context = peekPendingNavigationContext('roster');
    const focus = consumePendingRosterFocus();
    if (!focus && !context?.programId) return;
    const focusedEvent = context?.programId ? allOrdered.find(event => event.id === context.programId) : allOrdered.find(event => dateOf(event).getTime() === focus?.getTime());
    if (context?.sourceView === 'home-roster') { choose('aims', 'day'); setFocusedEventId(focusedEvent?.id); }
    const iso = focusedEvent ? isoOf(focusedEvent) : '';
    if (!iso) { setRosterFocusStatus('A data operacional da programação não está confirmada. Consulte os itens com data não confirmada.'); return; }
    const month = iso.slice(0, 7);
    if (!months.includes(month)) {
      setRosterFocusStatus('A programação aberta no FlightDeck não está mais neste período da escala.');
      return;
    }
    setSelectedDay(iso);
    setPendingRosterFocusIso(iso);
    if (selectedMonth !== month) setSelectedMonth(month);
  }, []);
  useEffect(() => {
    if (!pendingRosterFocusIso || selectedMonth !== pendingRosterFocusIso.slice(0, 7)) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-roster-iso="${pendingRosterFocusIso}"]`);
      if (!target) {
        setRosterFocusStatus('A data da programação não está mais disponível nesta escala.');
        setPendingRosterFocusIso(null);
        return;
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (target.tabIndex >= 0) target.focus({ preventScroll: true });
      const [year, month, day] = pendingRosterFocusIso.split('-');
      setRosterFocusStatus(`Programação localizada em ${day}/${month}/${year}.`);
      setPendingRosterFocusIso(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingRosterFocusIso, selectedMonth, layout, zoom]);
  const ordered = useMemo(() => allOrdered.filter((event) => monthOf(event) === selectedMonth), [allOrdered, selectedMonth]);
  const financeAvailable = !financeMonth || selectedMonth === financeMonth;
  const scopedFinance = financeAvailable ? finance : undefined;
  const unconfirmed = allOrdered.filter(event => !isoOf(event));
  const groups = Array.from(ordered.reduce((map, event) => {
    const iso = isoOf(event);
    const group = map.get(iso) || { iso, date: rosterLabelDate(event), events: [] as RosterEvent[] };
    group.events.push(event);
    map.set(iso, group);
    return map;
  }, new Map<string, { iso: string; date: Date | null; events: RosterEvent[] }>()).values());
  const activeDay = selectedDay.startsWith(`${selectedMonth}-`) ? selectedDay : groups[0]?.iso || `${selectedMonth}-01`;
  const visibleEvents = zoom === 'day' ? ordered.filter(event => isoOf(event) === activeDay) : ordered;
  const timedEvents = visibleEvents.filter(event => Number.isFinite(dateOf(event).getTime()));
  const civilOnlyEvents = visibleEvents.filter(event => !Number.isFinite(dateOf(event).getTime()));
  // Consecutive runs retain canonical chronology when published dates recur
  // across a journey-rest interval. The civil map above serves month metrics.
  const visibleGroups = timedEvents.reduce((runs, event) => {
    const iso = isoOf(event), previous = runs[runs.length - 1];
    if (previous?.iso === iso) previous.events.push(event);
    else runs.push({ iso, date: rosterLabelDate(event), events: [event] });
    return runs;
  }, [] as { iso: string; date: Date | null; events: RosterEvent[] }[]);
  function selectDay(iso: string) {
    setSelectedDay(iso);
    chooseZoom('day');
  }
  const salaryRows = scopedFinance?.salary?.rows || [];
  const perDiemRows = scopedFinance?.perdiem?.rows || [];
  const selectedEventIds = new Set(ordered.map((event) => event.id));
  const selectedSalaryRows = salaryRows.filter((row) => selectedEventIds.has(row.id));
  const selectedPerDiemRows = perDiemRows.filter((row) => String(row.iso || '').startsWith(`${selectedMonth}-`));
  const salaryByEvent = new Map(selectedSalaryRows.map((row) => [row.id, row]));
  const firstEventByDay = new Map(groups.map((group) => [group.iso, group.events[0]?.id]));
  const perDiemForEvent = (event: RosterEvent) => selectedPerDiemRows.filter((row) => row.eventId === event.id || (!row.eventId && row.iso === isoOf(event) && firstEventByDay.get(row.iso) === event.id));
  const uniqueDays = groups.length;
  const flights = ordered.filter((event) => ['operating', 'extra'].includes(workMode(event))).length;
  const stays = ordered.filter((event) => workMode(event) === 'stay').length;
  const production = selectedSalaryRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const totalKm = selectedSalaryRows.reduce((sum, row) => sum + Number(row.km || 0), 0);
  const perDiemSummary = scopedFinance?.perdiem?.monthlySummary ?? summarizeForecastRows(selectedPerDiemRows);
  const perDiemTotal = perDiemSummary.convertedTotalBRL;
  const pendingCurrencies = perDiemSummary.pendingCurrencies;
  const dutyHours = ordered.filter((event) => !['stay', 'rest', 'journey-rest'].includes(workMode(event))).reduce((sum, event) => sum + duration(event), 0);
  const todayIso = isoFromDate(new Date());

  function goToday() {
    const month = todayIso.slice(0, 7);
    if (months.includes(month)) { setSelectedMonth(month); setSelectedDay(todayIso); }
    window.setTimeout(() => document.querySelector(`[data-roster-iso="${todayIso}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  return <div className="cc-roster-premium-v1397">
    <V139Header title="Escala inteligente" detail="Programações e horários publicados."/>

    <div className="cz-roster-actions cc-share-entry"><button type="button" onClick={() => { setPendingNavigationContext({sourceView:'roster',targetView:'community',programId:'share-roster',returnView:'roster',policy:'once'}); setView('community'); }}>Compartilhar escala</button></div>
    <section className="cc-roster-layout-picker cc-roster-compact-picker" aria-label="Formato da escala">
      <label>Formato<select aria-label="Formato da escala" value={layout} onChange={event => choose(event.target.value as typeof layout)}>
        <option value="cards">Cards</option><option value="list">Lista</option><option value="aims">AIMS</option><option value="calendar">Calendário</option>
      </select></label>
      <button className="cc-roster-layout-reset" type="button" onClick={() => choose('cards', 'month')} disabled={layout === 'cards' && zoom === 'month'}><RotateCcw aria-hidden="true"/> Restaurar padrão</button>
      <p className="cc-roster-layout-status" role="status" aria-live="polite">{rosterFocusStatus || message}</p>
    </section>

    <section className="cc-roster-period-v1399" aria-label="Período da escala">

      <label><CalendarDays/><span>Mês</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
      <button type="button" onClick={goToday}><Clock/> Hoje</button>
    </section>

    <section className="cc-roster-zoom" aria-label="Zoom da escala">
      <div role="group" aria-label="Escolher período de leitura">
        <button type="button" aria-pressed={zoom === 'month'} onClick={() => chooseZoom('month')}>Mês completo</button>
        <button type="button" aria-pressed={zoom === 'day'} onClick={() => chooseZoom('day')}>Dia ampliado</button>
      </div>
      {zoom === 'day' && <label>Dia da escala<input type="date" aria-label="Dia da escala" value={activeDay} min={`${selectedMonth}-01`} max={`${selectedMonth}-${new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).getDate()}`} onChange={event => { if (event.target.value.startsWith(`${selectedMonth}-`)) setSelectedDay(event.target.value); }}/></label>}
      <p role="status">{visibleEvents.length} programações {zoom === 'day' ? `em ${activeDay.split('-').reverse().join('/')}` : 'no mês'}. Horários publicados preservados.</p>
    </section>

    <details className="cc-roster-finance-summary">
      <summary>Resumo do mês · Diárias {financeAvailable ? money(perDiemTotal) : 'Indisponível'} · KM {financeAvailable ? (scopedFinance?.salary?.configured ? money(production) : 'Calibrar tarifa') : 'Indisponível'}</summary>
      <section className="cc-roster-hero-v1397">
      <div className="cc-roster-hero-copy-v1397">
        <h2>Resumo do mês</h2>
        <p>Cada programação preserva os dados da escala e exibe somente o que foi calculado pelas regras financeiras configuradas.</p>
        <div className="cc-roster-hero-counts-v1397">
          <span><CalendarDays/><b>{uniqueDays}</b> dias</span>
          <span><Plane/><b>{flights}</b> voos</span>
          <span><Hotel/><b>{stays}</b> pernoites</span>
          <span><Clock/><b>{readableHours(dutyHours)}</b> em programação</span>
        </div>
      </div>
      <div className="cc-roster-money-overview-v1397">
        <button type="button" onClick={() => setView('perdiem')}>
          <span><Utensils/> Diárias previstas</span>
          <strong>{financeAvailable ? money(perDiemTotal) : 'Indisponível'}</strong>
          <small>{financeAvailable ? (pendingCurrencies.length ? `Câmbio pendente: ${pendingCurrencies.join(', ')}` : 'Café e refeições elegíveis') : 'Financeiro disponível somente para a competência operacional ativa'}</small>
        </button>
        <button type="button" onClick={() => setView('salary')}>
          <span><Route/> Produção por KM</span>
          <strong>{financeAvailable ? (scopedFinance?.salary?.configured ? money(production) : 'Calibrar tarifa') : 'Indisponível'}</strong>
          <small>{financeAvailable ? `${totalKm.toLocaleString('pt-BR')} km estimados no mês` : 'Selecione a competência operacional ativa para ver a memória financeira'}</small>
        </button>
      </div>
    </section>
    </details>

    {unconfirmed.length > 0 && <section className="cc-roster-unconfirmed" aria-label="Programações com data não confirmada">
      <h2>Data não confirmada</h2>
      <p>{unconfirmed.length} programações não puderam ser posicionadas no mês ou dia. Os dados e detalhes permanecem disponíveis abaixo; confirme a data na fonte.</p>
      <AimsRosterTable events={unconfirmed} showHistory={false} focusEventId={focusedEventId} dayView title="Programações com data não confirmada"/>
    </section>}

    {layout === 'aims' && timedEvents.length
      ? <AimsRosterTable events={timedEvents} focusEventId={focusedEventId} dayView={zoom === 'day'}/>
      : layout === 'calendar' && ordered.length
        ? <CalendarRosterView events={ordered} month={selectedMonth} zoom={zoom} selectedDay={activeDay} onSelectDay={selectDay}/>
        : <section className="cc-roster-days-v1397" data-roster-layout={layout}>
      {visibleGroups.map((group) => {
        const groupPerDiems = group.events.flatMap(perDiemForEvent);
        const groupEarnings = group.events.map((event) => salaryByEvent.get(event.id)).filter(Boolean) as FlightEarningItem[];
        const groupPerDiemTotal = groupPerDiems.reduce((sum, row) => sum + Number(row.convertedBRL || 0), 0);
        const groupPendingCurrencies = Array.from(new Set(groupPerDiems.filter(row => row.convertedBRL === null).map(row => row.currency)));
        const groupProduction = groupEarnings.reduce((sum, row) => sum + Number(row.total || 0), 0);
        const groupKm = groupEarnings.reduce((sum, row) => sum + Number(row.km || 0), 0);
        return <section className="cc-roster-day-v1397" key={`${group.iso}:${group.events[0]?.id}`} data-roster-iso={group.iso}>
          <header className="cc-roster-day-header-v1397">
            <time dateTime={group.iso}><b>{group.iso.slice(8).padStart(2, '0')}</b><span>{new Intl.DateTimeFormat('pt-BR', { timeZone: ROSTER_DISPLAY_TIME_ZONE, month: 'short' }).format(group.date!)}</span></time>
            <div><small>{new Intl.DateTimeFormat('pt-BR', { timeZone: ROSTER_DISPLAY_TIME_ZONE, weekday: 'long' }).format(group.date!)}</small><h2>{group.events.length} {group.events.length === 1 ? 'programação' : 'programações'}</h2></div>
            {(groupPerDiems.length > 0 || groupEarnings.length > 0) && <div className="cc-roster-day-money-v1397">
              {groupPerDiems.length > 0 && <span><Utensils/><small>Diárias</small><b>{groupPendingCurrencies.length ? `${groupPendingCurrencies.join('/')} pendente` : money(groupPerDiemTotal)}</b></span>}
              {groupEarnings.length > 0 && <span><Route/><small>{groupKm} km</small><b>{scopedFinance?.salary?.configured ? money(groupProduction) : 'A calibrar'}</b></span>}
            </div>}
          </header>

          <div className="cc-roster-programs-v1397">
            {group.events.map((event) => {
              const mode = workMode(event);
              const meta = modeMeta[mode];
              const hours = duration(event);
              const ground = Number(event.canonical?.groundBeforeMinutes || 0);
              const atBase = /DESCANSO_BASE/.test(eventCode(event));
              const eventPerDiems = perDiemForEvent(event);
              const earning = salaryByEvent.get(event.id);
              const programWindow = publishedProgramWindow(event);
              return <article key={event.id} className="cc-roster-program-v1397 cc-roster-event-v1394" data-mode={mode} data-work-mode={mode} data-event-kind={event.kind || ''} data-roster-event-id={event.id}>
                <header className="cc-roster-program-head-v1397">
                  <span className="cc-roster-program-icon-v1397">{modeIcon(mode, atBase)}</span>
                  <div><small>{meta.label} · {formatDate(rosterLabelDate(event))}</small><h3>{cardTitle(event, mode)}</h3></div>
                  {hours > 0 && <span className="cc-roster-duration-v1397"><Clock/><b>{readableHours(hours)}</b></span>}
                </header>

                <small className="cc-roster-published-code">Código publicado: {String(event.flightNumber || event.day?.pairingCode || event.day?.type || event.title || 'Programação')}</small>

                {(mode === 'operating' || mode === 'extra') && <div className="cc-roster-flight-grid-v1397">
                  <span><small>Apresentação</small><b>{event.presentation && event.presentation !== 'Conexão/Solo' ? event.presentation : '—'}</b></span>
                  <span><small>Partida</small><b>{event.departure || '—'}</b></span>
                  <span><small>Chegada</small><b>{event.arrival || '—'}</b></span>
                  {event.subtitle && <span className="wide"><small>Detalhes da etapa</small><b>{event.subtitle}</b></span>}
                </div>}

                {['reserve', 'standby', 'training', 'duty'].includes(mode) && <div className="cc-roster-flight-grid-v1397 cc-roster-program-time-grid-v1397" aria-label="Horários publicados da programação">
                  <span><small>Início</small><b>{programWindow.start || 'A confirmar'}</b></span>
                  <span><small>Fim</small><b>{programWindow.end || 'A confirmar'}</b></span>
                </div>}

                {mode === 'stay' && <p className="cc-roster-summary-v1397">{hours ? `${readableHours(hours)} entre o fim da jornada e a próxima apresentação.` : 'Intervalo de continuidade entre jornadas.'} {event.hotel ? `Hotel: ${event.hotel}.` : atBase ? 'Descanso na base publicado na escala.' : 'Hotel ainda não informado.'}</p>}
                {mode === 'journey-rest' && <p className="cc-roster-summary-v1397">{event.subtitle || 'Intervalo entre jornadas. Não é tempo em solo, programação, pernoite ou deslocamento.'}</p>}
                {mode === 'rest' && <p className="cc-roster-summary-v1397">{event.subtitle || 'Código e dia preservados conforme a escala publicada.'}</p>}
                {['reserve', 'standby', 'training', 'duty'].includes(mode) && <p className="cc-roster-summary-v1397">{event.subtitle || `${event.departure || 'Horário a confirmar'} → ${event.arrival || 'Horário a confirmar'}`}</p>}

                {(eventPerDiems.length > 0 || earning) && <section className="cc-roster-event-finance-v1397">
                  {eventPerDiems.length > 0 && <div className="cc-roster-meals-v1397">
                    <small><WalletCards/> Diárias desta programação</small>
                    <div>{eventPerDiems.map((row, index) => <span key={`${row.iso}-${row.label}-${index}`}>{mealIcon(row.label)}<b>{row.label}</b><em>{currencyMoney(row.value, row.currency)}</em></span>)}</div>
                  </div>}
                  {earning && <div className="cc-roster-km-gain-v1397">
                    <small><Route/> Ganho por KM</small>
                    <strong>{scopedFinance?.salary?.configured ? money(earning.total) : 'Tarifa pendente'}</strong>
                    <p>{earning.km} km · {earning.dayKm} diurnos × {money(earning.dayRateApplied)}/km · {earning.nightKm} noturnos × {money(earning.nightRateApplied)}/km</p>
                    {earning.payRule && <em>{earning.payRule}</em>}
                  </div>}
                </section>}

                <div className="cc-roster-detail-chips-v1397">
                  {ground >= 60 && <span><Clock/> Solo/conexão {ground} min</span>}
                  {event.hotel && <span><Hotel/> {event.hotel}</span>}
                </div>

                <div className="cc-roster-actions-v1397">
                  {(mode === 'stay' || event.hotel) && <button type="button" onClick={() => setView('presentation')}><Building2/> Hotel e apresentação</button>}
                  {(mode === 'operating' || mode === 'extra') && <button type="button" onClick={() => setView('departure')}><MapPin/> Saída Inteligente</button>}
                  {(eventPerDiems.length > 0 || earning) && <button type="button" onClick={() => setView(earning ? 'salary' : 'perdiem')}><Banknote/> Ver memória de cálculo</button>}
                </div>
              </article>;
            })}
          </div>
        </section>;
      })}

      {!visibleEvents.length && <article className="cc-roster-empty-v1397"><CalendarDays/><h2>{unconfirmed.length ? 'Nenhuma programação com data confirmada neste período' : ordered.length ? 'Nenhuma programação neste dia' : 'Nenhuma escala carregada'}</h2><p>{unconfirmed.length ? 'Consulte as programações com data não confirmada acima.' : ordered.length ? 'Escolha outro dia ou volte ao mês completo.' : 'Importe o PDF ou sincronize o calendário autorizado do iFlight.'}</p></article>}
    </section>}

    {layout !== 'calendar' && civilOnlyEvents.length > 0 && <section className="cc-roster-unconfirmed" aria-label="Programações sem instante confirmado">
      <h2>Data publicada, horário a confirmar</h2>
      <p>Estas programações têm data confirmada, mas não têm um instante confirmado para posicioná-las na sequência das jornadas. Estão listadas por data publicada.</p>
      <AimsRosterTable events={civilOnlyEvents} showHistory={false} focusEventId={focusedEventId} dayView={zoom === 'day'} title="Programações sem instante confirmado"/>
    </section>}

    <details className="cc-roster-compact-legend"><summary>Legenda das programações</summary>
    <section className="cc-roster-legend-v1397" aria-label="Cores das programações">
      {(Object.entries(modeMeta) as Array<[ProgramMode, { label: string; shortLabel: string }]>).map(([mode, meta]) =>
        <span key={mode} data-mode={mode} aria-label={paletteA11y[mode] || meta.label}><i/>{meta.shortLabel}</span>
      )}
    </section>
    </details>

    {ordered.length > 0 && <footer className="cc-roster-estimate-note-v1397"><ShieldCheck/><p><strong>Estimativa conferível.</strong> Diárias e produção por KM usam as regras ACT, tarifas administrativas e dados aprendidos já configurados no CrewCheck. Não substituem o demonstrativo oficial.</p></footer>}
  </div>;
}
