import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Apple,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Footprints,
  HeartPulse,
  LockKeyhole,
  MoonStar,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import CrewLifeFemPanel from './CrewLifeFemPanel';

type NextProgram = {
  title?: string;
  date?: string;
  presentation?: string;
  departure?: string;
  kind?: string;
};

type LifeConsent = {
  active: boolean;
  acceptedAt: string;
  policyVersion: '1.0';
};

type LifeProfile = {
  sleepTarget: number;
  studyTargetMinutes: number;
  trainingTargetMinutes: number;
  areas: {
    sleep: boolean;
    study: boolean;
    activity: boolean;
    meals: boolean;
    leisure: boolean;
  };
};

type ManualSummary = {
  sleepHours: number;
  steps: number;
  activityMinutes: number;
  studyMinutes: number;
  leisureMinutes: number;
  updatedAt: string;
};

type NativeHealthStatus = {
  ok?: boolean;
  platform?: string;
  availability?: 'available' | 'update_required' | 'unavailable' | 'permission_required' | 'partial' | 'connected';
  grantedCount?: number;
  requiredCount?: number;
  allGranted?: boolean;
  samsungViaHealthConnect?: boolean;
  message?: string;
};

type NativeHealthSummary = {
  ok?: boolean;
  automatic?: boolean;
  source?: string;
  generatedAtEpochMs?: number;
  energyScore?: number | null;
  sleepScore?: number | null;
  caloriesBurned?: number | null;
  periodDays?: number;
  sleepMinutes?: number | null;
  sleepStart?: string | null;
  sleepEnd?: string | null;
  sleepSource?: string | null;
  steps?: number | null;
  distanceMeters?: number | null;
  activityMinutes?: number | null;
  restingHeartRateAverage?: number | null;
  capturedAt?: string;
};

const KEYS = {
  consent: 'crewcheck:life:consent:v1',
  profile: 'crewcheck:life:profile:v1',
  manual: 'crewcheck:life:manual:v1',
  nativeSummary: 'crewcheck:life:health-summary:v1',
};

const DEFAULT_PROFILE: LifeProfile = {
  sleepTarget: 7.5,
  studyTargetMinutes: 180,
  trainingTargetMinutes: 150,
  areas: { sleep: true, study: true, activity: true, meals: true, leisure: true },
};

const DEFAULT_MANUAL: ManualSummary = {
  sleepHours: 0,
  steps: 0,
  activityMinutes: 0,
  studyMinutes: 0,
  leisureMinutes: 0,
  updatedAt: '',
};

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function parseNativePayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  try { return JSON.parse(String(value || '{}')); } catch { return {}; }
}

