import React, { useState } from 'react';
import {
  Plane,
  Moon,
  Sun,
  BedDouble,
  UserCheck,
  Clock,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Users,
  MapPin,
  Search,
  Filter,
  ArrowLeft,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────── */
interface FlightLeg {
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  nextDay?: boolean;
  aircraft?: string;
  crew?: number;
}

interface RosterEvent {
  id: string;
  type: 'flight' | 'layover' | 'reserve' | 'standby' | 'off' | 'continuation';
  date: string;
  dayOfWeek: string;
  dayNum: number;
  month: string;
  title?: string;
  subtitle?: string;
  startTime?: string;
  endTime?: string;
  duration?: string;
  station?: string;
  legs?: FlightLeg[];
  compliance?: {
    status: 'conforme' | 'atencao' | 'alerta';
    label: string;
    detail?: string;
  };
}

interface RosterViewProps {
  onBack?: () => void;
  events?: RosterEvent[];
}

/* ── Compliance Badge ───────────────────────────────────────── */
function ComplianceBadge({ status, label }: { status: 'conforme' | 'atencao' | 'alerta'; label: string }) {
  const cls = {
    conforme: 'cc-badge cc-badge-conforme',
    atencao:  'cc-badge cc-badge-atencao',
    alerta:   'cc-badge cc-badge-alerta',
  }[status];

  const Icon = {
    conforme: ShieldCheck,
    atencao:  AlertTriangle,
    alerta:   AlertTriangle,
  }[status];

  return (
    <span className={cls}>
      <Icon size={9} />
      {label}
    </span>
  );
}

/* ── Flight Leg Row ─────────────────────────────────────────── */
function LegRow({ leg }: { leg: FlightLeg }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--surface-border)' }}>
      <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
        <Plane size={11} style={{ color: 'var(--event-flight)' }} />
        <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--foreground)' }}>{leg.flightNumber}</span>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm font-black" style={{ color: 'var(--foreground)' }}>{leg.origin}</span>
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>{leg.departure}</span>
          <div className="flex-1 h-px" style={{ background: 'var(--surface-border)' }} />
          <Plane size={10} className="flex-shrink-0 rotate-90" style={{ color: 'var(--foreground-subtle)' }} />
          <div className="flex-1 h-px" style={{ background: 'var(--surface-border)' }} />
          <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
            {leg.arrival}
            {leg.nextDay && <span style={{ color: 'var(--event-flight)' }}> +1</span>}
          </span>
        </div>
        <span className="text-sm font-black" style={{ color: 'var(--foreground)' }}>{leg.destination}</span>
      </div>
      {leg.crew && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Users size={10} style={{ color: 'var(--foreground-subtle)' }} />
          <span className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>{leg.crew}</span>
        </div>
      )}
    </div>
  );
}

