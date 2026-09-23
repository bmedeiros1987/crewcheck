import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowUpRight, BatteryMedium, Footprints, MoonStar, ShieldCheck, Thermometer, Watch } from 'lucide-react';
import { METRICS, METRIC_KEYS, manualWellness, metricText, normalizeWellness, suggestWellness, type Feeling, type ManualRecord, type MetricKey, type WellnessData } from './wellness';
import './wellness.css';

import { disconnectSamsung, hasSamsungBridge, samsungRequest } from './samsung';
const icons = { sleepMinutes: MoonStar, sleepScore: MoonStar, skinTemperature: Thermometer, steps: Footprints, exerciseMinutes: Activity, energyScore: BatteryMedium };
const choices: { id: Feeling; label: string }[] = [{ id: 'tired', label: 'Cansado' }, { id: 'okay', label: 'Disposição regular' }, { id: 'well', label: 'Bem disposto' }, { id: 'unwell', label: 'Não me sinto bem' }];
export default function WellnessDashboard({ manual, sleepGoalHours }: { manual: ManualRecord; sleepGoalHours: number }) {
  const [feeling, setFeeling] = useState<Feeling>('unknown');
  const [now, setNow] = useState(Date.now());
  const [samsung, setSamsung] = useState<WellnessData>({});
  const [available, setAvailable] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [selected, setSelected] = useState<MetricKey[]>([]);
  const [background, setBackground] = useState(false);
  const [lastSync, setLastSync] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Conexão Samsung em preparação para liberação. Seus registros manuais continuam funcionando.');
  const state = useRef({ epoch: 0, active: true, busy: false, authorized: false });
  async function sync(action: 'status' | 'permissions' | 'read' | 'background', extra: Record<string, unknown> = {}) {
    if (state.current.busy) return;
    const epoch = state.current.epoch;
    let followUp = false;
    state.current.busy = true; setBusy(true);
    try {
      const result = await samsungRequest(action, extra);
      if (!state.current.active || epoch !== state.current.epoch) return;
      if (result.paused) return;
      if (!result.ok) throw new Error('Samsung indisponível');
      const keys = (Array.isArray(result.keys) ? result.keys : []).filter(key => METRIC_KEYS.includes(key));
      setAvailable(result.available === true); setSelected(keys); setAuthorized(keys.length > 0);
      state.current.authorized = keys.length > 0;
      setBackground(result.background === true);
      if (result.metrics) setSamsung(Object.fromEntries(Object.entries(normalizeWellness(result.metrics, 'samsung-health')).filter(([key]) => keys.includes(key as MetricKey))));
      else if (!keys.length) setSamsung({});
      setNow(Date.now());
      if (result.syncedAt) setLastSync(result.syncedAt);
      if (result.available) setNotice(keys.length ? 'Conectado. Atualização automática ao abrir esta tela e enquanto ela estiver visível.' : 'Escolha os dados e autorize o acesso no Samsung Health.');
      followUp = keys.length > 0 && ['status', 'permissions', 'background'].includes(action);
    } catch {
      if (!state.current.active || epoch !== state.current.epoch) return;
      disconnectSamsung();
      setNotice('Não foi possível acessar o Samsung Health. Confira a instalação, as permissões e a disponibilidade da integração para este app.');
    } finally { if (state.current.active && epoch === state.current.epoch) { state.current.busy = false; setBusy(false); } }
    if (followUp && state.current.active && epoch === state.current.epoch) void sync('read');
  }
  useEffect(() => {
    state.current.active = true;
    const disconnected = () => { state.current.epoch++; state.current.busy = false; state.current.authorized = false; setBusy(false); setAuthorized(false); setSelected([]); setBackground(false); setSamsung({}); setLastSync(undefined); };
    const visible = () => { setNow(Date.now()); if (!document.hidden && state.current.authorized) void sync('read'); };
    window.addEventListener('crewcheck:samsung-disconnected', disconnected);
    document.addEventListener('visibilitychange', visible);
    const refresh = window.setInterval(visible, 5 * 60000);
    const age = window.setInterval(() => setNow(Date.now()), 60000);
    if (hasSamsungBridge()) void sync('status');
    return () => { state.current.active = false; state.current.epoch++; state.current.busy = false; window.clearInterval(refresh); window.clearInterval(age); window.removeEventListener('crewcheck:samsung-disconnected', disconnected); document.removeEventListener('visibilitychange', visible); };
  }, []);
  const data = useMemo(() => ({ ...manualWellness(manual, Date.now()), ...normalizeWellness(samsung, 'samsung-health', Date.now()) }), [manual, samsung, now]);
  const suggestion = useMemo(() => suggestWellness(data, feeling, sleepGoalHours, Date.now()), [data, feeling, sleepGoalHours, now]);
  const count = Object.keys(data).length;
  function request(mode: 'permissions' | 'read') { void sync(mode, mode === 'permissions' ? { keys: selected } : {}); }
  function disconnect() { disconnectSamsung(); setNotice('Sincronização interrompida e cópia local apagada. As permissões do sistema podem ser removidas nas configurações do Samsung Health.'); }
  function toggle(key: MetricKey) {
    const next = selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key];
    disconnectSamsung(); setSelected(next);
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
      <p role="status">{notice}</p>{lastSync && <p>Última consulta: {new Date(lastSync).toLocaleString('pt-BR')}</p>}
      {available && <><fieldset><legend>Quais dados você quer consultar?</legend><div className="cw-consent-grid">{METRIC_KEYS.map(key => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)} disabled={busy}/>{METRICS[key].label}</label>)}</div></fieldset><label className="cw-background"><input type="checkbox" checked={background} disabled={busy || !authorized} onChange={event => void sync('background', { enabled: event.target.checked })}/>Atualizar também com o app fechado</label><p className="cw-background-note">Opcional: guarda neste celular um resumo criptografado com validade de até 24 horas. O Android define quando a atualização pode ocorrer; ela não é instantânea.</p><div className="cw-connection-actions"><button type="button" disabled={busy || !selected.length} onClick={() => request(authorized ? 'read' : 'permissions')}>{busy ? 'Aguardando Samsung Health…' : authorized ? 'Atualizar dados' : 'Autorizar no Samsung Health'}<ArrowUpRight aria-hidden="true"/></button><button type="button" onClick={disconnect}>Desconectar e limpar</button></div></>}
      <p className="cw-privacy"><ShieldCheck aria-hidden="true"/>Sem envio automático para servidor, IA, TV ou relógio. Sem atualização em segundo plano, os valores ficam apenas na memória desta tela. Você pode desconectar e apagar a cópia local a qualquer momento.</p>
    </section>
  </section>;
}
