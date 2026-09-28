import { authFetch, getStoredUser } from './authClient';

export type CrewCheckLocale = 'pt-BR' | 'en-US' | 'es-ES';
export type CrewCheckPlanId = 'free' | 'premium_monthly' | 'premium_annual' | 'premium_unlimited';

export type PlatformPlan = {
  id: CrewCheckPlanId;
  name: string;
  cycle: string;
  currency: 'BRL';
  value: number;
  callLimit: number;
  features: string[];
  googlePlayProductId?: string | null;
  webCheckout: boolean;
  adminGrantOnly: boolean;
  trialDays: number;
  annualSavings?: number;
};

export type PlatformCatalog = {
  ok: boolean;
  version: string;
  encoding: 'UTF-8';
  defaultLocale: CrewCheckLocale;
  supportedLocales: CrewCheckLocale[];
  defaultTimezone: string;
  plans: PlatformPlan[];
  disclosures: Record<string, string>;
};

export type PlatformProfile = {
  email: string;
  publicId: string;
  displayName: string;
  locale: CrewCheckLocale;
  timezone: string;
  plan: CrewCheckPlanId;
  sharePresence: boolean;
};

export type PlatformBilling = {
  plan: CrewCheckPlanId;
  status: string;
  provider?: string | null;
  productId?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  premiumAccess: boolean;
  entitlements?: Record<string, boolean>;
  usage: { kind: 'wakeup_call'; monthKey: string; used: number; limit: number; remaining: number };
};

export type PlatformParkingPosition = {
  lat: number;
  lng: number;
  accuracy?: number;
  level?: string;
  spot?: string;
  reference?: string;
  notes?: string;
  label?: string;
  savedAt: string;
  localOnly?: boolean;
};

const LOCAL_PROFILE_KEY = 'crewcheck_platform_profile_cache_v1';
const LOCAL_BILLING_KEY = 'crewcheck_platform_billing_cache_v1';
const LOCAL_STAYS_KEY = 'crewcheck_platform_stays_cache_v1';
const LOCAL_GYM_KEY = 'crewcheck_platform_gym_checkins_local_v1';
const LOCAL_PARKING_KEY = 'crewcheck_my_car_parking_position_v1';

