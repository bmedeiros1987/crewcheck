import { getStoredUser } from './authClient';
import {
  comparableRosterEvents,
  compareRosters,
  rosterFingerprint,
  sameRosterPeriod,
  type ComparableRosterEvent,
  type RosterChange,
} from './rosterComparison';
import type { CrewRoster } from './pdfParser';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export type RosterChangeAwarenessRecord = {
  revisionId: string;
  occurrenceId: string;
  publicationFingerprint: string;
  period: string;
  kind: RosterChange['kind'];
  date: string;
  title: string;
  descriptions: string[];
  planned: ComparableRosterEvent | null;
  current: ComparableRosterEvent | null;
  currentRenderKey: string | null;
  detectedAt: string;
  acknowledgedAt: string | null;
};

type OccurrenceReference = { renderKey: string; occurrenceId: string };

type PublicationSnapshot = {
  roster: CrewRoster;
  fingerprint: string;
  source: string;
  recordedAt: string;
  occurrences: OccurrenceReference[];
};

export type RosterChangeAwarenessLedger = {
  version: 1;
  generation: number;
  current: PublicationSnapshot;
  active: RosterChangeAwarenessRecord[];
  history: RosterChangeAwarenessRecord[];
};

export type RosterChangeAwarenessState = {
  ledger: RosterChangeAwarenessLedger | null;
  persisted: boolean;
  message: string;
};

const PREFIX = 'crewcheck:roster-change-awareness:v1:';
const runtime = new Map<string, RosterChangeAwarenessState>();
let runtimeStarted = false;

function normalized(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function normalizedTime(value: unknown): string {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? String(Number(match[1])).padStart(2, '0') + ':' + match[2] : '';
}

function isoDate(value: unknown): string {
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return iso[1] + '-' + String(Number(iso[2])).padStart(2, '0') + '-' + String(Number(iso[3])).padStart(2, '0');
  const br = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? '20' + br[3] : br[3];
    return year + '-' + String(Number(br[2])).padStart(2, '0') + '-' + String(Number(br[1])).padStart(2, '0');
  }
  return '';
}

function hash(input: string): string {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16).padStart(8, '0');
}

function accountKey(accountId: string | null | undefined): string | null {
  const owner = String(accountId || '').trim();
  return owner ? PREFIX + encodeURIComponent(owner) : null;
}

function periodOf(roster: CrewRoster): string {
  const year = Number(roster.year || 0);
  const month = Number(roster.month || 0);
  return year && month ? year + '-' + String(month).padStart(2, '0') : '';
}

function comparableRenderBase(event: ComparableRosterEvent): string {
  return [
    event.date,
    event.kind,
    event.flightNumber,
    event.origin,
    event.destination,
    event.departure,
    event.arrival,
    event.workType,
    event.dayType,
    event.pairingCode,
  ].map(normalized).join('|');
}

export type RenderedRosterEventLike = {
  kind?: string;
  date?: Date | string;
  day?: Record<string, any>;
  leg?: Record<string, any>;
  canonical?: { startDateTime?: string };
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departure?: string;
  arrival?: string;
};

export function renderedRosterEventBase(event: RenderedRosterEventLike): string {
  const isFlight = event.kind === 'flight';
  const date = isoDate(event.day?.date)
    || isoDate(event.canonical?.startDateTime)
    || (event.date instanceof Date && Number.isFinite(event.date.getTime()) ? event.date.toISOString().slice(0, 10) : isoDate(event.date));
  const dayType = normalized(event.day?.type || event.day?.pairingCode || 'OTHER');
  const pairing = normalized(event.day?.pairingCode);
  const flight = isFlight ? normalized(event.flightNumber) : normalized(event.day?.pairingCode || dayType);
  const origin = normalized(event.origin || event.day?.base);
  const destination = normalized(event.destination || event.day?.base);
  return [
    date,
    isFlight ? 'FLIGHT' : 'ACTIVITY',
    flight,
    origin,
    destination,
    normalizedTime(event.departure || event.day?.dutyReport),
    normalizedTime(event.arrival || event.day?.dutyDebrief),
    isFlight ? normalized(event.leg?.workType || 'OP') : '',
    dayType,
    pairing,
  ].join('|');
}

export function renderedRosterEventKey(event: RenderedRosterEventLike, ordinal: number): string {
  return renderedRosterEventBase(event) + '#' + Math.max(0, ordinal);
}

