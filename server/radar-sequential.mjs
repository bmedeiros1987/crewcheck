import { gateQueryDay, radarResultDecision, radarSourceEpoch } from '../shared/gate-query-day.mjs';

const ROUTING = 'cirium-flightaware-v1';
const gateValue = value => {
  if (typeof value !== 'string') return '';
  const gate = value.trim().toUpperCase().replace(/^(PORTÃO|PORTAO|GATE|PTO\.?)\s*/, '');
  return gate.length <= 12 && /^[A-Z0-9][A-Z0-9 .-]*$/.test(gate)
    && !/^(?:-|—|N\/A|NA|NULL|UNDEFINED|NONE|UNKNOWN|TBD|TBA|NÃO INFORMADO|NAO INFORMADO|SEM PORTÃO|SEM PORTAO)$/i.test(gate)
    && !/CONFIRMAR|INFORMAD|^(?:POS|POSIÇÃO|POSICAO|POSITION|STAND|STD|BOX|PARKING|PRK|SPOT|ESTANDE|BAY)(?=[\s\d.:#-]|$)|\b(?:PÁTIO|PATIO|REMOTA|REMOTO|REMOTE|BUS)\b/.test(gate) ? gate : '';
};
const fresh = (value, now, age) => { const at = typeof value === 'number' ? value : radarSourceEpoch(value); return Number.isFinite(at) && at > 0 && at <= now && now - at <= age; };

function eligible(result, identity, now) {
  return radarResultDecision(result, identity, now).allowed;
}
function primarySufficient(result, identity, now) {
  if (!eligible(result, identity, now) || result.provider !== 'cirium-sky' || !gateValue(result.gate)) return false;
  const field = result.provenance?.fields?.departureGate;
  // Observation freshness does not assert a gate-change timestamp. In particular
  // this routing contract never emits the manual-review gateUpdate capability.
  return field?.provider === 'cirium-sky' && field.value === result.gate && field.occurrenceKey === result.occurrenceKey
    && fresh(field.observedAt, now, 15 * 60_000);
}
function project(result, reason, fallbackAttempted, now) {
  return { ...result, radarRouting: ROUTING, fallbackReason: reason, fallbackAttempted,
    canonicalReadOnly: true, exportedToConcierge: false, sourceReceivedAt: result.sourceReceivedAt ?? now };
}

/** Callers provide the existing bounded/aborting adapters. Await primary completion
 * before starting at most one fallback; no retries, racing, new transport or activation. */
export async function runCiriumFlightAwareSequence({ identity, primary, fallback, admit, now = Date.now } = {}) {
  if (!gateQueryDay(identity, now()).allowed || typeof primary !== 'function' || typeof fallback !== 'function' || typeof admit !== 'function')
    return { ok: false, configured: false, radarRouting: ROUTING, canonicalReadOnly: true, exportedToConcierge: false, message: 'Contexto operacional não confirmado.' };
  const admitted = async () => { try { return await admit() === true && gateQueryDay(identity, now()).allowed; } catch { return false; } };
  const denied = () => ({ ok: false, configured: false, radarRouting: ROUTING, canonicalReadOnly: true, exportedToConcierge: false, message: 'Contexto operacional não confirmado.', fallbackReason: gateQueryDay(identity, now()).allowed ? 'authority-invalidated' : 'context-expired' });
  if (!await admitted()) return denied();
  let first;
  try { first = await primary(); } catch { first = { ok: false, providerState: 'provider_error' }; }
  if (!await admitted()) return denied();
  if (primarySufficient(first, identity, now())) return project(first, '', false, now());
  const reason = first?.ok ? eligible(first, identity, now()) ? 'primary-gate-insufficient' : 'primary-occurrence-or-freshness-rejected' : 'primary-unavailable';
  // Revalidate calendar after waiting; no delayed fallback on an expired day.
  if (!gateQueryDay(identity, now()).allowed) return project({ ok: false, message: 'Contexto operacional expirou.' }, 'context-expired', false, now());
  if (!await admitted()) return denied();
  let second;
  try { second = await fallback(); } catch { second = { ok: false }; }
  if (!await admitted()) return denied();
  if (eligible(second, identity, now())) {
    const received = second.sourceReceivedAt;
    // The existing FlightAware adapter provides live response receipt, but no
    // documented per-gate source-update time. Keep that absence explicit.
    if (fresh(received, now(), 30 * 60_000)) {
      const candidate = { ...second, provider: 'flightaware', gate: gateValue(second.gate), gateUpdate: null,
        provenance: { occurrenceKey: '', matchedProviders: ['flightaware'], fields: Object.fromEntries(
          [['departureGate', gateValue(second.gate)], ['departureTerminal', second.terminal], ['status', second.status]]
            .filter(([, value]) => typeof value === 'string' && value.trim()).map(([field, value]) => [field,
              { value, provider: 'flightaware', observedAt: null, receivedAt: new Date(received).toISOString(), coverageState: 'provided_no_source_freshness' }])) } };
      if (candidate.gate) return project(candidate, reason, true, now());
      if (!eligible(first, identity, now())) return project(candidate, reason, true, now());
    }
  }
  // Retain usable primary status when neither source proves a usable departure gate.
  if (eligible(first, identity, now())) return project({ ...first, gate: '', gateUpdate: null }, reason, true, now());
  return project({ ok: false, configured: Boolean(first?.configured || second?.configured), gate: '', message: 'Fontes operacionais sem dado confirmado para este voo.' }, reason, true, now());
}

export function sequentialRadarProjection(item) {
  if (item.radarRouting !== ROUTING) return {};
  return { radarRouting: ROUTING, provider: item.provider || '', canonicalReadOnly: true, exportedToConcierge: false,
    fallbackAttempted: item.fallbackAttempted === true, fallbackReason: item.fallbackReason || '', provenance: item.provenance || null };
}
