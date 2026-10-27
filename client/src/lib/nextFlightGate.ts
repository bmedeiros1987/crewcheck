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
 *
 * Ordem do portão (docs/gate-behavior-rule.md):
 *  1. manual vinculado à partida — sempre prevalece;
 *  2. 'radar': fonte com hora de observação do campo comprovada — alerta, Pulse e relógio;
 *  3. 'reported': fonte respondeu para esta partida exata, sem hora de observação — aparece
 *     como "informado pela fonte" por até 30 min após o recebimento; nunca alerta nem Pulse.
 */

export const NEXT_FLIGHT_DEPARTED_GRACE_MS = 20 * 60 * 1000;
export const RADAR_GATE_STALE_MS = 30 * 60 * 1000;
export const GATE_ALERT_WINDOW_BEFORE_MS = 8 * 60 * 60 * 1000;
export const GATE_ALERT_WINDOW_AFTER_MS = 60 * 60 * 1000;
const MANUAL_GATE_PREFIX = 'crewcheck:manual-gate:v1:';
const MANUAL_OPERATIONAL_PREFIX = 'crewcheck:manual-gate:v2:';
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
  registration?: string;
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
  registration?: string;
  operationalEvidence?: Partial<Record<'gate' | 'status' | 'registration', OperationalFieldEvidence>>;
  operationalConflicts?: Array<'gate' | 'status' | 'registration'>;
  departure?: string;
  scheduledDepartureUtc?: string;
  operationalDeparture?: string;
  updatedAt?: number;
  sourceOrigin?: string;
  sourceDestination?: string;
  quality?: number;
  alternatives?: number;
  /** Public provider key of the winning response (e.g. 'flightaware'); labels a reported gate. */
  provider?: string;
  /** Source-produced departure-gate update, never the local fetch/cache clock. */
  gateUpdate?: GateSourceUpdate | null;
  gateUpdateWatermark?: GateUpdateWatermark | null;
  /** Original receipt anchor of retained gate evidence, independent of live status. */
  gateEvidenceReceivedAt?: number;
  origin?: string;
  destination?: string;
};

export type OperationalFieldEvidence = { version: 1; value: string; sourceObservedAt: string; provenance: string; conflict?: boolean };
export type ManualOperationalField = { value: string; author: string; setAtEpochMs: number };
export type BoardingType = 'unknown' | 'remote' | 'finger';
export type ManualBoardingType = ManualOperationalField & { value: Exclude<BoardingType, 'unknown'>; gate: string; gateSetAtEpochMs: number };
type ManualOperationalGate = ManualOperationalField & {terminal?:string;sourceReview?:ManualGateSourceReview;boardingType?:ManualBoardingType};
type ManualOperationalEntry = { legacyGateDismissed?:true; gate?:ManualOperationalGate; owner: string; flight: string; date: string; origin: string; destination: string; scheduledDepartureUtc: string; status?: ManualOperationalField; registration?: ManualOperationalField };

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
  scheduledDepartureUtc?: string;
  operationalStatus?: ManualOperationalField;
  operationalRegistration?: ManualOperationalField;
  operationalScheduledDepartureUtc?: string;
  boardingType?: ManualBoardingType;
};

export type ManualGateReviewInfo = {
  state: 'none' | 'matching' | 'unverified' | 'older' | 'newer' | 'kept';
  candidate: { gate: string; provider: 'custom'; sourceUpdatedAtEpochMs: number; fingerprint: string } | null;
};

