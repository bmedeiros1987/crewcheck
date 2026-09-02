import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';
import { authFetch, getStoredUser, getToken } from './authClient';

export interface DatabaseStatus {
  ok: boolean;
  connected?: boolean;
  databaseConfigured?: boolean;
  configured?: boolean;
  coreReady?: boolean;
  degraded?: boolean;
  migrationRequired?: boolean;
  missingOptionalCount?: number;
  localOnly?: boolean;
  database?: string;
  user_name?: string;
  now?: string;
  message?: string;
  detail?: string;
  storage?: {
    provider?: string;
    mode?: string;
    configured?: boolean;
    databasePrimary?: boolean;
    bucket?: string | null;
    urlConfigured?: boolean;
    secretConfigured?: boolean;
    publishableConfigured?: boolean;
    jwksConfigured?: boolean;
    maxFileBytes?: number;
    freeBackupLimit?: number;
    freeTelegramBackupLimit?: number;
    premiumBackupPriority?: boolean;
  };
}

export interface SavedRosterSummary {
  id: string;
  createdAt: string;
  crewName: string | null;
  crewId: string | null;
  base: string | null;
  rank: string | null;
  airline: string | null;
  year: number | null;
  month: number | null;
  sourceFileName: string | null;
  score: number | null;
  intensityScore: number | null;
  alertsCount: number;
  criticalAlertsCount: number;
  checksum: string | null;
  isActive?: boolean;
  activeAt?: string | null;
  deletedAt?: string | null;
  importStatus?: string | null;
  storageProvider?: string | null;
  sourceStoragePath?: string | null;
  sourceFileSizeBytes?: number | null;
  storageUploadedAt?: string | null;
  storageReady?: boolean;
}

export interface SaveRosterPayload {
  roster: CrewRoster;
  compliance: ComplianceResult;
  gym: GymRecommendation[];
  sourceFileName?: string | null;
  checksum?: string;
  sourceFileDataBase64?: string | null;
  sourceMimeType?: string | null;
  sourceFileSize?: number | null;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  return authFetch<T>(url, init);
}

function hasCrewCheckAuthToken(): boolean {
  try { return Boolean(getToken()); } catch { return false; }
}

function localDatabaseStatus(message = 'Sessão offline/local ativa. Faça login para sincronizar com o banco em nuvem.', health: Partial<DatabaseStatus> = {}): DatabaseStatus {
  return { ...health, ok: Boolean(health.connected), connected: Boolean(health.connected), databaseConfigured: Boolean(health.databaseConfigured ?? health.configured), localOnly: true, message };
}

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  let health: DatabaseStatus = { ok: false };
  try {
    const response = await fetch('/api/platform/database/health', { cache: 'no-store' });
    health = await response.json().catch(() => ({}));
  } catch {}
  if (!hasCrewCheckAuthToken()) {
    return localDatabaseStatus(
      health.connected ? 'Banco principal disponível. Faça login para sincronizar esta conta.' : 'Modo local protegido ativo. A sincronização será retomada quando o banco voltar.',
      { ...health, databaseConfigured: Boolean(health.configured) }
    );
  }
  try {
    const status = await jsonFetch<DatabaseStatus>('/api/db/status');
    return { ...health, ...status, databaseConfigured: true, connected: true };
  } catch (error: any) {
    const code = String(error?.code || error?.payload?.code || '').toUpperCase();
    if (code === 'AUTH_REQUIRED' || error?.status === 401) return localDatabaseStatus('Login expirado. Histórico local ativo; entre novamente para sincronizar.', health);
    return localDatabaseStatus(health.message || 'Banco temporariamente indisponível. O histórico local permanece ativo e será sincronizado depois.', health);
  }
}

function normalizeSingleActiveSummary(items: SavedRosterSummary[]): SavedRosterSummary[] {
  let activeSeen = false;
  return items.map((item) => {
    if (!item.isActive) return item;
    if (!activeSeen) {
      activeSeen = true;
      return item;
    }
    return { ...item, isActive: false };
  });
}