function indexedEvents(roster: CrewRoster) {
  const counts = new Map<string, number>();
  return comparableRosterEvents(roster).map((event) => {
    const base = comparableRenderBase(event);
    const ordinal = counts.get(base) || 0;
    counts.set(base, ordinal + 1);
    return { event, renderKey: base + '#' + ordinal };
  });
}

function initialOccurrences(roster: CrewRoster, accountId: string): OccurrenceReference[] {
  return indexedEvents(roster).map(({ renderKey }) => ({
    renderKey,
    occurrenceId: 'occ-' + hash(accountId + '|' + periodOf(roster) + '|' + renderKey),
  }));
}

function validLedger(value: any): value is RosterChangeAwarenessLedger {
  return value?.version === 1
    && value.current?.roster
    && Array.isArray(value.current.roster.days)
    && Array.isArray(value.current.occurrences)
    && Array.isArray(value.active)
    && Array.isArray(value.history);
}

function readPersisted(storage: StorageLike, key: string): RosterChangeAwarenessLedger | null {
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    return validLedger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeState(storage: StorageLike, key: string, ledger: RosterChangeAwarenessLedger): RosterChangeAwarenessState {
  let persisted = false;
  try {
    storage.setItem(key, JSON.stringify(ledger));
    persisted = true;
  } catch {}
  const state = {
    ledger,
    persisted,
    message: persisted
      ? 'Alterações e ciências salvas nesta conta, neste dispositivo.'
      : 'Alterações visíveis nesta sessão. Não foi possível salvar a ciência neste dispositivo.',
  };
  runtime.set(key, state);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('crewcheck:roster-change-awareness', { detail: { key, persisted } }));
  }
  return state;
}

export function readRosterChangeAwareness(storage: StorageLike, accountId: string | null | undefined): RosterChangeAwarenessState {
  const key = accountKey(accountId);
  if (!key) return { ledger: null, persisted: false, message: 'Entre na sua conta para manter a ciência isolada.' };
  const live = runtime.get(key);
  if (live) return live;
  const ledger = readPersisted(storage, key);
  const state = {
    ledger,
    persisted: Boolean(ledger),
    message: ledger ? 'Alterações e ciências salvas nesta conta, neste dispositivo.' : '',
  };
  runtime.set(key, state);
  return state;
}

function recordForChange(
  change: RosterChange,
  generation: number,
  previousFingerprint: string,
  publicationFingerprint: string,
  previousById: Map<string, string>,
  currentById: Map<string, string>,
  previousOccurrences: Map<string, string>,
  now: string,
): RosterChangeAwarenessRecord {
  const plannedKey = change.planned ? previousById.get(change.planned.id) || null : null;
  const currentKey = change.current ? currentById.get(change.current.id) || null : null;
  const occurrenceId = (plannedKey && previousOccurrences.get(plannedKey))
    || 'occ-' + hash([publicationFingerprint, currentKey || plannedKey || change.id].join('|'));
  const revisionInput = JSON.stringify([
    generation,
    previousFingerprint,
    publicationFingerprint,
    occurrenceId,
    change.kind,
    change.categories,
    change.planned,
    change.current,
  ]);
  return {
    revisionId: 'rev-' + hash(revisionInput),
    occurrenceId,
    publicationFingerprint,
    period: change.date.slice(0, 7),
    kind: change.kind,
    date: change.date,
    title: change.title,
    descriptions: [...change.descriptions],
    planned: change.planned,
    current: change.current,
    currentRenderKey: currentKey,
    detectedAt: now,
    acknowledgedAt: null,
  };
}

