import { useEffect } from 'react';
import { publishCrewCheckPulse } from '@/components/pulse/CrewCheckPulse';
import type { ContextualEventLike } from './ContextualJourneyActions';

const PULSE_CONTEXT_SIGNATURE_KEY = 'crewcheck_pulse_context_signature_v1';

function clock(value: unknown): string {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` : '';
}

function dateAtClock(event: ContextualEventLike, value: unknown): Date | null {
  const time = clock(value);
  if (!time) return null;
  let date: Date;
  if (event.date instanceof Date) date = new Date(event.date);
  else if (String(event.date || '').trim()) date = new Date(String(event.date));
  else if (String((event.day as any)?.date || '').trim()) date = new Date(String((event.day as any).date));
  else date = new Date();
  if (!Number.isFinite(date.getTime())) return null;
  const [hours, minutes] = time.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function relativeMinutes(target: Date | null): number | null {
  if (!target) return null;
  return Math.round((target.getTime() - Date.now()) / 60000);
}

export default function PulseContextBridge({ event }: { event: (ContextualEventLike & { placeholder?: boolean; canonical?: { startDateTime?: string; endDateTime?: string } }) | null | undefined }) {
  useEffect(() => {
    if (!event || event.placeholder || !event.id) return;
    const isStay = event.kind === 'stay' || Boolean(String(event.hotel || '').trim());
    const presentation = clock(event.presentation);
    const presentationAt = dateAtClock(event, presentation);
    const untilPresentation = relativeMinutes(presentationAt);
    const flight = String(event.flightNumber || '').trim();
    const route = [event.origin, event.destination].filter(Boolean).join(' → ');
    const signature = [event.id, event.kind, presentation, flight, route, isStay ? 'stay' : 'duty'].join('|');

    try {
      if (window.sessionStorage.getItem(PULSE_CONTEXT_SIGNATURE_KEY) === signature) return;
      window.sessionStorage.setItem(PULSE_CONTEXT_SIGNATURE_KEY, signature);
    } catch {}

    const timer = window.setTimeout(() => {
      if (isStay) {
        publishCrewCheckPulse({
          id: `context-${event.id}`,
          tone: 'lembrete',
          title: `Pernoite${event.destination ? ` em ${event.destination}` : ''}`,
          detail: event.hotel ? `${event.hotel} · toque para gerenciar o pernoite.` : 'Hotel, quarto, entorno e próxima apresentação em um só lugar.',
          action: { label: 'Gerenciar pernoite', view: 'hotels' },
          dismissible: true,
        });
        return;
      }

      if (event.kind === 'flight' && presentation && untilPresentation !== null && untilPresentation >= 0 && untilPresentation <= 12 * 60) {
        const countdown = untilPresentation <= 60 ? `em ${Math.max(0, untilPresentation)} min` : `em ${Math.floor(untilPresentation / 60)} h ${untilPresentation % 60} min`;
        publishCrewCheckPulse({
          id: `context-${event.id}`,
          tone: untilPresentation <= 90 ? 'atencao' : 'operacional',
          title: `Apresentação às ${presentation}`,
          detail: `${flight || 'Próximo voo'}${route ? ` · ${route}` : ''} · ${countdown}.`,
          action: { label: 'Planejar saída', view: 'departure' },
          dismissible: true,
        });
        return;
      }

      if (event.kind === 'flight') {
        publishCrewCheckPulse({
          id: `context-${event.id}`,
          tone: 'operacional',
          title: flight ? `Próximo voo · ${flight}` : 'Próxima programação',
          detail: route || (presentation ? `Apresentação ${presentation}` : 'Toque para acompanhar a operação.'),
          action: { label: 'Portão e operação', view: 'radar' },
          dismissible: true,
        });
        return;
      }

      publishCrewCheckPulse({
        id: `context-${event.id}`,
        tone: 'informativo',
        title: 'Próxima programação',
        detail: presentation ? `Início previsto às ${presentation}.` : 'Confira a próxima atividade na sua linha do tempo.',
        action: { label: 'Ver escala', view: 'roster' },
        dismissible: true,
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [event?.id, event?.kind, event?.presentation, event?.origin, event?.destination, event?.flightNumber, event?.hotel, event?.placeholder]);

  return null;
}
