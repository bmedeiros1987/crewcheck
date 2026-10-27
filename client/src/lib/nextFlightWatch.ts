import type { CrewCheckWatchSnapshot } from '@/lib/watchContext';
import { gateDisplay, type NextFlightGateInfo } from '@/lib/nextFlightGate';

function fit(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * Projeta no snapshot do CrewWatch a mesma decisão de portão exibida no celular.
 * Não muda o contrato v1 nem a escala canônica: apenas preenche campos já existentes
 * (gate, remoteStand, nextFlight, nextDetail, detail, schedule[].gate) e encurta a
 * validade por observação de cada campo automático que será exibido.
 */
export function applyNextFlightToWatchSnapshot(
  snapshot: CrewCheckWatchSnapshot,
  info: NextFlightGateInfo | null,
  options: { primaryEventId: string; nextFlightScheduleId: string },
): CrewCheckWatchSnapshot {
  if (!info) return snapshot;
  const out: CrewCheckWatchSnapshot = { ...snapshot, schedule: snapshot.schedule.map((item) => ({ ...item })) };
  const gateLabel = gateDisplay(info);
  const scheduleGate = info.gate ? (info.remote && !/\d/.test(info.gate) ? 'REMOTA' : info.gate) : '';

  for (const item of out.schedule) {
    if (item.id === options.nextFlightScheduleId) item.gate = scheduleGate;
  }

  const notes: string[] = [];
  if (info.divergence) notes.push(`Fonte indica portão ${info.divergence.sourceGate}`);
  if (info.status) notes.push(info.status + (info.statusSource === 'manual' ? ' · manual' : ''));
  if (info.stale) notes.push('Radar desatualizado');

  if (options.primaryEventId === info.eventId && out.currentFlight) {
    out.gate = info.remote && !/\d/.test(info.gate) ? '' : info.gate;
    out.remoteStand = info.remote;
    if (notes.length) out.detail = fit([notes.join(' · '), out.detail].filter(Boolean).join(' · '), 96);
  } else if (!out.nextFlight || out.nextFlight === info.flight) {
    out.nextFlight = fit(info.flight, 16);
    const temporalDetail = out.nextDetail;
    const departureKnown = out.schedule.some(item => item.id === options.nextFlightScheduleId && Boolean(item.time));
    out.nextDetail = fit([
      temporalDetail,
      info.origin && info.destination ? `${info.origin} → ${info.destination}` : '',
      info.gate ? `P${gateLabel}` : 'Portão não informado',
      departureKnown ? info.departure : '',
      info.stale ? 'desatualizado' : '',
    ].filter(Boolean).join(' • '), 64);
  }

  // The Wear v1 snapshot has one expiry. Cap it at the earliest observation
  // deadline of every automatic field actually projected, including a status
  // alongside a manual gate and the automatic gate shown in a divergence note.
  const automaticFields: Array<'gate' | 'status'> = [];
  if (info.gate && (info.gateSource === 'radar' || info.gateSource === 'reported')) automaticFields.push('gate');
  if (options.primaryEventId === info.eventId && out.currentFlight) {
    if (info.status && info.statusSource === 'radar') automaticFields.push('status');
    if (info.divergence?.source === 'radar' || info.divergence?.source === 'reported') automaticFields.push('gate');
  }
  for (const field of automaticFields) {
    const expiry = info.automaticFieldValidUntilEpochMs?.[field];
    const safeExpiry = typeof expiry === 'number' && Number.isFinite(expiry) ? expiry : out.generatedAtEpochMs;
    out.validUntilEpochMs = Math.max(out.generatedAtEpochMs, Math.min(out.validUntilEpochMs, safeExpiry));
  }
  return out;
}
