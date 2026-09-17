import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  CloudSun,
  Crown,
  Loader2,
  MapPin,
  Newspaper,
  Plane,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { getStoredUser } from '@/lib/authClient';
import { getBillingStatus, type BillingStatus } from '@/lib/billingClient';
import { listSavedRosters, openSavedRoster, type SavedRosterSummary } from '@/lib/databaseClient';
import type { CrewRoster, RosterDay } from '@/lib/pdfParser';
import {
  AVIATION_NEWS_SOURCE_NOTE,
  loadAviationNews,
  type AviationNewsItem,
} from '@/lib/aviationNewsClient';

type TvMode = 'briefing' | 'operational' | 'ambient';
type PrivacyMode = 'family' | 'private';

type TvActivity = {
  id: string;
  day: RosterDay;
  startAt: Date;
  endAt: Date;
  title: string;
  reportTime: string;
  endTime: string;
  route: string;
  flight: string;
  origin: string;
  destination: string;
  type: string;
  hotel: string;
};

type RadarSnapshot = {
  ok?: boolean;
  status?: string;
  gate?: string;
  terminal?: string;
  aircraft?: string;
  registration?: string;
  message?: string;
  remoteStand?: boolean;
};

type WeatherSnapshot = Record<string, any> & {
  ok?: boolean;
  airport?: string;
  city?: string;
  message?: string;
};

function parseRosterDate(value?: string, time = '12:00') {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const timeMatch = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = timeMatch ? Number(timeMatch[1]) : 12;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), hour, minute, 0, 0);
}

function dayTitle(day: RosterDay) {
  if (day.legs?.length) return day.legs.map((leg) => leg.flightNumber).filter(Boolean).slice(0, 2).join(' · ') || 'Voo';
  const code = String(day.pairingCode || day.type || '').toUpperCase();
  if (/DOF|DO|OFF|DR/.test(code)) return 'Folga / descanso';
  if (/HSB|HSBE/.test(code)) return 'Sobreaviso';
  if (/ASB|RES/.test(code)) return 'Reserva';
  if (/CRM/.test(code)) return 'CRM';
  if (/MCK/.test(code)) return 'Treinamento MCK';
  return day.pairingCode || day.type || 'Programação';
}

function dayType(day: RosterDay) {
  if (day.legs?.length) return 'VOO';
  return String(day.type || day.pairingCode || 'OTHER').toUpperCase();
}

