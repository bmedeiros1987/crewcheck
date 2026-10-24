// Only an account/device display preference. No money, token or source data.
export const FINANCIAL_PRIVACY_PREFIX = 'crewcheck:financial-privacy:v2:';
const memory = new Map<string, boolean>();
function deviceStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
export function financialValuesHidden(owner: string | null): boolean {
  if (!owner) return true;
  if (memory.has(owner)) return memory.get(owner)!;
  try {
    const storage = deviceStorage();
    if (!storage) return memory.get(owner) ?? true;
    const value = storage.getItem(FINANCIAL_PRIVACY_PREFIX + encodeURIComponent(owner));
    if (value === 'hidden') return true;
    if (value === 'shown') return false;
    if (value !== null) return true;
    return memory.get(owner) ?? false;
  } catch { return memory.get(owner) ?? true; }
}
export function toggleFinancialValues(owner: string | null): void {
  if (!owner) return;
  const hidden = !financialValuesHidden(owner);
  const storage = deviceStorage();
  try {
    if (!storage) { memory.set(owner, hidden); return; }
    storage.setItem(FINANCIAL_PRIVACY_PREFIX + encodeURIComponent(owner), hidden ? 'hidden' : 'shown');
    memory.delete(owner);
  } catch { memory.set(owner, hidden); }
}

// A real storage event from another tab supplies a newer device preference.
// Unrelated storage events cannot discard a local write-failure overlay.
export function invalidateFinancialPrivacyPreference(key: string | null | undefined): void {
  if (key === null) { memory.clear(); return; }
  if (typeof key !== 'string' || !key.startsWith(FINANCIAL_PRIVACY_PREFIX)) return;
  try { memory.delete(decodeURIComponent(key.slice(FINANCIAL_PRIVACY_PREFIX.length))); } catch { /* malformed unrelated key */ }
}
