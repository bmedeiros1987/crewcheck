/**
 * Decisão única do portão de embarque do próximo voo.
 *
 * Alimenta o card abaixo da Escala rápida e a projeção do CrewWatch, para que celular e
 * relógio mostrem o mesmo voo, portão, horário e status. Não consulta nenhuma fonte: lê
 * apenas o cache Radar já validado e o portão informado manualmente pelo tripulante.
 *
 * Regras: portão de embarque nunca é preenchido por posição da aeronave, portão de chegada
 * ou dado de outro trecho/dia. Ausente fica "não informado"; antigo fica "desatualizado".
 */

export const NEXT_FLIGHT_DEPARTED_GRACE_MS = 20 * 60 * 1000;
export const RADAR_GATE_STALE_MS = 30 * 60 * 1000;
export const RADAR_OTHER_INSTANCE_MS = 12 * 60 * 60 * 1000;
export const GATE_ALERT_WINDOW_BEFORE_MS = 8 * 60 * 60 * 1000;
export const GATE_ALERT_WINDOW_AFTER_MS = 60 * 60 * 1000;
const MANUAL_GATE_PREFIX = 'crewcheck:manual-gate:v1:';
const MANUAL_GATE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
export const MANUAL_GATE_EVENT = 'crewcheck:manual-gate-updated';

export type NextFlightLike = {
  id: string;
  kind?: string;
  placeholder?: boolean;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  presentation?: string;
  departure?: string;
  arrival?: string;
  gate?: string;
  terminal?: string;
  status?: string;
  date?: Date | string;
  canonical?: { startDateTime?: string; endDateTime?: string };
};

export type RadarGateSnapshot = {
  ok?: boolean;
  gate?: string;
  terminal?: string;
  status?: string;
  departure?: string;
  updatedAt?: number;
  sourceOrigin?: string;
  sourceDestination?: string;
  quality?: number;
  alternatives?: number;
};

export type ManualGateEntry = {
  gate: string;
  terminal?: string;
  flight: string;
  date: string;
  origin: string;
  destination: string;
  setAtEpochMs: number;
  author: string;
};

export type GateSource = 'manual' | 'radar' | 'roster';

export type NextFlightGateInfo = {
  eventId: string;
  flight: string;
  operationalDate: string;
  origin: string;
  destination: string;
  departureEpochMs: number;
  presentation: string;
  departure: string;
  gate: string;
  remote: boolean;
  gateSource: GateSource | null;
  terminal: string;
  status: string;
  statusSource: 'radar' | 'roster' | null;
  updatedAtEpochMs: number;
  radarUpdatedAtEpochMs: number;
  /** O portão exibido vem do Radar (base para a validade no relógio). */
  usesRadar: boolean;
  stale: boolean;
  radarRejected: '' | 'not-ok' | 'other-segment' | 'other-day' | 'position';
  divergence: { manualGate: string; sourceGate: string; source: 'radar' | 'roster' } | null;
  manual: ManualGateEntry | null;
};

