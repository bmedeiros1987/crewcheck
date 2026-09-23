import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowUpRight, BatteryMedium, Footprints, MoonStar, ShieldCheck, Thermometer, Watch } from 'lucide-react';
import { METRICS, METRIC_KEYS, manualWellness, metricText, normalizeWellness, suggestWellness, type Feeling, type ManualRecord, type MetricKey, type WellnessData } from './wellness';
import './wellness.css';

type SamsungBridge = {
  getSamsungWellnessStatus: () => string;
  requestSamsungWellnessPermissions: (requestId: string, categories: string) => boolean;
  readSamsungWellness: (requestId: string, categories: string) => boolean;
  clearSamsungWellness: () => void;
};
const icons = { sleepMinutes: MoonStar, sleepScore: MoonStar, skinTemperature: Thermometer, steps: Footprints, exerciseMinutes: Activity, energyScore: BatteryMedium };
const choices: { id: Feeling; label: string }[] = [{ id: 'tired', label: 'Cansado' }, { id: 'okay', label: 'Disposição regular' }, { id: 'well', label: 'Bem disposto' }, { id: 'unwell', label: 'Não me sinto bem' }];
function getBridge(): SamsungBridge | undefined {
  const native = (window as unknown as { AndroidCrewCheckNative?: Partial<SamsungBridge> }).AndroidCrewCheckNative;
  if (!native || typeof native.getSamsungWellnessStatus !== 'function' || typeof native.requestSamsungWellnessPermissions !== 'function' || typeof native.readSamsungWellness !== 'function' || typeof native.clearSamsungWellness !== 'function') return undefined;
  return native as SamsungBridge;
}