/* ── Event Card ─────────────────────────────────────────────── */
function EventCard({ event }: { event: RosterEvent }) {
  const [expanded, setExpanded] = useState(false);

  const typeClass: Record<string, string> = {
    flight:       'flight',
    layover:      'layover',
    reserve:      'reserve',
    standby:      'standby',
    off:          'off',
    continuation: 'off',
  };

  const TypeIcon: Record<string, React.FC<{ size?: number }>> = {
    flight:       ({ size }) => <Plane size={size} style={{ color: 'var(--event-flight)' }} />,
    layover:      ({ size }) => <BedDouble size={size} style={{ color: 'var(--event-layover)' }} />,
    reserve:      ({ size }) => <UserCheck size={size} style={{ color: 'var(--event-reserve)' }} />,
    standby:      ({ size }) => <Clock size={size} style={{ color: 'var(--event-standby)' }} />,
    off:          ({ size }) => <Moon size={size} style={{ color: 'var(--event-off)' }} />,
    continuation: ({ size }) => <Sun size={size} style={{ color: 'var(--event-layover)' }} />,
  };

  const Icon = TypeIcon[event.type] ?? TypeIcon.off;
  const hasLegs = event.legs && event.legs.length > 0;
  const hasDetails = hasLegs || event.subtitle;

  return (
    <div
      className={`cc-event-card ${typeClass[event.type] ?? 'off'}`}
      onClick={() => hasDetails && setExpanded((v) => !v)}
      role={hasDetails ? 'button' : undefined}
      tabIndex={hasDetails ? 0 : undefined}
    >
      <div className="flex items-start gap-3 p-4 pl-5">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <Icon size={18} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold leading-tight line-clamp-1" style={{ color: 'var(--foreground)' }}>
                {event.title}
              </h3>
              {event.subtitle && !expanded && (
                <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--foreground-muted)' }}>
                  {event.subtitle}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {event.compliance && (
                <ComplianceBadge status={event.compliance.status} label={event.compliance.label} />
              )}
              {hasDetails && (
                <ChevronDown
                  size={16}
                  style={{
                    color: 'var(--foreground-subtle)',
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              )}
            </div>
          </div>

          {/* Times */}
          {(event.startTime || event.duration) && (
            <div className="flex items-center gap-3 mt-2">
              {event.startTime && event.endTime && (
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>
                    {event.startTime}
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="w-8 h-px" style={{ background: 'var(--surface-border)' }} />
                    <Plane size={10} className="rotate-90" style={{ color: 'var(--foreground-subtle)' }} />
                    <div className="w-8 h-px" style={{ background: 'var(--surface-border)' }} />
                  </div>
                  <span className="text-xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>
                    {event.endTime}
                  </span>
                </div>
              )}
              {event.duration && (
                <span className="text-xs font-semibold" style={{ color: 'var(--foreground-muted)' }}>
                  {event.duration}
                </span>
              )}
              {event.station && (
                <div className="flex items-center gap-1 ml-auto">
                  <MapPin size={10} style={{ color: 'var(--foreground-subtle)' }} />
                  <span className="text-xs font-bold" style={{ color: 'var(--foreground-muted)' }}>
                    {event.station}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Compliance detail */}
          {event.compliance?.detail && !expanded && (
            <p className="text-xs mt-1.5 line-clamp-1" style={{ color: 'var(--foreground-subtle)' }}>
              {event.compliance.detail}
            </p>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && hasDetails && (
        <div className="px-5 pb-4 pt-0">
          <div className="pt-3" style={{ borderTop: '1px solid var(--surface-border)' }}>
            {event.subtitle && (
              <p className="text-xs mb-3" style={{ color: 'var(--foreground-muted)' }}>
                {event.subtitle}
              </p>
            )}
            {hasLegs && (
              <div>
                {event.legs!.map((leg, i) => (
                  <LegRow key={i} leg={leg} />
                ))}
              </div>
            )}
            {event.compliance?.detail && (
              <div
                className="mt-3 rounded-lg px-3 py-2 flex items-start gap-2"
                style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)' }}
              >
                <ShieldCheck size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--event-conforme)' }} />
                <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                  {event.compliance.detail}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Day Group ──────────────────────────────────────────────── */
function DayGroup({ dayOfWeek, dayNum, month, events }: {
  dayOfWeek: string;
  dayNum: number;
  month: string;
  events: RosterEvent[];
}) {
  const isToday = (() => {
    const now = new Date();
    return now.getDate() === dayNum && now.toLocaleString('pt-BR', { month: 'short' }).toLowerCase() === month.toLowerCase();
  })();

  return (
    <div className="flex gap-4">
      {/* Date column */}
      <div className="flex flex-col items-center w-10 flex-shrink-0 pt-1">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: isToday ? 'var(--accent)' : 'var(--foreground-subtle)' }}
        >
          {dayOfWeek}
        </span>
        <span
          className="text-2xl font-black leading-none mt-0.5"
          style={{ color: isToday ? 'var(--accent)' : 'var(--foreground)' }}
        >
          {dayNum}
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
          style={{ color: isToday ? 'var(--accent)' : 'var(--foreground-subtle)' }}
        >
          {month}
        </span>
        {isToday && (
          <div className="cc-live-dot mt-2" />
        )}
      </div>

      {/* Events column */}
      <div className="flex-1 min-w-0 space-y-2 pb-2">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

/* ── Demo Data ──────────────────────────────────────────────── */
const DEMO_EVENTS: RosterEvent[] = [
  {
    id: 'f1',
    type: 'flight',
    date: '2026-07-06',
    dayOfWeek: 'SEG',
    dayNum: 6,
    month: 'JUL',
    title: 'LA 3455 · FOR → GRU',
    subtitle: 'Apres. 04:15 · Solo 15h15 · Guarulhos',
    startTime: '04:45',
    endTime: '08:20',
    legs: [
      { flightNumber: 'LA3455', origin: 'FOR', destination: 'GRU', departure: '04:45', arrival: '08:20', aircraft: 'A320', crew: 4 },
    ],
    compliance: {
      status: 'conforme',
      label: 'Conforme',
      detail: 'RBAC 117 B.1 / ACT · 9h · 1-2 etapas · início 04:15 · encerra até 13:15 · aplica o mais restritivo',
    },
  },
  {
    id: 'l1',
    type: 'layover',
    date: '2026-07-06',
    dayOfWeek: 'SEG',
    dayNum: 6,
    month: 'JUL',
    title: 'Estadia diurna · GRU',
    subtitle: 'Estadia diurna em Guarulhos',
    startTime: '08:20',
    endTime: '23:35',
    duration: '15h 15min',
    station: 'GRU',
    compliance: {
      status: 'conforme',
      label: 'Repouso OK',
      detail: 'Repouso mínimo de 10h cumprido. Próxima apresentação às 23:05.',
    },
  },
  {
    id: 'f2',
    type: 'flight',
    date: '2026-07-06',
    dayOfWeek: 'SEG',
    dayNum: 6,
    month: 'JUL',
    title: 'LA 3394 · GRU → PMW',
    subtitle: 'Decolagem 23:35 · Chegada 02:00 +1 · Após solo 10h40',
    startTime: '23:35',
    endTime: '02:00',
    legs: [
      { flightNumber: 'LA3394', origin: 'GRU', destination: 'PMW', departure: '23:35', arrival: '02:00', nextDay: true, aircraft: 'B738', crew: 4 },
    ],
    compliance: {
      status: 'conforme',
      label: 'Conforme',
      detail: 'RBAC 117 B.1 / ACT · 8h25 · 1 etapa · início 23:05 · encerra até 07:05 +1',
    },
  },
  {
    id: 'f3',
    type: 'flight',
    date: '2026-07-08',
    dayOfWeek: 'QUA',
    dayNum: 8,
    month: 'JUL',
    title: 'LA 3838 · GRU → CXJ',
    subtitle: 'Apres. 09:03 · Solo 1h · Guarulhos',
    startTime: '09:50',
    endTime: '11:30',
    legs: [
      { flightNumber: 'LA3838', origin: 'GRU', destination: 'CXJ', departure: '09:50', arrival: '11:30', aircraft: 'E195', crew: 3 },
    ],
    compliance: {
      status: 'conforme',
      label: 'Conforme',
      detail: 'RBAC 117 B.1 / ACT · 13h · 3-4 etapas · início 09:03 · encerra até 22:03',
    },
  },
  {
    id: 'r1',
    type: 'reserve',
    date: '2026-07-10',
    dayOfWeek: 'SEX',
    dayNum: 10,
    month: 'JUL',
    title: 'ASB · Reserva Aeroporto',
    subtitle: 'Airport Stand By — aguardando acionamento',
    startTime: '06:00',
    endTime: '14:00',
    duration: '8h',
    station: 'BSB',
    compliance: {
      status: 'atencao',
      label: 'Em reserva',
      detail: 'ACT Art. 23 · Reserva aeroporto · máx 8h · não acionado',
    },
  },
  {
    id: 'sb1',
    type: 'standby',
    date: '2026-07-11',
    dayOfWeek: 'SÁB',
    dayNum: 11,
    month: 'JUL',
    title: 'HSB · Sobreaviso',
    subtitle: 'Home Stand By — disponível para acionamento',
    startTime: '08:00',
    endTime: '20:00',
    duration: '12h',
    station: 'BSB',
    compliance: {
      status: 'atencao',
      label: 'Sobreaviso',
      detail: 'ACT Art. 24 · Sobreaviso domiciliar · máx 12h · não acionado',
    },
  },
];

/* ── Group events by day ────────────────────────────────────── */
function groupByDay(events: RosterEvent[]) {
  const map = new Map<string, { dayOfWeek: string; dayNum: number; month: string; events: RosterEvent[] }>();
  for (const event of events) {
    const key = `${event.dayNum}-${event.month}`;
    if (!map.has(key)) {
      map.set(key, { dayOfWeek: event.dayOfWeek, dayNum: event.dayNum, month: event.month, events: [] });
    }
    map.get(key)!.events.push(event);
  }
  return Array.from(map.values());
}

/* ── Main Component ─────────────────────────────────────────── */
const RosterView: React.FC<RosterViewProps> = ({ onBack, events }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const sourceEvents = events ?? DEMO_EVENTS;
  const filtered = query
    ? sourceEvents.filter((e) =>
        (e.title ?? '').toLowerCase().includes(query.toLowerCase()) ||
        (e.subtitle ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : sourceEvents;

  const days = groupByDay(filtered);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-4 py-3"
        style={{
          background: 'var(--sidebar-bg)',
          borderBottom: '1px solid var(--surface-border)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="flex items-center gap-3">
          {onBack && (
            <button className="cc-icon-btn" onClick={onBack} aria-label="Voltar">
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h1 className="text-base font-bold leading-tight" style={{ color: 'var(--foreground)' }}>
              Minha Escala
            </h1>
            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
              Julho 2026 · Horário local
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="cc-icon-btn"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Buscar"
          >
            <Search size={16} />
          </button>
          <button className="cc-icon-btn" aria-label="Filtrar">
            <Filter size={16} />
          </button>
        </div>
      </header>

      {/* Search bar */}
      {searchOpen && (
        <div className="px-4 py-2" style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--surface-border)' }}>
          <input
            className="cc-input text-sm"
            placeholder="Buscar voo, aeroporto..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {/* Month pills */}
      <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto" style={{ borderBottom: '1px solid var(--surface-border)' }}>
        {['MAI', 'JUN', 'JUL', 'AGO', 'SET'].map((m) => (
          <button key={m} className={`cc-month-pill ${m === 'JUL' ? 'active' : ''}`}>
            {m}
          </button>
        ))}
      </div>

      {/* Roster list */}
      <main className="flex-1 px-4 py-4 space-y-6 overflow-y-auto pb-28">
        {days.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Plane size={32} style={{ color: 'var(--foreground-subtle)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--foreground-muted)' }}>
              Nenhum evento encontrado
            </p>
          </div>
        ) : (
          days.map((day) => (
            <DayGroup
              key={`${day.dayNum}-${day.month}`}
              dayOfWeek={day.dayOfWeek}
              dayNum={day.dayNum}
              month={day.month}
              events={day.events}
            />
          ))
        )}
      </main>
    </div>
  );
};

export default RosterView;
