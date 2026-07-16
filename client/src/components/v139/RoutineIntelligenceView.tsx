import { useEffect, useMemo, useState } from 'react';
import { Activity, Bell, BookOpen, Clock, Dumbbell, Moon, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { v139Api } from './api';
import { V139Header } from './Shell';
import './v139.css';

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

const ACTIVITIES = [
  ['academia', 'Academia', Dumbbell],
  ['crossfit', 'CrossFit', Dumbbell],
  ['pilates', 'Pilates', Sparkles],
  ['corrida', 'Corrida', Activity],
  ['caminhada', 'Caminhada', Activity],
  ['estudo', 'Estudo', BookOpen],
  ['descanso', 'Descanso', ShieldCheck],
] as const;

const ACTIVITY_DURATION: Record<string, string> = {
  academia: '60–90 min', crossfit: '60–75 min', pilates: '50–70 min', corrida: '35–60 min',
  caminhada: '30–60 min', estudo: '45–90 min', descanso: 'recuperação prioritária',
};

function eventStart(item: RoutineEvent): Date { return new Date(item.canonical?.startDateTime || 0); }
function eventEnd(item: RoutineEvent): Date { return new Date(item.canonical?.endDateTime || item.canonical?.startDateTime || 0); }
function durationHours(item?: RoutineEvent): number { return item ? Math.max(0, (eventEnd(item).getTime() - eventStart(item).getTime()) / 3_600_000) : 0; }
function presentationMinutes(item?: RoutineEvent): number {
  const match = String(item?.presentation || '').match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 12 * 60;
}
function timeLabel(preference: string, start: Date, end: Date): string {
  if (preference === 'manha') return 'manhã, após o sono protegido';
  if (preference === 'tarde') return 'tarde';
  if (preference === 'noite') return 'início da noite, sem reduzir o sono';
  const hour = new Date((start.getTime() + end.getTime()) / 2).getHours();
  return hour < 12 ? 'melhor janela da manhã' : hour < 18 ? 'melhor janela da tarde' : 'melhor janela do início da noite';
}

export default function RoutineIntelligenceView({ events }: { events: RoutineEvent[] }) {
  const [activities, setActivities] = useState<string[]>([]);
  const [timePreference, setTimePreference] = useState('automatico');
  const [gymProvider, setGymProvider] = useState('wellhub');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    v139Api('/api/platform/routine/preferences')
      .then((payload) => {
        const preferences = payload.preferences || {};
        setActivities(Array.isArray(preferences.activities) ? preferences.activities.slice(0, 3) : []);
        setTimePreference(preferences.timePreference || 'automatico');
        setGymProvider(preferences.gymProvider || 'wellhub');
      })
      .catch(() => {
        try {
          setActivities(JSON.parse(localStorage.getItem('crewcheck:routine:activities') || '[]'));
          setTimePreference(localStorage.getItem('crewcheck:routine:time') || 'automatico');
          setGymProvider(localStorage.getItem('crewcheck:gym-provider-plan') || 'wellhub');
        } catch {}
      });
  }, []);

  const operational = useMemo(() => events
    .filter((item) => !item.placeholder && ['flight', 'duty', 'stay'].includes(String(item.kind)))
    .filter((item) => Number.isFinite(eventStart(item).getTime()))
    .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime()), [events]);

  const plan = useMemo(() => {
    const now = Date.now();
    const previous = [...operational].reverse().find((item) => eventEnd(item).getTime() <= now && item.kind !== 'stay');
    const next = operational.find((item) => eventEnd(item).getTime() > now && item.kind !== 'stay');
    const start = previous ? Math.max(now, eventEnd(previous).getTime()) : now;
    const end = next ? eventStart(next).getTime() : now + 24 * 3_600_000;
    const gapHours = Math.max(0, (end - start) / 3_600_000);
    const previousDuty = durationHours(previous);
    const earlyStart = Boolean(next && presentationMinutes(next) < 6 * 60);
    const monoFolga = Boolean(previous && next && gapHours >= 24 && gapHours < 48);
    const sevenDayEnd = now + 7 * 24 * 3_600_000;
    const nextSeven = operational.filter((item) => {
      const time = eventStart(item).getTime();
      return item.kind !== 'stay' && time >= now && time <= sevenDayEnd;
    });
    const earlyStarts = nextSeven.filter((item) => presentationMinutes(item) < 6 * 60).length;
    const projectedDuty = nextSeven.reduce((sum, item) => sum + durationHours(item), 0);
    const heavy = previousDuty >= 10 || earlyStart || monoFolga || earlyStarts >= 2 || projectedDuty >= 35;
    const sleepHours = 8;
    const essentialBuffer = 2;
    const usableHours = Math.max(0, gapHours - sleepHours - essentialBuffer);
    const selected = activities.length ? activities : ['descanso'];
    let recommended: string[];
    if (gapHours < 10 || (heavy && gapHours < 14)) recommended = ['descanso'];
    else if (gapHours >= 18) recommended = selected.slice(0, 3);
    else recommended = selected.filter((item) => !(heavy && ['crossfit', 'corrida'].includes(item))).slice(0, 2);
    if (!recommended.length) recommended = ['descanso'];
    const protectedStart = new Date(start + sleepHours * 3_600_000);
    const protectedEnd = new Date(Math.max(protectedStart.getTime(), end - essentialBuffer * 3_600_000));
    return { next, gapHours, monoFolga, earlyStarts, projectedDuty, heavy, usableHours, recommended, suggestedWindow: timeLabel(timePreference, protectedStart, protectedEnd) };
  }, [operational, activities, timePreference]);

  function toggle(value: string) {
    setActivities((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      if (current.length >= 3) {
        toast.info('Escolha até três atividades.');
        return current;
      }
      return [...current, value];
    });
  }

  async function save() {
    setBusy(true);
    localStorage.setItem('crewcheck:routine:activities', JSON.stringify(activities));
    localStorage.setItem('crewcheck:routine:time', timePreference);
    localStorage.setItem('crewcheck:gym-provider-plan', gymProvider);
    localStorage.setItem('crewcheck:gym-only-open', '1');
    try {
      await v139Api('/api/platform/routine/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ activities, timePreference, gymProvider }),
      });
      toast.success('Preferências de rotina sincronizadas.');
    } catch {
      toast.success('Preferências salvas neste dispositivo.');
    } finally {
      setBusy(false);
    }
  }

  const workTone = plan.heavy ? 'Carga pesada' : 'Carga administrável';
  const priority = plan.heavy || plan.gapHours < 12 ? 'Recuperação' : 'Equilíbrio';

  return <>
    <V139Header title="Rotina inteligente" detail="Trabalho, sono e até três atividades organizados sem competir com a próxima apresentação."/>
    <section className="cc139-grid">
      <article><Clock/><span>Janela até a próxima atividade</span><strong>{plan.gapHours.toFixed(1)} h</strong></article>
      <article><Moon/><span>Sono protegido</span><strong>8 h</strong></article>
      <article><Bell/><span>Prioridade</span><strong>{priority}</strong></article>
    </section>
    <section className="cc139-card">
      <h2>Suas atividades</h2>
      <p>Escolha até três. Quando a escala estiver pesada, descanso terá prioridade automática.</p>
      <div className="cc139-choices">
        {ACTIVITIES.map(([id, label, Icon]) => <button key={id} className={activities.includes(id) ? 'active' : ''} onClick={() => toggle(id)}><Icon/>{label}</button>)}
      </div>
      <div className="cc139-form">
        <label>Horário preferido
          <select value={timePreference} onChange={(event) => setTimePreference(event.target.value)}>
            <option value="automatico">Automático</option><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option>
          </select>
        </label>
        <label>Rede preferida
          <select value={gymProvider} onChange={(event) => setGymProvider(event.target.value)}>
            <option value="wellhub">Wellhub</option><option value="smartfit">Smart Fit</option><option value="ambos">Wellhub ou Smart Fit</option>
          </select>
        </label>
      </div>
      <div className="cc139-actions">
        <button className="primary" onClick={save} disabled={busy}><Save/> {busy ? 'Salvando…' : 'Salvar preferências'}</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'gyms' }))}><Dumbbell/> Academias abertas</button>
      </div>
    </section>
    <section className={`cc139-card cc139-plan-card ${plan.heavy ? 'warn' : 'ok'}`}>
      <h2>Plano recomendado</h2>
      <p>{plan.heavy ? 'A sequência combina jornada longa, early start, monofolga ou carga elevada. Reduza atividades e preserve recuperação.' : plan.gapHours >= 18 ? 'Pernoite superior a 18 horas: há margem confortável depois do sono e dos tempos essenciais.' : 'A rotina foi ajustada ao intervalo real disponível.'}</p>
      <div className="cc139-plan">
        <span><b>Carga:</b> {workTone}</span>
        <span><b>Proteção:</b> 8 h de sono + 2 h para alimentação, deslocamento e desaceleração</span>
        <span><b>Tempo utilizável:</b> {plan.usableHours.toFixed(1)} h</span>
        <span><b>Atividades:</b> {plan.recommended.map((item) => `${item} (${ACTIVITY_DURATION[item] || 'tempo ajustado'})`).join(' · ')}</span>
        <span><b>Melhor horário:</b> {plan.suggestedWindow}</span>
        <span><b>Early starts nos próximos 7 dias:</b> {plan.earlyStarts}</span>
        <span><b>Jornada projetada em 7 dias:</b> {plan.projectedDuty.toFixed(1)} h</span>
        {plan.monoFolga && <span><b>Monofolga:</b> detectada; prioridade reforçada para descanso</span>}
        {plan.next && <span><b>Próxima programação:</b> {plan.next.title || 'Atividade'} · apresentação {plan.next.presentation || 'a confirmar'}</span>}
      </div>
    </section>
    <section className="cc139-card"><ShieldCheck/><h2>Decisão conservadora</h2><p>O planejamento nunca reduz as oito horas reservadas ao sono. Em dúvida, o CrewCheck recomenda descansar.</p></section>
  </>;
}
