import type { FemCheckin, FemCycleRecord } from './crewLifeFem';

export type FemConsent = { active: boolean; acceptedAt: string; version: '1.0' };
export type FemStore = { consent: FemConsent; cycles: FemCycleRecord[]; checkins: FemCheckin[] };
export const EMPTY_FEM_STORE: FemStore = { consent: { active: false, acceptedAt: '', version: '1.0' }, cycles: [], checkins: [] };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const PREFIX = 'crewcheck:private:life:fem:v2';

function identityKey(): string {
  try {
    const user = JSON.parse(localStorage.getItem('crewcheck_auth_user') || '{}');
    const identity = String(user.id || user.email || 'device').trim().toLowerCase();
    return identity.replace(/[^a-z0-9._-]/g, '_').slice(0, 96) || 'device';
  } catch { return 'device'; }
}

export function femVaultKey(identity = identityKey()): string { return `${PREFIX}:${identity}`; }
function validIso(value: unknown): value is string { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }

function sanitizeStore(value: unknown): FemStore {
  if (!value || typeof value !== 'object') return EMPTY_FEM_STORE;
  const candidate = value as Partial<FemStore>;
  const consent = candidate.consent?.version === '1.0' && typeof candidate.consent.active === 'boolean'
    ? { ...candidate.consent, acceptedAt: validIso(candidate.consent.acceptedAt) ? candidate.consent.acceptedAt : '' }
    : EMPTY_FEM_STORE.consent;
  const cycles = Array.isArray(candidate.cycles) ? candidate.cycles.filter((item) =>
    Boolean(item && typeof item.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.periodStart) && validIso(item.createdAt))) : [];
  const checkins = Array.isArray(candidate.checkins) ? candidate.checkins.filter((item) =>
    Boolean(item && typeof item.id === 'string' && validIso(item.at) && Array.isArray(item.symptoms))) : [];
  return { consent, cycles: cycles.slice(-240), checkins: checkins.slice(-2000) };
}

export function readFemVault(storage: StorageLike = localStorage): FemStore {
  try {
    const raw = storage.getItem(femVaultKey());
    if (!raw) return EMPTY_FEM_STORE;
    const envelope = JSON.parse(raw);
    if (envelope?.schemaVersion !== 2 || envelope?.dataClass !== 'reproductive_private') return EMPTY_FEM_STORE;
    return sanitizeStore(envelope.payload);
  } catch { return EMPTY_FEM_STORE; }
}

export function writeFemVault(value: FemStore, storage: StorageLike = localStorage): void {
  storage.setItem(femVaultKey(), JSON.stringify({ schemaVersion: 2, dataClass: 'reproductive_private', localOnly: true, exportAllowed: false, updatedAt: new Date().toISOString(), payload: sanitizeStore(value) }));
}

export function eraseFemVault(storage: StorageLike = localStorage): void {
  storage.removeItem(femVaultKey());
  storage.removeItem('crewcheck:life:fem:v1');
}
