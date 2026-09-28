import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  BookOpenCheck,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Dumbbell,
  GlassWater,
  HeartHandshake,
  MapPinCheck,
  MoonStar,
  Palmtree,
  Play,
  Save,
  Share2,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildLifeConciergeRecommendation,
  cancelLifeSession,
  finishLifeSession,
  getActiveLifeSession,
  getLifeAdaptivePreferences,
  getLifeRoutineContext,
  recordGymCheckIn,
  recordHydration,
  recordLifeEvent,
  recordRecommendationFeedback,
  saveLifeAdaptivePreferences,
  scheduleLifeRemindersForToday,
  shareGymCheckInText,
  startLifeSession,
  type LifeAdaptivePreferences,
  type LifeRoutineContext,
} from '@/lib/lifeConcierge';
import './life-concierge.css';

type NextProgram = { title?: string; date?: string; presentation?: string; departure?: string; kind?: string };
type HealthSummary = { capturedAt?: string; sleepMinutes?: number | null; steps?: number | null; activityMinutes?: number | null };
type LifeProfile = { sleepTarget?: number; studyTargetMinutes?: number; trainingTargetMinutes?: number };

type ActiveSession = ReturnType<typeof getActiveLifeSession>;

function periodLabel(value: string): string {
  if (value === 'manha') return 'Manhã';
  if (value === 'tarde') return 'Tarde';
  if (value === 'noite') return 'Noite';
  if (value === 'qualquer') return 'Qualquer janela';
  return 'Aprender automaticamente';
}

function learningLabel(context: LifeRoutineContext): string {
  if (context.learningLevel === 'personalizado') return 'Perfil personalizado';
  if (context.learningLevel === 'adaptando') return 'Aprendendo seu padrão';
  return 'Iniciando aprendizado';
}

function durationLabel(minutes: number): string {
  if (!minutes) return '0 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}min` : ''}` : `${rest} min`;
}

function elapsedLabel(active: ActiveSession, tick: number): string {
  if (!active) return '';
  const elapsed = Math.max(1, Math.round((tick - new Date(active.startedAt).getTime()) / 60_000));
  return durationLabel(elapsed);
}