export async function listSavedRosters(limit = 72): Promise<SavedRosterSummary[]> {
  const local = getLocalRosterSummaries(limit);
  if (!hasCrewCheckAuthToken()) return normalizeSingleActiveSummary(local);
  try {
    const payload = await jsonFetch<{ ok: boolean; rosters: SavedRosterSummary[] }>(`/api/rosters?limit=${limit}&manager=1`);
    let online = payload.rosters || [];
    if (!online.some((item) => item.isActive)) {
      try {
        const active = await jsonFetch<{ ok: boolean; roster?: SavedRosterSummary | null }>(`/api/rosters/active`, { cache: 'no-store' });
        if (active?.roster?.id) online = [active.roster, ...online];
      } catch {
        // Alguns backends antigos ainda não expõem /active; o histórico local cobre o iOS.
      }
    }
    const seen = new Set<string>();
    const merged: SavedRosterSummary[] = [];
    for (const item of [...online, ...local]) {
      const key = item.checksum || `${item.year || ''}:${item.month || ''}:${item.crewId || item.crewName || item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    const sorted = merged.sort((a, b) => Number(Boolean(b.isActive)) - Number(Boolean(a.isActive)) || String(b.year || 0).localeCompare(String(a.year || 0)) || Number(b.month || 0) - Number(a.month || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, limit);
    return normalizeSingleActiveSummary(sorted);
  } catch {
    return normalizeSingleActiveSummary(local);
  }
}

const MAX_INLINE_ROSTER_BACKUP_BYTES = Math.max(512_000, Number((import.meta as any)?.env?.VITE_CREWCHECK_MAX_INLINE_ROSTER_BACKUP_BYTES || 4 * 1024 * 1024));

function estimateBase64Bytes(value?: string | null): number {
  const raw = String(value || '').replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '');
  return raw ? Math.floor(raw.length * 3 / 4) : 0;
}

function trimHeavyRosterBackupPayload<T extends SaveRosterPayload>(payload: T): T {
  const declaredSize = Number(payload.sourceFileSize || 0) || 0;
  const estimatedSize = estimateBase64Bytes(payload.sourceFileDataBase64);
  const effectiveSize = Math.max(declaredSize, estimatedSize);
  if (payload.sourceFileDataBase64 && effectiveSize > MAX_INLINE_ROSTER_BACKUP_BYTES) {
    return { ...payload, sourceFileDataBase64: null };
  }
  return payload;
}

export async function saveRosterAnalysis(payload: SaveRosterPayload): Promise<SavedRosterSummary> {
  const onlinePayload = trimHeavyRosterBackupPayload(payload);
  const result = await jsonFetch<{ ok: boolean; roster: SavedRosterSummary }>('/api/rosters', {
    method: 'POST',
    body: JSON.stringify(onlinePayload),
  });
  return result.roster;
}

function assertExpectedRosterPeriod(roster: CrewRoster, expected?: Pick<SavedRosterSummary, 'year' | 'month'>): void {
  const expectedYear = Number(expected?.year || 0);
  const expectedMonth = Number(expected?.month || 0);
  if (!expectedYear || !expectedMonth) return;
  if (Number(roster?.year) === expectedYear && Number(roster?.month) === expectedMonth) return;
  throw Object.assign(new Error('A competência retornada não corresponde à escala escolhida.'), {
    code: 'ROSTER_PERIOD_MISMATCH',
    expectedYear,
    expectedMonth,
    actualYear: Number(roster?.year || 0),
    actualMonth: Number(roster?.month || 0),
  });
}

export async function openSavedRoster(id: string, expected?: Pick<SavedRosterSummary, 'year' | 'month'>): Promise<{ roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[] }> {
  const local = findLocalRoster(id);
  if (id.startsWith('local-') || id.startsWith('offline-')) {
    if (local) {
      assertExpectedRosterPeriod(local.roster, expected);
      return { roster: local.roster, compliance: local.compliance, gym: local.gym || [] };
    }
  }

  const attempts = [
    `/api/rosters/${encodeURIComponent(id)}`,
    `/api/rosters/open?id=${encodeURIComponent(id)}`,
  ];

  let lastError: unknown = null;
  for (const endpoint of attempts) {
    try {
      const payload = await jsonFetch<{ ok: boolean; data: { roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[] } }>(endpoint);
      if (payload?.data?.roster?.days?.length) {
        assertExpectedRosterPeriod(payload.data.roster, expected);
        return payload.data;
      }
    } catch (error) {
      if ((error as any)?.code === 'ROSTER_PERIOD_MISMATCH') throw error;
      lastError = error;
    }
  }

  if (local) {
    assertExpectedRosterPeriod(local.roster, expected);
    return { roster: local.roster, compliance: local.compliance, gym: local.gym || [] };
  }

  throw lastError || new Error('Não foi possível abrir a escala salva.');
}

export async function openActiveRoster(): Promise<{ roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[]; summary?: SavedRosterSummary | null }> {
  const local = getSmartLocalActiveRosterSummary();
  try {
    const payload = await jsonFetch<{ ok: boolean; roster?: SavedRosterSummary | null; data?: { roster: CrewRoster; compliance: ComplianceResult | null; gym: GymRecommendation[] } }>(`/api/rosters/active`, { cache: 'no-store' });
    if (payload?.data?.roster?.days?.length) {
      return { roster: payload.data.roster, compliance: payload.data.compliance as any, gym: payload.data.gym || [], summary: payload.roster || null };
    }
    throw new Error('Escala ativa não retornou dados.');
  } catch (error) {
    if (local?.id) {
      const data = await openSavedRoster(local.id, local);
      const merged = await buildSmartLocalContinuousRoster(local, data).catch(() => data);
      return { ...merged, summary: local };
    }
    throw error;
  }
}

function parseCrewRosterDate(value?: string | null): Date | null {
  const raw = String(value || '').trim();
  let match = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (match) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return new Date(year, Number(match[2]) - 1, Number(match[1]), 12, 0, 0, 0);
  }
  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function rosterSummaryBounds(summary: SavedRosterSummary): { first: Date | null; last: Date | null } {
  const month = Number(summary.month);
  const year = Number(summary.year);
  if (!month || !year) return { first: null, last: null };
  return { first: new Date(year, month - 1, 1, 12), last: new Date(year, month, 0, 12) };
}

function rosterDataBounds(roster: CrewRoster): { first: Date | null; last: Date | null } {
  const dates = (roster.days || []).map((day) => parseCrewRosterDate(day.date)).filter((date): date is Date => Boolean(date && Number.isFinite(date.getTime())));
  if (!dates.length) return { first: null, last: null };
  return { first: new Date(Math.min(...dates.map((date) => date.getTime()))), last: new Date(Math.max(...dates.map((date) => date.getTime()))) };
}

function rosterPeriodOrdinal(period: Pick<SavedRosterSummary, 'year' | 'month'>): number | null {
  const year = Number(period.year);
  const month = Number(period.month);
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

function adjacentRosterSummary(candidates: SavedRosterSummary[], current: Pick<SavedRosterSummary, 'year' | 'month'>, offset: -1 | 1): SavedRosterSummary | undefined {
  const currentOrdinal = rosterPeriodOrdinal(current);
  if (currentOrdinal === null) return undefined;
  const targetOrdinal = currentOrdinal + offset;
  return candidates
    .filter((item) => rosterPeriodOrdinal(item) === targetOrdinal)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
}

function mergeAirportForLocal(value?: string | null): string {
  return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

function isOffLikeLocalDay(day: CrewRoster['days'][number]): boolean {
  const text = `${day?.type || ''} ${day?.pairingCode || ''} ${day?.rawText || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return /\b(DO|DOF|DOP|DOPR|OFF|DR|FOLGA|FERIAS|VACATION)\b/.test(text) && !(day?.legs || []).length;
}

function rosterContinuationAnchorsLocal(roster: CrewRoster): Array<{ day: CrewRoster['days'][number]; index: number; date: Date; origin: string; destination: string }> {
  return (roster.days || [])
    .map((day, index) => {
      const legs = day.legs || [];
      if (!legs.length) return null;
      const first = legs[0];
      const last = legs[legs.length - 1];
      const date = parseCrewRosterDate(day.date);
      if (!date) return null;
      return { day, index, date, origin: mergeAirportForLocal(first.origin), destination: mergeAirportForLocal(last.destination) };
    })
    .filter((item): item is { day: CrewRoster['days'][number]; index: number; date: Date; origin: string; destination: string } => Boolean(item))
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.index - b.index);
}

function dayGapLocal(a: { date: Date }, b: { date: Date }): number {
  return Math.round((b.date.getTime() - a.date.getTime()) / (24 * 60 * 60 * 1000));
}

function continuationTailLocal(previousRoster: CrewRoster, nextRoster: CrewRoster): CrewRoster | null {
  const previousAnchors = rosterContinuationAnchorsLocal(previousRoster);
  const nextAnchors = rosterContinuationAnchorsLocal(nextRoster);
  if (!previousAnchors.length || !nextAnchors.length) return null;
  const base = mergeAirportForLocal(previousRoster.base || nextRoster.base || 'BSB') || 'BSB';
  const last = previousAnchors[previousAnchors.length - 1];
  const firstNext = nextAnchors[0];
  if (!last.destination || !firstNext.origin || last.destination === base || last.destination !== firstNext.origin) return null;
  const gapToNext = dayGapLocal(last, firstNext);
  if (gapToNext < 0 || gapToNext > 3) return null;
  const hasOffAfter = (previousRoster.days || []).some((day, index) => index > last.index && isOffLikeLocalDay(day));
  if (hasOffAfter) return null;
  let tailStart = last.index;
  for (let i = previousAnchors.length - 2; i >= 0; i -= 1) {
    const previous = previousAnchors[i];
    const current = previousAnchors[i + 1];
    const gap = dayGapLocal(previous, current);
    if (gap < 0 || gap > 3) break;
    if (!previous.destination || !current.origin || previous.destination !== current.origin) break;
    tailStart = previous.index;
  }
  const days = (previousRoster.days || []).filter((day, index) => index >= tailStart && !isOffLikeLocalDay(day));
  return days.length ? { ...previousRoster, days } : null;
}

function mergeContinuousLocal(primary: CrewRoster, adjacent: CrewRoster, position: 'prepend' | 'append'): CrewRoster {
  const sourceDays = position === 'prepend' ? [...(adjacent.days || []), ...(primary.days || [])] : [...(primary.days || []), ...(adjacent.days || [])];
  const seen = new Set<string>();
  const days: CrewRoster['days'] = [];
  for (const day of sourceDays) {
    const key = `${day.date}|${day.type}|${day.pairingCode}|${day.dutyReport}|${day.dutyDebrief}|${(day.legs || []).map((leg) => `${leg.flightNumber}-${leg.origin}-${leg.destination}-${leg.departureTime}`).join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    days.push(day);
  }
  days.sort((a, b) => (parseCrewRosterDate(a.date)?.getTime() || 0) - (parseCrewRosterDate(b.date)?.getTime() || 0));
  return { ...primary, days, rawText: `${position === 'prepend' ? `${adjacent.rawText || ''}\n\n--- Final da escala anterior anexado automaticamente por continuidade/pernoite ---\n` : ''}${primary.rawText || ''}${position === 'append' ? `\n\n--- Próxima escala anexada automaticamente ---\n${adjacent.rawText || ''}` : ''}`.trim() };
}

function getSmartLocalActiveRosterSummary(): SavedRosterSummary | undefined {
  const candidates = getLocalRosterSummaries(12);
  if (!candidates.length) return undefined;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const withBounds = candidates.map((summary) => ({ summary, bounds: rosterSummaryBounds(summary) }));
  const active = withBounds.find((item) => item.summary.isActive);
  if (active?.bounds.last && active.bounds.last.getTime() >= today.getTime()) return active.summary;
  const live = withBounds.filter((item) => item.bounds.last && item.bounds.last.getTime() >= today.getTime())
    .sort((a, b) => (a.bounds.first?.getTime() || 0) - (b.bounds.first?.getTime() || 0));
  return live[0]?.summary || active?.summary || candidates[0];
}

async function buildSmartLocalContinuousRoster(summary: SavedRosterSummary, data: { roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[] }) {
  const currentBounds = rosterDataBounds(data.roster);
  if (!currentBounds.first || !currentBounds.last) return data;
  let roster = data.roster;
  const candidates = getLocalRosterSummaries(12).filter((item) => item.id !== summary.id);

  // Publication adjacency is a property of the nominal competence, not of the
  // factual first/last day carried inside a roster. A next-month publication may
  // legitimately carry the final days of the previous month; using those factual
  // bounds to choose the previous publication can skip the actual previous month.
  const previousSummary = adjacentRosterSummary(candidates, summary, -1);
  if (previousSummary) {
    const previous = await openSavedRoster(previousSummary.id, previousSummary).catch(() => null);
    const tail = previous?.roster ? continuationTailLocal(previous.roster, roster) : null;
    if (tail?.days?.length) roster = mergeContinuousLocal(roster, tail, 'prepend');
  }

  const nextSummary = adjacentRosterSummary(candidates, summary, 1);
  if (nextSummary) {
    const next = await openSavedRoster(nextSummary.id, nextSummary).catch(() => null);
    const tail = next?.roster ? continuationTailLocal(roster, next.roster) : null;
    if (tail?.days?.length && next?.roster) roster = mergeContinuousLocal(roster, next.roster, 'append');
    else if (next?.roster?.days?.length) roster = mergeContinuousLocal(roster, { ...next.roster, days: next.roster.days.slice(0, 5) }, 'append');
  }

  return roster === data.roster ? data : { roster, compliance: null as any, gym: [] };
}

export async function deleteRosterAnalysis(id: string): Promise<boolean> {
  if (id.startsWith('local-') || id.startsWith('offline-')) {
    deleteLocalRoster(id);
    return true;
  }
  try {
    const payload = await jsonFetch<{ ok: boolean }>(`/api/rosters/${id}`, { method: 'DELETE' });
    deleteLocalRoster(id);
    return Boolean(payload.ok);
  } catch (error) {
    const local = findLocalRoster(id);
    if (local) {
      deleteLocalRoster(id);
      return true;
    }
    throw error;
  }
}

export async function activateRosterAnalysis(id: string): Promise<SavedRosterSummary | null> {
  if (id.startsWith('local-') || id.startsWith('offline-')) return null;
  const payload = await jsonFetch<{ ok: boolean; roster?: SavedRosterSummary }>(`/api/rosters/${id}/activate`, { method: 'POST' });
  return payload.roster || null;
}

export interface StoredPeriodStats {
  id: string;
  period: string;
  year: number | null;
  month: number | null;
  daysAnalyzed: number;
  flightSegments: number;
  daysOff: number;
  layovers: number;
  standby: number;
  reserve: number;
  gymGoodDays: number;
  gymAvoidDays: number;
  heavyDays: number;
  score: number;
  intensityScore: number;
  alertsCount: number;
  criticalAlertsCount: number;
}

export interface StoredStatsBlock {
  mode: 'personal' | 'global';
  summary: {
    rostersCount: number;
    firstPeriod: string | null;
    lastPeriod: string | null;
    avgScore: number;
    avgIntensity: number;
    avgAlerts: number;
    avgCriticalAlerts: number;
    avgFlightSegments: number;
    avgDaysOff: number;
    avgLayovers: number;
    avgGymGoodDays: number;
    avgHeavyDays: number;
  };
  periods: StoredPeriodStats[];
  disclaimer: string;
}

export interface StoredStatsResponse {
  ok: boolean;
  personal: StoredStatsBlock;
  global: StoredStatsBlock;
  notice: string;
}

export async function getStoredStats(): Promise<StoredStatsResponse> {
  try {
    return await jsonFetch<StoredStatsResponse>('/api/stats');
  } catch {
    return buildLocalStoredStats();
  }
}

const LEGACY_LOCAL_HISTORY_KEY = 'crewcheck_local_history_v1';

function localHistoryKey(): string {
  try {
    const user = getStoredUser();
    const raw = String(user?.id || user?.email || 'anon').trim().toLowerCase();
    const safe = raw.replace(/[^a-z0-9_-]+/g, '_').slice(0, 80) || 'anon';
    return `crewcheck_local_history_v11_${safe}`;
  } catch {
    return 'crewcheck_local_history_v11_anon';
  }
}

type LocalHistoryItem = {
  id: string;
  checksum: string;
  createdAt: string;
  sourceFileName?: string | null;
  roster: CrewRoster;
  compliance: ComplianceResult;
  gym: GymRecommendation[];
};

function safeStorageScope(): string {
  try {
    const user = getStoredUser();
    const raw = String(user?.id || user?.email || 'anon').trim().toLowerCase();
    return raw.replace(/[^a-z0-9_-]+/g, '_').slice(0, 80) || 'anon';
  } catch {
    return 'anon';
  }
}

const LOCAL_HISTORY_LEGACY_MIGRATED_KEY = 'crewcheck_local_history_legacy_migrated_v11';

// The pre-scoping legacy key has no trustworthy owner binding. Never promote it
// into whichever authenticated identity happens to boot first. Mark it handled and
// remove it so server truth / an explicit re-import wins instead of risking A -> B
// roster leakage on a shared or reused device. Mirrors the same fix in
// client/src/lib/offlineSync.ts (see #440, #493).
function migrateLegacyLocalHistoryOnce(): void {
  try {
    if (localStorage.getItem(LOCAL_HISTORY_LEGACY_MIGRATED_KEY) === '1') return;
    localStorage.setItem(LOCAL_HISTORY_LEGACY_MIGRATED_KEY, '1');
    localStorage.removeItem(LEGACY_LOCAL_HISTORY_KEY);
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

function normalizeLocalHistoryItem(raw: any, index = 0): LocalHistoryItem | null {
  const roster = raw?.roster || raw?.data?.roster;
  if (!roster?.days?.length) return null;
  const compliance = raw?.compliance || raw?.data?.compliance || ({ score: 0, alerts: [] } as any);
  const gym = Array.isArray(raw?.gym) ? raw.gym : Array.isArray(raw?.data?.gym) ? raw.data.gym : [];
  const checksum = String(raw?.checksum || `${roster?.crewId || roster?.crewName || 'crew'}:${roster?.year || '0000'}:${String(roster?.month || '00').padStart(2, '0')}`);
  return {
    id: String(raw?.id || `local-recovered-${checksum}-${index}`).replace(/[^a-zA-Z0-9:_-]/g, '-'),
    checksum,
    createdAt: raw?.createdAt || raw?.updatedAt || new Date().toISOString(),
    sourceFileName: raw?.sourceFileName || raw?.filename || raw?.source || 'Escala recuperada do dispositivo',
    roster,
    compliance,
    gym,
  };
}

function readLocalHistory(): LocalHistoryItem[] {
  const seen = new Set<string>();
  const items: LocalHistoryItem[] = [];
  for (const key of localHistoryKeys()) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      list.forEach((entry, index) => {
        const item = normalizeLocalHistoryItem(entry, index);
        if (!item) return;
        const dedupe = item.checksum || periodHistoryKey(item);
        if (seen.has(dedupe)) return;
        seen.add(dedupe);
        items.push(item);
      });
    } catch {
      // Ignora chaves antigas/corrompidas.
    }
  }
  return items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function findLocalRoster(id: string): LocalHistoryItem | null {
  return readLocalHistory().find((item) => item.id === id || item.checksum === id) || null;
}

function deleteLocalRoster(id: string): void {
  for (const key of localHistoryKeys()) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      const next = parsed.filter((entry: any) => {
        const item = normalizeLocalHistoryItem(entry);
        return item && item.id !== id && item.checksum !== id;
      });
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // LocalStorage pode estar indisponível no modo privado.
    }
  }
}

// Deliberately excludes the '_anon' variants: those are the anon scope's own,
// genuinely current data (readable normally by whichever session's scope is
// literally 'anon'), not ownerless pre-scoping artifacts - migrating them into
// an *authenticated* scope would itself reintroduce the #440 cross-identity
// leak this migration exists to close. Only keys that predate per-user scoping
// entirely (so there is unambiguously at most one legitimate value) belong here.
const ACTIVE_ROSTER_LEGACY_KEYS = [
  'crewcheck_last_roster_bundle_v11108',
  'crewcheck_last_roster_bundle_v11102',
  'crewcheck_last_roster_bundle_v11101',
  'crewcheck_last_roster_bundle_v11100',
  'crewcheck_last_roster_bundle_v11099',
  'crewcheck_last_roster_bundle_v11098',
  'crewcheck_latest_roster_bundle',
];
const ACTIVE_ROSTER_LEGACY_MIGRATED_KEY = 'crewcheck_active_roster_legacy_migrated_v11';

// The pre-scoping active-roster snapshot keys have no trustworthy owner binding,
// exactly like the legacy history key above. Never promote their content into any
// scope's snapshot slot - just discard each one the first time it's seen. This
// closes the concrete mechanism behind #440 ("erro de carregamento no APK mistura
// escala antiga e gera teletransporte"): openActiveRoster() falls back to this
// snapshot data whenever the live /api/rosters/active call fails, so a stale/
// foreign snapshot surfacing here was exactly what produced a different identity's
// roster on a failed load. Data already correctly scoped to the current identity
// (crewcheck_active_roster_snapshot_<scope> etc., written by that identity's own
// prior sync) is untouched - only these unscoped pre-migration keys are discarded.
function migrateLegacyActiveRosterSnapshotsOnce(): void {
  try {
    if (localStorage.getItem(ACTIVE_ROSTER_LEGACY_MIGRATED_KEY) === '1') return;
    localStorage.setItem(ACTIVE_ROSTER_LEGACY_MIGRATED_KEY, '1');
    for (const legacyKey of ACTIVE_ROSTER_LEGACY_KEYS) {
      localStorage.removeItem(legacyKey);
    }
  } catch {}
}

function readLocalActiveRosterSnapshots(): LocalHistoryItem[] {
  const scope = safeStorageScope();
  migrateLegacyActiveRosterSnapshotsOnce();
  // Scoped strictly to the current identity: these three keys are different
  // storage generations for the *same* user's own snapshot, never scanned
  // from other scopes or folded in from 'anon' while authenticated (see #440).
  const keys = new Set<string>([
    `crewcheck_active_roster_snapshot_${scope}`,
    `crewcheck_latest_roster_bundle_${scope}`,
    `crewcheck_roster_sync_latest_v11_${scope}`,
  ]);
  const seen = new Set<string>();
  const out: LocalHistoryItem[] = [];
  Array.from(keys).forEach((key, index) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const payload = JSON.parse(raw);
      const item = normalizeLocalHistoryItem({ ...payload, id: `local-active-${scope}-${index}`, sourceFileName: payload.sourceFileName || 'Escala ativa recuperada no iOS' }, index);
      if (!item) return;
      const dedupe = item.checksum || periodHistoryKey(item);
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      out.push(item);
    } catch {}
  });
  return out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function readLocalActiveRosterSnapshot(): LocalHistoryItem | null {
  return readLocalActiveRosterSnapshots()[0] || null;
}

function getLocalRosterSummaries(limit: number): SavedRosterSummary[] {
  const seen = new Set<string>();
  const activeSnapshots = readLocalActiveRosterSnapshots();
  const sourceItems = [...activeSnapshots, ...readLocalHistory()];
  const unique = sourceItems.filter((item) => {
    const key = periodHistoryKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
  return unique.map((item) => ({
    id: item.id,
    createdAt: item.createdAt,
    crewName: item.roster.crewName || null,
    crewId: item.roster.crewId || null,
    base: item.roster.base || null,
    rank: item.roster.rank || null,
    airline: item.roster.airline || null,
    year: Number(item.roster.year) || null,
    month: Number(item.roster.month) || null,
    sourceFileName: item.sourceFileName || null,
    score: Number(item.compliance?.score ?? 0),
    intensityScore: Number(item.compliance?.loadAnalysis?.intensityScore ?? 0),
    alertsCount: Array.isArray(item.compliance?.alerts) ? item.compliance.alerts.length : 0,
    criticalAlertsCount: Array.isArray(item.compliance?.alerts) ? item.compliance.alerts.filter((a: any) => a?.severity === 'error').length : 0,
    checksum: item.checksum,
    isActive: item.id.startsWith('local-active-'),
    importStatus: item.id.startsWith('local-active-') ? 'local_active_ios' : 'local',
    storageReady: false,
  }));
}

function periodHistoryKey(item: LocalHistoryItem): string {
  // P0_580_HISTORY_CREW_IDENTITY_GUARD: a placeholder crewId must never collapse
  // different crew members into the same nominal-period history slot. Prefer a
  // verified ID; otherwise use the normalized published name; without either,
  // keep entries distinct rather than authorizing cross-publication adjacency.
  const normalizedId = String(item.roster.crewId || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const usableId = normalizedId && !/^(?:UNKNOWN|INVALID|MISSING)(?:\d+)?$/.test(normalizedId) && !/^(?:NA|NONE|NULL|UNDEFINED|TBD|TBA|PLACEHOLDER)$/.test(normalizedId) ? normalizedId : '';
  const normalizedName = String(item.roster.crewName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const identity = usableId ? `ID:${usableId}` : normalizedName ? `NAME:${normalizedName}` : `ENTRY:${item.checksum || item.id}`;
  return `${identity}:${item.roster.year || '0000'}:${item.roster.month || '00'}`;
}

function buildLocalStoredStats(): StoredStatsResponse {
  const seenPeriods = new Set<string>();
  const historyByPeriod = readLocalHistory().filter((item) => {
    const key = periodHistoryKey(item);
    if (seenPeriods.has(key)) return false;
    seenPeriods.add(key);
    return true;
  });
  const periods = historyByPeriod.map((item) => {
    const roster = item.roster;
    const compliance = item.compliance;
    const gym = item.gym || [];
    const days = Array.isArray(roster.days) ? roster.days : [];
    const alerts = Array.isArray(compliance?.alerts) ? compliance.alerts : [];
    const month = Number(roster.month) || null;
    const year = Number(roster.year) || null;
    return {
      id: item.id,
      period: month && year ? `${String(month).padStart(2, '0')}/${year}` : 'Local',
      year,
      month,
      daysAnalyzed: days.length,
      flightSegments: days.reduce((sum, day) => sum + (day.legs?.length || 0), 0),
      daysOff: days.filter((day) => ['DO', 'DR', 'DOF'].includes(day.type) || ['DOP', 'DOPR', 'VC', 'FOLGA'].includes(String(day.pairingCode || '').toUpperCase())).length,
      layovers: days.filter((day) => day.type === 'LAYOVER').length,
      standby: days.filter((day) => day.type === 'HSB' || day.type === 'HSBE').length,
      reserve: days.filter((day) => day.type === 'ASB' || day.type === 'RES').length,
      gymGoodDays: gym.filter((g: any) => g.priority === 'high').length,
      gymAvoidDays: gym.filter((g: any) => g.priority === 'avoid' || g.priority === 'low').length,
      heavyDays: compliance?.loadAnalysis?.hardestDays?.length || 0,
      score: Number(compliance?.score ?? 0),
      intensityScore: Number(compliance?.loadAnalysis?.intensityScore ?? 0),
      alertsCount: alerts.length,
      criticalAlertsCount: alerts.filter((a: any) => a?.severity === 'error').length,
    };
  });
  const summary = summarizePeriods(periods);
  const block: StoredStatsBlock = {
    mode: 'personal',
    summary,
    periods,
    disclaimer: 'Histórico local deste aparelho. Comparativo superficial e não oficial.',
  };
  return {
    ok: true,
    personal: block,
    global: { mode: 'global', summary: summarizePeriods([]), periods: [], disclaimer: 'Comparativo geral indisponível sem conexão com o banco.' },
    notice: 'Dados locais/superficiais. Não use como prova, documento oficial ou argumento perante empresa/terceiros.',
  };
}

function summarizePeriods(periods: StoredPeriodStats[]): StoredStatsBlock['summary'] {
  const avg = (selector: (item: StoredPeriodStats) => number) => periods.length ? Math.round(periods.reduce((sum, item) => sum + selector(item), 0) / periods.length) : 0;
  return {
    rostersCount: periods.length,
    firstPeriod: periods[0]?.period || null,
    lastPeriod: periods[periods.length - 1]?.period || null,
    avgScore: avg((p) => p.score),
    avgIntensity: avg((p) => p.intensityScore),
    avgAlerts: avg((p) => p.alertsCount),
    avgCriticalAlerts: avg((p) => p.criticalAlertsCount),
    avgFlightSegments: avg((p) => p.flightSegments),
    avgDaysOff: avg((p) => p.daysOff),
    avgLayovers: avg((p) => p.layovers),
    avgGymGoodDays: avg((p) => p.gymGoodDays),
    avgHeavyDays: avg((p) => p.heavyDays),
  };
}