function readLocal<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
}
function writeLocal(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function removeLocal(key: string): void {
  try { localStorage.removeItem(key); } catch {}
}
function localBilling(): PlatformBilling & { ok: boolean; plans: PlatformPlan[]; localOnly: true } {
  const cached = readLocal<Partial<PlatformBilling>>(LOCAL_BILLING_KEY, {});
  const plan = cached.plan || 'free';
  const limit = Number(cached.usage?.limit ?? (plan === 'free' ? 1 : plan === 'premium_unlimited' ? 60 : 20));
  const used = Number(cached.usage?.used || 0);
  const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  return { ok: true, plans: [], localOnly: true, plan, status: cached.status || 'offline', provider: cached.provider || null, productId: cached.productId || null, currentPeriodEnd: cached.currentPeriodEnd || null, cancelAtPeriodEnd: Boolean(cached.cancelAtPeriodEnd), premiumAccess: plan !== 'free', entitlements: cached.entitlements || {}, usage: { kind: 'wakeup_call', monthKey, used, limit, remaining: Math.max(0, limit - used) } };
}
function localProfile(): PlatformProfile {
  const cached = readLocal<Partial<PlatformProfile>>(LOCAL_PROFILE_KEY, {});
  const user: any = getStoredUser?.() || {};
  return {
    email: cached.email || user.email || '',
    publicId: cached.publicId || 'CC-OFFLINE',
    displayName: cached.displayName || user.name || user.displayName || 'Tripulante',
    locale: cached.locale || 'pt-BR',
    timezone: cached.timezone || 'America/Sao_Paulo',
    plan: cached.plan || 'free',
    sharePresence: Boolean(cached.sharePresence),
  };
}

export type PlatformPermissions = {
  roster: boolean;
  map: boolean;
  hotels: boolean;
  room: boolean;
  presentation: boolean;
  radar: boolean;
  contact: boolean;
  emergency: boolean;
  chat: boolean;
};

export const defaultVisitorPermissions: PlatformPermissions = {
  roster: true,
  map: true,
  hotels: false,
  room: false,
  presentation: true,
  radar: false,
  contact: true,
  emergency: true,
  chat: false,
};

export async function getPlatformCatalog(): Promise<PlatformCatalog> {
  const response = await fetch('/api/platform/catalog', { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não consegui carregar os planos.');
  return payload;
}

export async function getPlatformProfile(): Promise<{ ok: boolean; profile: PlatformProfile; billing: PlatformBilling; localOnly?: boolean }> {
  let timezone = 'America/Sao_Paulo';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone; } catch {}
  try {
    const payload = await authFetch<{ ok: boolean; profile: PlatformProfile; billing: PlatformBilling }>('/api/platform/profile', { headers: { 'x-crewcheck-locale': navigator.language || 'pt-BR', 'x-crewcheck-timezone': timezone } });
    writeLocal(LOCAL_PROFILE_KEY, payload.profile);
    writeLocal(LOCAL_BILLING_KEY, payload.billing);
    return payload;
  } catch {
    return { ok: true, profile: localProfile(), billing: localBilling(), localOnly: true };
  }
}

export async function savePlatformProfile(patch: Partial<Pick<PlatformProfile, 'displayName' | 'locale' | 'timezone' | 'sharePresence'>>): Promise<{ ok: boolean; profile: PlatformProfile; billing: PlatformBilling; localOnly?: boolean }> {
  const local = { ...localProfile(), ...patch };
  writeLocal(LOCAL_PROFILE_KEY, local);
  try {
    const payload = await authFetch<{ ok: boolean; profile: PlatformProfile; billing: PlatformBilling }>('/api/platform/profile', { method: 'PATCH', body: JSON.stringify(patch) });
    writeLocal(LOCAL_PROFILE_KEY, payload.profile);
    writeLocal(LOCAL_BILLING_KEY, payload.billing);
    return payload;
  } catch {
    return { ok: true, profile: local, billing: localBilling(), localOnly: true };
  }
}

export async function getPlatformBilling(): Promise<PlatformBilling & { ok: boolean; plans: PlatformPlan[]; localOnly?: boolean }> {
  try {
    const payload = await authFetch<PlatformBilling & { ok: boolean; plans: PlatformPlan[] }>('/api/platform/billing/status');
    writeLocal(LOCAL_BILLING_KEY, payload);
    return payload;
  } catch {
    return localBilling();
  }
}

export async function createWebSubscription(plan: 'premium_monthly' | 'premium_annual', cpfCnpj: string, billingType = 'UNDEFINED') {
  return authFetch<any>('/api/platform/billing/asaas/checkout', {
    method: 'POST',
    headers: { 'x-crewcheck-platform': 'web' },
    body: JSON.stringify({ plan, cpfCnpj, billingType, platform: 'web' }),
  });
}

export async function cancelSubscription() {
  return authFetch<any>('/api/platform/billing/cancel', { method: 'POST', body: '{}' });
}

type AndroidBillingBridge = {
  isReady?: () => boolean;
  queryProducts?: (productIdsJson: string) => void;
  purchase?: (productId: string, obfuscatedAccountId: string) => void;
  restorePurchases?: () => void;
  acknowledge?: (purchaseToken: string) => void;
};

declare global {
  interface Window {
    AndroidCrewCheckBilling?: AndroidBillingBridge;
    __crewcheckBillingResult?: unknown;
  }
}

export function hasGooglePlayBillingBridge(): boolean {
  return Boolean(window.AndroidCrewCheckBilling && typeof window.AndroidCrewCheckBilling.purchase === 'function');
}

export function queryGooglePlayProducts(productIds: string[]): void {
  if (!window.AndroidCrewCheckBilling?.queryProducts) return;
  window.AndroidCrewCheckBilling.queryProducts(JSON.stringify(productIds.filter(Boolean)));
}

export function startGooglePlayPurchase(productId: string, publicId: string): void {
  if (!hasGooglePlayBillingBridge()) throw new Error('Abra esta opção no aplicativo Android instalado pela Google Play.');
  window.AndroidCrewCheckBilling!.purchase!(productId, publicId);
}

export function restoreGooglePlayPurchases(): void {
  if (!hasGooglePlayBillingBridge()) throw new Error('A restauração Google Play está disponível no aplicativo Android.');
  window.AndroidCrewCheckBilling!.restorePurchases!();
}

export function acknowledgeGooglePlayPurchase(purchaseToken: string): void {
  window.AndroidCrewCheckBilling?.acknowledge?.(purchaseToken);
}

export async function verifyGooglePlayPurchase(productId: string, purchaseToken: string) {
  return authFetch<any>('/api/platform/billing/google-play/verify', {
    method: 'POST',
    body: JSON.stringify({ productId, purchaseToken }),
  });
}

export async function syncPlatformRoster(roster: unknown, compliance: unknown, sourceName: string) {
  try {
    return await authFetch<any>('/api/platform/rosters/sync', { method: 'POST', body: JSON.stringify({ roster, compliance, sourceName }) });
  } catch {
    writeLocal('crewcheck_platform_roster_pending_v1', { roster, compliance, sourceName, savedAt: new Date().toISOString() });
    return { ok: true, localOnly: true, queued: true };
  }
}

export async function listPlatformStays() {
  try {
    const payload = await authFetch<any>('/api/platform/hotels/stays');
    writeLocal(LOCAL_STAYS_KEY, payload.stays || []);
    return payload;
  } catch {
    return { ok: true, stays: readLocal<any[]>(LOCAL_STAYS_KEY, []), localOnly: true };
  }
}

export async function updatePlatformStay(patch: Record<string, unknown>) {
  const items = readLocal<any[]>(LOCAL_STAYS_KEY, []);
  const key = String(patch.id || patch.hotelKey || patch.stayDate || Date.now());
  const next = [...items.filter((item) => String(item.id || item.hotelKey || item.stayDate) !== key), { ...patch, id: patch.id || key, updatedAt: new Date().toISOString() }];
  writeLocal(LOCAL_STAYS_KEY, next);
  try {
    const payload = await authFetch<any>('/api/platform/hotels/stays', { method: 'PATCH', body: JSON.stringify(patch) });
    if (payload.stays) writeLocal(LOCAL_STAYS_KEY, payload.stays);
    return payload;
  } catch {
    return { ok: true, stays: next, localOnly: true };
  }
}

export async function findHotelCompanions(hotelKey: string, date: string) {
  try {
    return await authFetch<any>(`/api/platform/hotels/companions?hotelKey=${encodeURIComponent(hotelKey)}&date=${encodeURIComponent(date)}`);
  } catch {
    return { ok: true, companions: [], localOnly: true };
  }
}

export async function listVisitors() {
  return authFetch<any>('/api/platform/visitors');
}

export async function createVisitor(payload: { email: string; displayName?: string; telegram?: string; permissions: PlatformPermissions }) {
  return authFetch<any>('/api/platform/visitors', { method: 'POST', body: JSON.stringify(payload) });
}

export async function revokeVisitor(id: string) {
  return authFetch<any>(`/api/platform/visitors/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: '{}' });
}

export async function updateVisitorPermissions(id: string, permissions: PlatformPermissions) {
  return authFetch<any>(`/api/platform/visitors/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ permissions }) });
}

