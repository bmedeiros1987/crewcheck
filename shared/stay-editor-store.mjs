import { stayInstant } from './stay-edit-plan.mjs';
import { stayTimeZonePreference } from './stay-time-presentation.mjs';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const lead = value => Number.isInteger(value) && value >= 0 && value <= 720;
export function stayEditorKey(accountId) {
  return typeof accountId === 'string' && accountId.trim() ? `crewcheck_stay_editor_v2:${encodeURIComponent(accountId)}` : null;
}
export function emptyStayEditor(accountId) { return { version: 2, accountId, defaultLeadMinutes: 90, defaultWithoutBreakfastMinutes: 60, timeZonePreference: stayTimeZonePreference(), stays: {} }; }
export function sanitizeStayChoice(value) {
  if (value == null) return undefined;
  if (value.mode === 'relative' && lead(value.leadMinutes)) return { mode: 'relative', leadMinutes: value.leadMinutes };
  if (value.mode === 'absolute' && stayInstant(value.alarmAt) !== null && typeof value.timeZone === 'string') {
    try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }); return { mode: 'absolute', alarmAt: value.alarmAt, timeZone: value.timeZone }; } catch {}
  }
  return null;
}
export function readStayEditor(storage, accountId) {
  const key = stayEditorKey(accountId), empty = emptyStayEditor(accountId);
  if (!key) return empty;
  try {
    const raw = JSON.parse(storage.getItem(key) || 'null');
    if (!object(raw) || raw.version !== 2 || raw.accountId !== accountId || !object(raw.stays)) return empty;
    const stays = {};
    for (const [id, value] of Object.entries(raw.stays)) {
      if (!id || !object(value) || value.eventId !== id || typeof value.signature !== 'string' || !object(value.draft)) continue;
      const choice = sanitizeStayChoice(value.choice);
      // Unknown/invalid choices never silently become Auto.
      if (choice === null) continue;
      stays[id] = { ...value, choice, breakfastPlan: ['with', 'without'].includes(value.breakfastPlan) ? value.breakfastPlan : 'unknown', apzConfirmed: value.apzConfirmed === true && value.apzSource === 'manual', alarmState: value.alarmState === 'cancelled' ? 'cancelled' : 'not-programmed' };
    }
    return { ...empty, timeZonePreference: stayTimeZonePreference(raw.timeZonePreference), defaultLeadMinutes: lead(raw.defaultLeadMinutes) ? raw.defaultLeadMinutes : 90,
      defaultWithoutBreakfastMinutes: lead(raw.defaultWithoutBreakfastMinutes) ? raw.defaultWithoutBreakfastMinutes : 60, stays };
  } catch { return empty; }
}
export function writeStayEditor(storage, accountId, state) {
  const key = stayEditorKey(accountId);
  if (!key || state.accountId !== accountId || state.version !== 2) throw new Error('Conta não confirmada para salvar este pernoite.');
  storage.setItem(key, JSON.stringify(state)); // Quota/privacy failures must reach the caller.
}
/** Only authenticated server data with an unambiguous event binding may migrate.
 * A legacy clock has unknown provenance, so it requires explicit APZ confirmation.
 * Unscoped offline caches, automatic learning and old scheduled jobs are never adopted. */
export function migrateLegacyStay(saved, { accountId, eventId, signature, draft }) {
  if (!accountId || !eventId || !saved || saved.localOnly || (saved.rosterEventId && saved.rosterEventId !== eventId)) return null;
  const minutes = Number(saved.leadMinutes);
  return { eventId, signature, draft, timeZone: '', apzDate: draft.stayDate, apzSource: 'legacy-unconfirmed', apzConfirmed: false,
    choice: saved.leadMinutes != null && lead(minutes) ? { mode: 'relative', leadMinutes: minutes } : undefined,
    alarmState: 'not-programmed', migration: 'authenticated-server-unique-match' };
}
