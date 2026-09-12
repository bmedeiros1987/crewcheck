import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronUp, HeartHandshake, LockKeyhole, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildFemInsights,
  buildRecoverySuggestion,
  estimateCycleContext,
  maturityLabel,
  type FemCheckin,
  type FemCycleRecord,
  type FemSymptomKey,
  type FemWellbeing,
} from '@/lib/crewLifeFem';

type Props = {
  nextPresentation?: string;
  sleepHours?: number;
  activityMinutes?: number;
};

type FemConsent = { active: boolean; acceptedAt: string; version: '1.0' };

type FemStore = {
  consent: FemConsent;
  cycles: FemCycleRecord[];
  checkins: FemCheckin[];
};

const KEY = 'crewcheck:life:fem:v1';
const EMPTY: FemStore = { consent: { active: false, acceptedAt: '', version: '1.0' }, cycles: [], checkins: [] };

const SYMPTOMS: Array<[FemSymptomKey, string]> = [
  ['cramps', 'Cólica/dor'],
  ['headache', 'Cefaleia'],
  ['bloating', 'Inchaço'],
  ['sleep_worse', 'Sono pior'],
  ['sleepiness', 'Sonolência'],
  ['irritability', 'Irritabilidade'],
  ['mood_change', 'Mudança de humor'],
  ['low_energy', 'Energia baixa'],
  ['gastrointestinal', 'Desconforto gastrointestinal'],
  ['hot_flushes', 'Calor/ondas de calor'],
  ['night_sweats', 'Sudorese noturna'],
  ['concentration', 'Concentração pior'],
  ['exercise_discomfort', 'Treino desconfortável'],
];

function readStore(): FemStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<FemStore>;
    return {
      consent: parsed.consent?.version === '1.0' ? parsed.consent : EMPTY.consent,
      cycles: Array.isArray(parsed.cycles) ? parsed.cycles : [],
      checkins: Array.isArray(parsed.checkins) ? parsed.checkins : [],
    };
  } catch {
    return EMPTY;
  }
}

function writeStore(value: FemStore) {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch {}
}