export type GateSource = 'manual' | 'radar' | 'reported' | 'roster';

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
  /** Phone/web manual declaration only; never changes the legacy Wear remote boolean. */
  boardingType: BoardingType;
  manualBoardingType: ManualBoardingType | null;
  gateSource: GateSource | null;
  terminal: string;
  status: string;
  statusSource: 'manual' | 'radar' | null;
  plannedStatus: string;
  plannedGate: string;
  registration: string;
  registrationSource: 'manual' | 'radar' | null;
  manualStatus: ManualOperationalField | null;
  manualRegistration: ManualOperationalField | null;
  conflicts: { gate: boolean; status: boolean; registration: boolean };
  operationalConflicts: Array<'gate' | 'status' | 'registration'>;
  manualGateUnlinked: boolean;
  updatedAtEpochMs: number;
  radarUpdatedAtEpochMs: number;
  /** Internal projection metadata; never serialized into the Wear v1 contract. */
  automaticFieldValidUntilEpochMs: Partial<Record<'gate' | 'status' | 'registration', number>>;
  /** O portão exibido vem do Radar (base para a validade no relógio). */
  usesRadar: boolean;
  /** Fonte que informou um portão sem observação comprovada ('reported'). */
  reportedProvider: string;
  stale: boolean;
  radarRejected: '' | 'not-ok' | 'other-flight' | 'other-segment' | 'other-day' | 'unproven-day' | 'position';
  divergence: { manualGate: string; sourceGate: string; source: 'radar' | 'reported' | 'roster' } | null;
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
  return raw && raw.length <= 80 && !EMPTY_VALUES.test(raw.toUpperCase()) && !/aguardando|monitorando|n[aã]o confirmado/i.test(raw) ? raw : '';
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
  const normalized = normalizeBoardingGate(entry?.gate);
  const fields = readManualOperational(storage, account, event);
  const legacy = !fields?.legacyGateDismissed && normalized.gate && Number.isFinite(Number(entry?.setAtEpochMs)) ? entry : null;
  if (!legacy && !fields?.gate && !fields?.status && !fields?.registration) return null;
  const base = fields?.gate ? {gate:fields.gate.value,terminal:fields.gate.terminal,sourceReview:fields.gate.sourceReview,author:fields.gate.author,setAtEpochMs:fields.gate.setAtEpochMs,flight:fields.flight,date:fields.date,origin:fields.origin,destination:fields.destination,scheduledDepartureUtc:fields.scheduledDepartureUtc} : legacy ? { ...legacy, gate: normalized.gate, terminal: cleanTerminal(legacy.terminal) } : {
    gate: '', flight: upper(event.flightNumber), date: flightPublishedDate(event), origin: upper(event.origin), destination: upper(event.destination),
    setAtEpochMs: 0, author: '',
  };
  // Never adopt optional status/registration fields from a legacy v1 record.
  return { ...base, boardingType: fields?.gate?.boardingType, operationalStatus: fields?.status, operationalRegistration: fields?.registration, operationalScheduledDepartureUtc: fields?.scheduledDepartureUtc };
}

