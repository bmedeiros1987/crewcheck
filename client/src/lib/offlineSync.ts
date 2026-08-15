import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';
import { saveRosterAnalysis, type SavedRosterSummary } from './databaseClient';
import { getStoredUser } from './authClient';

const LEGACY_OFFLINE_QUEUE_KEY = 'crewcheck_offline_queue_v1';
const LEGACY_SAVED_CHECKSUMS_KEY = 'crewcheck_saved_checksums_v1';
export const LEGACY_LOCAL_HISTORY_KEY = 'crewcheck_local_history_v1';

function storageScope(): string {
  try {
    const user = getStoredUser();
    const raw = String(user?.id || user?.email || 'anon').trim().toLowerCase();
    return (raw.replace(/[^a-z0-9_-]+/g, '_').slice(0, 80) || 'anon');
  } catch {
    return 'anon';
  }
}

function offlineQueueKey(): string { return `crewcheck_offline_queue_v11_${storageScope()}`; }
function savedChecksumsKey(): string { return `crewcheck_saved_checksums_v11_${storageScope()}`; }
export function localHistoryKey(): string { return `crewcheck_local_history_v11_${storageScope()}`; }


export interface OfflineRosterPayload {
  id: string;
  checksum: string;
  createdAt: string;
  sourceFileName?: string | null;
  roster: CrewRoster;
  compliance: ComplianceResult;
  gym: GymRecommendation[];
  attempts: number;
  lastError?: string;
}