export async function listShares() {
  return authFetch<any>('/api/platform/shares');
}

export async function createRosterShare(payload: { rosterKey?: string; kind?: string; expiresHours?: number; permissions: PlatformPermissions }) {
  return authFetch<any>('/api/platform/shares', { method: 'POST', body: JSON.stringify(payload) });
}

export async function revokeShare(id: string) {
  return authFetch<any>(`/api/platform/shares/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: '{}' });
}

export async function listConnections() {
  return authFetch<any>('/api/platform/connections');
}

export async function requestConnection(identifier: string) {
  const value = String(identifier || '').trim();
  return authFetch<any>('/api/platform/connections', { method: 'POST', body: JSON.stringify(value.includes('@') ? { email: value, chat: true } : { publicId: value, chat: true }) });
}

export async function answerConnection(id: string, accepted: boolean) {
  return authFetch<any>('/api/platform/connections', { method: 'PATCH', body: JSON.stringify({ id, status: accepted ? 'accepted' : 'declined' }) });
}

export async function compareRoster(publicId: string) {
  return authFetch<any>(`/api/platform/compare?publicId=${encodeURIComponent(publicId)}`);
}

export async function loadChat(publicId: string) {
  return authFetch<any>(`/api/platform/chat?publicId=${encodeURIComponent(publicId)}`);
}

export async function sendChat(publicId: string, message: string) {
  return authFetch<any>('/api/platform/chat', { method: 'POST', body: JSON.stringify({ publicId, message }) });
}

export async function loadVisitorChat(visitorId: string) {
  return authFetch<any>(`/api/platform/visitors/${encodeURIComponent(visitorId)}/chat`);
}

export async function sendVisitorChat(visitorId: string, message: string) {
  return authFetch<any>(`/api/platform/visitors/${encodeURIComponent(visitorId)}/chat`, { method: 'POST', body: JSON.stringify({ message }) });
}

export async function gymCheckIn(payload: { gymName: string; chainName?: string; location?: string; sharePresence: boolean; durationMinutes?: number }) {
  const checkedInAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.min(240, Math.max(15, Number(payload.durationMinutes || 90))) * 60_000).toISOString();
  const localEntry = { ...payload, id: 'local-' + Date.now(), checkedInAt, expiresAt };
  const current = readLocal<any[]>(LOCAL_GYM_KEY, []).filter((item) => new Date(item.expiresAt || 0).getTime() > Date.now());
  writeLocal(LOCAL_GYM_KEY, [localEntry, ...current.filter((item) => item.gymName !== payload.gymName)].slice(0, 20));
  try {
    return await authFetch<any>('/api/platform/gyms/checkins', { method: 'POST', body: JSON.stringify(payload) });
  } catch {
    return { ok: true, localOnly: true, gyms: [{ gymName: payload.gymName, chainName: payload.chainName || '', peopleSharing: 0, crowdLabel: 'Check-in salvo somente neste dispositivo', lastReport: checkedInAt }] };
  }
}

export async function listGymCrowding(gymKey = '') {
  try {
    const suffix = gymKey ? '?gymKey=' + encodeURIComponent(gymKey) : '';
    return await authFetch<any>('/api/platform/gyms/checkins' + suffix);
  } catch {
    const entries = readLocal<any[]>(LOCAL_GYM_KEY, []).filter((item) => new Date(item.expiresAt || 0).getTime() > Date.now());
    return { ok: true, localOnly: true, gyms: entries.map((item) => ({ gymName: item.gymName, chainName: item.chainName || '', peopleSharing: 0, crowdLabel: 'Presença local privada', lastReport: item.checkedInAt })) };
  }
}

export async function getParkingPosition(): Promise<{ ok: boolean; position: PlatformParkingPosition | null; localOnly?: boolean }> {
  const local = readLocal<PlatformParkingPosition | null>(LOCAL_PARKING_KEY, null);
  try {
    const payload = await authFetch<{ ok: boolean; position: PlatformParkingPosition | null }>('/api/platform/parking');
    if (payload.position) writeLocal(LOCAL_PARKING_KEY, payload.position);
    return payload;
  } catch {
    return { ok: true, position: local ? { ...local, localOnly: true } : null, localOnly: true };
  }
}

export async function saveParkingPosition(position: PlatformParkingPosition): Promise<{ ok: boolean; position: PlatformParkingPosition; localOnly?: boolean }> {
  writeLocal(LOCAL_PARKING_KEY, { ...position, localOnly: true });
  try {
    const payload = await authFetch<{ ok: boolean; position: PlatformParkingPosition }>('/api/platform/parking', { method: 'POST', body: JSON.stringify(position) });
    writeLocal(LOCAL_PARKING_KEY, { ...payload.position, localOnly: false });
    return payload;
  } catch {
    return { ok: true, position: { ...position, localOnly: true }, localOnly: true };
  }
}

export async function deleteParkingPosition(): Promise<{ ok: boolean; localOnly?: boolean }> {
  removeLocal(LOCAL_PARKING_KEY);
  try {
    return await authFetch<{ ok: boolean }>('/api/platform/parking', { method: 'DELETE' });
  } catch {
    return { ok: true, localOnly: true };
  }
}

export async function deleteCrewCheckAccount(confirmation: string) {
  return authFetch<any>('/api/platform/account/delete', { method: 'POST', body: JSON.stringify({ confirmation }) });
}