function operationalIdentity(event: NextFlightLike): string {
  const utc = sourceInstantEpochMs(event.canonical?.startDateTime);
  return manualGateIdentity(event).split('|').every(Boolean) && Number.isFinite(utc)
    ? manualGateIdentity(event) + '|' + new Date(utc).toISOString() : '';
}
function operationalMap(storage: StorageLike, account: string): Record<string, ManualOperationalEntry> {
  try { const data = JSON.parse(storage.getItem(MANUAL_OPERATIONAL_PREFIX + account) || '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; } catch { return {}; }
}
function cleanRegistration(value: unknown): string {
  const raw = upper(value);
  return raw.length >= 3 && raw.length <= 16 && /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(raw) && !EMPTY_VALUES.test(raw) && !/CONFIRM|INFORMAD/.test(raw) ? raw : '';
}
function validManualField(field: ManualOperationalField | undefined, normalizer: (value: unknown) => string): ManualOperationalField | undefined {
  return field && typeof field.value === 'string' && normalizer(field.value) === field.value && Boolean(field.value)
    && typeof field.author === 'string' && Boolean(field.author.trim()) && field.author.length <= 60
    && typeof field.setAtEpochMs === 'number' && Number.isFinite(field.setAtEpochMs) && field.setAtEpochMs > 0 ? field : undefined;
}
/** Only a declaration saved with this exact gate revision is meaningful. Missing
 * metadata (including legacy records) is unknown, never an airport inference. */
function validManualBoardingType(field: ManualBoardingType | undefined, gate: string, gateSetAtEpochMs: number): ManualBoardingType | undefined {
  if (!field || !['remote', 'finger'].includes(field.value) || field.gate !== gate
    || field.gateSetAtEpochMs !== gateSetAtEpochMs || field.setAtEpochMs !== gateSetAtEpochMs
    || !validManualField(field, value => value === 'remote' || value === 'finger' ? value : '')
    || (field.value === 'finger' && normalizeBoardingGate(gate).remote)) return undefined;
  return { value: field.value, gate: field.gate, gateSetAtEpochMs: field.gateSetAtEpochMs, author: field.author, setAtEpochMs: field.setAtEpochMs };
}

export function boardingTypeLabel(value: BoardingType): string {
  return value === 'remote' ? 'Remota' : value === 'finger' ? 'Finger' : 'Não confirmado';
}

function readManualOperational(storage: StorageLike, account: string, event: NextFlightLike): ManualOperationalEntry | null {
  if (!account || account === 'local') return null;
  const identity = operationalIdentity(event), entry = operationalMap(storage, account)[identity];
  if (!identity || !entry || entry.owner !== account || ![entry.flight,entry.date,entry.origin,entry.destination,entry.scheduledDepartureUtc].every(value=>typeof value==='string')
    || [entry.flight,entry.date,entry.origin,entry.destination,entry.scheduledDepartureUtc].join('|') !== identity) return null;
  const status = validManualField(entry.status, cleanStatus), registration = validManualField(entry.registration, cleanRegistration);
  const gate = validManualField(entry.gate,value=>normalizeBoardingGate(value).gate) ? { ...entry.gate!, boardingType: validManualBoardingType(entry.gate?.boardingType, entry.gate!.value, entry.gate!.setAtEpochMs) } : undefined;
  return gate || status || registration || entry.legacyGateDismissed===true ? { ...entry, gate, status, registration, ...(entry.legacyGateDismissed===true?{legacyGateDismissed:true}:{}) } : null;
}

/** Same manual domain, versioned exact-occurrence fields. No Radar/cache writes.
 * An omitted field is preserved; null removes only that field, never v1 gate. */
export function patchManualOperationalFields(storage: StorageLike, account: string, event: NextFlightLike,
  patch: { status?: string | null; registration?: string | null }, author: string, now = Date.now()): ManualGateWriteResult {
  const identity = operationalIdentity(event);
  if (!identity || !account || account === 'local' || event.kind !== 'flight' || event.placeholder) return { ok: false, message: 'Conta e ocorrência publicada precisam estar confirmadas.' };
  if (!Number.isFinite(now) || now <= 0) return { ok: false, message: 'Horário da informação não confirmado.' };
  const map = operationalMap(storage, account), previous = readManualOperational(storage, account, event);
  const [flight,date,origin,destination,scheduledDepartureUtc] = identity.split('|');
  const entry: ManualOperationalEntry = { owner:account,flight,date,origin,destination,scheduledDepartureUtc, ...(previous?.legacyGateDismissed?{legacyGateDismissed:true}:{}), ...(previous?.gate ? {gate:previous.gate} : {}), ...(previous?.status ? {status:previous.status} : {}), ...(previous?.registration ? {registration:previous.registration} : {}) };
  for (const field of ['status','registration'] as const) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    if (patch[field] === null) { delete entry[field]; continue; }
    if (typeof patch[field] !== 'string') return {ok:false,message:'Informe o campo ou remova explicitamente a informação.'};
    const value = field === 'status' ? cleanStatus(patch[field]) : cleanRegistration(patch[field]);
    if (!value || value.length > (field === 'status' ? 80 : 16)) return {ok:false,message:field === 'status' ? 'Status inválido ou não confirmado.' : 'Matrícula inválida ou não confirmada.'};
    entry[field] = { value, author: text(author).slice(0,60) || 'Você', setAtEpochMs: now };
  }
  if (entry.gate || entry.status || entry.registration || entry.legacyGateDismissed) map[identity] = entry; else delete map[identity];
  try { storage.setItem(MANUAL_OPERATIONAL_PREFIX + account, JSON.stringify(map)); } catch { return {ok:false,message:'Não foi possível salvar neste dispositivo.'}; }
  return { ok:true, entry:readManualGate(storage,account,event) };
}

export type ManualGateWriteResult = { ok: true; entry: ManualGateEntry | null } | { ok: false; message: string };

/** Salva (ou remove, com gate vazio) o portão informado para este voo e esta data. */
export function writeManualGate(
  storage: StorageLike,
  account: string,
  event: NextFlightLike,
  input: { gate: string; terminal?: string; author: string; boardingType?: BoardingType; expectedManualRevision?: string },
  now = Date.now(),
): ManualGateWriteResult {
  const identity = operationalIdentity(event);
  if (!identity || !account || account === 'local' || event.kind !== 'flight' || event.placeholder || !Number.isFinite(now) || now <= 0) return {ok:false,message:'Conta e ocorrência publicada precisam estar confirmadas.'};
  const typed = Object.prototype.hasOwnProperty.call(input, 'boardingType');
  // One local record/write for gate + type. A stale rendered editor must not
  // overwrite a newer gate or review; no asynchronous work occurs after this check.
  if ((typed || input.expectedManualRevision !== undefined) && (typeof input.expectedManualRevision !== 'string'
    || manualGateRevision(readManualGate(storage,account,event),account,event) !== input.expectedManualRevision)) return {ok:false,message:'Os dados mudaram. Reveja o portão antes de salvar.'};
  if (typed && !['unknown','remote','finger'].includes(input.boardingType!)) return {ok:false,message:'Tipo de embarque inválido.'};
  const map=operationalMap(storage,account),previous=readManualOperational(storage,account,event);
  const [flight,date,origin,destination,scheduledDepartureUtc]=identity.split('|');
  const entry:ManualOperationalEntry={owner:account,flight,date,origin,destination,scheduledDepartureUtc,...(previous?.legacyGateDismissed?{legacyGateDismissed:true}:{}),...(previous?.gate?{gate:previous.gate}:{}),...(previous?.status?{status:previous.status}:{}),...(previous?.registration?{registration:previous.registration}:{})};
  if (!text(input.gate)) {delete entry.gate;entry.legacyGateDismissed=true;}
  else {
    const normalized=normalizeBoardingGate(input.gate);
    if (normalized.position) return {ok:false,message:'Informe o portão de embarque, não a posição da aeronave.'};
    if (!normalized.gate) return {ok:false,message:'Portão inválido. Use até 12 caracteres, por exemplo 24 ou 7A.'};
    if (input.boardingType === 'finger' && normalized.remote) return {ok:false,message:'O portão contém indicação de remota. Corrija o portão antes de selecionar Finger.'};
    delete entry.legacyGateDismissed;
    const author=text(input.author).slice(0,60)||'Você';
    entry.gate={value:normalized.gate,terminal:cleanTerminal(input.terminal),author,setAtEpochMs:now};
    if (input.boardingType === 'remote' || input.boardingType === 'finger') entry.gate.boardingType={value:input.boardingType,gate:normalized.gate,gateSetAtEpochMs:now,author,setAtEpochMs:now};
  }
  if(entry.gate||entry.status||entry.registration||entry.legacyGateDismissed)map[identity]=entry;else delete map[identity];
  if ((typed || input.expectedManualRevision !== undefined) && manualGateRevision(readManualGate(storage,account,event),account,event) !== input.expectedManualRevision) return {ok:false,message:'Os dados mudaram. Reveja o portão antes de salvar.'};
  try{storage.setItem(MANUAL_OPERATIONAL_PREFIX+account,JSON.stringify(map));}catch{return {ok:false,message:'Não foi possível salvar neste dispositivo.'};}
  return {ok:true,entry:entry.gate?readManualGate(storage,account,event):null};
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
  const receipt = radar?.gateEvidenceReceivedAt ?? radar?.updatedAt;
  if (typeof receipt !== 'number' || !Number.isFinite(receipt) || receipt <= 0 || receipt > now || now - receipt > RADAR_GATE_STALE_MS) return null;
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

/** Keep only the last proven gate and its original receipt anchor while fresh.
 * Status, operational times, aircraft, terminal and query receipt remain live. */
export function retainLatestGateEvidence<T extends RadarGateSnapshot>(event: NextFlightLike, previous: T | null, incoming: T, now = Date.now()): T {
  const before = sourceGateUpdate(event, previous, now);
  const after = sourceGateUpdate(event, { ...incoming, updatedAt: now }, now);
  return previous && before && (!after || after.sourceUpdatedAtEpochMs < before.sourceUpdatedAtEpochMs)
    ? { ...incoming, gate: previous.gate, gateUpdate: previous.gateUpdate, gateEvidenceReceivedAt: previous.gateEvidenceReceivedAt ?? previous.updatedAt }
    : incoming;
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
export function manualGateRevision(entry: ManualGateEntry | null, account: string, event?: NextFlightLike): string {
  const parts: unknown[] | null = entry ? [account, entry.gate, entry.terminal || '', entry.setAtEpochMs, entry.sourceReview || null, entry.scheduledDepartureUtc || ''] : null;
  // Preserve existing untyped notice/review revisions byte-for-byte on upgrade.
  if (parts && entry?.boardingType) parts.push(entry.boardingType);
  const revision = parts ? JSON.stringify(parts) : '';
  // Editor writes additionally bind even an empty record to its exact occurrence.
  return event ? JSON.stringify(['manual-gate-editor:v1',account,operationalIdentity(event),revision]) : revision;
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
  // Re-read the same exact occurrence before patching its gate alone.
  const map=operationalMap(storage,account),identity=operationalIdentity(event),current=readManualGate(storage,account,event),stored=readManualOperational(storage,account,event);
  if (!identity || !current || manualGateRevision(current,account)!==input.expectedManualRevision) return reject();
  const currentInfo=resolveNextFlightGate({event,manual:current,radar,now});
  if(currentInfo.manualReview.state!=='newer'||currentInfo.manualReview.candidate?.fingerprint!==input.expectedSourceFingerprint) return reject();
  const [flight,date,origin,destination,scheduledDepartureUtc]=identity.split('|');
  const entry=stored||{owner:account,flight,date,origin,destination,scheduledDepartureUtc};
  // An explicit keep/accept may migrate a UTC-bound v1 gate. Copy only the
  // validated gate fields; legacy status/registration and v1 bytes stay untouched.
  const priorGate=entry.gate||{value:current.gate,terminal:cleanTerminal(current.terminal),author:current.author,setAtEpochMs:current.setAtEpochMs};
  const gate:ManualOperationalGate={...priorGate,sourceReview:{action:input.action,decidedAtEpochMs:now,fingerprint:candidate.fingerprint,sourceGate:candidate.gate,sourceUpdatedAtEpochMs:candidate.sourceUpdatedAtEpochMs,provider:candidate.provider}};
  if(input.action==='accept'){delete gate.boardingType;gate.value=candidate.gate;gate.author=text(input.author).slice(0,60)||'Você';gate.setAtEpochMs=now;}
  map[identity]={owner:account,flight:entry.flight,date:entry.date,origin:entry.origin,destination:entry.destination,scheduledDepartureUtc:entry.scheduledDepartureUtc,gate,
    ...(entry.legacyGateDismissed?{legacyGateDismissed:true}:{}),...(entry.status?{status:entry.status}:{}),...(entry.registration?{registration:entry.registration}:{})};
  try{storage.setItem(MANUAL_OPERATIONAL_PREFIX+account,JSON.stringify(map));}catch{return {ok:false,message:'Não foi possível salvar a escolha neste dispositivo.'};}
  return {ok:true,entry:readManualGate(storage,account,event)!};
}

const ABSOLUTE_INSTANT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:(Z)|([+-])(\d{2}):?(\d{2}))$/;

/** Instante absoluto válido informado pela fonte (data, hora e fuso coerentes); caso contrário NaN. */
export function sourceInstantEpochMs(value: unknown): number {
  if (typeof value !== 'string') return NaN;
  const match = ABSOLUTE_INSTANT.exec(text(value));
  if (!match) return NaN;
  const [, y, mo, d, h, mi, sec = '0', zulu, sign, oh = '0', om = '0'] = match;
  const [year, month, day, hour, minute, second, offH, offM] = [y, mo, d, h, mi, sec, oh, om].map(Number);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return NaN;
  if (!zulu && (offH > 14 || offM > 59 || (offH === 14 && offM > 0))) return NaN;
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return NaN;
  // The validated primitive includes an explicit offset. Preserve fractional
  // milliseconds: truncating to seconds could admit a future source sample.
  return Date.parse(text(value));
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
  const candidateManual = input.manual || null;
  const manual = candidateManual && [upper(candidateManual.flight),candidateManual.date,upper(candidateManual.origin),upper(candidateManual.destination)].join('|') === manualGateIdentity(event) ? candidateManual : null;
  const linkedManualGate = Boolean(manual?.gate && validManualField({value:manual.gate,author:manual.author,setAtEpochMs:manual.setAtEpochMs},value=>normalizeBoardingGate(value).gate)
    && manual.setAtEpochMs <= now && Number.isFinite(departureEpochMs) && sourceInstantEpochMs(manual.scheduledDepartureUtc) === departureEpochMs);

  let radarRejected: NextFlightGateInfo['radarRejected'] = '';
  let radar: RadarGateSnapshot | null = input.radar || null;
  if (radar) {
    const sourceOrigin = upper(radar.sourceOrigin);
    const sourceDestination = upper(radar.sourceDestination);
    const plannedEpoch = radarSourceEpoch(radar.scheduledDepartureUtc);
    const occurrence = !Number.isFinite(plannedEpoch) || !Number.isFinite(departureEpochMs)
      ? 'unproven' : plannedEpoch === departureEpochMs ? 'match' : 'other';
    if (radar.ok !== true) radarRejected = 'not-ok';
    else if (!upper(radar.flight) || canonicalFlightId(radar.flight) !== canonicalFlightId(event.flightNumber)) radarRejected = 'other-flight';
    else if (!sourceOrigin || !sourceDestination || sourceOrigin !== upper(event.origin) || sourceDestination !== upper(event.destination)) radarRejected = 'other-segment';
    else if (occurrence === 'other') radarRejected = 'other-day';
    else if (occurrence === 'unproven') radarRejected = 'unproven-day';
    if (radarRejected) radar = null;
  }

  const receipt = typeof radar?.updatedAt === 'number' ? radar.updatedAt : 0;
  const receivedFresh = receipt > 0 && receipt <= now && now - receipt <= RADAR_GATE_STALE_MS;
  const conflicted = (field:'gate'|'status'|'registration') => radar?.operationalEvidence?.[field]?.conflict === true || (Array.isArray(radar?.operationalConflicts) && radar.operationalConflicts.includes(field));
  const conflicts = { gate:conflicted('gate'), status:conflicted('status'), registration:conflicted('registration') };
  const gateHistoryBlocks = (observed:number) => {
    const watermark=radar?.gateUpdateWatermark,at=watermark?.sourceUpdatedAtEpochMs;
    const blocks=typeof at==='number'&&Number.isFinite(at)&&at>0&&at<=now&&(at>observed||(at===observed&&watermark?.conflicted===true));
    if(blocks)conflicts.gate=true;
    return blocks;
  };
  const automaticFieldValidUntilEpochMs: NextFlightGateInfo['automaticFieldValidUntilEpochMs'] = {};
  const fieldValue = (field: 'gate' | 'status' | 'registration'): string => {
    if (!radar || !receivedFresh || conflicts[field]) return '';
    const normalize = field === 'gate' ? (value:unknown)=>normalizeBoardingGate(value).gate : field === 'status' ? cleanStatus : cleanRegistration;
    const evidence = radar.operationalEvidence?.[field], value = normalize(radar[field]);
    const observed = sourceInstantEpochMs(evidence?.sourceObservedAt);
    if (value && evidence?.version === 1 && typeof evidence.value === 'string' && normalize(evidence.value) === value
      && typeof evidence.provenance === 'string' && Boolean(evidence.provenance.trim()) && Number.isFinite(observed)
      && observed <= now && observed <= receipt && now - observed <= RADAR_GATE_STALE_MS) {
      if (field === 'gate' && gateHistoryBlocks(observed)) return '';
      automaticFieldValidUntilEpochMs[field] = Math.min(receipt, observed) + RADAR_GATE_STALE_MS;
      return value;
    }
    if (field === 'gate') {
      const proof = sourceGateUpdate(event,radar,now);
      if (proof && proof.sourceUpdatedAtEpochMs <= receipt && now - proof.sourceUpdatedAtEpochMs <= RADAR_GATE_STALE_MS) {
        if (gateHistoryBlocks(proof.sourceUpdatedAtEpochMs)) return '';
        automaticFieldValidUntilEpochMs.gate = Math.min(receipt, proof.sourceUpdatedAtEpochMs) + RADAR_GATE_STALE_MS;
        return proof.gate;
      }
    }
    return '';
  };
  const radarGate = normalizeBoardingGate(fieldValue('gate'));
  if (radar && normalizeBoardingGate(radar.gate).position) radarRejected = 'position';
  // Reported: the exact occurrence answered with a gate but no field observation instant.
  // Shown as provider-reported for the receipt window; never confirmed, alerted or pulsed.
  const reportedGate = (() => {
    // A source that sent field evidence or a gate update spoke about observation; when that
    // proof fails (stale, mismatched, conflicting) the gate stays hidden, never "reported".
    if (radarGate.gate || !radar || !receivedFresh || conflicts.gate || radar.operationalEvidence?.gate || radar.gateUpdate) return normalizeBoardingGate('');
    const value = normalizeBoardingGate(radar.gate), watermark = radar.gateUpdateWatermark;
    if (!value.gate || (watermark && watermark.gate !== value.gate)) return normalizeBoardingGate('');
    automaticFieldValidUntilEpochMs.gate = receipt + RADAR_GATE_STALE_MS;
    return value;
  })();
  const rosterGate = normalizeBoardingGate(event.gate);
  const radarGateReceipt = radar?.gateEvidenceReceivedAt ?? radar?.updatedAt;
  const radarUpdatedAt = radar && Number(radarGateReceipt) > 0 && Number(radarGateReceipt) <= now + 60_000 ? Number(radarGateReceipt) : 0;
  const radarStale = Boolean(radar) && (!radarUpdatedAt || now - radarUpdatedAt > RADAR_GATE_STALE_MS);

  const sourceGate = radarGate.gate ? { ...radarGate, source: 'radar' as const }
    : reportedGate.gate ? { ...reportedGate, source: 'reported' as const } : null;

  let gate = '';
  let remote = false;
  let gateSource: GateSource | null = null;
  if (linkedManualGate && manual) {
    gate = manual.gate;
    remote = REMOTE_VALUES.test(manual.gate);
    gateSource = 'manual';
  } else if (sourceGate) {
    gate = sourceGate.gate;
    remote = sourceGate.remote;
    gateSource = sourceGate.source;
  }

  const divergence = linkedManualGate && manual && sourceGate && sourceGate.gate !== manual.gate
    ? { manualGate: manual.gate, sourceGate: sourceGate.gate, source: sourceGate.source }
    : null;

  const radarStatus = fieldValue('status'), radarRegistration = fieldValue('registration');
  const rosterStatus = cleanStatus(event.status);
  const exactManual = manual && Number.isFinite(departureEpochMs) && sourceInstantEpochMs(manual.operationalScheduledDepartureUtc) === departureEpochMs;
  const statusField = exactManual ? validManualField(manual.operationalStatus,cleanStatus) : undefined;
  const registrationField = exactManual ? validManualField(manual.operationalRegistration,cleanRegistration) : undefined;
  const manualStatus = statusField && statusField.setAtEpochMs <= now ? statusField : null;
  const manualRegistration = registrationField && registrationField.setAtEpochMs <= now ? registrationField : null;
  const terminal = gateSource === 'manual' ? cleanTerminal(manual?.terminal) : '';
  if (manualStatus && radarStatus && manualStatus.value !== radarStatus) conflicts.status = true;
  if (manualRegistration && radarRegistration && manualRegistration.value !== radarRegistration) conflicts.registration = true;
  if (divergence) conflicts.gate = true;

  const declaredType = linkedManualGate && manual ? validManualBoardingType(manual.boardingType,manual.gate,manual.setAtEpochMs) : undefined;
  // Manual declarations retain the existing manual-input lifecycle. This is
  // provenance, not a fresh provider observation or an airport-wide mapping.
  const manualBoardingType = declaredType && declaredType.setAtEpochMs <= now ? declaredType : null;
  const updatedAtEpochMs = gateSource === 'manual' ? manual!.setAtEpochMs : radarUpdatedAt;
  const stale = (gateSource === 'radar' || gateSource === 'reported' || Boolean(radarStatus)) && radarStale;

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
    boardingType: manualBoardingType?.value || 'unknown',
    manualBoardingType,
    gateSource,
    terminal,
    status: manualStatus?.value || radarStatus,
    statusSource: manualStatus ? 'manual' : radarStatus ? 'radar' : null,
    registration: manualRegistration?.value || radarRegistration,
    registrationSource: manualRegistration ? 'manual' : radarRegistration ? 'radar' : null,
    plannedStatus: rosterStatus,
    plannedGate: rosterGate.gate,
    manualStatus, manualRegistration, conflicts,
    operationalConflicts: (['gate','status','registration'] as const).filter(field=>conflicts[field]),
    manualGateUnlinked: Boolean(manual?.gate && !linkedManualGate),
    updatedAtEpochMs,
    radarUpdatedAtEpochMs: radarUpdatedAt,
    automaticFieldValidUntilEpochMs,
    usesRadar: gateSource === 'radar',
    reportedProvider: gateSource === 'reported' || divergence?.source === 'reported' ? providerLabel(radar?.provider) : '',
    stale,
    radarRejected,
    divergence,
    manual,
    manualReview: linkedManualGate && manual ? manualGateReview(event, radar, manual, radarGate.gate, radarStale, now) : {state:'none',candidate:null},
  };
}

/** Rótulo do portão para telas e relógio. Nunca inventa valor. */
export function statusSourceLabel(info: Pick<NextFlightGateInfo, 'statusSource'>): string {
  if (info.statusSource === 'manual') return 'Informado por você · preservado neste dispositivo';
  if (info.statusSource === 'radar') return 'Fonte operacional · observação do status comprovada';
  return 'Status operacional não confirmado';
}

const PROVIDER_LABELS: Record<string, string> = { flightaware: 'FlightAware', aerodatabox: 'AeroDataBox', airlabs: 'AirLabs', aviationstack: 'Aviationstack', custom: 'Fonte própria', 'cirium-sky': 'Cirium', 'cirium-flex': 'Cirium' };
/** Nome público da fonte; desconhecida vira um rótulo genérico, nunca texto livre da resposta. */
export function providerLabel(provider: unknown): string {
  return PROVIDER_LABELS[String(provider || '')] || 'Fonte operacional';
}

export function gateDisplay(info: Pick<NextFlightGateInfo, 'gate' | 'remote'>): string {
  if (!info.gate) return 'Não confirmado';
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
