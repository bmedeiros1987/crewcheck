import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  Coffee,
  Compass,
  Dumbbell,
  Footprints,
  HeartPulse,
  LoaderCircle,
  LocateFixed,
  MapPin,
  MoonStar,
  Navigation,
  Plane,
  RefreshCw,
  Route,
  Send,
  Share2,
  Sparkles,
  Trees,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getLifeRoutineContext,
  recordGymCheckIn,
  recordLifeEvent,
  shareGymCheckInText,
} from '@/lib/lifeConcierge';
import {
  lifeLocationLabel,
  lifePlaceCategoryLabel,
  loadLifeLocation,
  openLifePlace,
  placeDistanceLabel,
  requestLifeLocation,
  reverseGeocodeLifeLocation,
  searchLifePlaceSet,
  type LifeCoordinates,
  type LifePlace,
  type LifePlaceCategory,
} from '@/lib/lifePlaces';
import './routine-daily-concierge.css';

type RoutineEvent = {
  id?: string;
  kind?: string;
  placeholder?: boolean;
  presentation?: string;
  title?: string;
  origin?: string;
  destination?: string;
  hotel?: string;
  canonical?: { startDateTime?: string; endDateTime?: string };
};

type DayGuideSettings = {
  breakfastTime: string;
  autoLocation: boolean;
  preparationMinutes: number;
  windDownMinutes: number;
  tripMinGapHours: number;
};

type DailyPlan = {
  previous?: RoutineEvent;
  next?: RoutineEvent;
  gapHours: number;
  previousDutyHours: number;
  projectedDutyHours: number;
  earlyStarts: number;
  heavy: boolean;
  recoveryPriority: boolean;
  sleepStart: Date;
  sleepEnd: Date;
  breakfast: Date;
  breakfastConflicts: boolean;
  freeStart: Date;
  freeEnd: Date;
  freeMinutes: number;
  tripEligible: boolean;
};

const SETTINGS_KEY = 'crewcheck:life:daily-guide-settings:v1';
const DEFAULT_SETTINGS: DayGuideSettings = {
  breakfastTime: '09:30',
  autoLocation: true,
  preparationMinutes: 120,
  windDownMinutes: 45,
  tripMinGapHours: 30,
};

function readSettings(): DayGuideSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(value: DayGuideSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch {}
}

function eventStart(item?: RoutineEvent): Date {
  return new Date(item?.canonical?.startDateTime || 0);
}

function eventEnd(item?: RoutineEvent): Date {
  return new Date(item?.canonical?.endDateTime || item?.canonical?.startDateTime || 0);
}

function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

function atTime(base: Date, value: string): Date {
  const [hour, minute] = String(value || '09:30').split(':').map(Number);
  const date = new Date(base);
  date.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 30, 0, 0);
  return date;
}

function timeLabel(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(value).replace('.', '');
}

function dateTimeLabel(value?: Date): string {
  if (!value || Number.isNaN(value.getTime())) return 'a confirmar';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value);
}

function categoryForActivity(value: string): { category: LifePlaceCategory; query?: string } | null {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'academia') return { category: 'gym' };
  if (normalized === 'crossfit') return { category: 'crossfit' };
  if (normalized === 'pilates') return { category: 'pilates' };
  if (normalized === 'corrida') return { category: 'running', query: 'parque pista corrida caminhada' };
  if (normalized === 'caminhada') return { category: 'park' };
  if (normalized === 'estudo') return { category: 'study' };
  return null;
}

function selectedRoutineActivities(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('crewcheck:routine:activities') || '[]');
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 3) : [];
  } catch {
    return [];
  }
}

