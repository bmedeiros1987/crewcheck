import { useEffect, useMemo, useState } from 'react';
import { BellRing, Check, CloudRain, CloudSun, Hotel, Link2, Luggage, Moon, Phone, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { authFetch, getStoredUser } from '@/lib/authClient';
import {
  briefingLeadHours,
  crewWakeEventKey,
  effectivePickup,
  formatClock,
  formatDuration,
  isNativeCrewCheck,
  isPwaLike,
  myCrewCareConnectionStatus,
  nextTripBriefing,
  readCrewWakeState,
  readMyCrewCareSnapshot,
  setBriefingLeadHours,
  stayWindow,
  wakeAtForEvent,
  writeCrewWakeState,
  writeMyCrewCareSnapshot,
  type CrewWakeEvent,
} from '@/lib/crewWake';
import './crew-wake.css';

type WeatherSnapshot = {
  ok?: boolean;
  airport?: string;
  city?: string;
  temperature?: number;
  minTemperature?: number;
  maxTemperature?: number;
  wind?: number;
  rainChance?: number;
  condition?: string;
};

function nativeBridge(): any {
  try { return (window as any).CrewCheckNative || (window as any).AndroidCrewCheckNative || null; } catch { return null; }
}

function notifyWakeChanged() {
  try { window.dispatchEvent(new CustomEvent('crewcheck:wake-updated')); } catch {}
}

function normalizedPhone(): string {
  const account = String(getStoredUser()?.phoneE164 || '').trim();
  let local = '';
  try { local = String(localStorage.getItem('crewcheck_wakeup_phone') || '').trim(); } catch {}
  const value = account || local;
  const digits = value.replace(/[^+\d]/g, '');
  if (digits.startsWith('+')) return digits;
  if (/^55\d{10,11}$/.test(digits)) return '+' + digits;
  if (/^\d{10,11}$/.test(digits)) return '+55' + digits;
  return digits;
}

async function schedulePhoneWake(scheduledAt: Date, phone: string, jobKey: string, message: string) {
  return authFetch<any>('/api/alarm/schedule', {
    method: 'POST',
    body: JSON.stringify({
      scheduledAt: scheduledAt.toISOString(),
      channel: 'phone',
      phone,
      jobKey,
      message,
    }),
  });
}

async function cancelPhoneWake(jobKey: string) {
  return authFetch<any>('/api/alarm/cancel', {
    method: 'POST',
    body: JSON.stringify({ jobKey }),
  });
}

export function CrewWakeRuntimeBridge() {
  useEffect(() => {
    const onMyCrewCare = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const snapshot = writeMyCrewCareSnapshot({
        connected: detail.connected !== false,
        syncedAt: detail.syncedAt || new Date().toISOString(),
        records: Array.isArray(detail.records) ? detail.records : [],
      });
      window.dispatchEvent(new CustomEvent('crewcheck:mycrewcare-state', { detail: snapshot }));
    };
    const onMyCrewCareStatus = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const snapshot = writeMyCrewCareSnapshot({
        ...readMyCrewCareSnapshot(),
        connected: detail.connected === true || detail.status === 'connected',
        syncedAt: detail.syncedAt || new Date().toISOString(),
      });
      window.dispatchEvent(new CustomEvent('crewcheck:mycrewcare-state', { detail: snapshot }));
    };
    const onWakeAck = (event: Event) => {
      const wakeKey = String((event as CustomEvent)?.detail?.wakeKey || '').trim();
      if (!wakeKey) return;
      void cancelPhoneWake(`wake-fallback:${wakeKey}`).catch(() => undefined);
    };

    window.addEventListener('crewcheck:mycrewcare-update', onMyCrewCare as EventListener);
    window.addEventListener('crewcheck:mycrewcare-status', onMyCrewCareStatus as EventListener);
    window.addEventListener('crewcheck:wake-ack', onWakeAck as EventListener);

    const bridge = nativeBridge();
    if (bridge?.syncMyCrewCare && myCrewCareConnectionStatus() === 'connected') {
      try { bridge.syncMyCrewCare(); } catch {}
    }

    return () => {
      window.removeEventListener('crewcheck:mycrewcare-update', onMyCrewCare as EventListener);
      window.removeEventListener('crewcheck:mycrewcare-status', onMyCrewCareStatus as EventListener);
      window.removeEventListener('crewcheck:wake-ack', onWakeAck as EventListener);
    };
  }, []);
  return null;
}

