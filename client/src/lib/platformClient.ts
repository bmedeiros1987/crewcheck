import { authFetch } from './authClient';

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

export async function getPlatformProfile(): Promise<{ ok: boolean; profile: PlatformProfile; billing: PlatformBilling }> {
  let timezone = 'America/Sao_Paulo';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone; } catch {}
  return authFetch('/api/platform/profile', { headers: { 'x-crewcheck-locale': navigator.language || 'pt-BR', 'x-crewcheck-timezone': timezone } });
}

export async function savePlatformProfile(patch: Partial<Pick<PlatformProfile, 'displayName' | 'locale' | 'timezone' | 'sharePresence'>>): Promise<{ ok: boolean; profile: PlatformProfile; billing: PlatformBilling }> {
  return authFetch('/api/platform/profile', { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function getPlatformBilling(): Promise<PlatformBilling & { ok: boolean; plans: PlatformPlan[] }> {
  return authFetch('/api/platform/billing/status');
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
  return authFetch<any>('/api/platform/rosters/sync', { method: 'POST', body: JSON.stringify({ roster, compliance, sourceName }) });
}

export async function listPlatformStays() {
  return authFetch<any>('/api/platform/hotels/stays');
}

export async function updatePlatformStay(patch: Record<string, unknown>) {
  return authFetch<any>('/api/platform/hotels/stays', { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function findHotelCompanions(hotelKey: string, date: string) {
  return authFetch<any>(`/api/platform/hotels/companions?hotelKey=${encodeURIComponent(hotelKey)}&date=${encodeURIComponent(date)}`);
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
  return authFetch<any>('/api/platform/gyms/checkins', { method: 'POST', body: JSON.stringify(payload) });
}

export async function listGymCrowding(gymKey = '') {
  return authFetch<any>(`/api/platform/gyms/checkins${gymKey ? `?gymKey=${encodeURIComponent(gymKey)}` : ''}`);
}

export async function deleteCrewCheckAccount(confirmation: string) {
  return authFetch<any>('/api/platform/account/delete', { method: 'POST', body: JSON.stringify({ confirmation }) });
}