export interface OfflineSaveResult {
  savedOnline: boolean;
  queued: boolean;
  deduplicatedLocal: boolean;
  summary?: SavedRosterSummary;
  checksum: string;
  pendingCount: number;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

export async function checksumRoster(payload: unknown): Promise<string> {
  const roster = (payload as any)?.roster;
  const periodKey = roster?.year && roster?.month
    ? `period:${roster?.crewId || roster?.crewName || 'crew'}:${roster.year}-${String(roster.month).padStart(2, '0')}`
    : '';
  const text = periodKey || stableStringify(payload);
  if (crypto?.subtle) {
    const encoded = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = Math.imul(31, hash) + text.charCodeAt(i) | 0;
  return `fallback-${Math.abs(hash)}`;
}


const LEGACY_LOCAL_HISTORY_MIGRATED_KEY = 'crewcheck_local_history_legacy_migrated_v11';

// One-shot, removable migration of the pre-scoping legacy history key into
// whichever scope asks for it first. Deleting the legacy key immediately
// after the first claim is what makes this safe: no later scope (a
// different user on the same device, or an anon session after a different
// person logs out) can ever read it again, so this can never turn into a
// permanent cross-scope merge - only a single one-time handoff.
function migrateLegacyLocalHistoryOnce(): void {
  try {
    if (localStorage.getItem(LEGACY_LOCAL_HISTORY_MIGRATED_KEY) === '1') return;
    const legacyRaw = localStorage.getItem(LEGACY_LOCAL_HISTORY_KEY);
    localStorage.setItem(LEGACY_LOCAL_HISTORY_MIGRATED_KEY, '1');
    localStorage.removeItem(LEGACY_LOCAL_HISTORY_KEY);
    if (!legacyRaw) return;
    const legacyList = JSON.parse(legacyRaw);
    if (!Array.isArray(legacyList) || !legacyList.length) return;
    const currentKey = localHistoryKey();
    const currentList = JSON.parse(localStorage.getItem(currentKey) || '[]');
    const merged = [...(Array.isArray(currentList) ? currentList : []), ...legacyList];
    localStorage.setItem(currentKey, JSON.stringify(merged));
  } catch {}
}

// Scoped strictly to the current identity's own key. Never scan localStorage
// for other 'crewcheck_local_history_*' keys and never fold in the 'anon'
// key while a real user is authenticated - either of those reintroduces a
// different identity's roster history into the active session (see #440).
function localHistoryKeys(): string[] {
  migrateLegacyLocalHistoryOnce();
  return [localHistoryKey()];
}

function normalizeOfflineHistoryItem(raw: any, index = 0): OfflineRosterPayload | null {
  const roster = raw?.roster;
  if (!roster?.days?.length) return null;
  return {
    id: String(raw?.id || `local-recovered-${Date.now()}-${index}`),
    checksum: String(raw?.checksum || `${roster?.crewId || roster?.crewName || 'crew'}:${roster?.year || '0000'}:${String(roster?.month || '00').padStart(2, '0')}`),
    createdAt: raw?.createdAt || raw?.updatedAt || new Date().toISOString(),
    sourceFileName: raw?.sourceFileName || 'Escala recuperada do histórico local',
    roster,
    compliance: raw?.compliance || ({ score: 0, alerts: [] } as any),
    gym: Array.isArray(raw?.gym) ? raw.gym : [],
    attempts: Number(raw?.attempts || 0),
    lastError: raw?.lastError,
  };
}

function readLocalHistory(): OfflineRosterPayload[] {
  const seen = new Set<string>();
  const items: OfflineRosterPayload[] = [];
  for (const key of localHistoryKeys()) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      const list = Array.isArray(parsed) ? parsed : [parsed];
      list.forEach((entry, index) => {
        const item = normalizeOfflineHistoryItem(entry, index);
        if (!item) return;
        if (seen.has(item.checksum)) return;
        seen.add(item.checksum);
        items.push(item);
      });
    } catch {}
  }
  return items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function rememberLocalHistory(payload: Omit<OfflineRosterPayload, 'id' | 'createdAt' | 'attempts' | 'checksum'> & { checksum: string }) {
  const history = readLocalHistory();
  const existingIndex = history.findIndex((item) => item.checksum === payload.checksum);
  const item: OfflineRosterPayload = {
    ...payload,
    id: existingIndex >= 0 ? history[existingIndex].id : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: existingIndex >= 0 ? history[existingIndex].createdAt : new Date().toISOString(),
    attempts: existingIndex >= 0 ? history[existingIndex].attempts : 0,
  };
  if (existingIndex >= 0) history.splice(existingIndex, 1);
  history.unshift(item);
  localStorage.setItem(localHistoryKey(), JSON.stringify(history.slice(0, 84)));
}

function readQueue(): OfflineRosterPayload[] {
  try {
    return JSON.parse(localStorage.getItem(offlineQueueKey()) || '[]') as OfflineRosterPayload[];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineRosterPayload[]) {
  localStorage.setItem(offlineQueueKey(), JSON.stringify(queue.slice(0, 50)));
}

function readSavedChecksums(): string[] {
  try {
    return JSON.parse(localStorage.getItem(savedChecksumsKey()) || '[]') as string[];
  } catch {
    return [];
  }
}

function rememberChecksum(checksum: string) {
  const checksums = new Set(readSavedChecksums());
  checksums.add(checksum);
  localStorage.setItem(savedChecksumsKey(), JSON.stringify(Array.from(checksums).slice(-200)));
}

export function getPendingOfflineRosters(): OfflineRosterPayload[] {
  return readQueue();
}

export function getPendingOfflineCount(): number {
  return readQueue().length;
}

export async function queueRosterOffline(payload: Omit<OfflineRosterPayload, 'id' | 'createdAt' | 'attempts' | 'checksum'> & { checksum?: string }): Promise<OfflineRosterPayload> {
  const checksum = payload.checksum || await checksumRoster({ roster: payload.roster, compliance: payload.compliance, gym: payload.gym, sourceFileName: payload.sourceFileName || null });
  const queue = readQueue();
  const existing = queue.find((item) => item.checksum === checksum);
  if (existing) return existing;

  const item: OfflineRosterPayload = {
    ...payload,
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    checksum,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  queue.unshift(item);
  writeQueue(queue);
  return item;
}

export async function saveRosterOfflineFirst(payload: {
  roster: CrewRoster;
  compliance: ComplianceResult;
  gym: GymRecommendation[];
  sourceFileName?: string | null;
  sourceFileDataBase64?: string | null;
  sourceMimeType?: string | null;
  sourceFileSize?: number | null;
}, options: { forceOnline?: boolean } = {}): Promise<OfflineSaveResult> {
  const checksum = await checksumRoster(payload);
  const alreadySavedLocal = readSavedChecksums().includes(checksum);
  const queuedDuplicate = readQueue().some((item) => item.checksum === checksum);
  const { sourceFileDataBase64, sourceMimeType, sourceFileSize, ...localPayload } = payload;
  rememberLocalHistory({ ...localPayload, checksum });

  if (alreadySavedLocal && !options.forceOnline) {
    return { savedOnline: false, queued: false, deduplicatedLocal: true, checksum, pendingCount: getPendingOfflineCount() };
  }

  try {
    const summary = await saveRosterAnalysis({ ...payload, checksum });
    rememberChecksum(checksum);
    return { savedOnline: true, queued: false, deduplicatedLocal: Boolean((summary as any)?.deduplicated), summary, checksum, pendingCount: getPendingOfflineCount() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/payload.*grande|too large|413/i.test(message) && payload.sourceFileDataBase64) {
      try {
        const summary = await saveRosterAnalysis({ ...payload, sourceFileDataBase64: null, checksum });
        rememberChecksum(checksum);
        return { savedOnline: true, queued: false, deduplicatedLocal: Boolean((summary as any)?.deduplicated), summary, checksum, pendingCount: getPendingOfflineCount() };
      } catch {
        // Continua para a fila offline abaixo.
      }
    }
    if (!queuedDuplicate) {
      await queueRosterOffline({ ...localPayload, checksum });
    }
    return { savedOnline: false, queued: true, deduplicatedLocal: queuedDuplicate, checksum, pendingCount: getPendingOfflineCount() };
  }
}

export async function syncPendingRosters(): Promise<{ synced: number; remaining: number; errors: string[] }> {
  const historyChecksums = new Set(readLocalHistory().map((item) => item.checksum));
  const queueChecksums = new Set(readQueue().map((item) => item.checksum));
  const savedChecksums = new Set(readSavedChecksums());
  const backfill = readLocalHistory().filter((item) => item.roster?.days?.length && !queueChecksums.has(item.checksum) && !savedChecksums.has(item.checksum));
  const queue = [...readQueue(), ...backfill];
  const remaining: OfflineRosterPayload[] = [];
  const errors: string[] = [];
  let synced = 0;
  const processed = new Set<string>();

  for (const item of queue) {
    if (processed.has(item.checksum)) continue;
    processed.add(item.checksum);
    try {
      await saveRosterAnalysis({
        roster: item.roster,
        compliance: item.compliance,
        gym: item.gym,
        sourceFileName: item.sourceFileName,
        checksum: item.checksum,
      });
      rememberChecksum(item.checksum);
      rememberLocalHistory({ roster: item.roster, compliance: item.compliance, gym: item.gym, sourceFileName: item.sourceFileName, checksum: item.checksum });
      synced += 1;
    } catch (error) {
      if (historyChecksums.has(item.checksum) || queueChecksums.has(item.checksum)) {
        remaining.push({ ...item, attempts: item.attempts + 1, lastError: error instanceof Error ? error.message : 'Erro ao sincronizar' });
      }
      errors.push(error instanceof Error ? error.message : 'Erro ao sincronizar');
    }
  }

  writeQueue(remaining);
  return { synced, remaining: remaining.length, errors };
}
