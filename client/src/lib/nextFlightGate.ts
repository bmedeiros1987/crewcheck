import { radarSourceEpoch } from '../../../shared/gate-query-day.mjs';
import { rosterDisplayIso, ROSTER_DISPLAY_TIME_ZONE } from '@/lib/rosterDisplayDate';

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
  operationalTimeZone?: string;
  canonical?: { startDateTime?: string; endDateTime?: string; date?: string };
};

export type RadarGateSnapshot = {
  flight?: string;
  ok?: boolean;
  gate?: string;
  terminal?: string;
  status?: string;
  departure?: string;
  scheduledDepartureUtc?: string;
  operationalDeparture?: string;
  updatedAt?: number;
  sourceOrigin?: string;
  sourceDestination?: string;
  quality?: number;
  alternatives?: number;
  /** Source-produced departure-gate update, never the local fetch/cache clock. */
  gateUpdate?: GateSourceUpdate | null;
  gateUpdateWatermark?: GateUpdateWatermark | null;
  origin?: string;
  destination?: string;
};

export type GateUpdateWatermark = { sourceUpdatedAtEpochMs: number; gate: string; conflicted: boolean };

export type GateSourceUpdate = {
  version: 1;
  provider: 'custom';
  kind: 'departure-gate-update';
  sourceUpdatedAt: string;
  gate: string;
  flight: string;
  origin: string;
  destination: string;
  scheduledDepartureUtc: string;
};

export type ManualGateSourceReview = {
  action: 'keep' | 'accept';
  decidedAtEpochMs: number;
  fingerprint: string;
  sourceGate: string;
  sourceUpdatedAtEpochMs: number;
  provider: 'custom';
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
  sourceReview?: ManualGateSourceReview;
};

