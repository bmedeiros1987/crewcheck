import type { CrewCheckWatchSnapshot } from '@/lib/watchContext';
import { RADAR_GATE_STALE_MS, gateDisplay, type NextFlightGateInfo } from '@/lib/nextFlightGate';

function fit(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * Projeta no snapshot do CrewWatch a mesma decisão de portão exibida no celular.
 * Não muda o contrato v1 nem a escala canônica: apenas preenche campos já existentes
 * (gate, remoteStand, nextFlight, nextDetail, detail, schedule[].gate) e encurta a
 * validade quando o portão vem de um Radar que ficou antigo.
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
  if (info.status) notes.push(info.status);
  if (info.stale) notes.push('Radar desatualizado');

  if (options.primaryEventId === info.eventId) {
    out.gate = info.remote && !/\d/.test(info.gate) ? '' : info.gate;
    out.remoteStand = info.remote;
    if (!out.detail && out.state !== 'IN_FLIGHT' && out.state !== 'OVERNIGHT' && notes.length) out.detail = fit(notes.join(' · '), 96);
  } else if (!out.nextFlight || out.nextFlight === info.flight) {
    out.nextFlight = fit(info.flight, 16);
    out.nextDetail = fit([
      info.origin && info.destination ? `${info.origin} → ${info.destination}` : '',
      info.gate ? `P${gateLabel}` : 'Portão não informado',
      info.departure,
      info.stale ? 'desatualizado' : '',
    ].filter(Boolean).join(' • '), 64);
  }

  // Um portão Radar antigo nunca pode parecer atual no relógio: a validade acompanha o dado.
  if (info.usesRadar) {
    const radarValidUntil = info.stale || !info.radarUpdatedAtEpochMs ? out.generatedAtEpochMs : info.radarUpdatedAtEpochMs + RADAR_GATE_STALE_MS;
    out.validUntilEpochMs = Math.max(out.generatedAtEpochMs, Math.min(out.validUntilEpochMs, radarValidUntil));
  }
  return out;
}