export function StayWakeStrip({ event, onOpen }: { event: CrewWakeEvent; onOpen: () => void }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('crewcheck:wake-updated', refresh);
    window.addEventListener('crewcheck:mycrewcare-state', refresh);
    return () => {
      window.removeEventListener('crewcheck:wake-updated', refresh);
      window.removeEventListener('crewcheck:mycrewcare-state', refresh);
    };
  }, []);

  const state = useMemo(() => readCrewWakeState(event), [event.id, revision]);
  const windowInfo = useMemo(() => stayWindow(event, state), [event.id, revision, state.manualPickup, state.automatic, state.wakeLeadMinutes]);
  const pickupLabel = windowInfo.pickup.time || 'A confirmar';

  return <button type="button" className="cc-stay-wake-strip" onClick={(click) => { click.stopPropagation(); onOpen(); }}>
    <span className="cc-stay-window"><Moon size={15}/><b>{formatClock(windowInfo.start)} → {formatClock(windowInfo.end)}</b><small>{formatDuration(windowInfo.minutes)}</small></span>
    <span><span>Pickup</span><b>{pickupLabel}</b></span>
    <span className="cc-stay-wake-time"><BellRing size={15}/><span>Despertar</span><b>{formatClock(windowInfo.wakeAt)}</b></span>
  </button>;
}

function connectionLabel() {
  return myCrewCareConnectionStatus() === 'connected' ? 'Conectado' : 'Desconectado';
}

function sourceLabel(source: ReturnType<typeof effectivePickup>['source']): string {
  if (source === 'manual') return 'Manual';
  if (source === 'mycrewcare') return 'MyCrewCare';
  if (source === 'presentation') return 'Apresentação';
  if (source === 'automatic') return 'Automático';
  return 'A confirmar';
}

