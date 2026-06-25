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


function readLocalHistory(): OfflineRosterPayload[] {
  try {
    return JSON.parse(localStorage.getItem(localHistoryKey()) || '[]') as OfflineRosterPayload[];
  } catch {
    return [];
  }
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
  localStorage.setItem(localHistoryKey(), JSON.stringify(history.slice(0, 60)));
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
}): Promise<OfflineSaveResult> {
  const checksum = await checksumRoster(payload);
  const alreadySavedLocal = readSavedChecksums().includes(checksum);
  const queuedDuplicate = readQueue().some((item) => item.checksum === checksum);
  rememberLocalHistory({ ...payload, checksum });

  if (alreadySavedLocal) {
    return { savedOnline: false, queued: false, deduplicatedLocal: true, checksum, pendingCount: getPendingOfflineCount() };
  }

  try {
    const summary = await saveRosterAnalysis({ ...payload, checksum });
    rememberChecksum(checksum);
    return { savedOnline: true, queued: false, deduplicatedLocal: Boolean((summary as any)?.deduplicated), summary, checksum, pendingCount: getPendingOfflineCount() };
  } catch (error) {
    if (!queuedDuplicate) {
      await queueRosterOffline({ ...payload, checksum });
    }
    return { savedOnline: false, queued: true, deduplicatedLocal: queuedDuplicate, checksum, pendingCount: getPendingOfflineCount() };
  }
}

export async function syncPendingRosters(): Promise<{ synced: number; remaining: number; errors: string[] }> {
  const queue = readQueue();
  const remaining: OfflineRosterPayload[] = [];
  const errors: string[] = [];
  let synced = 0;

  for (const item of queue) {
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
      remaining.push({ ...item, attempts: item.attempts + 1, lastError: error instanceof Error ? error.message : 'Erro ao sincronizar' });
      errors.push(error instanceof Error ? error.message : 'Erro ao sincronizar');
    }
  }

  writeQueue(remaining);
  return { synced, remaining: remaining.length, errors };
}