function today() { return new Date().toISOString().slice(0, 10); }
function id(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export default function CrewLifeFemPanel({ nextPresentation, sleepHours, activityMinutes }: Props) {
  const [store, setStore] = useState<FemStore>(() => readStore());
  const [consentChecked, setConsentChecked] = useState(false);
  const [periodStart, setPeriodStart] = useState(today());
  const [wellbeing, setWellbeing] = useState<FemWellbeing>('ok');
  const [sleepQuality, setSleepQuality] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [energy, setEnergy] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [symptoms, setSymptoms] = useState<FemSymptomKey[]>([]);
  const [freeText, setFreeText] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const cycleContext = useMemo(() => estimateCycleContext(store.cycles), [store.cycles]);
  const insights = useMemo(() => buildFemInsights(store.cycles, store.checkins), [store.cycles, store.checkins]);
  const latestCheckin = store.checkins.slice().sort((a, b) => b.at.localeCompare(a.at))[0];
  const suggestion = useMemo(() => buildRecoverySuggestion({ cycleContext, latestCheckin, insights, nextPresentation }), [cycleContext, latestCheckin, insights, nextPresentation]);

  function commit(next: FemStore) {
    setStore(next);
    writeStore(next);
  }

  function activate() {
    if (!consentChecked) return;
    commit({ ...store, consent: { active: true, acceptedAt: new Date().toISOString(), version: '1.0' } });
    toast.success('CrewLife Fem ativado somente neste aparelho.');
  }

  function recordPeriod() {
    if (!periodStart) return;
    if (store.cycles.some((item) => item.periodStart === periodStart)) {
      toast.info('Esta data já está registrada.');
      return;
    }
    const record: FemCycleRecord = { id: id('cycle'), periodStart, source: 'manual', createdAt: new Date().toISOString() };
    commit({ ...store, cycles: [...store.cycles, record].sort((a, b) => a.periodStart.localeCompare(b.periodStart)) });
    toast.success('Início da menstruação registrado localmente.');
  }

  function toggleSymptom(value: FemSymptomKey) {
    setSymptoms((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function saveCheckin() {
    const entry: FemCheckin = {
      id: id('checkin'),
      at: new Date().toISOString(),
      wellbeing,
      sleepQuality,
      energy,
      symptoms,
      freeText: freeText.trim() || undefined,
      context: {
        presentation: nextPresentation,
        sleepHours: Number.isFinite(sleepHours) && Number(sleepHours) > 0 ? Number(sleepHours) : undefined,
        trainingMinutes: Number.isFinite(activityMinutes) && Number(activityMinutes) > 0 ? Number(activityMinutes) : undefined,
        earlyStart: Boolean(nextPresentation && /^0[0-5]:/.test(nextPresentation)),
      },
    };
    commit({ ...store, checkins: [...store.checkins, entry] });
    setSymptoms([]);
    setFreeText('');
    toast.success('Check-in salvo. O CrewLife Fem usa isso como autorrelato, não diagnóstico.');
  }

  function pause() {
    commit({ ...store, consent: { ...store.consent, active: false } });
    toast.success('CrewLife Fem pausado.');
  }

  function erase() {
    if (!window.confirm('Apagar todos os dados locais do CrewLife Fem neste aparelho?')) return;
    try { localStorage.removeItem(KEY); } catch {}
    setStore(EMPTY);
    setConsentChecked(false);
    toast.success('Dados locais do CrewLife Fem apagados.');
  }

  if (!store.consent.active) {
    return <section className="cc-life-block cc-fem-optin" aria-labelledby="crewlife-fem-title">
      <header><div><small>OPCIONAL · LOCAL ONLY</small><h2 id="crewlife-fem-title">CrewLife Fem</h2><p>Ciclo, escala, sono e qualidade de vida com aprendizado pessoal — sem diagnóstico e sem presumir como você deveria se sentir.</p></div><HeartHandshake/></header>
      <div className="cc-fem-privacy"><LockKeyhole/><p>Desativado por padrão. Os registros ficam neste aparelho nesta primeira entrega e não são enviados ao empregador, usados para ranking ou avaliação de aptidão.</p></div>
      <label className="cc-life-check"><input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)}/><span>Quero ativar o CrewLife Fem e entendo que ciclo e sintomas são dados pessoais sensíveis e voluntários.</span></label>
      <button className="primary" disabled={!consentChecked} onClick={activate}><Check/> Ativar CrewLife Fem</button>
    </section>;
  }

  return <section className="cc-life-block cc-fem-panel" aria-labelledby="crewlife-fem-title">
    <header><div><small>APRENDIZADO PESSOAL · LOCAL ONLY</small><h2 id="crewlife-fem-title">CrewLife Fem</h2><p>Aprende padrões da própria usuária ao longo do tempo. Nunca transforma fase do ciclo em diagnóstico, previsão de fadiga ou aptidão.</p></div><HeartHandshake/></header>

    <section className="cc-fem-summary">
      <article><CalendarDays/><small>Ciclo</small><strong>{cycleContext.cycleDay ? `Dia estimado ${cycleContext.cycleDay}` : 'Sem estimativa'}</strong><span>{cycleContext.cyclesObserved} ciclo(s) registrado(s)</span></article>
      <article><Sparkles/><small>Maturidade</small><strong>{maturityLabel(cycleContext.confidence)}</strong><span>{cycleContext.averageCycleDays ? `média observada ${cycleContext.averageCycleDays} dias` : 'ainda aprendendo'}</span></article>
    </section>

    <section className="cc-fem-suggestion"><small>COACH DE RECUPERAÇÃO</small><h3>{suggestion.title}</h3><p>{suggestion.body}</p></section>

    <section className="cc-fem-entry">
      <div><h3>Registrar início da menstruação</h3><p>Use apenas se quiser. A fase exibida é estimativa baseada nas datas que você informou.</p></div>
      <div className="cc-fem-inline"><input aria-label="Data do início da menstruação" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)}/><button onClick={recordPeriod}>Registrar</button></div>
    </section>

    <section className="cc-fem-checkin">
      <div><h3>Como você está se sentindo?</h3><p>A resposta é sua percepção. O CrewCheck não converte “cansada” em diagnóstico de fadiga.</p></div>
      <div className="cc-fem-choice-row">
        {([['well','Bem'],['ok','OK'],['tired','Cansada'],['very_tired','Muito cansada']] as Array<[FemWellbeing,string]>).map(([value,label]) => <button key={value} className={wellbeing === value ? 'selected' : ''} onClick={() => setWellbeing(value)}>{label}</button>)}
      </div>
      <div className="cc-life-form-grid">
        <label><span>Qualidade do sono percebida (1–5)</span><input type="number" min="1" max="5" value={sleepQuality} onChange={(event) => setSleepQuality(Math.min(5, Math.max(1, Number(event.target.value))) as 1|2|3|4|5)}/></label>
        <label><span>Energia percebida (1–5)</span><input type="number" min="1" max="5" value={energy} onChange={(event) => setEnergy(Math.min(5, Math.max(1, Number(event.target.value))) as 1|2|3|4|5)}/></label>
      </div>
      <div className="cc-fem-chips">{SYMPTOMS.map(([value,label]) => <button key={value} className={symptoms.includes(value) ? 'selected' : ''} onClick={() => toggleSymptom(value)}>{label}</button>)}</div>
      <label className="cc-fem-note"><span>Observação opcional</span><textarea maxLength={500} value={freeText} onChange={(event) => setFreeText(event.target.value)} placeholder="Ex.: noite ruim no hotel por barulho, cólica, treino mais intenso..."/></label>
      <button className="primary" onClick={saveCheckin}>Salvar check-in</button>
    </section>

    <section className="cc-fem-insights">
      <header><div><small>SEUS PADRÕES</small><h3>{insights.length ? 'O que apareceu no seu histórico' : 'Ainda estamos aprendendo'}</h3></div></header>
      {insights.length ? insights.map((item) => <article key={item.id}><strong>{item.title}</strong><p>{item.detail}</p><small>{item.confidenceLabel} · n={item.sampleSize} · {item.factors.join(' + ')}</small></article>) : <p>Com mais ciclos e check-ins, o sistema poderá comparar sono, early starts, treino e sintomas sem aplicar uma regra genérica para todas as mulheres.</p>}
    </section>

    <button className="cc-fem-history-toggle" onClick={() => setHistoryOpen((value) => !value)}>Histórico local {historyOpen ? <ChevronUp/> : <ChevronDown/>}</button>
    {historyOpen && <div className="cc-fem-history">
      <p><strong>{store.cycles.length}</strong> início(s) de ciclo · <strong>{store.checkins.length}</strong> check-in(s).</p>
      {store.checkins.slice().sort((a,b) => b.at.localeCompare(a.at)).slice(0,5).map((entry) => <small key={entry.id}>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(entry.at))} · {entry.wellbeing} · {entry.symptoms.length} sintoma(s)</small>)}
    </div>}

    <div className="cc-fem-controls"><button onClick={pause}>Pausar</button><button className="danger" onClick={erase}><Trash2/> Apagar dados do Fem</button></div>
  </section>;
}
