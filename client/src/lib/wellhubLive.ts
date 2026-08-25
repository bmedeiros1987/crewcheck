import type { WellhubPlan } from '@/lib/wellhubVerifiedCatalog';

export type WellhubLivePartner = {
  id: string;
  name: string;
  chain: string;
  city: string;
  state: string;
  address: string;
  minimumPlan: WellhubPlan;
  rating?: number;
  reviewCount?: number;
  openingHours: string[];
  is24Hours?: boolean;
  accessNote?: string;
  sourceUrl: string;
  verifiedAt: string;
  activities?: string[];
  liveVerified?: boolean;
  liveCheckedAt?: string;
};

export type WellhubRoutineSuggestion = {
  ok: boolean;
  message: string;
  caution?: string;
  plan?: WellhubPlan;
  activity?: string;
  gym?: WellhubLivePartner;
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  bufferMinutes?: number;
  nextAt?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(payload?.message || `Erro HTTP ${response.status}`);
  return payload as T;
}

export async function fetchWellhubVerifiedSearch(input: {
  plan: WellhubPlan;
  query?: string;
  activity?: string;
  location?: string;
  limit?: number;
}): Promise<{ ok: boolean; partners: WellhubLivePartner[]; total: number; source: string; mapsUsedForEligibility: boolean }> {
  const params = new URLSearchParams({ plan: input.plan });
  if (input.query?.trim()) params.set('query', input.query.trim());
  if (input.activity?.trim()) params.set('activity', input.activity.trim());
  if (input.location?.trim()) params.set('location', input.location.trim());
  params.set('limit', String(input.limit || 30));
  return fetchJson(`/api/wellhub/search?${params.toString()}`);
}

export async function fetchWellhubRoutineSuggestion(input: {
  plan: WellhubPlan;
  activity?: string;
  location?: string;
  nextAt: string;
  durationMinutes?: number;
  bufferMinutes?: number;
}): Promise<WellhubRoutineSuggestion> {
  const params = new URLSearchParams({ plan: input.plan, nextAt: input.nextAt });
  if (input.activity?.trim()) params.set('activity', input.activity.trim());
  if (input.location?.trim()) params.set('location', input.location.trim());
  params.set('duration', String(input.durationMinutes || 45));
  params.set('buffer', String(input.bufferMinutes || 120));
  return fetchJson(`/api/wellhub/routine?${params.toString()}`);
}