export function CrewWakePremiumPanel({ event }: { event: CrewWakeEvent }) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const state = useMemo(() => readCrewWakeState(event), [event.id, revision]);
  const pickup = useMemo(() => effectivePickup(event, state), [event.id, revision, state.manualPickup, state.automatic]);
  const wakeAt = useMemo(() => wakeAtForEvent(event, state), [event.id, revision, state.manualPickup, state.automatic, state.wakeLeadMinutes]);
  const native = isNativeCrewCheck();
  const pwa = isPwaLike() || !native;
  const wakeKey = crewWakeEventKey(event);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('crewcheck:mycrewcare-state', refresh);
    window.addEventListener('crewcheck:wake-updated', refresh);
    return () => {
      window.removeEventListener('crewcheck:mycrewcare-state', refresh);
      window.removeEventListener('crewcheck:wake-updated', refresh);
    };
  }, []);

  function patch(patchValue: Parameters<typeof writeCrewWakeState>[1]) {
    writeCrewWakeState(event, patchValue);
    setRevision((value) => value + 1);
    notifyWakeChanged();
  }

  function connectMyCrewCare() {
    const bridge = nativeBridge();
    if (!bridge?.openMyCrewCare) {
      toast.message('A conexão automática com MyCrewCare está disponível no aplicativo Android.');
      return;
    }
    try { bridge.openMyCrewCare(); } catch { toast.error('Não consegui abrir o MyCrewCare agora.'); }
  }

  async function activate() {
    if (!wakeAt || wakeAt.getTime() <= Date.now()) return toast.error('Defina um pickup futuro para ativar o despertador.');
    const phone = normalizedPhone();
    if (pwa && !phone) return toast.error('Informe seu telefone no perfil para receber a ligação CrewCheck.');
    if (state.infobipFallback && !phone) return toast.error('Informe seu telefone no perfil para usar a ligação de segurança.');

    setBusy(true);
    try {
      const bridge = nativeBridge();
      if (native && bridge?.scheduleWakeAlarm) {
        const ok = bridge.scheduleWakeAlarm(wakeKey, String(wakeAt.getTime()), `CrewCheck · ${event.destination || event.origin || 'Pernoite'}`);
        if (!ok) throw new Error('O Android não conseguiu programar o alarme local.');
      }

      if (native && state.mirrorSystemAlarm && bridge?.syncSystemAlarm) {
        try { bridge.syncSystemAlarm(String(wakeAt.getTime()), 'CrewCheck'); } catch {}
      }

      let fallbackJobKey = '';
      if (pwa) {
        fallbackJobKey = `wake-pwa:${wakeKey}`;
        await schedulePhoneWake(wakeAt, phone, fallbackJobKey, `Despertador CrewCheck. Pickup ${pickup.time || 'a confirmar'}. Abra o CrewCheck e confira sua programação.`);
      } else if (state.infobipFallback) {
        const fallbackAt = new Date(wakeAt.getTime() + 7 * 60_000);
        fallbackJobKey = `wake-fallback:${wakeKey}`;
        await schedulePhoneWake(fallbackAt, phone, fallbackJobKey, 'Ligação de segurança CrewCheck. O despertador tocou há alguns minutos e ainda não houve confirmação.');
      }

      patch({ active: true, scheduledWakeAt: wakeAt.toISOString(), fallbackJobKey });
      toast.success(pwa ? 'Ligação CrewCheck programada.' : 'CrewCheck Wake ativado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui ativar o despertador.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="cc-wake-premium">
    <header>
      <div className="cc-wake-hero-icon"><BellRing/></div>
      <div><small>CREWCHECK WAKE</small><h1>{formatClock(wakeAt)}</h1><p>{state.wakeLeadMinutes} min antes de {pickup.source === 'presentation' ? 'apresentação' : 'pickup'}</p></div>
      <span className={state.active ? 'cc-live-chip on' : 'cc-live-chip'}>{state.active ? 'Ativo' : 'Pronto'}</span>
    </header>

    <div className="cc-wake-facts">
      <label>
        <span>Pickup</span>
        <input
          type="time"
          value={pickup.time || ''}
          onChange={(change) => patch({ manualPickup: change.target.value || undefined })}
          aria-label="Horário de pickup"
        />
        <small>{sourceLabel(pickup.source)}</small>
      </label>
      <label>
        <span>Acordar antes</span>
        <select value={state.wakeLeadMinutes} onChange={(change) => patch({ wakeLeadMinutes: Number(change.target.value) })}>
          {[30,45,60,75,90,120].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
        </select>
        <small>Por pernoite</small>
      </label>
    </div>

    <div className="cc-wake-mode-row">
      <label className="cc-switch-line">
        <span><RefreshCw size={16}/><b>Pickup automático</b></span>
        <input type="checkbox" checked={state.automatic} onChange={(change) => patch({ automatic: change.target.checked, manualPickup: change.target.checked ? undefined : state.manualPickup })}/>
      </label>
      {state.automatic && <button type="button" className={connectionLabel() === 'Conectado' ? 'cc-connection connected' : 'cc-connection'} onClick={connectMyCrewCare}>
        <Link2 size={15}/>{connectionLabel()}
      </button>}
    </div>

    {native ? <div className="cc-wake-safety">
      <label><input type="checkbox" checked={state.mirrorSystemAlarm} onChange={(change) => patch({ mirrorSystemAlarm: change.target.checked })}/><Smartphone size={16}/><span><b>Relógio do celular</b><small>Espelhar este horário</small></span></label>
      <label><input type="checkbox" checked={state.infobipFallback} onChange={(change) => patch({ infobipFallback: change.target.checked })}/><Phone size={16}/><span><b>Ligação de segurança</b><small>Infobip após 7 min sem confirmação</small></span></label>
    </div> : <div className="cc-pwa-only"><Phone size={17}/><span><b>Ligação CrewCheck</b><small>Na versão PWA, o despertar usa somente Infobip.</small></span><Check size={17}/></div>}

    <button type="button" className="cc-wake-activate" onClick={activate} disabled={busy || !wakeAt}>
      <BellRing/>{busy ? 'Programando…' : `Ativar ${formatClock(wakeAt)}`}
    </button>
  </section>;
}

async function fetchForecast(airport: string): Promise<WeatherSnapshot | null> {
  try {
    const response = await fetch(`/api/weather/airport?airport=${encodeURIComponent(airport)}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function packingText(weather: WeatherSnapshot[]): string {
  if (!weather.length) return 'Confira a previsão antes de fechar a mala.';
  const temps = weather.flatMap((item) => [item.minTemperature, item.temperature, item.maxTemperature]).map(Number).filter(Number.isFinite);
  const low = temps.length ? Math.min(...temps) : NaN;
  const high = temps.length ? Math.max(...temps) : NaN;
  const rain = weather.some((item) => Number(item.rainChance || 0) >= 40);
  const parts: string[] = [];
  if (Number.isFinite(low) && low <= 14) parts.push('casaco');
  if (Number.isFinite(high) && high >= 28) parts.push('roupas leves');
  if (rain) parts.push('proteção para chuva');
  if (!parts.length) parts.push('camadas leves');
  return `Para a mala: ${parts.join(' · ')}.`;
}

export function CrewTripBriefingCard({ events }: { events: CrewWakeEvent[] }) {
  const [lead, setLead] = useState(() => briefingLeadHours());
  const [weather, setWeather] = useState<Record<string, WeatherSnapshot>>({});
  const briefing = useMemo(() => nextTripBriefing(events, new Date(), lead), [events, lead]);

  const airports = useMemo(() => {
    if (!briefing) return [];
    return Array.from(new Set(briefing.stays.map((stay) => String(stay.destination || stay.origin || '').toUpperCase()).filter(Boolean))).slice(0, 5);
  }, [briefing?.startsAt?.getTime(), briefing?.stays?.length]);

  useEffect(() => {
    let alive = true;
    Promise.all(airports.map(async (airport) => [airport, await fetchForecast(airport)] as const)).then((rows) => {
      if (!alive) return;
      const next: Record<string, WeatherSnapshot> = {};
      rows.forEach(([airport, payload]) => { if (payload) next[airport] = payload; });
      setWeather(next);
    });
    return () => { alive = false; };
  }, [airports.join('|')]);

  useEffect(() => {
    if (!briefing || briefing.briefingAt.getTime() <= Date.now()) return;
    const bridge = nativeBridge();
    if (!bridge?.scheduleNotification) return;
    const key = `crewcheck:briefing:scheduled:${briefing.startsAt.toISOString()}:${lead}`;
    try {
      if (localStorage.getItem(key) === '1') return;
      bridge.scheduleNotification('Briefing da próxima chave', 'Pernoites e previsão do tempo já estão prontos para você organizar a mala.', String(briefing.briefingAt.getTime()));
      localStorage.setItem(key, '1');
    } catch {}
  }, [briefing?.startsAt?.getTime(), lead]);

  if (!briefing) return null;
  const weatherList = Object.values(weather);
  const untilHours = Math.max(0, Math.ceil((briefing.briefingAt.getTime() - Date.now()) / 36e5));

  return <section className={briefing.available ? 'cc-trip-briefing ready' : 'cc-trip-briefing'}>
    <header>
      <span className="cc-briefing-icon"><Luggage/></span>
      <div><small>ANTES DA PRÓXIMA CHAVE</small><h2>Briefing de mala</h2><p>Início {briefing.startsAt.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p></div>
      <label className="cc-briefing-lead"><span>Rever</span><select value={lead} onChange={(change) => setLead(setBriefingLeadHours(Number(change.target.value)))}>{[6,12,18,24,36,48].map((hours) => <option key={hours} value={hours}>{hours} h antes</option>)}</select></label>
    </header>

    {!briefing.available ? <div className="cc-briefing-locked"><Moon/><span><b>Briefing programado</b><small>Fica em destaque em aproximadamente {untilHours} h.</small></span></div> : <>
      <div className="cc-briefing-stays">
        {briefing.stays.length ? briefing.stays.map((stay) => {
          const airport = String(stay.destination || stay.origin || '').toUpperCase();
          const forecast = weather[airport];
          return <article key={stay.id}>
            <Hotel/>
            <div><b>{airport || 'Pernoite'} · {String(stay.hotel || 'Hotel a confirmar')}</b><small>{forecast?.city || airport} · {Number.isFinite(Number(forecast?.temperature)) ? `${Math.round(Number(forecast?.temperature))}°C` : 'temperatura a confirmar'} · {Number.isFinite(Number(forecast?.rainChance)) ? `${Math.round(Number(forecast?.rainChance))}% chuva` : 'chuva a confirmar'}</small></div>
            {Number(forecast?.rainChance || 0) >= 40 ? <CloudRain/> : <CloudSun/>}
          </article>;
        }) : <article><Hotel/><div><b>Sem pernoite previsto</b><small>A próxima chave não possui pernoite detectado na escala atual.</small></div><ShieldCheck/></article>}
      </div>
      <div className="cc-packing-hint"><Luggage/><span><b>{packingText(weatherList)}</b><small>Resumo orientativo com base na previsão disponível agora.</small></span></div>
    </>}
  </section>;
}