function buildActivities(roster: CrewRoster | null): TvActivity[] {
  if (!roster?.days?.length) return [];
  return roster.days
    .map((day, index) => {
      const first = day.legs?.[0];
      const last = day.legs?.[day.legs.length - 1];
      const reportTime = String(day.dutyReport || first?.departureTime || '12:00');
      const endTime = String(day.dutyDebrief || last?.arrivalTime || reportTime);
      const startAt = parseRosterDate(day.date, reportTime);
      let endAt = parseRosterDate(day.date, endTime);
      if (!startAt || !endAt) return null;
      if (endAt.getTime() < startAt.getTime()) endAt = new Date(endAt.getTime() + 24 * 60 * 60_000);
      const origin = String(first?.origin || day.base || '').toUpperCase();
      const destination = String(last?.destination || origin || '').toUpperCase();
      const flight = String(first?.flightNumber || '').trim();
      return {
        id: `${day.date}-${index}-${flight || day.pairingCode || day.type || 'activity'}`,
        day,
        startAt,
        endAt,
        title: dayTitle(day),
        reportTime,
        endTime,
        route: day.legs?.length ? `${origin || '—'} → ${destination || '—'}` : (origin || '—'),
        flight,
        origin,
        destination,
        type: dayType(day),
        hotel: String(day.hotel || '').trim(),
      } satisfies TvActivity;
    })
    .filter((item): item is TvActivity => Boolean(item))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

function selectBestSummary(items: SavedRosterSummary[]) {
  if (!items.length) return null;
  const now = new Date();
  const currentKey = now.getFullYear() * 100 + now.getMonth() + 1;
  return items.find((item) => ((Number(item.year) || 0) * 100 + (Number(item.month) || 0)) >= currentKey) || items[0];
}

function minutesUntil(date: Date, now: Date) {
  return Math.round((date.getTime() - now.getTime()) / 60_000);
}

function countdownLabel(activity: TvActivity | null, now: Date) {
  if (!activity) return 'Sem próxima atividade';
  if (now >= activity.startAt && now <= activity.endAt) return 'Em andamento';
  const diff = Math.max(0, minutesUntil(activity.startAt, now));
  if (diff < 60) return `em ${diff} min`;
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  if (hours < 24) return `em ${hours}h${minutes ? String(minutes).padStart(2, '0') : ''}`;
  const days = Math.floor(hours / 24);
  return `em ${days} dia${days === 1 ? '' : 's'}`;
}

function automaticMode(activity: TvActivity | null, now: Date): TvMode {
  if (!activity) return 'ambient';
  if (now >= activity.startAt && now <= activity.endAt) return 'operational';
  const diff = minutesUntil(activity.startAt, now);
  if (diff >= 0 && diff <= 180) return 'briefing';
  if (diff >= 0 && diff <= 18 * 60) return 'operational';
  return 'ambient';
}

function modeLabel(mode: TvMode) {
  if (mode === 'briefing') return 'Briefing';
  if (mode === 'operational') return 'Operacional';
  return 'Ambient';
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(date);
}

function relativeNewsTime(value: string | null) {
  if (!value) return 'Atualização recente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Atualização recente';
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return `há ${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? '' : 's'}`;
}

function weatherTemperature(weather: WeatherSnapshot | null) {
  if (!weather) return null;
  const candidates = [
    weather.temperatureC,
    weather.temperature,
    weather.tempC,
    weather.current?.temperature_2m,
    weather.current?.temperature,
  ];
  for (const candidate of candidates) {
    const number = Number(candidate);
    if (Number.isFinite(number)) return Math.round(number);
  }
  return null;
}

function weatherCondition(weather: WeatherSnapshot | null) {
  if (!weather) return '';
  return String(
    weather.condition ||
    weather.summary ||
    weather.description ||
    weather.current?.condition ||
    weather.current?.summary ||
    weather.message ||
    '',
  ).trim();
}

function premiumFromBilling(billing: BillingStatus | null) {
  const user = getStoredUser() as any;
  const role = String(user?.role || window.localStorage.getItem('crewcheck_role') || '').toLowerCase();
  return Boolean(billing?.premiumAccess || billing?.plan?.id === 'admin' || role.includes('admin'));
}

function weekStats(activities: TvActivity[], now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60_000);
  const week = activities.filter((item) => item.startAt >= start && item.startAt < end);
  const flights = week.reduce((sum, item) => sum + Number(item.day.legs?.length || 0), 0);
  const duties = week.filter((item) => !/DOF|DO|OFF|DR/.test(item.type)).length;
  const overnights = week.filter((item) => Boolean(item.hotel)).length;
  return { flights, duties, overnights };
}

function lockedCard(title: string, description: string) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-[1.6rem] border border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-5 text-center">
      <Crown className="mb-3 h-7 w-7 text-fuchsia-200" />
      <p className="text-sm font-black text-white">{title}</p>
      <p className="mt-2 max-w-sm text-xs font-semibold leading-relaxed text-slate-400">{description}</p>
      <span className="mt-4 rounded-full border border-fuchsia-300/25 bg-fuchsia-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-100">Premium</span>
    </div>
  );
}

