import { useEffect, useMemo, useState } from 'react';
import { Clock, Hotel } from 'lucide-react';
import { buildConciergeStayContext, type ConciergeStayContextStep } from '@/lib/conciergeStayContext';
import { listConciergeStays } from '@/lib/conciergeStaySync';

type SavedStay = {
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

export default function ConciergeStayContextCard({
  hotelName,
  room,
  stayDate,
}: {
  hotelName: string;
  room: string;
  stayDate: string;
}) {
  const [savedStay, setSavedStay] = useState<SavedStay | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [localOnly, setLocalOnly] = useState(false);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const payload = await listConciergeStays();
        if (!active) return;
        const target = (payload.stays || []).find((item: SavedStay) => text(item?.stayDate).slice(0, 10) === stayDate) || null;
        setSavedStay(target);
        setLocalOnly(Boolean(payload.localOnly));
      } catch {
        if (active) setSavedStay(null);
      }
    }

    refresh().catch(() => undefined);
    const handleRefresh = () => refresh().catch(() => undefined);
    window.addEventListener('online', handleRefresh);
    window.addEventListener('focus', handleRefresh);
    return () => {
      active = false;
      window.removeEventListener('online', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
    };
  }, [stayDate]);

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

  const copy = stepCopy(context.step);
  const resolvedHotel = text(hotelName || savedStay?.hotelName);
  const resolvedRoom = text(room || savedStay?.room);
  const wakeCountdown = countdownLabel(context.minutesUntilWake);
  const presentationCountdown = countdownLabel(context.minutesUntilPresentation);

  return <section className="cc139-card">
    <Clock/><h2>Agora no pernoite</h2>
    <p><strong>{copy.title}</strong> · {copy.detail}</p>
    <div className="cc139-badges">
      <span><Hotel/> {resolvedHotel || 'Hotel a confirmar'}</span>
      <span>{resolvedRoom ? `Quarto ${resolvedRoom}` : 'Quarto a registrar'}</span>
      {context.wakeAt && <span>Despertar {timeLabel(context.wakeAt)}{wakeCountdown ? ` · ${wakeCountdown}` : ''}</span>}
      {context.presentationAt && <span>Apresentação {timeLabel(context.presentationAt)}{presentationCountdown ? ` · ${presentationCountdown}` : ''}</span>}
    </div>
    {context.canPrepareWakeReminder && <small>Linha de preparação pronta: o despertar usa somente a antecedência salva para este pernoite.</small>}
    {localOnly && <small>Contexto obtido do cache local. O CrewCheck reconciliará a estadia quando a conexão estiver disponível.</small>}
    <small>Este card usa somente o pernoite salvo e não altera a escala canônica. Apresentação, APZ oficial e pickup/saída do hotel continuam conceitos separados; o Concierge não inventa horário de traslado.</small>
  </section>;
}
