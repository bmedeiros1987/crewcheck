import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plane, CalendarDays, Clock, RefreshCw } from 'lucide-react';
import { isAuthenticated } from '@/lib/authClient';
import { listSavedRosters, openSavedRoster, type SavedRosterSummary } from '@/lib/databaseClient';
import type { CrewRoster, RosterDay } from '@/lib/pdfParser';

type WatchEvent = {
  id: string;
  date: string;
  day: string;
  title: string;
  time: string;
  route: string;
  detail: string;
  type: string;
};

function parseRosterDate(value?: string): Date | null {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12, 0, 0);
}

function dayTime(day: RosterDay): string {
  const first = day.legs?.[0];
  const last = day.legs?.[day.legs.length - 1];
  if (first?.departureTime || last?.arrivalTime) return `${day.dutyReport || first?.departureTime || '—'}–${day.dutyDebrief || last?.arrivalTime || '—'}`;
  if (day.dutyReport || day.dutyDebrief) return `${day.dutyReport || '—'}–${day.dutyDebrief || '—'}`;
  return '—';
}

function dayTitle(day: RosterDay): string {
  if (day.legs?.length) return day.legs.map((leg) => leg.flightNumber).filter(Boolean).slice(0, 2).join(' · ') || 'Voo';
  if (/DOF|DO|OFF/i.test(day.type || day.pairingCode || '')) return 'Folga';
  if (/CRM/i.test(day.type || day.pairingCode || '')) return 'CRM';
  if (/HSB|HSBE|ASB|RES/i.test(day.type || day.pairingCode || '')) return day.pairingCode || day.type || 'Reserva';
  return day.pairingCode || day.type || 'Programação';
}

function dayRoute(day: RosterDay): string {
  const legs = day.legs || [];
  if (legs.length) return `${legs[0].origin || '—'} → ${legs[legs.length - 1].destination || '—'}`;
  return day.base || '—';
}

function buildWatchEvents(roster: CrewRoster | null): WatchEvent[] {
  if (!roster?.days?.length) return [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10);
  return roster.days
    .map((day, index) => ({ day, date: parseRosterDate(day.date), index }))
    .filter((item) => item.date && item.date >= start && item.date <= end)
    .sort((a, b) => Number(a.date) - Number(b.date))
    .map(({ day, date, index }) => ({
      id: `${day.date}-${index}`,
      date: day.date,
      day: date!.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      title: dayTitle(day),
      time: dayTime(day),
      route: dayRoute(day),
      detail: day.legs?.length ? `${day.legs.length} trecho(s) · ${day.pairingCode || 'pairing'}` : (day.hotel ? `Hotel ${day.hotel}` : day.rawText?.slice(0, 80) || 'Detalhe na escala completa'),
      type: day.type || 'OTHER',
    }));
}

function selectBestSummary(items: SavedRosterSummary[]): SavedRosterSummary | null {
  if (!items.length) return null;
  const now = new Date();
  const currentKey = now.getFullYear() * 100 + now.getMonth() + 1;
  return items.find((item) => ((Number(item.year) || 0) * 100 + (Number(item.month) || 0)) >= currentKey) || items[0];
}

export default function WatchPage({ device = 'samsung' }: { device?: 'samsung' | 'apple' }) {
  const [roster, setRoster] = useState<CrewRoster | null>(null);
  const [summary, setSummary] = useState<SavedRosterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const events = useMemo(() => buildWatchEvents(roster), [roster]);
  const isAppleWatch = device === 'apple';
  const deviceLabel = isAppleWatch ? 'Apple Watch' : 'Galaxy Watch / Wear OS';
  const pageTitle = isAppleWatch ? 'CrewCheck Apple Watch' : 'CrewCheck Watch';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (!isAuthenticated()) throw new Error('Faça login no celular ou navegador primeiro.');
      const list = await listSavedRosters(8);
      const best = selectBestSummary(list);
      if (!best) throw new Error('Nenhuma escala salva encontrada.');
      const data = await openSavedRoster(best.id);
      setSummary(best);
      setRoster(data.roster);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a escala no relógio.');
      setRoster(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <main className={`crewcheck-watch-page min-h-screen px-2 py-3 text-white ${isAppleWatch ? 'crewcheck-apple-watch-page bg-black' : 'bg-[#050b14]'}`}>
      <header className="sticky top-0 z-10 rounded-[1.4rem] border border-cyan-200/15 bg-[#07111f]/95 p-3 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200/75">{pageTitle}</p>
            <h1 className="truncate text-lg font-black">{isAppleWatch ? 'Escala no Apple Watch' : 'Minha escala'}</h1>
            <p className="truncate text-[11px] font-bold text-slate-300">{summary ? `${String(summary.month).padStart(2, '0')}/${summary.year} · ${summary.base || 'base'}` : deviceLabel}</p>
          </div>
          <button onClick={() => void load()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-100" aria-label="Atualizar escala">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="mt-5 flex flex-col items-center justify-center gap-3 rounded-[1.4rem] border border-white/10 bg-white/[0.05] p-5 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-cyan-200" />
          <p className="text-sm font-black">Carregando escala...</p>
        </div>
      ) : error ? (
        <div className="mt-5 rounded-[1.4rem] border border-amber-200/25 bg-amber-300/10 p-4 text-sm font-bold text-amber-50">
          {error}<br /><a href="/login" className="mt-3 inline-flex rounded-2xl bg-white px-3 py-2 text-xs font-black text-slate-950">Entrar</a>
        </div>
      ) : events.length ? (
        <div className="mt-3 grid gap-2">
          {events.map((event) => (
            <article key={event.id} className="rounded-[1.35rem] border border-cyan-200/12 bg-[linear-gradient(145deg,rgba(14,165,233,.13),rgba(255,255,255,.055))] p-3 shadow-xl">
              <div className="flex items-start gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-cyan-300 text-[#07111f]">{event.type === 'VOO' ? <Plane className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/70">{event.day}</p>
                  <h2 className="truncate text-base font-black">{event.title}</h2>
                  <p className="mt-0.5 truncate text-xs font-bold text-slate-300">{event.route}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="inline-flex items-center gap-1 text-xs font-black text-cyan-100"><Clock className="h-3 w-3" />{event.time}</span>
                <span className="truncate text-[10px] font-bold text-slate-400">{event.detail}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-white/[0.05] p-4 text-sm font-bold text-slate-200">Nenhuma programação nos próximos dias.</div>
      )}
    </main>
  );
}
