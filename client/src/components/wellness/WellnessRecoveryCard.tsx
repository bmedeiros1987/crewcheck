import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { connectGoogleCalendar, hasGoogleCalendarToken } from '@/lib/googleCalendarSync';
import { airportTimeZone } from '@/lib/calendarExport';
import {
  buildWellnessPlan,
  loadWellnessPreferences,
  maybeAutoOrganize,
  readAuthorizedHealthDays,
  saveWellnessPreferences,
} from '@/lib/wellnessCalendarSync';
import { wellnessDecisionLabel, type WellnessDayPlan, type WellnessPreferences } from '@/lib/wellnessScheduler';
import type { CrewRoster } from '@/lib/pdfParser';

function readActiveRoster(): CrewRoster | null {
  try {
    const raw = localStorage.getItem('crewcheck_latest_roster_bundle');
    const roster = raw ? JSON.parse(raw)?.roster : null;
    return roster?.days?.length ? roster as CrewRoster : null;
  } catch {
    return null;
  }
}

function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).slice(0, 10);
}

/** Recuperação de hoje + organização automática do calendário "Academia". Sem diagnóstico médico. */
export default function WellnessRecoveryCard() {
  const [roster, setRoster] = useState<CrewRoster | null>(() => readActiveRoster());
  const [prefs, setPrefs] = useState<WellnessPreferences>(() => loadWellnessPreferences());
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => { setRoster(readActiveRoster()); setPrefs(loadWellnessPreferences()); };
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('crewcheck:life-adaptive-update', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('crewcheck:life-adaptive-update', refresh);
    };
  }, []);

  const plan: WellnessDayPlan | null = useMemo(() => {
    if (!roster) return null;
    try {
      const timeZone = airportTimeZone(roster.base);
      const today = todayIn(timeZone);
      const plans = buildWellnessPlan(roster, { preferences: prefs, health: prefs.useHealthData ? readAuthorizedHealthDays(timeZone) : [], fromDate: today });
      return plans.find((item) => item.date === today) || plans[0] || null;
    } catch {
      return null;
    }
  }, [roster, prefs]);

  // Recalcula sozinho quando "Auto-organizar" está ligado e algo mudou (escala, saúde, preferências).
  useEffect(() => {
    if (!roster || !prefs.autoOrganize) return;
    let cancelled = false;
    maybeAutoOrganize(roster).then((outcome) => {
      if (cancelled || !outcome.ran) return;
      setStatus(`✓ Sincronizado automaticamente${outcome.wellness ? ` · Academia: ${outcome.wellness.created} novos, ${outcome.wellness.updated} atualizados, ${outcome.wellness.deleted} removidos` : ''}`);
    }).catch(() => { if (!cancelled) setStatus('Não consegui organizar automaticamente agora. Tente “Organizar agora”.'); });
    return () => { cancelled = true; };
  }, [roster, prefs]);

  function update(patch: Partial<WellnessPreferences>) {
    setPrefs(saveWellnessPreferences(patch));
  }

  async function organizeNow() {
    if (!roster) return;
    setBusy(true);
    try {
      if (!hasGoogleCalendarToken()) await connectGoogleCalendar();
      const outcome = await maybeAutoOrganize(roster, { force: true });
      const wellness = outcome.wellness;
      setStatus(wellness
        ? `✓ ${wellness.calendarName}${wellness.calendarCreated ? ' (criado)' : ''}: ${wellness.created} novos, ${wellness.updated} atualizados, ${wellness.deleted} removidos, ${wellness.unchanged} iguais`
        : `✓ ${outcome.reason}`);
      toast.success('Rotina organizada no Google Calendar.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui organizar o calendário.');
    } finally {
      setBusy(false);
    }
  }

  if (!roster) return null;
  const rest = plan?.decision === 'REST' || plan?.decision === 'RECOVERY';
  return <section className="cc-life-block cc-wellness-card" aria-labelledby="cc-wellness-title">
    <header><div><small>{rest ? 'HOJE É MELHOR RECUPERAR' : 'RECUPERAÇÃO HOJE'}</small><h2 id="cc-wellness-title">{plan ? wellnessDecisionLabel(plan) : 'Sem plano para hoje'}</h2></div></header>
    {plan && <>
      <ul className="cc-wellness-factors">
        {plan.factors.slice(0, 5).map((factor) => <li key={factor.text}>{factor.ok ? '✓' : '⚠'} {factor.text}</li>)}
      </ul>
      <p><strong>{plan.window ? `Melhor janela: ${plan.window.startLocal}–${plan.window.endLocal}` : 'Sugestão: mobilidade + caminhada leve ou descanso completo.'}</strong></p>
      <p><small>{plan.reason} Confiança {plan.confidence}. Sugestão de bem-estar, não diagnóstico.</small></p>
    </>}
    <div className="cc-tool-actions">
      <button onClick={organizeNow} disabled={busy}>{busy ? 'Organizando…' : 'Organizar agora no Google Calendar'}</button>
    </div>
    {status && <p><small>{status}</small></p>}
    <details>
      <summary>Preferências de rotina</summary>
      <label><input type="checkbox" checked={prefs.autoOrganize} onChange={(event) => update({ autoOrganize: event.target.checked })}/> Auto-organizar rotina</label>
      <label><input type="checkbox" checked={prefs.syncSchedule} onChange={(event) => update({ syncSchedule: event.target.checked })}/> Sincronizar escala no Google</label>
      <label><input type="checkbox" checked={prefs.syncAcademia} onChange={(event) => update({ syncAcademia: event.target.checked })}/> Sincronizar Academia</label>
      <label><input type="checkbox" checked={prefs.useHealthData} onChange={(event) => update({ useHealthData: event.target.checked })}/> Reavaliar com dados do relógio (se autorizados)</label>
      <label>Repouso mínimo antes do treino (h) <input type="number" min={0} max={24} step={0.5} value={prefs.minimumRecoveryBeforeWorkoutHours} onChange={(event) => update({ minimumRecoveryBeforeWorkoutHours: Number(event.target.value) })}/></label>
      <label>Margem antes da próxima jornada (h) <input type="number" min={0} max={24} step={0.5} value={prefs.minimumBufferBeforeDutyHours} onChange={(event) => update({ minimumBufferBeforeDutyHours: Number(event.target.value) })}/></label>
      <label>Calendário da escala <input type="text" value={prefs.scheduleCalendarName} onChange={(event) => update({ scheduleCalendarName: event.target.value })}/></label>
      <label>Calendário de treinos <input type="text" value={prefs.academiaCalendarName} onChange={(event) => update({ academiaCalendarName: event.target.value })}/></label>
    </details>
  </section>;
}