export type ManualGateReviewInfo = {
  state: 'none' | 'matching' | 'unverified' | 'older' | 'newer' | 'kept';
  candidate: { gate: string; provider: 'custom'; sourceUpdatedAtEpochMs: number; fingerprint: string } | null;
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
  radarRejected: '' | 'not-ok' | 'other-flight' | 'other-segment' | 'other-day' | 'unproven-day' | 'position';
  divergence: { manualGate: string; sourceGate: string; source: 'radar' | 'roster' } | null;
  manual: ManualGateEntry | null;
  manualReview: ManualGateReviewInfo;
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

/** Data operacional publicada, compartilhada pelo cache e pela identidade manual. */
export function flightOperationalDate(event: NextFlightLike): string {
  return flightPublishedDate(event);
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

/** Data publicada na escala; não muda quando o aparelho troca de fuso. */
export function flightPublishedDate(event: NextFlightLike): string {
  return rosterDisplayIso({ ...event, operationalTimeZone: event.operationalTimeZone || ROSTER_DISPLAY_TIME_ZONE }) || '';
}

export function manualGateIdentity(event: NextFlightLike): string {
  return [upper(event.flightNumber), flightPublishedDate(event), upper(event.origin), upper(event.destination)].join('|');
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
    const date = Date.parse(`${entry?.date || ''}T23:59:59-03:00`);
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

const CARRIER_ALIASES: Record<string, string> = { LAN: 'LA', TAM: 'JJ' };

/**
 * Identidade do voo restrita aos aliases que o servidor já usa em buildFlightContext
 * (LA↔LAN, JJ↔TAM), com espaços removidos como em normalizeFlightRaw. Qualquer outro
 * formato (sufixos, zeros à esquerda, ids internos do provedor) fica literal e falha fechado.
 */
export function canonicalFlightId(value: unknown): string {
  const raw = upper(value).replace(/\s+/g, '');
  const match = /^(LAN|TAM|LA|JJ)(\d+)$/.exec(raw);
  return match ? `${CARRIER_ALIASES[match[1]] || match[1]}${match[2]}` : raw;
}

/** Only an explicit source gate-update contract can establish chronology.
 * Aircraft signals, HTTP receipt time and cache updatedAt are never substitutes. */
export function sourceGateUpdate(event: NextFlightLike, radar: RadarGateSnapshot | null, now = Date.now()): ManualGateReviewInfo['candidate'] {
  if (!Number.isFinite(now)) return null;
  const proof = radar?.gateUpdate;
  const at = radarSourceEpoch(proof?.sourceUpdatedAt);
  const expected = flightDepartureEpochMs(event);
  const normalized = normalizeBoardingGate(proof?.gate);
  const sourceGate = normalizeBoardingGate(radar?.gate).gate;
  if (!radar || radar.ok !== true || canonicalFlightId(radar.flight) !== canonicalFlightId(event.flightNumber)
    || upper(radar.sourceOrigin ?? radar.origin) !== upper(event.origin) || upper(radar.sourceDestination ?? radar.destination) !== upper(event.destination)
    || radarSourceEpoch(radar.scheduledDepartureUtc) !== expected
    || !proof || proof.version !== 1 || proof.provider !== 'custom' || proof.kind !== 'departure-gate-update'
    || !normalized.gate || normalized.position || normalized.gate !== sourceGate
    || canonicalFlightId(proof.flight) !== canonicalFlightId(event.flightNumber)
    || upper(proof.origin) !== upper(event.origin) || upper(proof.destination) !== upper(event.destination)
    || !Number.isFinite(expected) || radarSourceEpoch(proof.scheduledDepartureUtc) !== expected
    || !Number.isFinite(at) || at > now || now - at > RADAR_GATE_STALE_MS) return null;
  const fingerprint = [canonicalFlightId(event.flightNumber), expected, upper(event.origin), upper(event.destination), sourceGate, proof.provider, at].join('|');
  return { gate: sourceGate, provider: proof.provider, sourceUpdatedAtEpochMs: at, fingerprint };
}

/** Source-clock watermark only: receipt times cannot advance it. Equal-time
 * contradictory gates remain ambiguous until a genuinely later source update. */
export function nextGateUpdateWatermark(event: NextFlightLike, previous: RadarGateSnapshot | null, incoming: RadarGateSnapshot, now = Date.now()): GateUpdateWatermark | null {
  const history = previous?.gateUpdateWatermark;
  let result: GateUpdateWatermark | null = history && typeof history.sourceUpdatedAtEpochMs === 'number' && Number.isFinite(history.sourceUpdatedAtEpochMs)
    && history.sourceUpdatedAtEpochMs > 0 && history.sourceUpdatedAtEpochMs <= now && normalizeBoardingGate(history.gate).gate
    ? { sourceUpdatedAtEpochMs: history.sourceUpdatedAtEpochMs, gate: normalizeBoardingGate(history.gate).gate, conflicted: history.conflicted === true } : null;
  for (const snapshot of [previous, incoming]) {
    const candidate = sourceGateUpdate(event, snapshot, now);
    if (!candidate) continue;
    if (!result || candidate.sourceUpdatedAtEpochMs > result.sourceUpdatedAtEpochMs) result = { sourceUpdatedAtEpochMs: candidate.sourceUpdatedAtEpochMs, gate: candidate.gate, conflicted: false };
    else if (candidate.sourceUpdatedAtEpochMs === result.sourceUpdatedAtEpochMs && candidate.gate !== result.gate) result.conflicted = true;
  }
  return result;
}

/** Retain the last proven source update while it is fresh. A later receipt,
 * missing proof or older source response cannot erase a pending choice. Keep
 * its original receipt time too; this never makes old evidence fresh again. */
export function retainLatestGateEvidence<T extends RadarGateSnapshot>(event: NextFlightLike, previous: T | null, incoming: T, now = Date.now()): T {
  const before = sourceGateUpdate(event, previous, now), after = sourceGateUpdate(event, incoming, now);
  return previous && before && (!after || after.sourceUpdatedAtEpochMs < before.sourceUpdatedAtEpochMs) ? previous : incoming;
}

function manualGateReview(event: NextFlightLike, radar: RadarGateSnapshot | null, manual: ManualGateEntry | null, sourceGate: string, stale: boolean, now: number): ManualGateReviewInfo {
  const none: ManualGateReviewInfo = { state: 'none', candidate: null };
  if (!manual || !sourceGate || !radar || stale) return none;
  if ([upper(manual.flight), manual.date, upper(manual.origin), upper(manual.destination)].join('|') !== manualGateIdentity(event)) return { state: 'unverified', candidate: null };
  if (sourceGate === manual.gate) return { state: 'matching', candidate: null };
  const candidate = sourceGateUpdate(event, radar, now);
  if (!candidate) return { state: 'unverified', candidate: null };
  const { fingerprint, sourceUpdatedAtEpochMs: at } = candidate;
  const watermark = radar.gateUpdateWatermark;
  if (watermark && typeof watermark.sourceUpdatedAtEpochMs === 'number' && watermark.sourceUpdatedAtEpochMs > at) return { state: 'older', candidate };
  if (watermark?.sourceUpdatedAtEpochMs === at && watermark.conflicted === true) return { state: 'unverified', candidate: null };
  const review = manual.sourceReview;
  if (review?.action === 'keep' && review.fingerprint === fingerprint && Number.isFinite(review.decidedAtEpochMs) && review.decidedAtEpochMs <= now) return { state: 'kept', candidate };
  const decidedAt = review && ['keep', 'accept'].includes(review.action) && Number.isFinite(review.decidedAtEpochMs) && review.decidedAtEpochMs <= now ? review.decidedAtEpochMs : 0;
  const baseline = Math.max(Number(manual.setAtEpochMs), decidedAt);
  if (!Number.isFinite(baseline) || baseline <= 0 || baseline > now || at <= baseline) return { state: 'older', candidate };
  return { state: 'newer', candidate };
}

/** Compare-and-review token, scoped by the caller to its account and occurrence. */
export function manualGateRevision(entry: ManualGateEntry | null, account: string): string {
  return entry ? JSON.stringify([account, entry.gate, entry.terminal || '', entry.setAtEpochMs, entry.sourceReview || null]) : '';
}

export type ManualGateReviewWriteResult = { ok: true; entry: ManualGateEntry } | { ok: false; message: string };

/** Explicit local choice only. Re-read manual and source before the one storage write.
 * The host must also revalidate its current account/session before calling. */
export function writeManualGateReview(storage: StorageLike, account: string, event: NextFlightLike,
  input: { action: 'keep' | 'accept'; expectedManualRevision: string; expectedSourceFingerprint: string; author: string }, now = Date.now()): ManualGateReviewWriteResult {
  const reject = (): ManualGateReviewWriteResult => ({ ok: false, message: 'Os dados mudaram. Reveja o portão antes de confirmar.' });
  if (!account || account === 'local' || !Number.isFinite(now) || now <= 0 || !['keep', 'accept'].includes(input.action)) return reject();
  const manual = readManualGate(storage, account, event);
  if (!manual || manualGateRevision(manual, account) !== input.expectedManualRevision) return reject();
  const radar = readCachedRadarForFlight(storage, event, now);
  const info = resolveNextFlightGate({ event, manual, radar, now });
  const candidate = info.manualReview.candidate;
  if (info.manualReview.state !== 'newer' || !candidate || candidate.fingerprint !== input.expectedSourceFingerprint) return reject();
  // Preserve other local entries, including a manual change made since the first read.
  const map = readMap(storage, account), identity = manualGateIdentity(event);
  const current = readManualGate({ getItem: () => JSON.stringify(map), setItem() {} }, account, event);
  if (manualGateRevision(current, account) !== input.expectedManualRevision) return reject();
  const entry: ManualGateEntry = { ...manual, sourceReview: { action: input.action, decidedAtEpochMs: now, fingerprint: candidate.fingerprint,
    sourceGate: candidate.gate, sourceUpdatedAtEpochMs: candidate.sourceUpdatedAtEpochMs, provider: candidate.provider } };
  if (input.action === 'accept') {
    entry.gate = candidate.gate;
    entry.setAtEpochMs = now;
    entry.author = text(input.author).slice(0, 60) || 'Este dispositivo';
  }
  map[identity] = entry;
  try { storage.setItem(MANUAL_GATE_PREFIX + account, JSON.stringify(map)); }
  catch { return { ok: false, message: 'Não foi possível salvar a escolha neste dispositivo.' }; }
  return { ok: true, entry };
}

const ABSOLUTE_INSTANT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:(Z)|([+-])(\d{2}):?(\d{2}))$/;

/** Instante absoluto válido informado pela fonte (data, hora e fuso coerentes); caso contrário NaN. */
export function sourceInstantEpochMs(value: unknown): number {
  const match = ABSOLUTE_INSTANT.exec(text(value));
  if (!match) return NaN;
  const [, y, mo, d, h, mi, sec = '0', zulu, sign, oh = '0', om = '0'] = match;
  const [year, month, day, hour, minute, second, offH, offM] = [y, mo, d, h, mi, sec, oh, om].map(Number);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return NaN;
  if (!zulu && (offH > 14 || offM > 59 || (offH === 14 && offM > 0))) return NaN;
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return NaN;
  const offsetMs = zulu ? 0 : (sign === '-' ? -1 : 1) * (offH * 60 + offM) * 60_000;
  return wall - offsetMs;
}

/**
 * Prova de que o dado da fonte é desta ocorrência do voo: só um instante absoluto válido
 * (com fuso) comparado à partida da escala. Hora solta, data sem fuso, valor malformado
 * ou ausente não provam nada e falham fechado.
 */
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
    const plannedEpoch = radarSourceEpoch(radar.scheduledDepartureUtc);
    const occurrence = !Number.isFinite(plannedEpoch) || !Number.isFinite(departureEpochMs)
      ? 'unproven' : plannedEpoch === departureEpochMs ? 'match' : 'other';
    if (radar.ok !== true) radarRejected = 'not-ok';
    else if (upper(radar.flight) && canonicalFlightId(radar.flight) !== canonicalFlightId(event.flightNumber)) radarRejected = 'other-flight';
    else if ((sourceOrigin && sourceOrigin !== upper(event.origin)) || (sourceDestination && sourceDestination !== upper(event.destination))) radarRejected = 'other-segment';
    else if (occurrence === 'other') radarRejected = 'other-day';
    else if (occurrence === 'unproven') radarRejected = 'unproven-day';
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
    operationalDate: flightPublishedDate(event),
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
    manualReview: manualGateReview(event, radar, manual, radarGate.gate, radarStale, now),
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
  if (event.kind !== 'flight' || event.placeholder || !flightOperationalDate(event)) return null;
  try {
    const parsed = JSON.parse(storage.getItem(radarSnapshotStorageKey(event)) || 'null') as RadarCacheRecord | null;
    if (!parsed || !parsed.updatedAt || now - Number(parsed.updatedAt) > RADAR_SNAPSHOT_TTL_MS) return null;
    if (canonicalFlightId(parsed.flight) !== canonicalFlightId(event.flightNumber)
      || parsed.operationalDate !== flightOperationalDate(event)
      || upper(parsed.origin) !== upper(event.origin)
      || upper(parsed.destination) !== upper(event.destination)) return null;
    const plannedEpoch = radarSourceEpoch(parsed.scheduledDepartureUtc);
    if (!Number.isFinite(plannedEpoch) || plannedEpoch !== flightDepartureEpochMs(event)) return null;
    return parsed;
  } catch {
    return null;
  }
}