function numberOrZero(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function hoursLabel(minutes?: number | null): string {
  if (!Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return 'Sem dado';
  const total = Math.round(Number(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return `${hours}h${String(rest).padStart(2, '0')}`;
}

function dateTimeLabel(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function integrationLabel(status: NativeHealthStatus): string {
  if (status.allGranted || status.availability === 'connected') return 'Conectado';
  if (status.availability === 'partial') return 'Permissão parcial';
  if (status.availability === 'update_required') return 'Atualização necessária';
  if (status.availability === 'unavailable') return 'Indisponível neste aparelho';
  if (status.availability === 'available' || status.availability === 'permission_required') return 'Pronto para conectar';
  return 'Aguardando app Android';
}

export default function CrewCheckLifeView({ nextProgram }: { nextProgram?: NextProgram | null }) {
  const [consent, setConsent] = useState<LifeConsent>(() => readStored(KEYS.consent, { active: false, acceptedAt: '', policyVersion: '1.0' }));
  const [consentChecked, setConsentChecked] = useState(false);
  const [profile, setProfile] = useState<LifeProfile>(() => {
    const stored = readStored(KEYS.profile, DEFAULT_PROFILE);
    return { ...DEFAULT_PROFILE, ...stored, areas: { ...DEFAULT_PROFILE.areas, ...(stored as LifeProfile).areas } };
  });
  const [manual, setManual] = useState<ManualSummary>(() => readStored(KEYS.manual, DEFAULT_MANUAL));
  const [nativeStatus, setNativeStatus] = useState<NativeHealthStatus>({});
  const [nativeSummary, setNativeSummary] = useState<NativeHealthSummary>(() => readStored(KEYS.nativeSummary, {}));
  const [companionSummary, setCompanionSummary] = useState<NativeHealthSummary>({});
  const [companionStatus, setCompanionStatus] = useState<{
    installed?: boolean;
    state?: string;
    automatic?: boolean;
    migrationRequired?: boolean;
    officialStoreUrl?: string;
  }>({});
  const [watchMirrorEnabled, setWatchMirrorEnabled] = useState(() => {
    try {
      const bridge = (window as any).AndroidCrewCheckNative;
      const raw = bridge?.watchLifeStatus?.();
      const status = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Boolean(status?.enabled);
    } catch { return false; }
  });
  const [whyOpen, setWhyOpen] = useState(false);
  const androidBridge = (window as any).AndroidCrewCheckHealth;
  const nativeHealthBridgeMode = (() => {
    try { return String(androidBridge?.ping?.() || ''); } catch { return ''; }
  })();
  const nativeHealthEnabled = Boolean(androidBridge?.postMessage)
    && nativeHealthBridgeMode !== 'crewcheck-life-manual-only';
  const appleBridge = (window as any).webkit?.messageHandlers?.CrewCheckHealthKit;

  function postAndroid(action: string, payload: Record<string, unknown> = {}): boolean {
    if (!androidBridge?.postMessage) return false;
    try {
      androidBridge.postMessage(JSON.stringify({ action, ...payload }));
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    const onStatus = (event: Event) => setNativeStatus(parseNativePayload((event as CustomEvent).detail) as NativeHealthStatus);
    const onSummary = (event: Event) => {
      const detail = parseNativePayload((event as CustomEvent).detail) as NativeHealthSummary;
      setNativeSummary(detail);
      if (detail.ok) writeStored(KEYS.nativeSummary, detail);
    };
    window.addEventListener('crewcheck:health-status', onStatus);
    window.addEventListener('crewcheck:health-summary', onSummary);
    if (consent.active && nativeHealthEnabled) postAndroid('status');
    return () => {
      window.removeEventListener('crewcheck:health-status', onStatus);
      window.removeEventListener('crewcheck:health-summary', onSummary);
    };
  }, [consent.active, androidBridge, nativeHealthEnabled]);

  useEffect(() => {
    const native = (window as any).AndroidCrewCheckNative;
    const readCompanion = () => {
      try {
        const statusRaw = native?.lifeCompanionStatus?.();
        const status = typeof statusRaw === 'string' ? JSON.parse(statusRaw) : (statusRaw || {});
        setCompanionStatus(status);
        const summaryRaw = native?.readLifeCompanionSummary?.();
        const summary = typeof summaryRaw === 'string' ? JSON.parse(summaryRaw) : (summaryRaw || {});
        if (summary && typeof summary === 'object' && summary.automatic) {
          const normalized = { ...summary, ok: true, source: 'samsung_health' };
          setCompanionSummary(normalized);
          try {
            localStorage.setItem('crewcheck:life:companion-summary:v1', JSON.stringify({
              ...normalized,
              capturedAt: Number(normalized.generatedAtEpochMs) > 0
                ? new Date(Number(normalized.generatedAtEpochMs)).toISOString()
                : new Date().toISOString(),
              source: 'samsung-companion',
            }));
            window.dispatchEvent(new CustomEvent('crewcheck:life-adaptive-update', { detail: { key: 'crewcheck:life:companion-summary:v1' } }));
          } catch {}
        }
      } catch {}
    };
    const onCompanion = (event: Event) => {
      const detail = parseNativePayload((event as CustomEvent).detail) as NativeHealthSummary;
      if (detail && detail.automatic) {
        const normalized = { ...detail, ok: true, source: 'samsung_health' };
        setCompanionSummary(normalized);
        setCompanionStatus((current) => ({ ...current, installed: true, state: 'connected', automatic: true }));
        try {
          localStorage.setItem('crewcheck:life:companion-summary:v1', JSON.stringify({
            ...normalized,
            capturedAt: Number(normalized.generatedAtEpochMs) > 0
              ? new Date(Number(normalized.generatedAtEpochMs)).toISOString()
              : new Date().toISOString(),
            source: 'samsung-companion',
          }));
          window.dispatchEvent(new CustomEvent('crewcheck:life-adaptive-update', { detail: { key: 'crewcheck:life:companion-summary:v1' } }));
        } catch {}
      }
    };
    readCompanion();
    window.addEventListener('crewcheck:life-companion-summary', onCompanion);
    window.addEventListener('focus', readCompanion);
    return () => {
      window.removeEventListener('crewcheck:life-companion-summary', onCompanion);
      window.removeEventListener('focus', readCompanion);
    };
  }, []);

  const companionAgeMs = companionSummary.generatedAtEpochMs
    ? Date.now() - Number(companionSummary.generatedAtEpochMs)
    : Number.POSITIVE_INFINITY;
  const companionFresh = Boolean(
    companionSummary.automatic
      && companionStatus.state === 'connected'
      && companionAgeMs >= 0
      && companionAgeMs <= 6 * 60 * 60 * 1000
  );
  const effectiveSummary = companionFresh ? companionSummary : nativeSummary;
  const automaticSamsung = companionFresh;

  const companionMigrationRequired = Boolean(
    companionStatus.migrationRequired || companionStatus.state === 'bridge_incompatible'
  );
  const companionStateLabel = automaticSamsung
    ? 'Samsung Health conectado · automático'
    : companionMigrationRequired
      ? 'Companion antigo · migrar para a versão oficial'
      : companionStatus.installed
        ? 'Companion instalado · concluir conexão'
        : 'Samsung Health · não instalado';

  function openCompanionStore() {
    const native = (window as any).AndroidCrewCheckNative;
    try {
      if (native?.openLifeCompanionStore?.()) return;
    } catch {}
    window.open(
      companionStatus.officialStoreUrl || 'https://play.google.com/store/apps/details?id=com.crewcheck.life',
      '_blank',
      'noopener,noreferrer',
    );
    toast.info('A sincronização automática com Samsung Health requer o app Android CrewLife Companion.');
  }

  function migrateCompanionToOfficialPlay() {
    const native = (window as any).AndroidCrewCheckNative;
    try {
      if (native?.migrateLifeCompanionToPlay?.()) {
        toast.info('O Android pedirá para remover somente o Companion antigo. Depois o CrewCheck abrirá a versão oficial na Play Store.');
        return;
      }
    } catch {}
    toast.info('Remova somente o CrewLife Companion antigo e instale a versão oficial pela Play Store. Não desinstale o CrewCheck.');
    openCompanionStore();
  }

  const metrics = useMemo(() => {
    const sleepHours = numberOrZero(effectiveSummary.sleepMinutes) / 60 || numberOrZero(manual.sleepHours);
    return {
      sleepHours,
      steps: numberOrZero(effectiveSummary.steps) || numberOrZero(manual.steps),
      activityMinutes: numberOrZero(effectiveSummary.activityMinutes) || numberOrZero(manual.activityMinutes),
      studyMinutes: numberOrZero(manual.studyMinutes),
      leisureMinutes: numberOrZero(manual.leisureMinutes),
    };
  }, [manual, effectiveSummary]);

  useEffect(() => {
    if (!consent.active || !watchMirrorEnabled || (!effectiveSummary.ok && !effectiveSummary.automatic)) return;
    const bridge = (window as any).AndroidCrewCheckNative;
    if (!bridge?.publishWatchCrewLife) return;

    const now = Date.now();
    const payload: Record<string, unknown> = {
      schemaVersion: 1,
      generatedAtEpochMs: now,
      validUntilEpochMs: now + 6 * 60 * 60 * 1000,
      recoveryLabel: 'DESCONHECIDA',
    };
    if (Number.isFinite(Number(effectiveSummary.sleepMinutes))) {
      payload.sleepMinutes = Math.max(0, Math.round(Number(effectiveSummary.sleepMinutes)));
      payload.sleepLabel = hoursLabel(effectiveSummary.sleepMinutes);
    }
    if (Number.isFinite(Number(effectiveSummary.steps))) {
      payload.steps = Math.max(0, Math.round(Number(effectiveSummary.steps)));
    }
    if (Number.isFinite(Number(effectiveSummary.activityMinutes))) {
      payload.activeMinutes = Math.max(0, Math.round(Number(effectiveSummary.activityMinutes)));
    }
    if (Number.isFinite(Number(effectiveSummary.restingHeartRateAverage))) {
      payload.restingHeartRate = Math.max(0, Math.round(Number(effectiveSummary.restingHeartRateAverage)));
    }
    if (effectiveSummary.source === 'samsung_health' && Number(effectiveSummary.energyScore) > 0) {
      payload.recoveryScore = Math.max(0, Math.min(100, Math.round(Number(effectiveSummary.energyScore))));
      payload.scoreKind = 'ENERGY';
      payload.detail = 'Samsung Health · Energy Score';
    }

    try { bridge.publishWatchCrewLife(JSON.stringify(payload)); } catch {}
  }, [consent.active, effectiveSummary, watchMirrorEnabled]);

  const recommendation = useMemo(() => {
    const program = nextProgram?.title || (nextProgram?.kind === 'flight' ? 'próxima programação' : 'próximo compromisso operacional');
    const presentation = nextProgram?.presentation || nextProgram?.departure;
    if (profile.areas.sleep && metrics.sleepHours > 0 && metrics.sleepHours < profile.sleepTarget) {
      return {
        tone: 'rest',
        title: 'Preserve seu descanso antes de encaixar novas atividades',
        body: `Seu registro mais recente está ${Math.max(0, profile.sleepTarget - metrics.sleepHours).toFixed(1).replace('.', ',')} h abaixo da meta pessoal. ${presentation ? `A apresentação do ${program} está indicada para ${presentation}.` : 'Confira a próxima programação antes de organizar estudo ou treino.'}`,
      };
    }
    if (profile.areas.activity && metrics.activityMinutes < 20) {
      return {
        tone: 'activity',
        title: 'Há espaço para uma atividade curta, se sua agenda permitir',
        body: `${nextProgram?.title ? `Considerando ${nextProgram.title}` : 'Como não há uma janela operacional completa informada'}, prefira um bloco leve e mantenha o descanso como prioridade.`,
      };
    }
    if (profile.areas.study && metrics.studyMinutes < profile.studyTargetMinutes) {
      return {
        tone: 'study',
        title: 'Boa janela para um bloco curto de estudo',
        body: `Você registrou ${metrics.studyMinutes} min nesta referência, diante da meta de ${profile.studyTargetMinutes} min. Confirme primeiro os horários da escala e do deslocamento.`,
      };
    }
    return {
      tone: 'balanced',
      title: 'Rotina registrada sem ajuste urgente',
      body: 'Mantenha a próxima programação como referência e atualize os registros quando sua rotina mudar.',
    };
  }, [metrics, nextProgram, profile]);

  function activateLife() {
    if (!consentChecked) return;
    const next: LifeConsent = { active: true, acceptedAt: new Date().toISOString(), policyVersion: '1.0' };
    setConsent(next);
    writeStored(KEYS.consent, next);
    toast.success('CrewCheck Life ativado. Nenhuma permissão de saúde foi solicitada ainda.');
  }

  function saveProfile() {
    const safe: LifeProfile = {
      ...profile,
      sleepTarget: Math.min(12, Math.max(1, numberOrZero(profile.sleepTarget) || 7.5)),
      studyTargetMinutes: Math.min(1440, Math.max(0, numberOrZero(profile.studyTargetMinutes))),
      trainingTargetMinutes: Math.min(1440, Math.max(0, numberOrZero(profile.trainingTargetMinutes))),
    };
    setProfile(safe);
    writeStored(KEYS.profile, safe);
    toast.success('Objetivos do CrewCheck Life salvos neste aparelho.');
  }

  function saveManual() {
    const safe: ManualSummary = {
      sleepHours: Math.min(24, numberOrZero(manual.sleepHours)),
      steps: Math.min(200000, Math.round(numberOrZero(manual.steps))),
      activityMinutes: Math.min(1440, Math.round(numberOrZero(manual.activityMinutes))),
      studyMinutes: Math.min(1440, Math.round(numberOrZero(manual.studyMinutes))),
      leisureMinutes: Math.min(1440, Math.round(numberOrZero(manual.leisureMinutes))),
      updatedAt: new Date().toISOString(),
    };
    setManual(safe);
    writeStored(KEYS.manual, safe);
    toast.success('Resumo manual atualizado localmente.');
  }

  function connectAndroid() {
    if (!postAndroid('requestPermissions', { consentVersion: '1.0', consentAccepted: consent.active })) {
      toast.info('Abra esta opção no aplicativo Android CrewCheck. No navegador, use o lançamento manual.');
    }
  }

  function refreshAndroid() {
    if (!postAndroid('readSummary', { days: 7, consentVersion: '1.0', consentAccepted: consent.active })) {
      toast.info('A atualização automática está disponível no aplicativo Android.');
    }
  }

  function setWatchMirror(enabled: boolean) {
    const bridge = (window as any).AndroidCrewCheckNative;
    if (!bridge?.setWatchLifeConsent) {
      toast.info('O espelhamento do CrewLife está disponível no aplicativo Android CrewCheck.');
      return;
    }
    try {
      const ok = bridge.setWatchLifeConsent(Boolean(enabled));
      if (ok === false) throw new Error('O celular não conseguiu atualizar o consentimento do relógio.');
      setWatchMirrorEnabled(enabled);
      toast.success(enabled
        ? 'CrewLife no relógio ativado. Somente resumos agregados serão enviados.'
        : 'CrewLife removido do relógio.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui atualizar o CrewLife no relógio.');
    }
  }

  function connectApple() {
    if (!appleBridge) {
      toast.info('Apple Health será liberado junto com o aplicativo nativo iOS. O modo manual já funciona no iPhone e iPad.');
      return;
    }
    appleBridge.postMessage({ action: 'requestPermissions', scopes: ['sleep', 'steps', 'activity', 'restingHeartRateTrend'] });
  }

  function revokeNative() {
    postAndroid('revokePermissions');
    try { appleBridge?.postMessage({ action: 'revokeOrOpenSettings' }); } catch {}
    setNativeSummary({});
    setNativeStatus({ availability: androidBridge?.postMessage ? 'permission_required' : 'unavailable' });
    try { localStorage.removeItem(KEYS.nativeSummary); } catch {}
    toast.success('Resumo local removido. A revogação do sistema foi solicitada quando disponível.');
  }

  function pauseLife() {
    const next = { ...consent, active: false };
    setConsent(next);
    writeStored(KEYS.consent, next);
    toast.success('CrewCheck Life pausado. Seus objetivos foram mantidos.');
  }

  function deleteLife() {
    if (!window.confirm('Apagar consentimento, objetivos e todos os resumos locais do CrewCheck Life neste aparelho?')) return;
    postAndroid('revokePermissions');
    Object.values(KEYS).forEach((key) => { try { localStorage.removeItem(key); } catch {} });
    setConsent({ active: false, acceptedAt: '', policyVersion: '1.0' });
    setProfile(DEFAULT_PROFILE);
    setManual(DEFAULT_MANUAL);
    setNativeSummary({});
    setNativeStatus({});
    setConsentChecked(false);
    toast.success('Dados locais do CrewCheck Life apagados.');
  }

  if (!consent.active) {
    return <section className="cc-life-shell cc-life-consent" aria-labelledby="crewcheck-life-title">
      <header className="cc-life-hero">
        <span><HeartPulse/></span>
        <div><small>ROTINA PESSOAL OPCIONAL</small><h1 id="crewcheck-life-title">CrewCheck Life</h1><p>Organize descanso, estudos, atividade física e tempo pessoal ao redor da sua escala.</p></div>
      </header>
      <article className="cc-life-readable cc-life-consent-card">
        <ShieldCheck/>
        <div><h2>Você decide se quer usar</h2><p>O CrewCheck Life não é uma ferramenta médica, não faz diagnóstico e não avalia aptidão. Os dados servem somente para recomendações pessoais e ficam neste aparelho nesta primeira entrega.</p></div>
      </article>
      <div className="cc-life-consent-grid">
        <article><MoonStar/><h3>Dados que podem ser usados</h3><p>Sono, passos, distância, atividade física, tendência resumida de frequência em repouso e sua próxima programação.</p></article>
        <article><LockKeyhole/><h3>Dados que não serão pedidos</h3><p>Pressão, glicose, peso, medicamentos, exames, diagnósticos, fertilidade ou prontuário.</p></article>
      </div>
      <label className="cc-life-check"><input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)}/><span>Li e entendi que o recurso é opcional e que permissões de saúde serão pedidas separadamente.</span></label>
      <div className="cc-life-actions"><button className="primary" disabled={!consentChecked} onClick={activateLife}><Check/> Ativar CrewCheck Life</button><button onClick={() => toast.message('Tudo bem. O CrewCheck continua funcionando normalmente sem o Life.')}>Agora não</button><a href="/manual.html#crewcheck-life-privacidade" target="_blank" rel="noreferrer"><BookOpen/> Como os dados são usados</a></div>
    </section>;
  }

  return <section className="cc-life-shell" aria-labelledby="crewcheck-life-title">
    <header className="cc-life-hero">
      <span><HeartPulse/></span>
      <div><small>ROTINA PESSOAL · CONTROLE LOCAL</small><h1 id="crewcheck-life-title">CrewCheck Life</h1><p>Planejamento de bem-estar ligado à escala, sem diagnóstico ou avaliação de aptidão.</p></div>
      <b>Ativo</b>
    </header>

    <section className={`cc-life-recommendation ${recommendation.tone}`}>
      <div><small>ORIENTAÇÃO PESSOAL</small><h2>{recommendation.title}</h2><p>{recommendation.body}</p></div>
      <button onClick={() => setWhyOpen((value) => !value)}>Por que estou vendo isso? {whyOpen ? <ChevronUp/> : <ChevronDown/>}</button>
      {whyOpen && <ul>
        <li>{nextProgram?.title ? `Próxima programação: ${nextProgram.title}${nextProgram.presentation ? ` às ${nextProgram.presentation}` : ''}.` : 'Nenhuma programação completa foi informada para esta orientação.'}</li>
        <li>Meta pessoal de sono: {profile.sleepTarget.toFixed(1).replace('.', ',')} h; registro considerado: {metrics.sleepHours ? `${metrics.sleepHours.toFixed(1).replace('.', ',')} h` : 'sem dado'}.</li>
        <li>Atividade considerada: {metrics.activityMinutes} min; estudo informado: {metrics.studyMinutes} min.</li>
        <li>A orientação é uma sugestão de rotina e não substitui avaliação pessoal ou canal oficial de fadiga.</li>
      </ul>}
    </section>

    {automaticSamsung && <section className="cc-life-auto-source">
      <div><small>FONTE AUTOMÁTICA</small><strong>Samsung Health</strong><span>Sincronizado pelo CrewLife Companion</span></div>
      {Number(companionSummary.energyScore || 0) > 0 && <b>Energia {Math.round(Number(companionSummary.energyScore))}</b>}
      <button onClick={() => (window as any).AndroidCrewCheckNative?.openLifeCompanion?.()}>Abrir Companion</button>
    </section>}

    <section className="cc-life-metrics" aria-label="Resumo do CrewCheck Life">
      <article><MoonStar/><small>Sono recente</small><strong>{metrics.sleepHours ? `${metrics.sleepHours.toFixed(1).replace('.', ',')} h` : 'Sem dado'}</strong><span>{automaticSamsung ? 'Samsung Health · automático' : `meta ${profile.sleepTarget.toFixed(1).replace('.', ',')} h`}</span></article>
      <article><Footprints/><small>Passos</small><strong>{metrics.steps ? metrics.steps.toLocaleString('pt-BR') : 'Sem dado'}</strong><span>{automaticSamsung ? 'Samsung Health · automático' : 'entrada manual'}</span></article>
      <article><Activity/><small>Atividade</small><strong>{metrics.activityMinutes ? `${metrics.activityMinutes} min` : 'Sem dado'}</strong><span>{automaticSamsung ? 'Samsung Health · automático' : 'sem avaliação clínica'}</span></article>
      <article><BookOpen/><small>Estudo</small><strong>{metrics.studyMinutes ? `${metrics.studyMinutes} min` : 'Sem dado'}</strong><span>meta {profile.studyTargetMinutes} min</span></article>
    </section>

    <CrewLifeFemPanel/>

    <section className="cc-life-block cc-life-integrations">
      <header><div><small>INTEGRAÇÕES</small><h2>Conecte somente o que quiser</h2></div><ShieldCheck/></header>
      <div className="cc-life-integration-grid">
        <article className={automaticSamsung ? 'connected' : companionStatus.installed ? 'ready' : ''}>
          <Smartphone/><div><h3>CrewLife Companion Samsung</h3><p>Lê automaticamente passos, sono, atividade e Energy Score do Samsung Health, somente com sua autorização.</p><small>{companionStateLabel}</small>{companionMigrationRequired && <p>Você está usando uma versão piloto antiga. O Android precisa remover somente o Companion uma vez para instalar a versão oficial da Play. Seu CrewCheck, login e escala não serão removidos.</p>}</div>
          <button className={automaticSamsung ? '' : 'primary'} onClick={() => {
            if (companionMigrationRequired) {
              migrateCompanionToOfficialPlay();
              return;
            }
            if (!companionStatus.installed) {
              openCompanionStore();
              return;
            }
            const ok = (window as any).AndroidCrewCheckNative?.openLifeCompanion?.();
            if (!ok) toast.info('Abra o CrewLife Companion para concluir a conexão com o Samsung Health.');
          }}>{automaticSamsung ? 'Abrir Companion' : companionMigrationRequired ? 'Migrar para versão oficial' : companionStatus.installed ? 'Conectar' : 'Baixar na Play Store'}</button>
        </article>
        {nativeHealthEnabled && <article className={nativeStatus.allGranted ? 'connected' : ''}>
          <Smartphone/><div><h3>Health Connect</h3><p>Integração Android alternativa quando disponível nesta build.</p><small>{integrationLabel(nativeStatus)}</small></div>
          <div><button className="primary" onClick={connectAndroid}>{nativeStatus.allGranted ? 'Rever permissões' : 'Conectar'}</button>{nativeStatus.allGranted && <button onClick={refreshAndroid}><RefreshCw/> Atualizar</button>}</div>
        </article>}
        {(!(window as any).AndroidCrewCheckNative || appleBridge) && <article className={appleBridge ? 'ready' : ''}>
          <Apple/><div><h3>Apple Health</h3><p>Interface preparada. A leitura depende do aplicativo nativo iOS e da autorização do HealthKit.</p><small>{appleBridge ? 'App iOS pronto para autorizar' : 'Modo manual disponível no iPhone/iPad'}</small></div>
          <button onClick={connectApple}>{appleBridge ? 'Conectar' : 'Ver disponibilidade'}</button>
        </article>}
        <article className="connected">
          <Check/><div><h3>Entrada manual</h3><p>Funciona no navegador e nos aplicativos, sem vincular nenhuma conta de saúde.</p><small>Disponível agora</small></div>
        </article>
        <article className={watchMirrorEnabled ? 'connected' : ''}>
          <Smartphone/><div><h3>Mostrar CrewLife no relógio</h3><p>Envia somente sono, passos/atividade e FC em repouso agregados quando disponíveis. Nenhum dado bruto é enviado.</p><small>{watchMirrorEnabled ? 'Espelhamento autorizado' : 'Desativado por padrão'}</small></div>
          <button className={watchMirrorEnabled ? '' : 'primary'} onClick={() => setWatchMirror(!watchMirrorEnabled)}>{watchMirrorEnabled ? 'Desativar no relógio' : 'Ativar no relógio'}</button>
        </article>
      </div>
      {nativeSummary.ok && <p className="cc-life-sync-note">Último resumo nativo: {dateTimeLabel(nativeSummary.capturedAt) || 'agora'} · sono {hoursLabel(effectiveSummary.sleepMinutes)} · período {nativeSummary.periodDays || 7} dias. Dados brutos não são copiados para o CrewCheck.</p>}
    </section>

    <section className="cc-life-block">
      <header><div><small>OBJETIVOS</small><h2>Preferências da sua rotina</h2></div><button onClick={saveProfile}>Salvar objetivos</button></header>
      <div className="cc-life-form-grid">
        <label><span>Meta de sono (h)</span><input type="number" min="1" max="12" step="0.5" value={profile.sleepTarget} onChange={(event) => setProfile({ ...profile, sleepTarget: Number(event.target.value) })}/></label>
        <label><span>Meta de estudo (min)</span><input type="number" min="0" max="1440" step="15" value={profile.studyTargetMinutes} onChange={(event) => setProfile({ ...profile, studyTargetMinutes: Number(event.target.value) })}/></label>
        <label><span>Meta de atividade (min)</span><input type="number" min="0" max="1440" step="15" value={profile.trainingTargetMinutes} onChange={(event) => setProfile({ ...profile, trainingTargetMinutes: Number(event.target.value) })}/></label>
      </div>
      <div className="cc-life-area-grid">{([
        ['sleep', 'Descanso'], ['study', 'Estudos'], ['activity', 'Atividade física'], ['meals', 'Alimentação'], ['leisure', 'Lazer'],
      ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={profile.areas[key]} onChange={(event) => setProfile({ ...profile, areas: { ...profile.areas, [key]: event.target.checked } })}/><span>{label}</span></label>)}</div>
    </section>

    <section className="cc-life-block">
      <header><div><small>ENTRADA MANUAL</small><h2>Resumo pessoal</h2><p>Use quando não quiser ou não puder conectar um repositório de saúde.</p></div><button onClick={saveManual}>Salvar resumo</button></header>
      <div className="cc-life-form-grid five">
        <label><span>Sono recente (h)</span><input type="number" min="0" max="24" step="0.25" value={manual.sleepHours} onChange={(event) => setManual({ ...manual, sleepHours: Number(event.target.value) })}/></label>
        <label><span>Passos</span><input type="number" min="0" max="200000" step="100" value={manual.steps} onChange={(event) => setManual({ ...manual, steps: Number(event.target.value) })}/></label>
        <label><span>Atividade (min)</span><input type="number" min="0" max="1440" step="5" value={manual.activityMinutes} onChange={(event) => setManual({ ...manual, activityMinutes: Number(event.target.value) })}/></label>
        <label><span>Estudo (min)</span><input type="number" min="0" max="1440" step="5" value={manual.studyMinutes} onChange={(event) => setManual({ ...manual, studyMinutes: Number(event.target.value) })}/></label>
        <label><span>Lazer (min)</span><input type="number" min="0" max="1440" step="5" value={manual.leisureMinutes} onChange={(event) => setManual({ ...manual, leisureMinutes: Number(event.target.value) })}/></label>
      </div>
      {manual.updatedAt && <small className="cc-life-updated">Atualizado em {dateTimeLabel(manual.updatedAt)}</small>}
    </section>

    <section className="cc-life-block cc-life-data-controls">
      <header><div><small>SEUS DADOS</small><h2>Controle e exclusão</h2><p>O CrewCheck Life continua opcional e o restante do sistema funciona sem ele.</p></div><LockKeyhole/></header>
      <div><button onClick={pauseLife}>Pausar CrewCheck Life</button><button onClick={revokeNative}>Revogar conexão e limpar resumo</button><button className="danger" onClick={deleteLife}><Trash2/> Apagar todos os dados do Life</button></div>
    </section>
  </section>;
}
