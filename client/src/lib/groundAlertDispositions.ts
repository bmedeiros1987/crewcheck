import { alertAccount, complianceAlertIdentity, type AlertIdentity } from './alertReviewStore';
import { alertRosterOwned } from './alertRosterOwnership';
export const GROUND_DISPOSITION_EVENT = 'crewcheck:ground-alert-disposition-changed';
const LEGACY_KEY = 'crewcheck_compliance_alert_dispositions_v1';
type State = { version: 2; owner: string; legacyResolved: boolean; ignored: Array<AlertIdentity & { at: string }> };
const key = (owner: string) => 'crewcheck:ground-alert-dispositions:v2:' + owner;
export const isGroundLimitAlert = (alert: any) => alert?.title === 'Tempo em solo entre etapas acima do limite ACT';
function read(owner = alertAccount()): State | null {
  if (!owner) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(key(owner)) || 'null');
    if (saved?.version === 2 && saved.owner === owner && Array.isArray(saved.ignored)) return {
      ...saved, legacyResolved: saved.legacyResolved === true,
      ignored: saved.ignored.filter((row: any) => typeof row?.occurrence === 'string' && typeof row?.version === 'string' && Number.isFinite(Date.parse(row.at))),
    };
  } catch {}
  return { version: 2, owner, legacyResolved: false, ignored: [] };
}
function persist(state: State, roster: any, expectedOwner: string | null): boolean {
  if (!expectedOwner || state.owner !== expectedOwner || alertAccount() !== expectedOwner || !alertRosterOwned(roster)) return false;
  try {
    localStorage.setItem(key(expectedOwner), JSON.stringify(state));
    window.dispatchEvent(new Event(GROUND_DISPOSITION_EVENT)); return true;
  } catch { return false; }
}
export function isGroundAlertIgnored(identity: AlertIdentity): boolean {
  return !!read()?.ignored.some(row => row.occurrence === identity.occurrence && row.version === identity.version);
}
export function ignoreGroundAlert(alert: any, roster: any, expectedOwner: string | null): boolean {
  const state = read(); if (!state || !isGroundLimitAlert(alert)) return false;
  const identity = complianceAlertIdentity(alert, roster);
  state.ignored = state.ignored.filter(row => row.occurrence !== identity.occurrence || row.version !== identity.version);
  state.ignored.push({ ...identity, at: new Date().toISOString() });
  return persist(state, roster, expectedOwner);
}
export function restoreGroundAlerts(roster: any, expectedOwner: string | null): boolean {
  const state = read(); if (!state) return false;
  state.ignored = []; state.legacyResolved = true;
  return persist(state, roster, expectedOwner);
}
/** Ownerless legacy preferences are never silently assigned to a signed-in user.
 * Only exact matches to this account's selected publication can be confirmed;
 * labels/details always come from the current alert, never the legacy store. */
export function pendingLegacyGroundAlerts(alerts: any[], roster: any): any[] {
  if (!alertRosterOwned(roster) || read()?.legacyResolved) return [];
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (!legacy || Array.isArray(legacy) || typeof legacy !== 'object') return [];
    return alerts.filter(alert => {
      if (!isGroundLimitAlert(alert)) return false;
      const fingerprint = [alert.title, alert.date, alert.description, alert.legalReference].map(value => String(value || '').trim()).join('|');
      const row = legacy[fingerprint];
      return row?.reason === 'user_schedule_change' && Number.isFinite(Date.parse(row.ignoredAt))
        && row.alertTitle === alert.title && String(row.alertDate || '') === String(alert.date || '');
    });
  } catch { return []; }
}
export function applyLegacyGroundAlerts(alerts: any[], roster: any, expectedOwner: string | null): boolean {
  const state = read(); if (!state) return false;
  const matches = pendingLegacyGroundAlerts(alerts, roster); if (!matches.length) return false;
  for (const alert of matches) {
    const identity = complianceAlertIdentity(alert, roster);
    if (!state.ignored.some(row => row.occurrence === identity.occurrence && row.version === identity.version))
      state.ignored.push({ ...identity, at: new Date().toISOString() });
  }
  state.legacyResolved = true;
  return persist(state, roster, expectedOwner);
}