function buildDailyPlan(events: RoutineEvent[], settings: DayGuideSettings): DailyPlan {
  const now = new Date();
  const context = getLifeRoutineContext(now);
  const operational = events
    .filter((item) => !item.placeholder && ['flight', 'duty', 'stay', 'rest'].includes(String(item.kind)))
    .filter((item) => Number.isFinite(eventStart(item).getTime()))
    .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
  const previous = [...operational].reverse().find((item) => eventEnd(item).getTime() <= now.getTime() && item.kind !== 'stay');
  const next = operational.find((item) => eventEnd(item).getTime() > now.getTime() && item.kind !== 'stay' && item.kind !== 'rest');
  const previousEnd = previous ? eventEnd(previous) : now;
  const nextStart = next ? eventStart(next) : new Date(now.getTime() + 36 * 3_600_000);
  const gapStart = new Date(Math.max(now.getTime(), previousEnd.getTime()));
  const gapHours = hoursBetween(gapStart, nextStart);
  const previousDutyHours = previous ? hoursBetween(eventStart(previous), eventEnd(previous)) : 0;
  const sevenDayEnd = now.getTime() + 7 * 86_400_000;
  const future = operational.filter((item) => {
    const time = eventStart(item).getTime();
    return item.kind !== 'stay' && item.kind !== 'rest' && time >= now.getTime() && time <= sevenDayEnd;
  });
  const earlyStarts = future.filter((item) => {
    const match = String(item.presentation || '').match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) < 6 * 60 : false;
  }).length;
  const projectedDutyHours = future.reduce((sum, item) => sum + hoursBetween(eventStart(item), eventEnd(item)), 0);
  const heavy = previousDutyHours >= 10 || earlyStarts >= 2 || projectedDutyHours >= 35 || gapHours < 12;
  const recoveryPriority = heavy || (context.sleep.available && context.sleep.deficitMinutes >= 60);
  const sleepTargetMinutes = Math.max(360, Math.min(600, context.sleep.targetMinutes || 450));
  const prep = settings.preparationMinutes * 60_000;
  const windDown = settings.windDownMinutes * 60_000;
  let sleepStart = new Date(now);
  const naturalTonight = new Date(now);
  naturalTonight.setHours(22, 30, 0, 0);
  if (naturalTonight.getTime() <= now.getTime()) naturalTonight.setDate(naturalTonight.getDate() + 1);
  if (gapHours >= 12 && now.getHours() >= 6 && now.getHours() < 20) sleepStart = naturalTonight;
  else sleepStart = new Date(now.getTime() + windDown);
  const latestWake = new Date(nextStart.getTime() - prep);
  let sleepEnd = new Date(sleepStart.getTime() + sleepTargetMinutes * 60_000);
  if (sleepEnd.getTime() > latestWake.getTime()) {
    sleepEnd = latestWake;
    sleepStart = new Date(Math.max(now.getTime() + windDown, sleepEnd.getTime() - sleepTargetMinutes * 60_000));
  }
  let breakfast = atTime(now, settings.breakfastTime);
  if (breakfast.getTime() <= now.getTime() - 30 * 60_000) breakfast.setDate(breakfast.getDate() + 1);
  const breakfastConflicts = breakfast.getTime() >= sleepStart.getTime() && breakfast.getTime() <= sleepEnd.getTime() + 30 * 60_000;
  const freeStart = new Date(Math.max(now.getTime(), sleepEnd.getTime() + 45 * 60_000));
  const freeEnd = new Date(nextStart.getTime() - prep - 30 * 60_000);
  const freeMinutes = Math.max(0, Math.round((freeEnd.getTime() - freeStart.getTime()) / 60_000));
  const tripEligible = gapHours >= settings.tripMinGapHours && !recoveryPriority && freeMinutes >= 8 * 60;
  return { previous, next, gapHours, previousDutyHours, projectedDutyHours, earlyStarts, heavy, recoveryPriority, sleepStart, sleepEnd, breakfast, breakfastConflicts, freeStart, freeEnd, freeMinutes, tripEligible };
}

function searchSet(plan: DailyPlan): Array<{ category: LifePlaceCategory; query?: string }> {
  const activities = selectedRoutineActivities().map(categoryForActivity).filter(Boolean) as Array<{ category: LifePlaceCategory; query?: string }>;
  if (plan.recoveryPriority) return [
    { category: 'park', query: 'parque tranquilo caminhada leve natureza' },
    { category: 'cafe', query: 'café da manhã tranquilo aberto agora' },
    { category: 'spa', query: 'massagem spa bem-estar relaxamento' },
  ];
  if (plan.tripEligible) return [
    { category: 'trip', query: 'atração turística natureza passeio bate e volta' },
    { category: 'nature', query: 'parque trilha cachoeira natureza' },
    ...(activities.length ? activities.slice(0, 1) : [{ category: 'leisure' as LifePlaceCategory }]),
  ];
  return [
    ...(activities.length ? activities.slice(0, 2) : [{ category: 'gym' as LifePlaceCategory }, { category: 'park' as LifePlaceCategory }]),
    { category: 'leisure', query: 'lazer cinema museu passeio aberto agora' },
  ];
}