export default function WellnessDashboard({ manual, sleepGoalHours }: { manual: ManualRecord; sleepGoalHours: number }) {
  const [feeling, setFeeling] = useState<Feeling>('unknown');
  const [now, setNow] = useState(Date.now());
  const [samsung, setSamsung] = useState<WellnessData>({});
  const [available, setAvailable] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [selected, setSelected] = useState<MetricKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('A conexão Samsung Health ainda não está disponível nesta versão. Seus registros manuais continuam funcionando.');
  const pending = useRef<{ id: string; mode: 'permissions' | 'read'; keys: MetricKey[] } | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finish = () => { pending.current = null; clearTimeout(timeout.current); setBusy(false); };

  useEffect(() => {
    try {
      const bridge = getBridge();
      const status = bridge ? JSON.parse(bridge.getSamsungWellnessStatus()) : null;
      if (status?.available === true) { setAvailable(true); setNotice('Escolha quais dados deseja consultar. A autorização será confirmada no Samsung Health.'); }
    } catch { /* Unavailable stays explicitly unavailable. */ }
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    const receive = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      const request = pending.current;
      if (!request || !payload || payload.requestId !== request.id) return;
      if (payload.ok !== true) {
        setSamsung({}); setAuthorized(false); finish();
        setNotice('Não foi possível consultar os dados. Confira o acesso no Samsung Health e tente novamente.');
        return;
      }
      if (request.mode === 'permissions') {
        setAuthorized(true); setNotice('Autorização concluída. Toque em atualizar para consultar os dados disponíveis.');
      } else {
        const normalized = normalizeWellness(payload.metrics, 'samsung-health');
        const allowed = Object.fromEntries(Object.entries(normalized).filter(([key]) => request.keys.includes(key as MetricKey)));
        setSamsung(allowed); setNow(Date.now());
        setNotice(Object.keys(allowed).length ? 'Dados consultados. Valores ausentes podem depender do modelo do relógio, das medições ou das permissões.' : 'Nenhum dado recente disponível para as categorias escolhidas.');
      }
      finish();
    };
    window.addEventListener('crewcheck:samsung-wellness', receive);
    return () => {
      window.clearInterval(timer); clearTimeout(timeout.current); pending.current = null;
      window.removeEventListener('crewcheck:samsung-wellness', receive);
      try { getBridge()?.clearSamsungWellness(); } catch { /* Session data is memory-only. */ }
    };
  }, []);

  const data = useMemo(() => ({ ...manualWellness(manual, Date.now()), ...normalizeWellness(samsung, 'samsung-health', Date.now()) }), [manual, samsung, now]);
  const suggestion = useMemo(() => suggestWellness(data, feeling, sleepGoalHours, Date.now()), [data, feeling, sleepGoalHours, now]);
  const count = Object.keys(data).length;

  function request(mode: 'permissions' | 'read') {
    const bridge = getBridge();
    if (!available || !bridge || busy || !selected.length || (mode === 'read' && !authorized)) return;
    const id = crypto.randomUUID();
    pending.current = { id, mode, keys: [...selected] }; setBusy(true);
    timeout.current = setTimeout(() => { finish(); setSamsung({}); setNotice('A consulta demorou mais que o esperado. Você pode tentar novamente.'); }, 45000);
    try {
      const accepted = mode === 'permissions' ? bridge.requestSamsungWellnessPermissions(id, JSON.stringify(selected)) : bridge.readSamsungWellness(id, JSON.stringify(selected));
      if (!accepted) { finish(); setNotice('Não foi possível abrir a conexão Samsung Health neste aparelho.'); }
    } catch { finish(); setNotice('Conexão indisponível. Tente novamente mais tarde.'); }
  }
  function disconnect() {
    finish(); setSamsung({}); setAuthorized(false); setSelected([]);
    try { getBridge()?.clearSamsungWellness(); } catch { /* Local clear remains effective. */ }
    setNotice('Consulta interrompida e resumo Samsung removido desta tela. Para retirar a permissão do sistema, use o gerenciamento de acesso do Samsung Health.');
  }
  function toggle(key: MetricKey) {
    finish(); setSamsung({}); setAuthorized(false);
    try { getBridge()?.clearSamsungWellness(); } catch {}
    setSelected(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
  }

  return <section className="cw-wellness" aria-label="Seu bem-estar hoje">
    <header className="cw-wellness-heading"><div><p className="cw-eyebrow">CREWLIFE · SEU MOMENTO</p><h2>Cuide do seu ritmo.</h2><p>Sono, movimento e disposição em um lugar só.</p></div><span className="cw-source-count">{count ? `${count} de 6 métricas disponíveis` : 'Vamos começar'}</span></header>
    <div className={`cw-day-card cw-day-${suggestion.kind}`}>
      <div className="cw-day-icon"><MoonStar aria-hidden="true"/></div>
      <div><p className="cw-eyebrow">UMA SUGESTÃO PARA HOJE</p><h3>{suggestion.title}</h3><p>{suggestion.description}</p>
        <div className="cw-activity-options" aria-label="Opções de atividade">{suggestion.activities.map(activity => <span key={activity}>{activity}</span>)}</div>
        <details><summary>O que foi considerado</summary><ul>{suggestion.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><p>Energy Score, qualidade do sono e temperatura são contexto. Isoladamente, não determinam intensidade de treino nem aptidão para trabalhar ou voar.</p></details>
      </div>
    </div>
    <fieldset className="cw-feeling"><legend>Como você se sente agora?</legend><div>{choices.map(choice => <button type="button" key={choice.id} aria-pressed={feeling === choice.id} onClick={() => setFeeling(choice.id)}>{choice.label}</button>)}</div><small>Sua percepção vale mais que uma pontuação. Esta resposta fica somente nesta sessão.</small></fieldset>
    <div className="cw-metric-grid">{METRIC_KEYS.map(key => {
      const Icon = icons[key], observation = data[key], spec = METRICS[key];
      return <article key={key} className={observation ? 'cw-metric' : 'cw-metric cw-metric-empty'}>
        <div className="cw-metric-top"><Icon aria-hidden="true"/><span>{observation ? observation.source === 'samsung-health' ? 'Samsung Health' : 'Manual' : 'Não disponível'}</span></div>
        <h3>{spec.label}</h3><strong>{metricText(key, observation)}</strong><p>{spec.note}</p>
        {observation ? <time dateTime={observation.observedAt}>{new Date(observation.observedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time> : <small>{key === 'energyScore' || key === 'sleepScore' || key === 'skinTemperature' ? 'Depende de dados compatíveis da Samsung' : 'Adicione um registro ou conecte uma fonte disponível'}</small>}
      </article>;
    })}</div>
    <section className="cw-connection" aria-labelledby="cw-samsung-title"><div className="cw-connection-title"><Watch aria-hidden="true"/><div><p className="cw-eyebrow">GALAXY WATCH → SAMSUNG HEALTH</p><h3 id="cw-samsung-title">Seus dados, com sua autorização</h3></div><span>{available ? 'Disponível neste aparelho' : 'Em preparação'}</span></div>
      <p role="status">{notice}</p>
      {available && <><fieldset><legend>Quais dados você quer consultar?</legend><div className="cw-consent-grid">{METRIC_KEYS.map(key => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)} disabled={busy}/>{METRICS[key].label}</label>)}</div></fieldset><div className="cw-connection-actions"><button type="button" disabled={busy || !selected.length} onClick={() => request(authorized ? 'read' : 'permissions')}>{busy ? 'Aguardando Samsung Health…' : authorized ? 'Atualizar dados' : 'Autorizar no Samsung Health'}<ArrowUpRight aria-hidden="true"/></button><button type="button" onClick={disconnect}>Desconectar e limpar</button></div></>}
      <p className="cw-privacy"><ShieldCheck aria-hidden="true"/>Resumos Samsung ficam apenas na memória desta sessão. Nenhum envio automático para servidor, IA, TV ou relógio.</p>
    </section>
  </section>;
}