export default function PremiumTvPage() {
  const [roster, setRoster] = useState<CrewRoster | null>(null);
  const [summary, setSummary] = useState<SavedRosterSummary | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [news, setNews] = useState<AviationNewsItem[]>([]);
  const [newsStale, setNewsStale] = useState(false);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [radar, setRadar] = useState<RadarSnapshot | null>(null);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [forcedMode, setForcedMode] = useState<TvMode | 'auto'>('auto');
  const [privacy, setPrivacy] = useState<PrivacyMode>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('private') === '1' || window.localStorage.getItem('crewcheck_tv_privacy') === 'private' ? 'private' : 'family';
    } catch {
      return 'family';
    }
  });

  const activities = useMemo(() => buildActivities(roster), [roster]);
  const currentOrNext = useMemo(() => activities.find((item) => item.endAt.getTime() >= now.getTime() - 10 * 60_000) || null, [activities, now]);
  const autoMode = automaticMode(currentOrNext, now);
  const mode = forcedMode === 'auto' ? autoMode : forcedMode;
  const premium = premiumFromBilling(billing);
  const stats = useMemo(() => weekStats(activities, now), [activities, now]);
  const airport = String(currentOrNext?.origin || currentOrNext?.destination || summary?.base || '').toUpperCase();
  const nextAirportSet = useMemo(() => [currentOrNext?.origin, currentOrNext?.destination, summary?.base].filter(Boolean) as string[], [currentOrNext?.origin, currentOrNext?.destination, summary?.base]);

  const user = getStoredUser();
  const firstName = String(user?.name || '').trim().split(/\s+/)[0] || 'Tripulante';
  const countdown = countdownLabel(currentOrNext, now);
  const temperature = weatherTemperature(weather);
  const condition = weatherCondition(weather);
  const gate = String(radar?.gate || '').trim();
  const remoteStand = Boolean(radar?.remoteStand || /remot/i.test(gate));
  const status = String(radar?.status || '').trim();

  const loadBase = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [saved, billingResult] = await Promise.all([
        listSavedRosters(8),
        getBillingStatus().catch(() => null),
      ]);
      const best = selectBestSummary(saved);
      if (!best) throw new Error('Nenhuma escala salva encontrada para exibir na TV.');
      const data = await openSavedRoster(best.id, best);
      setSummary(best);
      setRoster(data.roster);
      setBilling(billingResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível montar o CrewCheck TV.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadBase(false);
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    const rosterRefresh = window.setInterval(() => void loadBase(true), 10 * 60_000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(rosterRefresh);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!premium) {
      setNews([]);
      setNewsStale(false);
      return () => { alive = false; };
    }
    const load = () => loadAviationNews(nextAirportSet, 6)
      .then((result) => {
        if (!alive) return;
        setNews(result.items);
        setNewsStale(result.stale);
      })
      .catch(() => {
        if (!alive) return;
        setNewsStale(true);
      });
    void load();
    const timer = window.setInterval(load, 20 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [premium, nextAirportSet.join('|')]);

  useEffect(() => {
    let alive = true;
    const loadSignals = async () => {
      if (airport) {
        try {
          const response = await fetch(`/api/weather/airport?airport=${encodeURIComponent(airport)}`, { cache: 'no-store' });
          const payload = await response.json().catch(() => null);
          if (alive) setWeather(payload && typeof payload === 'object' ? payload : null);
        } catch {
          if (alive) setWeather(null);
        }
      }
      const flight = String(currentOrNext?.flight || '').trim();
      if (flight && /\d/.test(flight)) {
        try {
          const params = new URLSearchParams({
            flight,
            origin: String(currentOrNext?.origin || ''),
            destination: String(currentOrNext?.destination || ''),
            force: '0',
          });
          const response = await fetch(`/api/radar-flight?${params.toString()}`, { cache: 'no-store' });
          const payload = await response.json().catch(() => null);
          if (alive) setRadar(payload && typeof payload === 'object' ? payload : null);
        } catch {
          if (alive) setRadar(null);
        }
      } else if (alive) {
        setRadar(null);
      }
    };
    void loadSignals();
    const timer = window.setInterval(loadSignals, 2 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [airport, currentOrNext?.flight, currentOrNext?.origin, currentOrNext?.destination]);

  useEffect(() => {
    try { window.localStorage.setItem('crewcheck_tv_privacy', privacy); } catch {}
  }, [privacy]);

  const ticker = [
    currentOrNext ? `${currentOrNext.title} · ${currentOrNext.route} · apresentação ${currentOrNext.reportTime}` : 'Nenhuma próxima programação detectada',
    gate ? `Portão ${gate}${remoteStand ? ' · Remota' : ''}${status ? ` · ${status}` : ''}` : status ? `Status: ${status}` : '',
    premium && news[0]?.title ? `Aviação: ${news[0].title}` : '',
  ].filter(Boolean);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#030712] text-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-cyan-300" />
          <p className="mt-4 text-lg font-black">Preparando CrewCheck TV</p>
          <p className="mt-1 text-sm font-semibold text-slate-400">Sua operação em modo ambiente.</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#030712] px-8 text-white">
        <div className="max-w-xl rounded-[2rem] border border-amber-300/20 bg-amber-300/[0.07] p-8 text-center">
          <Plane className="mx-auto h-9 w-9 text-amber-200" />
          <h1 className="mt-4 text-2xl font-black">CrewCheck TV</h1>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-amber-50/80">{error}</p>
          <button onClick={() => void loadBase(true)} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950">
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030712] text-white selection:bg-cyan-300/30">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(34,211,238,.15),transparent_27%),radial-gradient(circle_at_84%_18%,rgba(217,70,239,.15),transparent_30%),radial-gradient(circle_at_70%_84%,rgba(59,130,246,.11),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1920px] flex-col p-5 2xl:p-7">
        <header className="flex items-center justify-between gap-6 rounded-[1.7rem] border border-white/10 bg-white/[0.045] px-6 py-4 shadow-2xl backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ec4899,#8b5cf6_55%,#22d3ee)] shadow-lg shadow-fuchsia-500/10">
              <Plane className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-tight">CrewCheck TV</h1>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">{modeLabel(mode)}</span>
                {premium ? <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-100"><Crown className="h-3 w-3" /> Premium</span> : <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">Essential</span>}
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-slate-400">{privacy === 'family' ? `${firstName} · visão familiar` : `${firstName} · visão privada`} · {summary ? `${String(summary.month).padStart(2, '0')}/${summary.year}` : 'escala ativa'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {premium && (
              <div className="hidden items-center gap-1 rounded-2xl border border-white/10 bg-black/20 p-1 lg:flex">
                {(['auto', 'briefing', 'operational', 'ambient'] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => setForcedMode(item)}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition ${forcedMode === item ? 'bg-white text-slate-950' : 'text-slate-400 hover:bg-white/10 hover:text-white focus:bg-white focus:text-slate-950'}`}
                  >
                    {item === 'auto' ? 'Auto' : modeLabel(item)}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setPrivacy((value) => value === 'family' ? 'private' : 'family')}
              className="hidden rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300 hover:bg-white/10 focus:bg-white focus:text-slate-950 md:inline-flex"
            >
              {privacy === 'family' ? 'Privacidade: família' : 'Privacidade: privada'}
            </button>
            <button onClick={() => void loadBase(true)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white focus:bg-white focus:text-slate-950" aria-label="Atualizar painel">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <div className="min-w-[130px] text-right">
              <p className="text-3xl font-black tabular-nums tracking-tight">{formatClock(now)}</p>
              <p className="text-xs font-bold capitalize text-slate-400">{formatDate(now)}</p>
            </div>
          </div>
        </header>

        <section className="mt-5 grid flex-1 grid-cols-12 gap-5">
          <div className="col-span-12 flex min-h-[420px] flex-col rounded-[2rem] border border-cyan-200/15 bg-[linear-gradient(145deg,rgba(6,182,212,.12),rgba(15,23,42,.78)_42%,rgba(217,70,239,.07))] p-7 shadow-2xl xl:col-span-7 2xl:p-9">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/75">{mode === 'ambient' ? 'Próximo compromisso' : mode === 'briefing' ? 'Seu briefing agora' : 'Agora / próximo'}</p>
                <h2 className="mt-3 max-w-4xl text-4xl font-black leading-[1.04] tracking-tight 2xl:text-6xl">{currentOrNext?.title || 'Sem programação próxima'}</h2>
                <p className="mt-3 text-xl font-black text-cyan-100/90 2xl:text-2xl">{currentOrNext?.route || 'Aproveite o período livre'}</p>
              </div>
              <div className="rounded-[1.5rem] border border-cyan-200/15 bg-cyan-300/[0.08] px-5 py-4 text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/60">Contagem</p>
                <p className="mt-1 text-2xl font-black text-cyan-50">{countdown}</p>
              </div>
            </div>

            {currentOrNext ? (
              <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
                  <Clock3 className="h-5 w-5 text-cyan-200" />
                  <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Apresentação</p>
                  <p className="mt-1 text-2xl font-black">{currentOrNext.reportTime || '—'}</p>
                </div>
                <div className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
                  <Plane className="h-5 w-5 text-fuchsia-200" />
                  <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Voo</p>
                  <p className="mt-1 text-2xl font-black">{currentOrNext.flight || currentOrNext.type}</p>
                </div>
                <div className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
                  <MapPin className="h-5 w-5 text-violet-200" />
                  <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Portão</p>
                  <p className="mt-1 truncate text-2xl font-black">{gate || '—'}</p>
                  {remoteStand && <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-amber-200">Remota</p>}
                </div>
                <div className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
                  <Radio className="h-5 w-5 text-emerald-200" />
                  <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Status</p>
                  <p className="mt-1 truncate text-lg font-black">{status || 'Monitorando'}</p>
                  {radar?.terminal && <p className="mt-1 text-xs font-bold text-slate-400">Terminal {radar.terminal}</p>}
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-black/20 p-5 text-sm font-semibold text-slate-300">O CrewCheck continuará acompanhando sua escala e destacará a próxima ação quando surgir uma programação relevante.</div>
            )}

            <div className="mt-auto grid grid-cols-1 gap-3 pt-6 md:grid-cols-3">
              <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">O que importa</p>
                <p className="mt-2 text-sm font-bold leading-relaxed text-slate-200">{gate ? `Portão ${gate}${remoteStand ? ' em posição remota' : ''}.` : currentOrNext ? `Apresentação às ${currentOrNext.reportTime}.` : 'Nenhuma ação operacional necessária agora.'}</p>
              </div>
              <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Pernoite</p>
                <p className="mt-2 text-sm font-bold leading-relaxed text-slate-200">{privacy === 'private' && currentOrNext?.hotel ? currentOrNext.hotel : currentOrNext?.hotel ? 'Hotel confirmado · detalhes ocultos nesta TV' : 'Sem hotel confirmado no próximo contexto.'}</p>
              </div>
              <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Freshness</p>
                <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-slate-200"><Wifi className="h-4 w-4 text-emerald-300" /> Painel atualizado {refreshing ? 'agora' : 'automaticamente'}</p>
              </div>
            </div>
          </div>

          <div className="col-span-12 grid min-h-[420px] grid-cols-2 gap-5 xl:col-span-5">
            <div className="col-span-1 rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CloudSun className="h-5 w-5 text-sky-200" />
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">Meteo</p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{airport || '—'}</span>
              </div>
              {premium ? (
                <div className="mt-6">
                  <p className="text-5xl font-black tracking-tight">{temperature !== null ? `${temperature}°` : '—'}</p>
                  <p className="mt-3 text-sm font-bold leading-relaxed text-slate-300">{condition || 'Previsão local aguardando atualização.'}</p>
                  <p className="mt-5 text-[10px] font-bold leading-relaxed text-slate-500">Contexto meteorológico para leitura rápida. Briefing operacional detalhado continua nas superfícies próprias.</p>
                </div>
              ) : lockedCard('Meteo contextual', 'Clima do aeroporto relevante e leitura adaptada ao momento da jornada.')}
            </div>

            <div className="col-span-1 rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-violet-200" />
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">Sua semana</p>
              </div>
              {premium ? (
                <div className="mt-6 grid gap-3">
                  <div className="flex items-end justify-between border-b border-white/8 pb-3"><span className="text-xs font-bold text-slate-400">Voos</span><strong className="text-3xl font-black">{stats.flights}</strong></div>
                  <div className="flex items-end justify-between border-b border-white/8 pb-3"><span className="text-xs font-bold text-slate-400">Programações</span><strong className="text-3xl font-black">{stats.duties}</strong></div>
                  <div className="flex items-end justify-between"><span className="text-xs font-bold text-slate-400">Pernoites</span><strong className="text-3xl font-black">{stats.overnights}</strong></div>
                </div>
              ) : lockedCard('Resumo da semana', 'Uma visão rápida de voos, programações e pernoites sem abrir a escala completa.')}
            </div>

            <div className="col-span-2 rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Newspaper className="h-5 w-5 text-fuchsia-200" />
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">Notícias da aviação</p>
                </div>
                {premium && <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] ${newsStale ? 'text-amber-200' : 'text-emerald-200'}`}>{newsStale ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}{newsStale ? 'cache' : 'atualizando'}</span>}
              </div>
              {premium ? (
                news.length ? (
                  <div className="mt-4 grid gap-2">
                    {news.slice(0, 3).map((item) => (
                      <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-black/15 px-4 py-3 transition hover:bg-white/[0.07] focus:bg-white focus:text-slate-950">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-black leading-snug group-focus:text-slate-950">{item.title}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 group-focus:text-slate-600">{item.source} · {relativeNewsTime(item.publishedAt)}</p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-600 group-hover:text-fuchsia-200 group-focus:text-slate-900" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-white/8 bg-black/15 p-4 text-sm font-semibold text-slate-400">Não consegui atualizar as notícias agora. O painel operacional continua funcionando normalmente.</div>
                )
              ) : lockedCard('Aviation News', 'Feed de aviação com fontes selecionadas e relevância contextual por rota/base.')}
              {premium && <p className="mt-3 text-[9px] font-semibold leading-relaxed text-slate-600">{AVIATION_NEWS_SOURCE_NOTE}</p>}
            </div>
          </div>
        </section>

        <footer className="mt-5 flex min-h-[58px] items-center gap-4 overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/30 px-5 shadow-xl backdrop-blur-xl">
          <div className="flex shrink-0 items-center gap-2 text-cyan-200"><Sparkles className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-[0.18em]">Crewcierge</span></div>
          <div className="h-5 w-px shrink-0 bg-white/10" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="truncate text-sm font-bold text-slate-300">{ticker.join('  •  ')}</p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 text-[10px] font-bold text-slate-500 lg:flex"><ShieldCheck className="h-4 w-4" /> TV não substitui escala/comunicação oficial</div>
          <TimerReset className="h-4 w-4 shrink-0 text-slate-600" />
        </footer>
      </div>
    </main>
  );
}