function placeActionType(place: LifePlace): 'exercise' | 'study' | 'leisure' {
  if (['gym', 'crossfit', 'pilates', 'yoga', 'swimming', 'running', 'sports', 'park'].includes(String(place.category))) return 'exercise';
  if (place.category === 'study') return 'study';
  return 'leisure';
}

export default function RoutineDailyConcierge({ events }: { events: RoutineEvent[] }) {
  const [settings, setSettings] = useState<DayGuideSettings>(() => readSettings());
  const [location, setLocation] = useState<LifeCoordinates | null>(() => loadLifeLocation());
  const [locationName, setLocationName] = useState(() => lifeLocationLabel());
  const [places, setPlaces] = useState<LifePlace[]>([]);
  const [busyLocation, setBusyLocation] = useState(false);
  const [busyPlaces, setBusyPlaces] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const plan = useMemo(() => buildDailyPlan(events, settings), [events, settings]);
  const categories = useMemo(() => searchSet(plan), [plan.recoveryPriority, plan.tripEligible, plan.freeMinutes]);

  const loadPlaces = useCallback(async (target: LifeCoordinates, force = false) => {
    setBusyPlaces(true);
    setMessage('');
    try {
      const result = await searchLifePlaceSet(categories, target, force);
      setPlaces(result.slice(0, 9));
      if (!result.length) setMessage('Nenhum local adequado foi encontrado agora. Tente atualizar ou ampliar a busca no mapa.');
    } catch {
      setMessage('A busca automática de locais não respondeu agora.');
    } finally {
      setBusyPlaces(false);
    }
  }, [categories]);

  const locate = useCallback(async (forcePlaces = false) => {
    setBusyLocation(true);
    try {
      const target = await requestLifeLocation({ maximumAge: forcePlaces ? 0 : 5 * 60_000 });
      setLocation(target);
      const label = await reverseGeocodeLifeLocation(target).catch(() => 'Localização atual');
      setLocationName(label);
      await loadPlaces(target, forcePlaces);
      toast.success('Localização atualizada. As sugestões foram recalculadas.');
    } catch {
      toast.error('Não consegui acessar sua localização. Ative a permissão do CrewCheck e tente novamente.');
    } finally {
      setBusyLocation(false);
    }
  }, [loadPlaces]);

  useEffect(() => {
    if (location) {
      void loadPlaces(location);
      const age = Date.now() - new Date(location.capturedAt).getTime();
      if (settings.autoLocation && age > 30 * 60_000) void locate();
      return;
    }
    if (settings.autoLocation) void locate();
  }, []);

  useEffect(() => {
    if (location) void loadPlaces(location);
  }, [plan.recoveryPriority, plan.tripEligible]);

  function saveGuideSettings() {
    saveSettings(settings);
    setSettingsOpen(false);
    toast.success('Preferências do guia diário salvas.');
    if (settings.autoLocation && !location) void locate();
  }

  async function connectHealth() {
    const native = (window as any).CrewCheckNative || (window as any).AndroidCrewCheckNative;
    try {
      if (native?.openHealthConnect && native.openHealthConnect()) return toast.success('Abrindo o Health Connect.');
      const bridge = (window as any).AndroidCrewCheckHealth;
      if (bridge?.postMessage) {
        bridge.postMessage(JSON.stringify({ action: 'requestPermissions', consentVersion: '1.0', consentAccepted: true }));
        return toast.success('Abrindo permissões de saúde.');
      }
    } catch {}
    toast.info('Abra o CrewCheck Life e toque em Conectar Health Connect.');
  }

  async function connectTelegram() {
    try {
      const response = await fetch('/api/telegram/health', { cache: 'no-store', credentials: 'same-origin' });
      const payload = await response.json().catch(() => null);
      const username = String(payload?.botUsername || '').replace(/^@/, '');
      if (!username) return toast.info('Telegram ainda aguarda a configuração do bot.');
      const deepLink = `tg://resolve?domain=${encodeURIComponent(username)}&start=crewcheck_life`;
      const webLink = `https://t.me/${encodeURIComponent(username)}?start=crewcheck_life`;
      window.location.href = deepLink;
      window.setTimeout(() => window.open(webLink, '_blank', 'noopener,noreferrer'), 700);
    } catch {
      toast.error('Não consegui abrir o Telegram agora.');
    }
  }

  async function connectNotifications() {
    try {
      const runtime = (window as any).CrewCheckPremium;
      const ok = runtime?.requestNotifications ? await runtime.requestNotifications() : ('Notification' in window ? await Notification.requestPermission() === 'granted' : false);
      toast[ok ? 'success' : 'info'](ok ? 'Notificações autorizadas.' : 'A permissão de notificações não foi concedida.');
    } catch {
      toast.info('Ative as notificações nas configurações do CrewCheck.');
    }
  }

  function openCalendar() {
    window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'calendar' }));
    toast.message('Abrindo a sincronização de calendário.');
  }

  function choosePlace(place: LifePlace) {
    const type = placeActionType(place);
    if (type === 'exercise' && ['gym', 'crossfit', 'pilates', 'yoga', 'swimming', 'sports'].includes(String(place.category))) {
      recordGymCheckIn(place.name, false);
      toast.success(`${place.name} escolhido. O horário e a modalidade entram no aprendizado local.`);
    } else {
      recordLifeEvent({ type, status: 'planned', source: 'crewcheck', note: place.name, metadata: { address: place.address, category: place.category } });
      toast.success(`${place.name} incluído como possibilidade para hoje.`);
    }
  }

  async function shareCheckIn(place: LifePlace) {
    recordGymCheckIn(place.name, true);
    const text = shareGymCheckInText(place.name);
    try {
      if (navigator.share) await navigator.share({ title: 'CrewCheck Life', text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success('Check-in copiado para compartilhar.');
      }
    } catch {}
  }

  function addPlanToCalendar() {
    const title = plan.recoveryPriority ? 'CrewCheck Life · Recuperação e rotina leve' : 'CrewCheck Life · Janela pessoal';
    const details = [
      `Sono protegido: ${dateTimeLabel(plan.sleepStart)}–${dateTimeLabel(plan.sleepEnd)}`,
      `Café padrão: ${settings.breakfastTime}${plan.breakfastConflicts ? ' (opcional para não interromper o sono)' : ''}`,
      plan.next ? `Próxima programação: ${plan.next.title || 'Atividade'} · ${dateTimeLabel(eventStart(plan.next))}` : 'Sem programação próxima completa',
    ].join('\n');
    const start = plan.freeMinutes >= 30 ? plan.freeStart : plan.sleepStart;
    const end = plan.freeMinutes >= 30 ? new Date(Math.min(plan.freeEnd.getTime(), start.getTime() + 60 * 60_000)) : plan.sleepEnd;
    const format = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const url = new URL('https://calendar.google.com/calendar/render');
    url.searchParams.set('action', 'TEMPLATE');
    url.searchParams.set('text', title);
    url.searchParams.set('dates', `${format(start)}/${format(end)}`);
    url.searchParams.set('details', details);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }

  const planTone = plan.recoveryPriority ? 'recovery' : plan.tripEligible ? 'trip' : 'balanced';
  const breakfastText = plan.breakfastConflicts
    ? 'O café das 09:30 atravessa sua janela de sono. Se ele for opcional e houver alternativa de alimentação depois, não interrompa o descanso apenas para cumprir o horário.'
    : `O café padrão das ${settings.breakfastTime} cabe fora da janela principal de sono calculada.`;

  return <section className="cc-life-day-shell">
    <header className="cc-life-day-hero">
      <div><Compass/><Sparkles/></div>
      <span><small>GUIA DO DIA · ESCALA + LOCALIZAÇÃO + CREWCHECK LIFE</small><h2>Abra o app e veja o que faz mais sentido hoje</h2><p>O plano combina jornada, próxima apresentação, descanso desejado, dados do Life e locais reais perto de você.</p></span>
      <button onClick={() => void locate(true)} disabled={busyLocation}>{busyLocation ? <LoaderCircle className="spin"/> : <LocateFixed/>}{location ? 'Atualizar localização' : 'Usar minha localização'}</button>
    </header>

    <article className={`cc-life-day-plan ${planTone}`}>
      <div className="cc-life-day-plan-main">
        <small>{plan.recoveryPriority ? 'RECUPERAÇÃO REFORÇADA' : plan.tripEligible ? 'FOLGA COM ESPAÇO PARA LAZER OU BATE-VOLTA' : 'ROTINA EQUILIBRADA'}</small>
        <h3>{plan.recoveryPriority ? 'Hoje, descansar bem vale mais do que preencher toda janela livre' : plan.tripEligible ? 'Existe margem real para aproveitar a folga sem comprometer a próxima jornada' : 'Há uma janela possível depois de proteger sono, alimentação e preparação'}</h3>
        <p>{plan.next ? `Próxima programação: ${plan.next.title || 'Atividade'} em ${dateTimeLabel(eventStart(plan.next))}.` : 'Nenhuma programação operacional próxima foi encontrada nas próximas 36 horas.'}</p>
      </div>
      <div className="cc-life-day-timeline">
        <span><MoonStar/><b>Sono</b><strong>{timeLabel(plan.sleepStart)} → {timeLabel(plan.sleepEnd)}</strong></span>
        <span className={plan.breakfastConflicts ? 'warn' : ''}><Coffee/><b>Café padrão</b><strong>{settings.breakfastTime} · {plan.breakfastConflicts ? 'opcional para preservar sono' : 'compatível'}</strong></span>
        <span><Clock3/><b>Janela pessoal</b><strong>{plan.freeMinutes >= 30 ? `${timeLabel(plan.freeStart)} → ${timeLabel(plan.freeEnd)}` : 'sem margem confortável'}</strong></span>
        <span><Plane/><b>Preparação</b><strong>{settings.preparationMinutes} min protegidos antes da programação</strong></span>
      </div>
      <div className="cc-life-day-breakfast"><Coffee/><p><strong>Decisão sobre o café:</strong> {breakfastText}</p></div>
      <div className="cc-life-day-plan-actions"><button className="primary" onClick={addPlanToCalendar}><CalendarPlus/> Colocar plano no calendário</button><button onClick={openCalendar}><CalendarPlus/> Sincronização completa</button></div>
    </article>

    <section className="cc-life-day-connections">
      <button className="cc-life-day-section-head" onClick={() => setConnectionsOpen((value) => !value)}><span><Send/><span><small>CONEXÕES EM UM TOQUE</small><strong>Vincule sem procurar configurações escondidas</strong></span></span>{connectionsOpen ? <ChevronUp/> : <ChevronDown/>}</button>
      {connectionsOpen && <div className="cc-life-day-connection-grid">
        <button onClick={connectHealth}><HeartPulse/><span><strong>Health Connect</strong><small>Samsung Health e Galaxy Watch</small></span><Check/></button>
        <button onClick={() => void connectTelegram()}><Send/><span><strong>Telegram</strong><small>concierge, check-ins e lembretes</small></span><Navigation/></button>
        <button onClick={() => void locate(true)}><LocateFixed/><span><strong>Localização</strong><small>academias, esporte, lazer e viagens</small></span><MapPin/></button>
        <button onClick={() => void connectNotifications()}><BellRing/><span><strong>Notificações</strong><small>somente sugestões importantes</small></span><Check/></button>
        <button onClick={openCalendar}><CalendarPlus/><span><strong>Google Calendar</strong><small>escala e rotina no mesmo lugar</small></span><Navigation/></button>
      </div>}
    </section>

    <section className="cc-life-day-nearby">
      <header><div><small>SUGESTÕES REAIS PERTO DE VOCÊ</small><h3>{locationName}</h3><p>{plan.recoveryPriority ? 'Locais leves e opções de alimentação ou relaxamento foram priorizados.' : plan.tripEligible ? 'Passeios, natureza e opções compatíveis com uma folga longa.' : 'Modalidades escolhidas, lazer e locais abertos próximos.'}</p></div><button onClick={() => location ? void loadPlaces(location, true) : void locate(true)} disabled={busyPlaces}>{busyPlaces ? <LoaderCircle className="spin"/> : <RefreshCw/>} Atualizar</button></header>
      {!location && <div className="cc-life-day-empty"><MapPin/><h4>Ative a localização para o CrewCheck escolher locais reais</h4><p>A coordenada é usada para a busca e fica salva apenas no aparelho como referência recente.</p><button className="primary" onClick={() => void locate(true)}><LocateFixed/> Ativar localização automática</button></div>}
      {location && busyPlaces && !places.length && <div className="cc-life-day-loading"><LoaderCircle className="spin"/> Buscando locais compatíveis com o plano do dia…</div>}
      {message && <div className="cc-life-day-message"><CircleAlert/> {message}</div>}
      {Boolean(places.length) && <div className="cc-life-day-place-grid">{places.map((place) => <article key={`${place.name}-${place.address}`}>
        <div className="cc-life-day-place-icon">{['gym','crossfit','pilates','yoga','swimming','sports'].includes(String(place.category)) ? <Dumbbell/> : ['park','nature','running'].includes(String(place.category)) ? <Trees/> : <Footprints/>}</div>
        <div className="cc-life-day-place-copy"><small>{lifePlaceCategoryLabel(String(place.category))}{place.openNow === true ? ' · aberto agora' : place.openNow === false ? ' · fechado agora' : ''}</small><h4>{place.name}</h4><p>{place.address}</p><span>{placeDistanceLabel(place.distanceMeters)}{place.rating ? ` · nota ${place.rating.toFixed(1).replace('.', ',')}` : ''}{place.userRatingCount ? ` · ${place.userRatingCount} avaliações` : ''}</span></div>
        <div className="cc-life-day-place-actions"><button onClick={() => openLifePlace(place)}><Route/> Abrir rota</button><button className="primary" onClick={() => choosePlace(place)}><Check/> Escolher</button>{['gym','crossfit','pilates','yoga','swimming','sports'].includes(String(place.category)) && <button onClick={() => void shareCheckIn(place)}><Share2/> Check-in</button>}</div>
      </article>)}</div>}
    </section>

    <section className="cc-life-day-settings">
      <button className="cc-life-day-section-head" onClick={() => setSettingsOpen((value) => !value)}><span><Clock3/><span><small>AJUSTES DA AVIAÇÃO</small><strong>Café, preparação e flexibilidade</strong></span></span>{settingsOpen ? <ChevronUp/> : <ChevronDown/>}</button>
      {settingsOpen && <div className="cc-life-day-settings-body">
        <label><span>Horário padrão do café</span><input type="time" value={settings.breakfastTime} onChange={(event) => setSettings({ ...settings, breakfastTime: event.target.value })}/></label>
        <label><span>Margem antes da apresentação</span><input type="number" min="60" max="240" step="15" value={settings.preparationMinutes} onChange={(event) => setSettings({ ...settings, preparationMinutes: Number(event.target.value) })}/><small>Inclui preparação e margem conservadora; a Saída Inteligente continua calculando o deslocamento real.</small></label>
        <label><span>Desaceleração antes de dormir</span><input type="number" min="15" max="120" step="15" value={settings.windDownMinutes} onChange={(event) => setSettings({ ...settings, windDownMinutes: Number(event.target.value) })}/></label>
        <label><span>Folga mínima para sugerir bate-volta</span><input type="number" min="18" max="72" step="1" value={settings.tripMinGapHours} onChange={(event) => setSettings({ ...settings, tripMinGapHours: Number(event.target.value) })}/></label>
        <label className="check"><input type="checkbox" checked={settings.autoLocation} onChange={(event) => setSettings({ ...settings, autoLocation: event.target.checked })}/><span><strong>Atualizar localização automaticamente</strong><small>Somente quando a tela de rotina estiver aberta ou quando o usuário solicitar.</small></span></label>
        <button className="primary" onClick={saveGuideSettings}><Check/> Salvar ajustes</button>
      </div>}
    </section>

    <footer className="cc-life-day-safety"><MoonStar/><p><strong>Orientação de rotina, não avaliação clínica.</strong> O CrewCheck reduz sugestões quando a carga operacional, o sono ou a janela disponível pedem recuperação. Em caso de fadiga relevante, use também os canais oficiais da empresa e sua própria avaliação.</p></footer>
  </section>;
}
