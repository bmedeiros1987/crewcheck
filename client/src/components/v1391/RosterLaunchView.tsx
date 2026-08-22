import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
  MapPin,
  Moon,
  Plane,
  Route,
  ShieldCheck,
  Sparkles,
  Utensils,
  WalletCards,
} from 'lucide-react';
import { V139Header } from '@/components/v139/Shell';
import '@/components/v139/v139.css';
import '@/launch-v13-9-1.css';
import '@/components/v1397/roster-premium.css';

type RosterEvent = {
  id: string;
  kind?: string;
  title?: string;
  subtitle?: string;
  date?: Date;
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
  canonical?: { kind?: string; startDateTime?: string; endDateTime?: string; groundBeforeMinutes?: number; showPresentation?: boolean };
};

type ProgramMode = 'operating' | 'extra' | 'stay' | 'rest' | 'reserve' | 'standby' | 'training' | 'duty';

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
    monthly?: number;
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
  const date = event.canonical?.startDateTime ? new Date(event.canonical.startDateTime) : new Date(event.date || Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function isoOf(event: RosterEvent) {
  const value = dateOf(event);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function monthOf(event: RosterEvent) {
  return isoOf(event).slice(0, 7);
}

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(date);
}

function duration(event: RosterEvent) {
  const start = new Date(event.canonical?.startDateTime || 0);
  const end = new Date(event.canonical?.endDateTime || 0);
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? Math.max(0, (end.getTime() - start.getTime()) / 3600000) : 0;
}

function eventCode(event: RosterEvent) {
  return `${event.day?.type || ''} ${event.day?.pairingCode || ''} ${event.title || ''} ${event.flightNumber || ''}`.toUpperCase();
}

function workMode(event: RosterEvent): ProgramMode {
  const code = eventCode(event);
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
  reserve: { label: 'Reserva presencial', shortLabel: 'Reserva' },
  standby: { label: 'Sobreaviso', shortLabel: 'Sobreaviso' },
  training: { label: 'Treinamento', shortLabel: 'Treinamento' },
  duty: { label: 'Programação operacional', shortLabel: 'Programação' },
};

const paletteA11y: Partial<Record<ProgramMode, string>> = {
  operating: 'Verde · voo tripulando',
  extra: 'Cinza · deslocamento/extra',
  stay: 'Roxo · pernoite ou descanso',
};

function modeIcon(mode: ProgramMode, atBase = false) {
  if (mode === 'operating' || mode === 'extra') return <Plane/>;
  if (mode === 'stay') return atBase ? <Home/> : <BedDouble/>;
  if (mode === 'reserve') return <BriefcaseBusiness/>;
  if (mode === 'standby') return <Moon/>;
  if (mode === 'training') return <GraduationCap/>;
  return <ShieldCheck/>;
}

function mealIcon(label: string) {
  if (/café/i.test(label)) return <Coffee/>;
  if (/ceia/i.test(label)) return <Moon/>;
  return <Utensils/>;
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
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

export default function RosterLaunchView({ events, finance, setView, focusIso }: { events: RosterEvent[]; finance?: RosterFinance; setView: (view: any) => void; focusIso?: string | null }) {
  const allOrdered = useMemo(() => [...events]
    .filter((event) => !event.id?.includes('placeholder'))
    .sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime() || String(a.id).localeCompare(String(b.id))), [events]);
  const months = useMemo(() => Array.from(new Set(allOrdered.map(monthOf))).sort(), [allOrdered]);
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(() => months.includes(currentMonth) ? currentMonth : months[0] || currentMonth);
  useEffect(() => {
    if (months.length && !months.includes(selectedMonth)) setSelectedMonth(months.includes(currentMonth) ? currentMonth : months[0]);
  }, [months.join('|'), selectedMonth, currentMonth]);
  const ordered = useMemo(() => allOrdered.filter((event) => monthOf(event) === selectedMonth), [allOrdered, selectedMonth]);
  const groups = Array.from(ordered.reduce((map, event) => {
    const iso = isoOf(event);
    const group = map.get(iso) || { iso, date: dateOf(event), events: [] as RosterEvent[] };
    group.events.push(event);
    map.set(iso, group);
    return map;
  }, new Map<string, { iso: string; date: Date; events: RosterEvent[] }>()).values());
  const salaryRows = finance?.salary?.rows || [];
  const perDiemRows = finance?.perdiem?.rows || [];
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
  const perDiemTotal = selectedPerDiemRows.reduce((sum, row) => sum + Number(row.convertedBRL || 0), 0);
  const pendingCurrencies = Array.from(new Set(selectedPerDiemRows.filter((row) => row.convertedBRL === null).map((row) => row.currency)));
  const dutyHours = ordered.filter((event) => !['stay', 'rest'].includes(workMode(event))).reduce((sum, event) => sum + duration(event), 0);
  const todayIso = isoOf({ id: 'today', date: new Date() });

  function goToDate(iso: string, { announceEmpty = false } = {}) {
    const month = iso.slice(0, 7);
    if (months.includes(month) && selectedMonth !== month) setSelectedMonth(month);
    // O mês pode acabar de mudar; o alvo só existe no DOM depois do próximo render.
    window.setTimeout(() => {
      const target = document.querySelector(`[data-roster-iso="${iso}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      // #548: o atalho nunca é bloqueado — a escala abre e o dia vazio é anunciado.
      if (announceEmpty) toast.info('Não há programação publicada para esse dia nesta escala.');
    }, 60);
  }

  function goToday() {
    goToDate(todayIso);
  }

  // Entrada por atalho de data (calendário da Linha do Dia / FlightDeck).
  useEffect(() => {
    if (!focusIso) return;
    goToDate(focusIso, { announceEmpty: true });
  }, [focusIso]);

  return <div className="cc-roster-premium-v1397">
    <V139Header title="Escala inteligente" detail="Programações organizadas por dia, leitura operacional imediata e ganhos estimados com as regras já configuradas no CrewCheck."/>

    <section className="cc-roster-period-v1399" aria-label="Período da escala">
      <div><small>PERÍODO EXIBIDO</small><strong>{monthLabel(selectedMonth)}</strong><span>Totais financeiros e horas isolados por mês.</span></div>
      <label><CalendarDays/><span>Mês</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
      <button type="button" onClick={goToday}><Clock/> Hoje</button>
    </section>

    <section className="cc-roster-hero-v1397">
      <div className="cc-roster-hero-copy-v1397">
        <span className="cc-roster-eyebrow-v1397"><Sparkles/> VISÃO PREMIUM DO MÊS</span>
        <h2>Operação clara.<br/><em>Ganhos visíveis.</em></h2>
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
          <strong>{money(perDiemTotal)}</strong>
          <small>{pendingCurrencies.length ? `Câmbio pendente: ${pendingCurrencies.join(', ')}` : 'Café e refeições elegíveis'}</small>
        </button>
        <button type="button" onClick={() => setView('salary')}>
          <span><Route/> Produção por KM</span>
          <strong>{finance?.salary?.configured ? money(production) : 'Calibrar tarifa'}</strong>
          <small>{totalKm.toLocaleString('pt-BR')} km estimados no mês</small>
        </button>
      </div>
    </section>

    <section className="cc-roster-legend-v1397" aria-label="Cores das programações">
      {(Object.entries(modeMeta) as Array<[ProgramMode, { label: string; shortLabel: string }]>).map(([mode, meta]) =>
        <span key={mode} data-mode={mode} aria-label={paletteA11y[mode] || meta.label}><i/>{meta.shortLabel}</span>
      )}
    </section>

    <section className="cc-roster-days-v1397">
      {groups.map((group) => {
        const groupPerDiems = group.events.flatMap(perDiemForEvent);
        const groupEarnings = group.events.map((event) => salaryByEvent.get(event.id)).filter(Boolean) as FlightEarningItem[];
        const groupPerDiemTotal = groupPerDiems.reduce((sum, row) => sum + Number(row.convertedBRL || 0), 0);
        const groupPendingCurrencies = Array.from(new Set(groupPerDiems.filter(row => row.convertedBRL === null).map(row => row.currency)));
        const groupProduction = groupEarnings.reduce((sum, row) => sum + Number(row.total || 0), 0);
        const groupKm = groupEarnings.reduce((sum, row) => sum + Number(row.km || 0), 0);
        return <section className="cc-roster-day-v1397" key={group.iso} data-roster-iso={group.iso}>
          <header className="cc-roster-day-header-v1397">
            <time dateTime={group.iso}><b>{String(group.date.getDate()).padStart(2, '0')}</b><span>{new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(group.date)}</span></time>
            <div><small>{new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(group.date)}</small><h2>{group.events.length} {group.events.length === 1 ? 'programação' : 'programações'}</h2></div>
            {(groupPerDiems.length > 0 || groupEarnings.length > 0) && <div className="cc-roster-day-money-v1397">
              {groupPerDiems.length > 0 && <span><Utensils/><small>Diárias</small><b>{groupPendingCurrencies.length ? `${groupPendingCurrencies.join('/')} pendente` : money(groupPerDiemTotal)}</b></span>}
              {groupEarnings.length > 0 && <span><Route/><small>{groupKm} km</small><b>{finance?.salary?.configured ? money(groupProduction) : 'A calibrar'}</b></span>}
            </div>}
          </header>

          <div className="cc-roster-programs-v1397">
            {group.events.map((event) => {
              const mode = workMode(event);
              const meta = modeMeta[mode];
              const hours = duration(event);
              const ground = Number(event.canonical?.groundBeforeMinutes || 0);
              const routine = Array.isArray(event.routine) ? event.routine.filter((item) => item && !/academia|restaurante|mercado|farmácia|farmacia|lavanderia/i.test(item)).slice(0, 3) : [];
              const atBase = /DESCANSO_BASE/.test(eventCode(event));
              const eventPerDiems = perDiemForEvent(event);
              const earning = salaryByEvent.get(event.id);
              return <article key={event.id} className="cc-roster-program-v1397 cc-roster-event-v1394" data-mode={mode} data-work-mode={mode} data-event-kind={event.kind || ''}>
                <header className="cc-roster-program-head-v1397">
                  <span className="cc-roster-program-icon-v1397">{modeIcon(mode, atBase)}</span>
                  <div><small>{meta.label} · {formatDate(dateOf(event))}</small><h3>{cardTitle(event, mode)}</h3></div>
                  {hours > 0 && <span className="cc-roster-duration-v1397"><Clock/><b>{readableHours(hours)}</b></span>}
                </header>

                {(mode === 'operating' || mode === 'extra') && <div className="cc-roster-flight-grid-v1397">
                  <span><small>Apresentação</small><b>{event.presentation && event.presentation !== 'Conexão/Solo' ? event.presentation : '—'}</b></span>
                  <span><small>Partida</small><b>{event.departure || '—'}</b></span>
                  <span><small>Chegada</small><b>{event.arrival || '—'}</b></span>
                  {event.subtitle && <span className="wide"><small>Detalhes da etapa</small><b>{event.subtitle}</b></span>}
                </div>}

                {mode === 'stay' && <p className="cc-roster-summary-v1397">{hours ? `${readableHours(hours)} entre o fim da jornada e a próxima apresentação.` : 'Intervalo de continuidade entre jornadas.'} {event.hotel ? `Hotel: ${event.hotel}.` : atBase ? 'Endereço de casa salvo pode ser usado na Saída Inteligente.' : 'Hotel ainda não informado.'}</p>}
                {mode === 'rest' && <p className="cc-roster-summary-v1397">{event.subtitle || 'Código e dia preservados conforme a escala publicada.'}</p>}
                {['reserve', 'standby', 'training', 'duty'].includes(mode) && <p className="cc-roster-summary-v1397">{event.subtitle || `${event.departure || 'Horário a confirmar'} → ${event.arrival || 'Horário a confirmar'}`}</p>}

                {(eventPerDiems.length > 0 || earning) && <section className="cc-roster-event-finance-v1397">
                  {eventPerDiems.length > 0 && <div className="cc-roster-meals-v1397">
                    <small><WalletCards/> Diárias desta programação</small>
                    <div>{eventPerDiems.map((row, index) => <span key={`${row.iso}-${row.label}-${index}`}>{mealIcon(row.label)}<b>{row.label}</b><em>{currencyMoney(row.value, row.currency)}</em></span>)}</div>
                  </div>}
                  {earning && <div className="cc-roster-km-gain-v1397">
                    <small><Route/> Ganho por KM</small>
                    <strong>{finance?.salary?.configured ? money(earning.total) : 'Tarifa pendente'}</strong>
                    <p>{earning.km} km · {earning.dayKm} diurnos × {money(earning.dayRateApplied)}/km · {earning.nightKm} noturnos × {money(earning.nightRateApplied)}/km</p>
                    {earning.payRule && <em>{earning.payRule}</em>}
                  </div>}
                </section>}

                <div className="cc-roster-detail-chips-v1397">
                  {ground >= 60 && <span><Clock/> Solo/conexão {ground} min</span>}
                  {mode === 'stay' && <span><BedDouble/> Sono prioritário: pelo menos 8 h</span>}
                  {event.hotel && <span><Hotel/> {event.hotel}</span>}
                  {routine.map((item) => <span key={item}><Dumbbell/> {item}</span>)}
                </div>

                <div className="cc-roster-actions-v1397">
                  {(mode === 'stay' || event.hotel) && <button type="button" onClick={() => setView('presentation')}><Building2/> Hotel e apresentação</button>}
                  {(mode === 'stay' || mode === 'rest') && <button type="button" onClick={() => setView('routine')}><Dumbbell/> Planejar rotina</button>}
                  {(mode === 'operating' || mode === 'extra') && <button type="button" onClick={() => setView('departure')}><MapPin/> Saída Inteligente</button>}
                  {(eventPerDiems.length > 0 || earning) && <button type="button" onClick={() => setView(earning ? 'salary' : 'perdiem')}><Banknote/> Ver memória de cálculo</button>}
                </div>
              </article>;
            })}
          </div>
        </section>;
      })}

      {!ordered.length && <article className="cc-roster-empty-v1397"><CalendarDays/><h2>Nenhuma escala carregada</h2><p>Importe o PDF ou sincronize o calendário autorizado do iFlight.</p></article>}
    </section>

    {ordered.length > 0 && <footer className="cc-roster-estimate-note-v1397"><ShieldCheck/><p><strong>Estimativa conferível.</strong> Diárias e produção por KM usam as regras ACT, tarifas administrativas e dados aprendidos já configurados no CrewCheck. Não substituem o demonstrativo oficial.</p></footer>}
  </div>;
}