export function registerRosterPublication(
  storage: StorageLike,
  accountId: string | null | undefined,
  roster: CrewRoster,
  source = 'Escala ativa',
  now = new Date().toISOString(),
): RosterChangeAwarenessState {
  const key = accountKey(accountId);
  const owner = String(accountId || '').trim();
  if (!key || !owner || !Array.isArray(roster.days) || !roster.days.length) {
    return { ledger: null, persisted: false, message: '' };
  }
  const fingerprint = rosterFingerprint(roster);
  const existing = runtime.get(key)?.ledger || readPersisted(storage, key);
  if (!existing || !sameRosterPeriod(existing.current.roster, roster)) {
    const ledger: RosterChangeAwarenessLedger = {
      version: 1,
      generation: 0,
      current: {
        roster,
        fingerprint,
        source,
        recordedAt: now,
        occurrences: initialOccurrences(roster, owner),
      },
      active: [],
      history: existing?.history.slice(-200) || [],
    };
    return writeState(storage, key, ledger);
  }
  if (existing.current.fingerprint === fingerprint) {
    const state = {
      ledger: existing,
      persisted: Boolean(readPersisted(storage, key)),
      message: 'Alterações e ciências salvas nesta conta, neste dispositivo.',
    };
    runtime.set(key, state);
    return state;
  }

  const comparison = compareRosters(existing.current.roster, roster);
  const previousIndexed = indexedEvents(existing.current.roster);
  const currentIndexed = indexedEvents(roster);
  const previousById = new Map(previousIndexed.map((item) => [item.event.id, item.renderKey]));
  const currentById = new Map(currentIndexed.map((item) => [item.event.id, item.renderKey]));
  const previousOccurrences = new Map(existing.current.occurrences.map((item) => [item.renderKey, item.occurrenceId]));
  const generation = existing.generation + 1;
  const records = comparison.changes.map((change) => recordForChange(
    change,
    generation,
    existing.current.fingerprint,
    fingerprint,
    previousById,
    currentById,
    previousOccurrences,
    now,
  ));
  const occurrenceByCurrentKey = new Map(records
    .filter((record) => record.currentRenderKey)
    .map((record) => [record.currentRenderKey as string, record.occurrenceId]));
  const occurrences = currentIndexed.map(({ renderKey }) => ({
    renderKey,
    occurrenceId: occurrenceByCurrentKey.get(renderKey)
      || previousOccurrences.get(renderKey)
      || 'occ-' + hash(owner + '|' + periodOf(roster) + '|' + renderKey),
  }));
  const historicalByRevision = new Map(existing.history.map((record) => [record.revisionId, record]));
  records.forEach((record) => historicalByRevision.set(record.revisionId, record));
  const history = Array.from(historicalByRevision.values())
    .sort((a, b) => a.detectedAt.localeCompare(b.detectedAt))
    .slice(-200);
  const ledger: RosterChangeAwarenessLedger = {
    version: 1,
    generation,
    current: { roster, fingerprint, source, recordedAt: now, occurrences },
    active: records,
    history,
  };
  return writeState(storage, key, ledger);
}

export function acknowledgeRosterChange(
  storage: StorageLike,
  accountId: string | null | undefined,
  revisionId: string,
  publicationFingerprint: string,
  now = new Date().toISOString(),
): RosterChangeAwarenessState {
  const key = accountKey(accountId);
  if (!key) return { ledger: null, persisted: false, message: 'Entre na sua conta para registrar ciência.' };
  const existing = runtime.get(key)?.ledger || readPersisted(storage, key);
  if (!existing || existing.current.fingerprint !== publicationFingerprint) {
    return {
      ledger: existing || null,
      persisted: false,
      message: 'A escala mudou enquanto os detalhes estavam abertos. A nova alteração continua pendente.',
    };
  }
  const activeIndex = existing.active.findIndex((record) => record.revisionId === revisionId);
  if (activeIndex < 0) {
    return { ledger: existing, persisted: Boolean(readPersisted(storage, key)), message: '' };
  }
  const active = existing.active.map((record, index) => index === activeIndex ? { ...record, acknowledgedAt: now } : record);
  const history = existing.history.map((record) => record.revisionId === revisionId ? { ...record, acknowledgedAt: now } : record);
  return writeState(storage, key, { ...existing, active, history });
}

export function currentAccountId(): string | null {
  try { return getStoredUser()?.id || null; } catch { return null; }
}

export function startRosterChangeAwarenessRuntime(): void {
  if (runtimeStarted || typeof window === 'undefined') return;
  runtimeStarted = true;
  const register = (roster: CrewRoster | null | undefined, source?: string) => {
    if (!roster) return;
    registerRosterPublication(window.localStorage, currentAccountId(), roster, source);
  };
  try {
    const bundle = JSON.parse(window.localStorage.getItem('crewcheck_latest_roster_bundle') || 'null');
    register(bundle?.roster, bundle?.sourceFileName || bundle?.source);
  } catch {}
  window.addEventListener('crewcheck:roster-updated', ((event: CustomEvent) => {
    register(event.detail?.roster, event.detail?.source);
  }) as EventListener);
  window.addEventListener('storage', (event) => {
    if (!event.key?.startsWith(PREFIX)) return;
    runtime.delete(event.key);
    window.dispatchEvent(new CustomEvent('crewcheck:roster-change-awareness', { detail: { key: event.key, persisted: true } }));
  });
}
