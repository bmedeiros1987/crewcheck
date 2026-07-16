import { BedDouble, Building2, CalendarDays, Clock, Dumbbell, Home, Hotel, MapPin, Plane, ShieldCheck } from 'lucide-react';
import { V139Header } from '@/components/v139/Shell';
import '@/components/v139/v139.css';
import '@/launch-v13-9-1.css';

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

function dateOf(event: RosterEvent) {
  const date = event.canonical?.startDateTime ? new Date(event.canonical.startDateTime) : new Date(event.date || Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function duration(event: RosterEvent) {
  const start = new Date(event.canonical?.startDateTime || 0);
  const end = new Date(event.canonical?.endDateTime || 0);
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? Math.max(0, (end.getTime() - start.getTime()) / 3600000) : 0;
}

function workMode(event: RosterEvent): 'operating' | 'extra' | 'stay' | 'rest' | 'duty' {
  if (event.canonical?.kind === 'rest') return 'rest';
  if (event.kind === 'stay' || /PERNOITE|ESTADIA|DESCANSO_BASE_CONTINUIDADE/i.test(`${event.day?.type || ''} ${event.day?.pairingCode || ''}`)) return 'stay';
  if (event.kind !== 'flight') return 'duty';
  const work = `${event.leg?.workType || ''} ${event.title || ''}`.toUpperCase();
  return /(^|\s)(PS|PAX|DH|EXTRA|PASSAGEIRO)(\s|$)/.test(work) ? 'extra' : 'operating';
}

function cardTitle(event: RosterEvent, mode: ReturnType<typeof workMode>) {
  const code = String(event.day?.type || event.day?.pairingCode || '').toUpperCase();
  if (mode === 'rest') {
    if (/(DO|DOF|DOP|OFF)/.test(code)) return `Folga publicada${code ? ` · ${code}` : ''}`;
    return `Descanso publicado${code ? ` · ${code}` : ''}`;
  }
  if (mode === 'stay') {
    const location = event.destination || event.origin || event.day?.base || '';
    const atBase = /DESCANSO_BASE/.test(code);
    return atBase ? `Descanso entre jornadas na base · ${location}` : `Pernoite em ${location || 'localidade'}`;
  }
  if (mode === 'operating' || mode === 'extra') return `${event.flightNumber || 'Voo'} · ${event.origin || '—'} → ${event.destination || '—'}`;
  return String(event.day?.pairingCode || event.day?.type || event.title || 'Programação');
}

function modeLabel(mode: ReturnType<typeof workMode>) {
  if (mode === 'operating') return 'Tripulando';
  if (mode === 'extra') return 'Deslocamento / extra';
  if (mode === 'stay') return 'Pernoite / descanso';
  if (mode === 'rest') return 'Publicado na escala';
  return 'Programação';
}

export default function RosterLaunchView({ events, setView }: { events: RosterEvent[]; setView: (view: any) => void }) {
  const ordered = [...events].filter((event) => !event.id?.includes('placeholder')).sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime() || String(a.id).localeCompare(String(b.id)));
  const uniqueDays = new Set(ordered.map((event) => dateOf(event).toISOString().slice(0, 10))).size;
  const stays = ordered.filter((event) => workMode(event) === 'stay').length;
  const groundStops = ordered.filter((event) => Number(event.canonical?.groundBeforeMinutes || 0) >= 60).length;

  return <>
    <V139Header title="Escala completa" detail="Linha do tempo canônica, múltiplas programações por dia e continuidade física sem inventar folgas."/>
    <section className="cc-roster-launch-metrics">
      <article><CalendarDays/><span>Dias preservados</span><strong>{uniqueDays}</strong></article>
      <article><Hotel/><span>Pernoites/descansos</span><strong>{stays}</strong></article>
      <article><Clock/><span>Tempos em solo ≥ 60 min</span><strong>{groundStops}</strong></article>
    </section>
    <section className="cc-roster-legend-v1394">
      <h2>Leitura visual</h2>
      <div className="cc139-badges"><span>Verde · voo tripulando</span><span>Cinza · deslocamento/extra</span><span>Roxo · pernoite ou descanso entre jornadas</span></div>
      <p>Os textos “OP/Operando” e “PS/Passageiro” não ocupam mais o título. A distinção é visual e o título prioriza voo, rota e horário.</p>
    </section>
    <section className="cc-roster-timeline-v1394">
      {ordered.map((event) => {
        const mode = workMode(event);
        const hours = duration(event);
        const ground = Number(event.canonical?.groundBeforeMinutes || 0);
        const routine = Array.isArray(event.routine) ? event.routine.filter(Boolean).slice(0, 3) : [];
        const atBase = /DESCANSO_BASE/.test(String(event.day?.type || ''));
        const eventDate = dateOf(event);
        const icon = mode === 'operating' || mode === 'extra' ? <Plane/> : mode === 'stay' ? atBase ? <Home/> : <BedDouble/> : <ShieldCheck/>;
        return <article key={event.id} className="cc-roster-event-v1394" data-work-mode={mode} data-event-kind={event.kind || ''}>
          <header>
            <time dateTime={eventDate.toISOString()}><b>{String(eventDate.getDate()).padStart(2, '0')}</b><span>{new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(eventDate)}</span></time>
            <div className="cc-roster-event-heading"><small>{modeLabel(mode)} · {formatDate(eventDate)}</small><h2>{cardTitle(event, mode)}</h2></div>
            <span className="cc-roster-event-icon">{icon}</span>
          </header>
          {(mode === 'operating' || mode === 'extra') && <div className="cc-roster-flight-schedule"><span><b>Apresentação</b>{event.presentation && event.presentation !== 'Conexão/Solo' ? event.presentation : '—'}</span><span><b>Etapa</b>{event.departure || '—'} → {event.arrival || '—'}</span>{event.subtitle && <span className="cc-roster-flight-detail"><b>Detalhes</b>{event.subtitle}</span>}</div>}
          {mode === 'stay' && <p className="cc-roster-event-summary">{hours ? `${hours.toFixed(1)} h entre o fim da jornada e a próxima apresentação.` : 'Intervalo de continuidade entre jornadas.'} {event.hotel ? `Hotel: ${event.hotel}.` : atBase ? 'Use o endereço de casa salvo no Gerenciador de apresentação.' : 'Hotel ainda não informado.'}</p>}
          {mode === 'rest' && <p className="cc-roster-event-summary">{event.subtitle || 'Código preservado conforme a escala publicada.'}</p>}
          {mode === 'duty' && <p className="cc-roster-event-summary">{event.subtitle || `${event.departure || '—'} → ${event.arrival || '—'}`}</p>}
          <div className="cc-roster-card-details cc-roster-detail-chips-v1394">
            {ground >= 60 && <span className="cc-ground-time"><Clock/> Solo/conexão {ground} min</span>}
            {mode === 'stay' && <span className="cc-rest-window"><BedDouble/> Sono prioritário: pelo menos 8 h</span>}
            {event.hotel && <span className="cc-rest-window"><Hotel/> {event.hotel}</span>}
            {routine.map((item) => <span className="cc-routine-card-detail" key={item}><Dumbbell/> {item}</span>)}
          </div>
          <div className="cc-roster-actions-v1394">
            {(mode === 'stay' || event.hotel) && <button onClick={() => setView('presentation')}><Building2/> Hotel, quarto e apresentação</button>}
            {(mode === 'stay' || mode === 'rest') && <button onClick={() => setView('routine')}><Dumbbell/> Planejar rotina</button>}
            {(mode === 'operating' || mode === 'extra') && <button onClick={() => setView('departure')}><MapPin/> Saída Inteligente</button>}
          </div>
        </article>;
      })}
      {!ordered.length && <article className="cc-roster-empty-v1394"><CalendarDays/><h2>Nenhuma escala carregada</h2><p>Importe o PDF ou sincronize o calendário autorizado do iFlight.</p></article>}
    </section>
  </>;
}
