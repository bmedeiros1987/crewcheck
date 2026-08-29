import './crewcheck-dynamic-calendar.css';

type Props = { date: Date; className?: string; compact?: boolean; decorative?: boolean };

function fullDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export default function CrewCheckDynamicCalendar({ date, className = '', compact = false, decorative = false }: Props) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '').toUpperCase();
  return <span
    className={`cc-dynamic-calendar${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
    role={decorative ? undefined : 'img'}
    aria-hidden={decorative || undefined}
    aria-label={decorative ? undefined : `Programação de ${fullDate(date)}`}
    data-calendar-day={day}
  >
    <span className="cc-dynamic-calendar-rings" aria-hidden="true"><i/><i/></span>
    <span className="cc-dynamic-calendar-top" aria-hidden="true">✈</span>
    <span className="cc-dynamic-calendar-sheet" aria-hidden="true"><b key={`${date.getFullYear()}-${date.getMonth()}-${day}`}>{day}</b><small>{month}</small></span>
  </span>;
}