const EMPTY_VALUES = /^(|—|-|–|N\/?A|NA|TBD|TBA|UNKNOWN|NULL|UNDEFINED|A CONFIRMAR|NÃO INFORMADO|NAO INFORMADO|NÃO INFORMADA|NAO INFORMADA|SEM PORTÃO|SEM PORTAO)$/;
// Posição/estande é onde a aeronave estaciona, não onde o tripulante embarca.
const POSITION_VALUES = /^(POSIÇÃO|POSICAO|POSITION|POS|STAND|STD|BOX|PARKING|PRK|SPOT|ESTANDE|BAY)(?=[\s\d.:#-]|$)/;
const REMOTE_VALUES = /\b(REMOTA|REMOTO|REMOTE|PÁTIO|PATIO)\b/;

function text(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
function upper(value: unknown): string {
  return text(value).toUpperCase();
}

/** Normaliza um portão de embarque. Posição de aeronave e marcadores de ausência viram vazio. */
export function normalizeBoardingGate(value: unknown): { gate: string; remote: boolean; position: boolean } {
  const raw = upper(value).replace(/^(PORTÃO|PORTAO|GATE|PTO\.?)\s*/, '');
  if (EMPTY_VALUES.test(raw) || /CONFIRMAR|INFORMAD/.test(raw)) return { gate: '', remote: false, position: false };
  if (POSITION_VALUES.test(raw)) return { gate: '', remote: false, position: true };
  if (raw.length > 12) return { gate: '', remote: false, position: false };
  return { gate: raw, remote: REMOTE_VALUES.test(raw), position: false };
}

function cleanTerminal(value: unknown): string {
  const raw = upper(value).replace(/^(TERMINAL|TERM\.?|T)\s*/, '');
  return raw && !EMPTY_VALUES.test(raw) && !/CONFIRMAR|INFORMAD/.test(raw) && raw.length <= 6 ? raw : '';
}

function cleanStatus(value: unknown): string {
  const raw = text(value);
  return raw && !EMPTY_VALUES.test(raw.toUpperCase()) && !/aguardando|monitorando/i.test(raw) ? raw : '';
}

function clockOnly(value: unknown): string {
  const match = text(value).match(/^(\d{1,2}):([0-5]\d)/);
  return match && Number(match[1]) < 24 ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

export function flightDepartureEpochMs(event: NextFlightLike): number {
  const raw = event.canonical?.startDateTime || event.date;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(String(raw || ''));
  return Number.isFinite(ms) ? ms : NaN;
}

/** Data operacional local do voo, no mesmo formato da chave Radar existente. */
export function flightOperationalDate(event: NextFlightLike): string {
  const ms = flightDepartureEpochMs(event);
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

/**
 * Próximo voo publicado que ainda não partiu. Usa instantes absolutos, então virada de
 * data/fuso não altera a ordem. Uma tolerância curta mantém o voo atrasado ainda no portão.
 */
export function selectNextFlight<T extends NextFlightLike>(events: readonly T[], now = Date.now()): T | null {
  let best: T | null = null;
  let bestMs = Infinity;
  for (const event of events) {
    if (!event || event.placeholder || event.kind !== 'flight' || !/\d/.test(text(event.flightNumber))) continue;
    const start = flightDepartureEpochMs(event);
    if (!Number.isFinite(start) || start < now - NEXT_FLIGHT_DEPARTED_GRACE_MS) continue;
    if (start < bestMs) { best = event; bestMs = start; }
  }
  return best;
}

export function manualGateIdentity(event: NextFlightLike): string {
  return [upper(event.flightNumber), flightOperationalDate(event), upper(event.origin), upper(event.destination)].join('|');
}

export function manualGateAccountKey(user: { id?: string | null; email?: string | null } | null | undefined): string {
  const key = text(user?.id || user?.email || '').toLowerCase();
  return key ? key.replace(/[^a-z0-9@._-]+/g, '_').slice(0, 80) : 'local';
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function readMap(storage: StorageLike, account: string): Record<string, ManualGateEntry> {
  try {
    const parsed = JSON.parse(storage.getItem(MANUAL_GATE_PREFIX + account) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readManualGate(storage: StorageLike, account: string, event: NextFlightLike): ManualGateEntry | null {
  const entry = readMap(storage, account)[manualGateIdentity(event)];
  if (!entry || typeof entry !== 'object') return null;
  const normalized = normalizeBoardingGate(entry.gate);
  if (!normalized.gate || !Number.isFinite(Number(entry.setAtEpochMs))) return null;
  return { ...entry, gate: normalized.gate, terminal: cleanTerminal(entry.terminal) };
}

export type ManualGateWriteResult = { ok: true; entry: ManualGateEntry | null } | { ok: false; message: string };

/** Salva (ou remove, com gate vazio) o portão informado para este voo e esta data. */
export function writeManualGate(
  storage: StorageLike,
  account: string,
  event: NextFlightLike,
  input: { gate: string; terminal?: string; author: string },
  now = Date.now(),
): ManualGateWriteResult {
  const identity = manualGateIdentity(event);
  if (!identity.split('|').every(Boolean)) return { ok: false, message: 'Voo sem número, data ou rota publicada.' };
  const map = readMap(storage, account);
  for (const [key, entry] of Object.entries(map)) {
    const date = Date.parse(`${entry?.date || ''}T23:59:59`);
    if (!Number.isFinite(date) || now - date > MANUAL_GATE_RETENTION_MS) delete map[key];
  }
  let entry: ManualGateEntry | null = null;
  if (!text(input.gate)) {
    delete map[identity];
  } else {
    const normalized = normalizeBoardingGate(input.gate);
    if (normalized.position) return { ok: false, message: 'Informe o portão de embarque, não a posição da aeronave.' };
    if (!normalized.gate) return { ok: false, message: 'Portão inválido. Use até 12 caracteres, por exemplo 24 ou 7A.' };
    const [flight, date, origin, destination] = identity.split('|');
    entry = {
      gate: normalized.gate,
      terminal: cleanTerminal(input.terminal),
      flight, date, origin, destination,
      setAtEpochMs: now,
      author: text(input.author).slice(0, 60) || 'Este dispositivo',
    };
    map[identity] = entry;
  }
  try {
    storage.setItem(MANUAL_GATE_PREFIX + account, JSON.stringify(map));
  } catch {
    return { ok: false, message: 'Não foi possível salvar neste dispositivo.' };
  }
  return { ok: true, entry };
}

function radarDepartureEpochMs(value: unknown): number {
  const raw = text(value);
  // Só horários absolutos provam o dia; "14:05" sozinho não identifica a ocorrência.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) || !/(Z|[+-]\d{2}:?\d{2})$/.test(raw)) return NaN;
  return Date.parse(raw);
}

export function resolveNextFlightGate(input: {
  event: NextFlightLike;
  radar?: RadarGateSnapshot | null;
  manual?: ManualGateEntry | null;
  now?: number;
}): NextFlightGateInfo {
  const { event } = input;
  const now = input.now ?? Date.now();
  const departureEpochMs = flightDepartureEpochMs(event);
  const manual = input.manual || null;

  let radarRejected: NextFlightGateInfo['radarRejected'] = '';
  let radar: RadarGateSnapshot | null = input.radar || null;
  if (radar) {
    const sourceOrigin = upper(radar.sourceOrigin);
    const sourceDestination = upper(radar.sourceDestination);
    const radarDeparture = radarDepartureEpochMs(radar.departure);
    if (radar.ok !== true) radarRejected = 'not-ok';
    else if ((sourceOrigin && sourceOrigin !== upper(event.origin)) || (sourceDestination && sourceDestination !== upper(event.destination))) radarRejected = 'other-segment';
    else if (Number.isFinite(radarDeparture) && Number.isFinite(departureEpochMs) && Math.abs(radarDeparture - departureEpochMs) > RADAR_OTHER_INSTANCE_MS) radarRejected = 'other-day';
    if (radarRejected) radar = null;
  }

  const radarGate = radar ? normalizeBoardingGate(radar.gate) : { gate: '', remote: false, position: false };
  if (radar && radarGate.position) radarRejected = 'position';
  const rosterGate = normalizeBoardingGate(event.gate);
  const radarUpdatedAt = radar && Number(radar.updatedAt) > 0 && Number(radar.updatedAt) <= now + 60_000 ? Number(radar.updatedAt) : 0;
  const radarStale = Boolean(radar) && (!radarUpdatedAt || now - radarUpdatedAt > RADAR_GATE_STALE_MS);

  const sourceGate = radarGate.gate ? { ...radarGate, source: 'radar' as const } : rosterGate.gate ? { ...rosterGate, source: 'roster' as const } : null;

  let gate = '';
  let remote = false;
  let gateSource: GateSource | null = null;
  if (manual) {
    gate = manual.gate;
    remote = REMOTE_VALUES.test(manual.gate);
    gateSource = 'manual';
  } else if (sourceGate) {
    gate = sourceGate.gate;
    remote = sourceGate.remote;
    gateSource = sourceGate.source;
  }

  const divergence = manual && sourceGate && sourceGate.gate !== manual.gate
    ? { manualGate: manual.gate, sourceGate: sourceGate.gate, source: sourceGate.source }
    : null;

  const radarStatus = radar ? cleanStatus(radar.status) : '';
  const rosterStatus = cleanStatus(event.status);
  const terminal = (manual?.terminal) || (radar ? cleanTerminal(radar.terminal) : '') || cleanTerminal(event.terminal);

  const updatedAtEpochMs = gateSource === 'manual' ? manual!.setAtEpochMs : radarUpdatedAt;
  const stale = (gateSource === 'radar' || Boolean(radarStatus)) && radarStale;

  return {
    eventId: event.id,
    flight: upper(event.flightNumber),
    operationalDate: flightOperationalDate(event),
    origin: upper(event.origin),
    destination: upper(event.destination),
    departureEpochMs,
    presentation: clockOnly(event.presentation),
    departure: clockOnly(event.departure),
    gate,
    remote,
    gateSource,
    terminal,
    status: radarStatus || rosterStatus,
    statusSource: radarStatus ? 'radar' : rosterStatus ? 'roster' : null,
    updatedAtEpochMs,
    radarUpdatedAtEpochMs: radarUpdatedAt,
    usesRadar: gateSource === 'radar',
    stale,
    radarRejected,
    divergence,
    manual,
  };
}

/** Rótulo do portão para telas e relógio. Nunca inventa valor. */
export function gateDisplay(info: Pick<NextFlightGateInfo, 'gate' | 'remote'>): string {
  if (!info.gate) return 'Não informado';
  return info.remote && !/\d/.test(info.gate) ? 'Remoto' : info.gate;
}

/**
 * Alerta de mudança de portão com vibração só dentro da janela operacional do voo.
 * Fora dela o tripulante está em descanso: a mudança fica no app, sem notificação.
 */
export function gateChangeAlertAllowed(departureEpochMs: number, now = Date.now()): boolean {
  if (!Number.isFinite(departureEpochMs)) return false;
  return now >= departureEpochMs - GATE_ALERT_WINDOW_BEFORE_MS && now <= departureEpochMs + GATE_ALERT_WINDOW_AFTER_MS;
}

/** TTL do cache Radar do card (igual ao FlightDeck). Além disso o dado nem é lido. */
export const RADAR_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;

/** Chave do cache Radar existente (crewcheck_radar_v2), compartilhada com o FlightDeck. */
export function radarSnapshotStorageKey(event: Pick<NextFlightLike, 'id' | 'flightNumber' | 'origin' | 'destination'>): string {
  return ['crewcheck_radar_v2', event.id, event.flightNumber, event.origin, event.destination]
    .map((part) => String(part || '').trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_'))
    .join(':');
}

type RadarCacheRecord = RadarGateSnapshot & { flight?: string; operationalDate?: string; origin?: string; destination?: string };

/** Lê o cache Radar do mesmo voo, data e trecho. Não faz nenhuma consulta de rede. */
export function readCachedRadarForFlight(storage: Pick<Storage, 'getItem'>, event: NextFlightLike, now = Date.now()): RadarGateSnapshot | null {
  if (event.kind !== 'flight' || event.placeholder) return null;
  try {
    const parsed = JSON.parse(storage.getItem(radarSnapshotStorageKey(event)) || 'null') as RadarCacheRecord | null;
    if (!parsed || !parsed.updatedAt || now - Number(parsed.updatedAt) > RADAR_SNAPSHOT_TTL_MS) return null;
    if (upper(parsed.flight) !== upper(event.flightNumber)
      || parsed.operationalDate !== flightOperationalDate(event)
      || upper(parsed.origin) !== upper(event.origin)
      || upper(parsed.destination) !== upper(event.destination)) return null;
    return parsed;
  } catch {
    return null;
  }
}
