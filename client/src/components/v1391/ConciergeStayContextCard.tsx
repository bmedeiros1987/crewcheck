import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Clock, Hotel } from 'lucide-react';
import { toast } from 'sonner';
import { buildConciergeStayContext, type ConciergeStayContextStep } from '@/lib/conciergeStayContext';
import {
  buildConciergeStayReminderPlan,
  conciergeStayReminderJobKeys,
  type ConciergeStayReminderKind,
} from '@/lib/conciergeStayNotificationPlan';
import {
  cancelConciergeStayReminders,
  getConciergeStayReminderDelivery,
  listConciergeStayReminderJobs,
  scheduleConciergeStayReminders,
  type ConciergeStayReminderJob,
} from '@/lib/conciergeStayNotifications';
import { listConciergeStays } from '@/lib/conciergeStaySync';
import { selectConciergeSavedStay } from '@/lib/conciergeStayIdentity';

type SavedStay = {
  id?: unknown;
  stayDate?: unknown;
  hotelName?: unknown;
  room?: unknown;
  presentationTime?: unknown;
  leadMinutes?: unknown;
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function stepCopy(step: ConciergeStayContextStep): { title: string; detail: string } {
  if (step === 'confirm-hotel') return {
    title: 'Confirme o hotel',
    detail: 'A localidade pode estar identificada, mas o Concierge ainda precisa do hotel correto para completar a estadia.',
  };
  if (step === 'register-room') return {
    title: 'Registre o quarto',
    detail: 'Hotel confirmado. Salve o quarto quando chegar para ativar memória privada e Room Intelligence.',
  };
  if (step === 'set-presentation') return {
    title: 'Confirme a próxima apresentação',
    detail: 'Hotel e quarto estão prontos. Falta um horário salvo para montar a linha de preparação do pernoite.',
  };
  if (step === 'rest') return {
    title: 'Repouso em andamento',
    detail: 'O contexto da estadia está completo. O próximo marco é o despertar calculado a partir da antecedência salva.',
  };
  if (step === 'wake') return {
    title: 'Hora de se preparar',
    detail: 'A janela de preparação começou. Confira seus itens e o horário de apresentação antes de sair do hotel.',
  };
  if (step === 'presentation') return {
    title: 'Apresentação próxima',
    detail: 'A apresentação salva está muito próxima. O CrewCheck prioriza este marco acima das tarefas administrativas do quarto.',
  };
  return {
    title: 'Pernoite concluído',
    detail: 'A apresentação salva já passou. O histórico da estadia continua disponível sem reutilizar este horário como um novo evento.',
  };
}

function timeLabel(value: Date | null): string {
  if (!value || !Number.isFinite(value.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(value);
}

function countdownLabel(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return '';
  if (minutes < 60) return `em ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `em ${hours} h ${rest} min` : `em ${hours} h`;
}

function reminderKindLabel(kind: ConciergeStayReminderKind): string {
  return kind === 'wake' ? 'Despertar' : 'Apresentação próxima';
}

function reminderJobKey(job: ConciergeStayReminderJob): string {
  return text(job?.jobKey || job?.job_key);
}

export default function ConciergeStayContextCard({
  hotelName,
  room,
  stayDate,
  stayId,
}: {
  hotelName: string;
  room: string;
  stayDate: string;
  stayId?: string;
}) {
  const [loadedStay, setSavedStay] = useState<SavedStay | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [localOnly, setLocalOnly] = useState(false);
  const [reminderJobs, setReminderJobs] = useState<ConciergeStayReminderJob[]>([]);
  const [reminderBusy, setReminderBusy] = useState(false);

  // Do not render a previous selection while its replacement is loading.
  const savedStay = selectConciergeSavedStay(loadedStay ? [loadedStay] : [], stayDate, stayId);

  async function refresh() {
    const [stayPayload, jobs] = await Promise.all([
      listConciergeStays(),
      listConciergeStayReminderJobs(stayDate, stayId).catch(() => []),
    ]);
    const target = selectConciergeSavedStay<SavedStay>(stayPayload.stays || [], stayDate, stayId);
    setSavedStay(target);
    setLocalOnly(Boolean(stayPayload.localOnly));
    setReminderJobs(jobs);
  }

  useEffect(() => {
    let active = true;
    setSavedStay(null);
    setReminderJobs([]);

    async function guardedRefresh() {
      try {
        const [stayPayload, jobs] = await Promise.all([
          listConciergeStays(),
          listConciergeStayReminderJobs(stayDate, stayId).catch(() => []),
        ]);
        if (!active) return;
        const target = selectConciergeSavedStay<SavedStay>(stayPayload.stays || [], stayDate, stayId);
        setSavedStay(target);
        setLocalOnly(Boolean(stayPayload.localOnly));
        setReminderJobs(jobs);
      } catch {
        if (active) setSavedStay(null);
      }
    }

    guardedRefresh().catch(() => undefined);
    const handleRefresh = () => guardedRefresh().catch(() => undefined);
    window.addEventListener('online', handleRefresh);
    window.addEventListener('focus', handleRefresh);
    return () => {
      active = false;
      window.removeEventListener('online', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
    };
  }, [stayDate, stayId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const context = useMemo(() => buildConciergeStayContext({
    stayDate,
    hotelName: hotelName || savedStay?.hotelName,
    room: room || savedStay?.room,
    presentationTime: savedStay?.presentationTime,
    leadMinutes: savedStay?.leadMinutes,
  }, now), [hotelName, room, stayDate, savedStay, now]);

  const reminderPlan = useMemo(
    () => buildConciergeStayReminderPlan({ ...context, stayId }, now),
    [context, stayId, now],
  );
  const delivery = getConciergeStayReminderDelivery();
  const allowedReminderKeys = new Set(Object.values(conciergeStayReminderJobKeys(stayDate, stayId) || {}));
  const pendingReminderJobs = reminderJobs.filter((job) => allowedReminderKeys.has(reminderJobKey(job)) && ['pending', 'processing'].includes(text(job.status).toLowerCase()));
  const pendingKeys = new Set(pendingReminderJobs.map(reminderJobKey).filter(Boolean));

  const copy = stepCopy(context.step);
  const resolvedHotel = text(hotelName || savedStay?.hotelName);
  const resolvedRoom = text(room || savedStay?.room);
  const wakeCountdown = countdownLabel(context.minutesUntilWake);
  const presentationCountdown = countdownLabel(context.minutesUntilPresentation);

  async function activateReminders() {
    if (!reminderPlan.length) {
      toast.info('Não há um horário futuro confiável para agendar lembretes neste pernoite.');
      return;
    }
    setReminderBusy(true);
    try {
      const result = await scheduleConciergeStayReminders(reminderPlan);
      await refresh();
      if (result.scheduled === reminderPlan.length) {
        toast.success(`${result.scheduled === 1 ? 'Lembrete atualizado' : 'Lembretes atualizados'} pelo ${result.channelLabel}.`);
      } else if (result.scheduled > 0) {
        toast.info(`${result.scheduled} lembrete(s) salvo(s); ${result.failed} não puderam ser ativados.`);
      } else {
        toast.error(result.errors[0] || 'Não consegui ativar os lembretes deste pernoite.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui ativar os lembretes deste pernoite.');
    } finally {
      setReminderBusy(false);
    }
  }

  async function disableReminders() {
    setReminderBusy(true);
    try {
      const result = await cancelConciergeStayReminders(stayDate, stayId);
      await refresh();
      if (result.errors.length) toast.error(result.errors[0]);
      else toast.success(result.cancelled ? 'Lembretes deste pernoite desativados.' : 'Nenhum lembrete pendente para cancelar.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui desativar os lembretes deste pernoite.');
    } finally {
      setReminderBusy(false);
    }
  }

  return <section className="cc139-card">
    <Clock/><h2>Agora no pernoite</h2>
    <p><strong>{copy.title}</strong> · {copy.detail}</p>
    <div className="cc139-badges">
      <span><Hotel/> {resolvedHotel || 'Hotel a confirmar'}</span>
      <span>{resolvedRoom ? `Quarto ${resolvedRoom}` : 'Quarto a registrar'}</span>
      {context.wakeAt && <span>Despertar {timeLabel(context.wakeAt)}{wakeCountdown ? ` · ${wakeCountdown}` : ''}</span>}
      {context.presentationAt && <span>Apresentação {timeLabel(context.presentationAt)}{presentationCountdown ? ` · ${presentationCountdown}` : ''}</span>}
    </div>

    {!savedStay && <small>Estadia ainda não identificada com segurança. Nenhuma apresentação de outro pernoite será reutilizada.</small>}
    <h3><Bell/> Lembretes deste pernoite</h3>
    {reminderPlan.length > 0 ? <>
      <div className="cc139-badges">{reminderPlan.map((item) => <span key={item.jobKey}>
        {reminderKindLabel(item.kind)} · {timeLabel(item.scheduledAt)}{pendingKeys.has(item.jobKey) ? ' · ativo' : ''}
      </span>)}</div>
      <div className="cc139-actions">
        <button onClick={activateReminders} disabled={reminderBusy}><Bell/> {pendingReminderJobs.length ? 'Atualizar lembretes' : 'Ativar lembretes'}</button>
        {pendingReminderJobs.length > 0 && <button onClick={disableReminders} disabled={reminderBusy}><BellOff/> Desativar</button>}
      </div>
      <small>Canal: {delivery.channelLabel}. O Concierge reutiliza o canal já escolhido no Despertador e só agenda após sua ação.</small>
      <small>Os lembretes usam o scheduler persistente do CrewCheck e continuam ativos mesmo com o app fechado. Se você alterar apresentação ou antecedência, toque em “Atualizar lembretes” para substituir os horários pendentes deste pernoite.</small>
    </> : <small>Sem apresentação futura e antecedência válidas, nenhum lembrete é agendado.</small>}
    {context.step === 'register-room' && <small>Registrar o quarto continua como próximo passo, mas não vira notificação programada: o CrewCheck não possui um horário confiável de chegada ao hotel e não inventa esse marco.</small>}
    {context.canPrepareWakeReminder && <small>Linha de preparação pronta: o despertar usa somente a antecedência salva para este pernoite.</small>}
    {localOnly && <small>Contexto obtido do cache local. O CrewCheck reconciliará a estadia quando a conexão estiver disponível.</small>}
    <small>Este card usa somente o pernoite salvo e não altera a escala canônica. Apresentação, APZ oficial e pickup/saída do hotel continuam conceitos separados; o Concierge não inventa horário de traslado.</small>
  </section>;
}
