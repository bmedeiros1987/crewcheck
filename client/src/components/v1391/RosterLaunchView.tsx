import { filterRosterEvents, rosterCardPresentation, rosterProgramMode, rosterModeMeta, type RosterMode } from '@/lib/rosterPresentation';
import { carePresentationForScheduleActivity } from '@/lib/scheduleActivityClassification';
import { RosterActivityIcon, RosterLegend, useRosterCategoryFilter } from './RosterLegend';
import { useFinancialPrivacy, FinancialPrivacyToggle } from '@/components/finance/FinancialPrivacy';
import { rosterDisplayCompare, rosterDisplayIso, rosterInstantIso, rosterLabelDate, rosterStrictInstant, ROSTER_DISPLAY_TIME_ZONE } from '@/lib/rosterDisplayDate';
import { useEffect, useMemo, useState } from 'react';
import { summarizeForecastRows, summarizeNativeForecastRows } from '@/lib/financialForecastPeriods';
import { rosterDayAllowanceSummary } from '@/lib/rosterDayAllowanceSummary';
import { peekPendingNavigationContext } from '@/lib/navigationContext';
import { consumePendingRosterFocus } from '@/lib/rosterFocus';
import { AlertRosterNavigation } from '../alerts/AlertRosterNavigation';
import type { CrewRoster } from '../../lib/pdfParser';
import {
  Banknote,
  GitCompareArrows,
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
import { AimsDocumentView } from './AimsDocumentView';
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
  placeholder?: boolean;
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

type ProgramMode = RosterMode;

type PerDiemItem = {
  partial?: boolean;
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
  timeKnown?: boolean;
  distanceKnown?: boolean;
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
    unclassifiedItems?: Array<{iso:string;airport:string}>;
    monthly?: number | null;
    monthlySummary?: ReturnType<typeof summarizeForecastRows>;
    nativeSummary?: ReturnType<typeof summarizeNativeForecastRows>;
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

// Shared presentation contract: source classification and published fields remain unchanged.
function workMode(event: RosterEvent): ProgramMode { return rosterProgramMode(event); }
const modeMeta = rosterModeMeta;

function mealIcon(label: string) {
  if (/café/i.test(label)) return <Coffee/>;
  if (/ceia/i.test(label)) return <Moon/>;
  return <Utensils/>;
}

function salaryRowsTotal(rows: readonly FlightEarningItem[]): number | null {
  if (!rows.length || rows.some(row => row.timeKnown !== true || row.distanceKnown !== true || !Number.isFinite(row.total))) return null;
  return rows.reduce((sum, row) => sum + row.total, 0);
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

const formatMoney = money;
const formatCurrencyMoney = currencyMoney;

export default function RosterLaunchView({ events, finance, financeMonth, setView, roster }: { events: RosterEvent[]; finance?: RosterFinance; financeMonth?: string; setView: (view: any) => void; roster?: CrewRoster }) {
  const privacy = useFinancialPrivacy();
  const money = (value: number | null) => privacy.text(formatMoney(value));
  const currencyMoney = (value: number, currency = 'BRL') => privacy.text(formatCurrencyMoney(value, currency));
  const { layout, zoom, choose, chooseZoom, message } = useRosterLayout();
  const categoryFilter = useRosterCategoryFilter(events);
  const allOrdered = useMemo(() => [...events]
    .filter((event) => !event.placeholder && !event.id?.includes('placeholder'))
    .sort(rosterDisplayCompare), [events, categoryFilter.signature]);
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
    if (context?.sourceView === 'alerts') return;
    const focus = consumePendingRosterFocus();
    if (!focus && !context?.programId) return;
    categoryFilter.reset();
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
  function focusAlertDate(date: string) {
    categoryFilter.reset();
    const iso = date.split('/').reverse().join('-');
    if (!months.includes(iso.slice(0, 7))) { setRosterFocusStatus('A data do alerta não está neste período da escala.'); return; }
    setSelectedMonth(iso.slice(0, 7)); setSelectedDay(iso); setPendingRosterFocusIso(iso);
    choose('cards', 'day');
  }
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
  const periodEvents = zoom === 'day' ? ordered.filter(event => isoOf(event) === activeDay) : ordered;
  const visibleEvents = filterRosterEvents(periodEvents, categoryFilter.filter);
  const timedEvents = periodEvents.filter(event => Number.isFinite(dateOf(event).getTime()));
  const civilOnlyEvents = visibleEvents.filter(event => !Number.isFinite(dateOf(event).getTime()));
  // Consecutive runs retain canonical chronology when published dates recur
  // across a journey-rest interval. The civil map above serves month metrics.
  const visibleGroups = timedEvents.reduce((runs, event) => {
    const iso = isoOf(event), previous = runs[runs.length - 1];
    if (previous?.iso === iso) previous.events.push(event);
    else runs.push({ iso, date: rosterLabelDate(event), events: [event] });
    return runs;
  }, [] as { iso: string; date: Date | null; events: RosterEvent[] }[])
    .map(group => ({ ...group, allEvents: group.events, events: filterRosterEvents(group.events, categoryFilter.filter) }))
    .filter(group => group.events.length > 0);
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
  const production = salaryRowsTotal(selectedSalaryRows);
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
    {roster && <AlertRosterNavigation roster={roster} onFocus={focusAlertDate}/>}

    <div className="cz-roster-actions cc-share-entry"><a className="cc-roster-changes-link" href="?view=perdiem&fmode=allowance&fscreen=changes" aria-label="Alterações" title="Alterações"><GitCompareArrows size={18} aria-hidden="true"/></a><button type="button" onClick={() => { setPendingNavigationContext({sourceView:'roster',targetView:'community',programId:'share-roster',returnView:'roster',policy:'once'}); setView('community'); }}>Compartilhar escala</button></div>
    <section className="cc-roster-layout-picker cc-roster-compact-picker" aria-label="Formato da escala">
      <label>Formato<select aria-label="Formato da escala" value={layout} onChange={event => choose(event.target.value as typeof layout)}>
        <option value="cards">Cards</option><option value="list">Lista</option><option value="aims">CrewCheck AIMS</option><option value="calendar">Calendário</option>
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
      <p role="status">{periodEvents.length} programações {zoom === 'day' ? `em ${activeDay.split('-').reverse().join('/')}` : 'no mês'}. Horários publicados preservados.</p>
    </section>

    {categoryFilter.filter !== 'all' && !visibleEvents.length && <div className="cc-roster-filter-empty"><p>Nenhum item deste filtro no período selecionado.</p><button type="button" onClick={categoryFilter.reset}>Mostrar tudo</button></div>}

    <FinancialPrivacyToggle/><details className="cc-roster-finance-summary">
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
      <AimsRosterTable operationalEvents={allOrdered} events={filterRosterEvents(unconfirmed, categoryFilter.filter)} filtered={categoryFilter.filter !== 'all'} showHistory={false} focusEventId={focusedEventId} dayView title="Programações com data não confirmada"/>
    </section>}

    {(layout === 'aims' || layout === 'document')
      ? <AimsDocumentView events={visibleEvents} periodEvents={periodEvents} filtered={categoryFilter.filter !== 'all'} operationalEvents={allOrdered} onReturnToMonth={() => chooseZoom('month')} month={selectedMonth} day={zoom === 'day' ? activeDay : undefined} focusEventId={focusedEventId} describe={event => { const mode = workMode(event); return { mode, label: modeMeta[mode].label }; }}/>
      : layout === 'calendar' && ordered.length
        ? <CalendarRosterView operationalEvents={allOrdered} events={filterRosterEvents(ordered, categoryFilter.filter)} periodEvents={ordered} filtered={categoryFilter.filter !== 'all'} month={selectedMonth} zoom={zoom} selectedDay={activeDay} onSelectDay={selectDay}/>
        : <section className="cc-roster-days-v1397" data-roster-layout={layout}>
      {visibleGroups.map((group, groupIndex) => {
        // Headers follow the allowance's civil date; event details retain journey ownership.
        const groupPerDiems = selectedPerDiemRows.filter(row => row.iso === group.iso);
        const groupEarnings = group.allEvents.map((event) => salaryByEvent.get(event.id)).filter(Boolean) as FlightEarningItem[];
        const groupPerDiemTotal = rosterDayAllowanceSummary(group.iso, groupPerDiems, scopedFinance?.perdiem?.unclassifiedItems, scopedFinance?.perdiem?.nativeSummary?.complete).convertedTotalBRL;
        const groupPendingCurrencies = Array.from(new Set(groupPerDiems.filter(row => row.convertedBRL === null).map(row => row.currency)));
        const groupProduction = salaryRowsTotal(groupEarnings);
        const groupKm = groupEarnings.reduce((sum, row) => sum + Number(row.km || 0), 0);
        return <section className="cc-roster-day-v1397" key={`${group.iso}:${groupIndex}`} data-roster-iso={group.iso}>
          <header className="cc-roster-day-header-v1397">
            <time dateTime={group.iso}><b>{group.iso.slice(8).padStart(2, '0')}</b><span>{new Intl.DateTimeFormat('pt-BR', { timeZone: ROSTER_DISPLAY_TIME_ZONE, month: 'short' }).format(group.date!)}</span></time>
            <div><small>{new Intl.DateTimeFormat('pt-BR', { timeZone: ROSTER_DISPLAY_TIME_ZONE, weekday: 'long' }).format(group.date!)}</small><h2>{group.events.length} {group.events.length === 1 ? 'programação' : 'programações'}</h2></div>
            {(groupPerDiems.length > 0 || groupEarnings.length > 0) && <div className="cc-roster-day-money-v1397" aria-label="Totais do dia, sem filtro de categoria">
              {groupPerDiems.length > 0 && <span><Utensils/><small>Diárias</small><b>{groupPerDiemTotal === null ? 'Não calculável' : groupPendingCurrencies.length ? `${groupPendingCurrencies.join('/')} pendente` : money(groupPerDiemTotal)}</b></span>}
              {groupEarnings.length > 0 && <span><Route/><small>{groupKm} km</small><b>{scopedFinance?.salary?.configured ? money(groupProduction) : 'A calibrar'}</b></span>}
            </div>}
          </header>

          <div className="cc-roster-programs-v1397">
            {group.events.map((event, eventIndex) => {
              const mode = workMode(event);
              const meta = modeMeta[mode];
              const card = rosterCardPresentation(event, group.iso);
              const carePresentation = mode === 'rest' ? carePresentationForScheduleActivity(event) : null;
              const hours = card.nonOperational ? 0 : duration(event);
              const ground = Number(event.canonical?.groundBeforeMinutes || 0);
              const eventPerDiems = perDiemForEvent(event);
              const earning = salaryByEvent.get(event.id);

              return <article key={`${event.id}:${allOrdered.indexOf(event)}:${eventIndex}`} className="cc-roster-program-v1397 cc-roster-event-v1394 cc-roster-token" data-roster-mode={mode} data-mode={mode} data-work-mode={mode} data-event-kind={event.kind || ''} data-roster-event-id={event.id}>
                <header className="cc-roster-program-head-v1397">
                  <span className="cc-roster-program-icon-v1397"><RosterActivityIcon mode={mode}/></span>
                  <div><small>{carePresentation?.label || meta.label} · {formatDate(rosterLabelDate(event))}</small><h3>{card.title}</h3></div>
                  {hours > 0 && <span className="cc-roster-duration-v1397"><Clock/><b>{readableHours(hours)}</b></span>}
                </header>

                <details className="cc-roster-source-code"><summary>Dados da fonte</summary><small className="cc-roster-published-code">Código da fonte: {card.code}</small></details>

                {(mode === 'operating' || mode === 'extra') && <div className="cc-roster-flight-grid-v1397">
                  {card.presentation && <span><small>Apresentação</small><b>{card.presentation}</b></span>}
                  <span><small>Partida{card.startDate && ` · ${card.startDate}`}</small><b>{card.start}</b></span>
                  <span><small>Chegada{card.endDate && ` · ${card.endDate}`}</small><b>{card.end}</b></span>
                  {event.subtitle && <span className="wide"><small>Detalhes da etapa</small><b>{event.subtitle}</b></span>}
                </div>}

                {!(mode === 'operating' || mode === 'extra') && <div className="cc-roster-flight-grid-v1397 cc-roster-program-time-grid-v1397" aria-label="Horários publicados da programação">
                  <span><small>Início{card.startDate && ` · ${card.startDate}`}</small><b>{card.start}</b></span>
                  <span><small>Fim{card.endDate && ` · ${card.endDate}`}</small><b>{card.end}</b></span>
                </div>}

                {card.nonOperational && <p className="cc-roster-summary-v1397">{card.note}{card.context && ` · ${card.context}`}{card.hotel && ` · Hotel: ${card.hotel}`}</p>}
                {card.datesUnconfirmed && <p>Virada de dia indicada; datas a confirmar.</p>}
                {['reserve', 'standby', 'training', 'duty'].includes(mode) && <p className="cc-roster-summary-v1397">{event.subtitle || `${event.departure || 'Horário a confirmar'} → ${event.arrival || 'Horário a confirmar'}`}</p>}

                {(eventPerDiems.length > 0 || earning) && <section className="cc-roster-event-finance-v1397">
                  {eventPerDiems.length > 0 && <div className="cc-roster-meals-v1397">
                    <small><WalletCards/> Diárias desta programação</small>
                    <div>{eventPerDiems.map((row, index) => <span key={`${row.iso}-${row.label}-${index}`}>{mealIcon(row.label)}<b>{row.label}</b><em>{currencyMoney(row.value, row.currency)}</em></span>)}</div>
                  </div>}
                  {earning && <div className="cc-roster-km-gain-v1397">
                    <small><Route/> Ganho por KM</small>
                    <strong>{scopedFinance?.salary?.configured ? money(salaryRowsTotal([earning])) : 'Tarifa pendente'}</strong>
                    {salaryRowsTotal([earning]) === null ? <p>Horários, distância ou parcelas pendentes; valor não calculável.</p> : <p>{earning.km} km · {earning.dayKm} diurnos × {money(earning.dayRateApplied)}/km · {earning.nightKm} noturnos × {money(earning.nightRateApplied)}/km</p>}
                    {earning.payRule && <em>{earning.payRule}</em>}
                  </div>}
                </section>}

                <div className="cc-roster-detail-chips-v1397">
                  {['operating', 'extra'].includes(mode) && ground >= 60 && <span><Clock/> Solo/conexão {ground} min</span>}
                  {card.hotel && <span><Hotel/> {card.hotel}</span>}
                </div>

                <div className="cc-roster-actions-v1397">
                  {mode === 'stay' && <button type="button" onClick={() => setView('presentation')}><Building2/> Hotel e apresentação</button>}
                  {(mode === 'operating' || mode === 'extra') && <button type="button" onClick={() => setView('departure')}><MapPin/> Saída Inteligente</button>}
                  {(eventPerDiems.length > 0 || earning) && <button type="button" onClick={() => setView(earning ? 'salary' : 'perdiem')}><Banknote/> Ver memória de cálculo</button>}
                </div>
              </article>;
            })}
          </div>
        </section>;
      })}

      {!visibleEvents.length && categoryFilter.filter === 'all' && <article className="cc-roster-empty-v1397"><CalendarDays/><h2>{unconfirmed.length ? 'Nenhuma programação com data confirmada neste período' : ordered.length ? 'Nenhuma programação neste dia' : 'Nenhuma escala carregada'}</h2><p>{unconfirmed.length ? 'Consulte as programações com data não confirmada acima.' : ordered.length ? 'Escolha outro dia ou volte ao mês completo.' : 'Importe o PDF ou sincronize o calendário autorizado do iFlight.'}</p></article>}
    </section>}

    {layout !== 'calendar' && layout !== 'document' && civilOnlyEvents.length > 0 && <section className="cc-roster-unconfirmed" aria-label="Programações sem instante confirmado">
      <h2>Data publicada, horário a confirmar</h2>
      <p>Estas programações têm data confirmada, mas não têm um instante confirmado para posicioná-las na sequência das jornadas. Estão listadas por data publicada.</p>
      <AimsRosterTable operationalEvents={allOrdered} events={civilOnlyEvents} showHistory={false} focusEventId={focusedEventId} dayView={zoom === 'day'} title="Programações sem instante confirmado"/>
    </section>}

    {/* A legenda original, perto do rodapé, é o único controle de filtro (Tudo reúne todas). */}
    {ordered.length > 0 && <RosterLegend events={periodEvents} selected={categoryFilter.filter} onSelect={categoryFilter.choose} periodLabel={zoom === 'day' ? activeDay.split('-').reverse().join('/') : monthLabel(selectedMonth)}/>}

    {ordered.length > 0 && <footer className="cc-roster-estimate-note-v1397"><ShieldCheck/><p><strong>Estimativa conferível.</strong> Diárias e produção por KM usam as regras ACT, tarifas administrativas e dados aprendidos já configurados no CrewCheck. Não substituem o demonstrativo oficial.</p></footer>}
  </div>;
}
