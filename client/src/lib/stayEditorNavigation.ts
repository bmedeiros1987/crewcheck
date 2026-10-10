import { getStoredUser, getToken } from '@/lib/authClient';
import { peekPendingNavigationContext, setPendingNavigationContext } from '@/lib/navigationContext';
import { toast } from 'sonner';

let binding: { token: string; accountId: string; eventId: string } | null = null;
function account() { return getToken() ? getStoredUser()?.id || null : null; }
function originKey() { const id = account(); return id ? `crewcheck_stay_editor_origin_v1:${encodeURIComponent(id)}` : null; }

/** Only a boolean origin marker survives reload. No event, roster, room or clock
 * is persisted here, so reload always requires fresh explicit stay selection. */
export function hasStoredStayEditorOrigin(): boolean {
  const key = originKey();
  if (!key) return false;
  try { return sessionStorage.getItem(key) === 'hotels'; } catch { return false; }
}
export function clearStoredStayEditorOrigin() {
  const key = originKey(); if (!key) return;
  try { sessionStorage.removeItem(key); } catch {}
}

/** Called only by an explicit stay tap. No hotel/room/APZ values travel in navigation. */
export function openStayProgramEditor(event: { id: string; kind?: string; date?: Date; destination?: string; origin?: string }) {
  const token = getToken(), accountId = account(), key = originKey();
  if (!token || !accountId || !key || event.kind !== 'stay' || !event.id) return false;
  try { sessionStorage.setItem(key, 'hotels'); }
  catch { toast.error('Não foi possível manter o contexto deste editor. Reabra pela lista de pernoites.'); return false; }
  binding = { token, accountId, eventId: event.id };
  setPendingNavigationContext({ sourceView: 'hotels', targetView: 'presentation', stayId: event.id,
    programId: event.id, dateEpochMs: event.date?.getTime(), airportCode: event.destination || event.origin,
    returnView: 'hotels', returnLabel: 'Voltar ao pernoite', policy: 'persistent-until-return' });
  window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'presentation' }));
  return true;
}

export function readStayEditorIntent(): string | null {
  const context = peekPendingNavigationContext('presentation');
  if (!binding || getToken() !== binding.token || account() !== binding.accountId) { binding = null; return null; }
  return context?.sourceView === 'hotels' && context.stayId === binding.eventId ? binding.eventId : null;
}

export function returnFromStayProgramEditor() {
  const id = readStayEditorIntent();
  clearStoredStayEditorOrigin();
  // Reload or a lost/invalid context returns to the list without a guessed ID.
  setPendingNavigationContext(id ? { sourceView: 'presentation', targetView: 'hotels', stayId: id,
    programId: id, policy: 'once' } : null);
  window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'hotels' }));
  return true;
}

/** Return preserves even a removed ID; the caller must show absence, never fall back. */
export function consumeStayEditorReturn(): string | null {
  const context = peekPendingNavigationContext('hotels');
  if (!binding || binding.token !== getToken() || account() !== binding.accountId || context?.sourceView !== 'presentation' || context.stayId !== binding.eventId) return null;
  const id = binding.eventId;
  setPendingNavigationContext(null); binding = null;
  return id;
}
