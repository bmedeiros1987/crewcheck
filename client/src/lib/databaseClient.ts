import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';
import { authFetch, getStoredUser } from './authClient';

export interface DatabaseStatus {
  ok: boolean;
  connected?: boolean;
  databaseConfigured?: boolean;
  database?: string;
  user_name?: string;
  now?: string;
  message?: string;
  detail?: string;
  storage?: {
    provider?: string;
    configured?: boolean;
    bucket?: string | null;
    urlConfigured?: boolean;
    secretConfigured?: boolean;
    publishableConfigured?: boolean;
    jwksConfigured?: boolean;
    maxFileBytes?: number;
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

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  return jsonFetch<DatabaseStatus>('/api/db/status');
}

export async function listSavedRosters(limit = 72): Promise<SavedRosterSummary[]> {
  const local = getLocalRosterSummaries(limit);
  try {
    const payload = await jsonFetch<{ ok: boolean; rosters: SavedRosterSummary[] }>(`/api/rosters?limit=${limit}&manager=1`);
    const online = payload.rosters || [];
    const seen = new Set<string>();
    const merged: SavedRosterSummary[] = [];
    for (const item of [...online, ...local]) {
      const key = item.checksum || item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged.sort((a, b) => String(b.year || 0).localeCompare(String(a.year || 0)) || Number(b.month || 0) - Number(a.month || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, limit);
  } catch {
    return local;
  }
}

export async function saveRosterAnalysis(payload: SaveRosterPayload): Promise<SavedRosterSummary> {
  const result = await jsonFetch<{ ok: boolean; roster: SavedRosterSummary }>('/api/rosters', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.roster;
}

export async function openSavedRoster(id: string): Promise<{ roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[] }> {
  const local = findLocalRoster(id);
  if (id.startsWith('local-') || id.startsWith('offline-')) {
    if (local) return { roster: local.roster, compliance: local.compliance, gym: local.gym || [] };
  }
  try {
    const payload = await jsonFetch<{ ok: boolean; data: { roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[] } }>(`/api/rosters/${id}`);
    return payload.data;
  } catch (error) {
    if (local) return { roster: local.roster, compliance: local.compliance, gym: local.gym || [] };
    throw error;
  }
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

function readLocalHistory(): LocalHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(localHistoryKey()) || '[]') as LocalHistoryItem[];
  } catch {
    return [];
  }
}

function findLocalRoster(id: string): LocalHistoryItem | null {
  return readLocalHistory().find((item) => item.id === id || item.checksum === id) || null;
}


function deleteLocalRoster(id: string): void {
  try {
    const next = readLocalHistory().filter((item) => item.id !== id && item.checksum !== id);
    localStorage.setItem(localHistoryKey(), JSON.stringify(next));
  } catch {
    // LocalStorage pode estar indisponível no modo privado.
  }
}

function getLocalRosterSummaries(limit: number): SavedRosterSummary[] {
  const seen = new Set<string>();
  const unique = readLocalHistory().filter((item) => {
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
    isActive: false,
    importStatus: 'local',
    storageReady: false,
  }));
}

function periodHistoryKey(item: LocalHistoryItem): string {
  return `${item.roster.crewId || item.roster.crewName || 'crew'}:${item.roster.year || '0000'}:${item.roster.month || '00'}`;
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