export default function LifeConciergePanel({ nextProgram, healthSummary, profile }: { nextProgram?: NextProgram | null; healthSummary?: HealthSummary; profile?: LifeProfile }) {
  const [preferences, setPreferences] = useState<LifeAdaptivePreferences>(() => getLifeAdaptivePreferences());
  const [context, setContext] = useState<LifeRoutineContext>(() => getLifeRoutineContext());
  const [activeSession, setActiveSession] = useState<ActiveSession>(() => getActiveLifeSession());
  const [gymName, setGymName] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [patternsOpen, setPatternsOpen] = useState(true);
  const [feedback, setFeedback] = useState<'yes' | 'no' | ''>('');
  const [tick, setTick] = useState(Date.now());

  const refresh = useCallback(() => {
    setPreferences(getLifeAdaptivePreferences());
    setContext(getLifeRoutineContext());
    setActiveSession(getActiveLifeSession());
  }, []);

  useEffect(() => {
    const listener = () => refresh();
    window.addEventListener('crewcheck:life-adaptive-update', listener);
    window.addEventListener('crewcheck:health-summary', listener);
    window.addEventListener('storage', listener);
    const timer = window.setInterval(() => setTick(Date.now()), 30_000);
    refresh();
    return () => {
      window.removeEventListener('crewcheck:life-adaptive-update', listener);
      window.removeEventListener('crewcheck:health-summary', listener);
      window.removeEventListener('storage', listener);
      window.clearInterval(timer);
    };
  }, [healthSummary?.capturedAt, profile?.sleepTarget, profile?.studyTargetMinutes, profile?.trainingTargetMinutes, refresh]);

  const recommendation = useMemo(() => buildLifeConciergeRecommendation(nextProgram), [context, nextProgram, tick]);

  function registerHydration() {
    recordHydration(preferences.hydrationPortionMl);
    refresh();
    toast.success(`${preferences.hydrationPortionMl} ml registrados. O concierge ajustará o restante do dia.`);
  }

  function toggleSession(type: 'study' | 'exercise' | 'leisure') {
    if (activeSession) {
      if (activeSession.type !== type) {
        toast.info('Finalize a atividade em andamento antes de iniciar outra.');
        return;
      }
      const event = finishLifeSession(4);
      refresh();
      toast.success(event ? `${durationLabel(event.durationMinutes || 0)} registrados.` : 'Atividade finalizada.');
      return;
    }
    startLifeSession(type);
    refresh();
    const labels = { study: 'Estudo iniciado.', exercise: 'Atividade iniciada.', leisure: 'Lazer iniciado.' };
    toast.success(labels[type]);
  }

  async function gymCheckIn() {
    const name = gymName.trim() || 'Academia';
    recordGymCheckIn(name, preferences.shareGymCheckins);
    recordLifeEvent({ type: 'exercise', status: 'completed', source: 'gym-checkin', durationMinutes: 0, note: `Check-in em ${name}` });
    refresh();
    toast.success(`Check-in registrado em ${name}. Agora o compromisso é apenas começar.`);
    if (!preferences.shareGymCheckins) return;
    const text = shareGymCheckInText(name);
    try {
      if (navigator.share) await navigator.share({ title: 'CrewCheck Life', text });
      else {
        await navigator.clipboard.writeText(text);
        toast.message('Check-in copiado para compartilhar.');
      }
    } catch {}
  }

  function savePreferences() {
    const saved = saveLifeAdaptivePreferences(preferences);
    setPreferences(saved);
    setContext(getLifeRoutineContext());
    toast.success('Preferências salvas. O concierge continuará aprendendo sem deixar a rotina rígida.');
  }

  function scheduleReminders() {
    const count = scheduleLifeRemindersForToday();
    if (count) toast.success(`${count} lembrete${count > 1 ? 's' : ''} discreto${count > 1 ? 's' : ''} programado${count > 1 ? 's' : ''} para hoje.`);
    else toast.info(preferences.remindersEnabled ? 'Nenhum lembrete adicional foi necessário agora.' : 'Ative os lembretes nas preferências primeiro.');
  }

  function runPrimaryAction() {
    if (recommendation.category === 'hydration') registerHydration();
    else if (recommendation.category === 'study') toggleSession('study');
    else if (recommendation.category === 'exercise') void gymCheckIn();
    else if (recommendation.category === 'leisure') toggleSession('leisure');
    else if (recommendation.category === 'rest') {
      recordLifeEvent({ type: 'leisure', status: 'planned', source: 'crewcheck', durationMinutes: 30, note: 'Janela protegida de recuperação' });
      toast.success('Janela de recuperação marcada como prioridade no aprendizado local.');
    } else setPatternsOpen(true);
  }

  function sendFeedback(useful: boolean) {
    recordRecommendationFeedback(recommendation.id, useful);
    setFeedback(useful ? 'yes' : 'no');
    refresh();
    toast.success(useful ? 'Entendido. Vou reforçar sugestões semelhantes.' : 'Entendido. Vou reduzir sugestões desse tipo e testar outro horário.');
  }

  const hydrationPercent = Math.min(100, Math.round(context.hydration.progress * 100));
  const programLabel = nextProgram?.title ? `${nextProgram.title}${nextProgram.presentation ? ` · ${nextProgram.presentation}` : ''}` : 'Sem próxima programação completa';

  return <section className="cc-life-ai-shell" aria-label="CrewCheck Life Concierge adaptativo">
    <header className="cc-life-ai-hero">
      <div className="cc-life-ai-orb"><Brain/><Sparkles/></div>
      <div>
        <small>CONCIERGE ADAPTATIVO · LOCAL-FIRST</small>
        <h2>Seu gerenciamento pessoal, sem rotina engessada</h2>
        <p>O CrewCheck aprende com o que você realmente consegue cumprir, cruza com a escala e ajusta descanso, hidratação, estudo, atividade física e lazer.</p>
      </div>
      <span className={`cc-life-learning ${context.learningLevel}`}><TrendingUp/> {learningLabel(context)} · {context.observations} sinais</span>
    </header>

    <article className={`cc-life-ai-recommendation ${recommendation.category}`}>
      <div>
        <small>PRÓXIMA MELHOR AÇÃO · {programLabel}</small>
        <h3>{recommendation.title}</h3>
        <p>{recommendation.body}</p>
        <div className="cc-life-ai-reasons">{recommendation.reasons.slice(0, 4).map((reason) => <span key={reason}>{reason}</span>)}</div>
      </div>
      <div className="cc-life-ai-rec-actions">
        <button className="primary" onClick={runPrimaryAction}><Sparkles/> {recommendation.actionLabel}</button>
        <div className="cc-life-ai-feedback"><span>Foi útil?</span><button className={feedback === 'yes' ? 'active' : ''} onClick={() => sendFeedback(true)} aria-label="Sugestão útil"><ThumbsUp/></button><button className={feedback === 'no' ? 'active' : ''} onClick={() => sendFeedback(false)} aria-label="Sugestão não útil"><ThumbsDown/></button></div>
      </div>
    </article>

    <div className="cc-life-ai-dashboard">
      <article><MoonStar/><small>Descanso</small><strong>{context.sleep.available ? durationLabel(context.sleep.latestMinutes) : 'Aguardando sono'}</strong><span>{context.sleep.available ? `${context.sleep.deficitMinutes ? `${durationLabel(context.sleep.deficitMinutes)} abaixo da meta` : 'meta pessoal atendida'}` : 'sem presumir sua disposição'}</span></article>
      <article><GlassWater/><small>Hidratação</small><strong>{context.hydration.mlToday.toLocaleString('pt-BR')} ml</strong><span>{hydrationPercent}% da meta pessoal</span><i><b style={{ width: `${hydrationPercent}%` }}/></i></article>
      <article><Dumbbell/><small>Atividades</small><strong>{context.exercise.sessions7Days}/{context.exercise.targetSessions}</strong><span>melhor adesão: {periodLabel(context.exercise.preferredPeriod).toLowerCase()}</span></article>
      <article><BookOpenCheck/><small>Estudo</small><strong>{context.study.sessions7Days}/{context.study.targetSessions}</strong><span>{durationLabel(context.study.minutes7Days)} na semana</span></article>
      <article><Palmtree/><small>Lazer</small><strong>{context.leisure.sessions7Days}/{context.leisure.targetSessions}</strong><span>{durationLabel(context.leisure.minutes7Days)} registrados</span></article>
    </div>

    <section className="cc-life-ai-actions">
      <header><div><small>AÇÕES RÁPIDAS</small><h3>Registre o mínimo; o sistema aprende o restante</h3></div>{activeSession && <span className="cc-life-session-live"><Clock3/> {activeSession.type} · {elapsedLabel(activeSession, tick)}</span>}</header>
      <div className="cc-life-ai-action-grid">
        <button onClick={registerHydration}><GlassWater/><span><strong>Bebi água</strong><small>+{preferences.hydrationPortionMl} ml</small></span><Check/></button>
        <button className={activeSession?.type === 'study' ? 'active' : ''} onClick={() => toggleSession('study')}>{activeSession?.type === 'study' ? <Square/> : <Play/>}<span><strong>{activeSession?.type === 'study' ? 'Finalizar estudo' : 'Iniciar estudo'}</strong><small>cronômetro simples</small></span></button>
        <button className={activeSession?.type === 'leisure' ? 'active' : ''} onClick={() => toggleSession('leisure')}>{activeSession?.type === 'leisure' ? <Square/> : <Palmtree/>}<span><strong>{activeSession?.type === 'leisure' ? 'Finalizar lazer' : 'Registrar lazer'}</strong><small>tempo pessoal também conta</small></span></button>
        {activeSession && <button className="danger-soft" onClick={() => { cancelLifeSession(); refresh(); toast.message('Sessão descartada.'); }}><Square/><span><strong>Descartar sessão</strong><small>não entra no aprendizado</small></span></button>}
      </div>
    </section>

    <section className="cc-life-gym-checkin">
      <div><MapPinCheck/><span><small>CHECK-IN COMPARTILHADO</small><h3>O incentivo começa quando você chega</h3><p>Registre a academia e compartilhe apenas quando quiser. O sistema aprende frequência e horários de maior adesão.</p></span></div>
      <div><input value={gymName} onChange={(event) => setGymName(event.target.value)} placeholder="Nome da academia ou unidade"/><button className="primary" onClick={() => void gymCheckIn()}><Share2/> Fazer check-in</button></div>
    </section>

    <section className="cc-life-ai-collapsible">
      <button className="cc-life-ai-collapse-head" onClick={() => setPatternsOpen((value) => !value)}><span><TrendingUp/><span><small>PADRÕES APRENDIDOS</small><strong>Como o CrewCheck está se adaptando</strong></span></span>{patternsOpen ? <ChevronUp/> : <ChevronDown/>}</button>
      {patternsOpen && <div className="cc-life-pattern-grid">
        <article><Dumbbell/><span><small>Atividade física</small><strong>{periodLabel(context.exercise.preferredPeriod)}</strong><p>{context.exercise.sessions7Days} check-ins/sessões nos últimos 7 dias.</p></span></article>
        <article><BookOpenCheck/><span><small>Estudo</small><strong>{periodLabel(context.study.preferredPeriod)}</strong><p>{context.study.sessions7Days} blocos concluídos; o horário muda conforme sua adesão.</p></span></article>
        <article><HeartHandshake/><span><small>Estilo do concierge</small><strong>{preferences.flexibility === 'flexivel' ? 'Flexível' : preferences.flexibility === 'equilibrado' ? 'Equilibrado' : 'Estruturado'}</strong><p>Tom {preferences.coachTone}; sugestões nunca substituem sua decisão.</p></span></article>
        <article><BellRing/><span><small>Lembretes</small><strong>{preferences.remindersEnabled ? 'Ativos' : 'Desativados'}</strong><p>No máximo três lembretes úteis no dia, respeitando a escala.</p></span></article>
      </div>}
    </section>

    <section className="cc-life-ai-collapsible">
      <button className="cc-life-ai-collapse-head" onClick={() => setSettingsOpen((value) => !value)}><span><Sparkles/><span><small>PERSONALIZAÇÃO PREMIUM</small><strong>Ensine sem deixar rígido</strong></span></span>{settingsOpen ? <ChevronUp/> : <ChevronDown/>}</button>
      {settingsOpen && <div className="cc-life-ai-settings">
        <div className="cc-life-ai-form-grid">
          <label><span>Meta pessoal de hidratação (ml)</span><input type="number" min="250" max="8000" step="250" value={preferences.hydrationTargetMl} onChange={(event) => setPreferences({ ...preferences, hydrationTargetMl: Number(event.target.value) })}/><small>Meta definida pelo usuário; não é prescrição médica.</small></label>
          <label><span>Porção rápida (ml)</span><input type="number" min="50" max="1000" step="50" value={preferences.hydrationPortionMl} onChange={(event) => setPreferences({ ...preferences, hydrationPortionMl: Number(event.target.value) })}/></label>
          <label><span>Atividades por semana</span><input type="number" min="1" max="7" value={preferences.workoutFrequencyPerWeek} onChange={(event) => setPreferences({ ...preferences, workoutFrequencyPerWeek: Number(event.target.value) })}/></label>
          <label><span>Blocos de estudo por semana</span><input type="number" min="0" max="7" value={preferences.studyFrequencyPerWeek} onChange={(event) => setPreferences({ ...preferences, studyFrequencyPerWeek: Number(event.target.value) })}/></label>
          <label><span>Momentos de lazer por semana</span><input type="number" min="0" max="7" value={preferences.leisureFrequencyPerWeek} onChange={(event) => setPreferences({ ...preferences, leisureFrequencyPerWeek: Number(event.target.value) })}/></label>
          <label><span>Melhor horário para atividade</span><select value={preferences.preferredExercisePeriod} onChange={(event) => setPreferences({ ...preferences, preferredExercisePeriod: event.target.value as LifeAdaptivePreferences['preferredExercisePeriod'] })}><option value="auto">Aprender automaticamente</option><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option><option value="qualquer">Qualquer</option></select></label>
          <label><span>Melhor horário para estudo</span><select value={preferences.preferredStudyPeriod} onChange={(event) => setPreferences({ ...preferences, preferredStudyPeriod: event.target.value as LifeAdaptivePreferences['preferredStudyPeriod'] })}><option value="auto">Aprender automaticamente</option><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option><option value="qualquer">Qualquer</option></select></label>
          <label><span>Flexibilidade</span><select value={preferences.flexibility} onChange={(event) => setPreferences({ ...preferences, flexibility: event.target.value as LifeAdaptivePreferences['flexibility'] })}><option value="flexivel">Flexível</option><option value="equilibrado">Equilibrado</option><option value="estruturado">Estruturado</option></select></label>
          <label><span>Tom do incentivo</span><select value={preferences.coachTone} onChange={(event) => setPreferences({ ...preferences, coachTone: event.target.value as LifeAdaptivePreferences['coachTone'] })}><option value="acolhedor">Acolhedor</option><option value="direto">Direto</option><option value="discreto">Discreto</option></select></label>
        </div>
        <div className="cc-life-ai-toggle-grid">
          <label><input type="checkbox" checked={preferences.shareGymCheckins} onChange={(event) => setPreferences({ ...preferences, shareGymCheckins: event.target.checked })}/><span><strong>Oferecer compartilhamento no check-in</strong><small>Nunca compartilha automaticamente.</small></span></label>
          <label><input type="checkbox" checked={preferences.remindersEnabled} onChange={(event) => setPreferences({ ...preferences, remindersEnabled: event.target.checked })}/><span><strong>Lembretes adaptativos</strong><small>Opcional e limitado; sem notificações pequenas em excesso.</small></span></label>
        </div>
        <div className="cc-life-ai-settings-actions"><button className="primary" onClick={savePreferences}><Save/> Salvar personalização</button><button onClick={scheduleReminders}><BellRing/> Programar lembretes de hoje</button></div>
      </div>}
    </section>

    <footer className="cc-life-ai-privacy"><HeartHandshake/><p><strong>Assistente de rotina, não avaliação médica.</strong> O aprendizado usa resumos e registros locais. A escala, o deslocamento e o descanso têm prioridade; dados brutos do relógio não são copiados para o servidor.</p></footer>
  </section>;
}
