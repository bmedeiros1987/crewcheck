import { getStoredUser, getToken } from './authClient';
import { readStayEditor, writeStayEditor } from '@shared/stay-editor-store.mjs';
import { stayTimeZonePreference, type StayTimeZonePreference } from '@shared/stay-time-presentation.mjs';
export function stayEditorAccount() { return getToken() ? getStoredUser()?.id || null : null; }
export function loadStayEditor() { return readStayEditor(localStorage, stayEditorAccount()); }
export function persistStayEditor(state: any, expectedAccount: string | null) {
  if (!expectedAccount || expectedAccount !== stayEditorAccount()) throw new Error('A conta mudou. Reabra o pernoite.');
  writeStayEditor(localStorage, expectedAccount, state);
  window.dispatchEvent(new CustomEvent('crewcheck:stay-editor-saved', { detail: { eventId: state.lastEditedEventId } }));
}
// Presentation-only persistence cannot accept or invalidate an operational edit.
export function persistStayDisplayPreference(value: StayTimeZonePreference, expectedAccount: string | null) {
  if (!expectedAccount || expectedAccount !== stayEditorAccount()) throw new Error('A conta mudou. Reabra o pernoite.');
  const current = readStayEditor(localStorage, expectedAccount);
  writeStayEditor(localStorage, expectedAccount, { ...current, timeZonePreference: stayTimeZonePreference(value) });
}
export function savedStayEditorEvent(eventId: string, event?: any) {
  const record = loadStayEditor().stays[eventId] || null;
  if (!record || !event) return record;
  const signature = [event.id,event.canonical?.startDateTime,event.canonical?.endDateTime,event.origin,event.destination].join('|');
  return { ...record, apzConfirmed: record.apzConfirmed && record.signature === signature };
}
