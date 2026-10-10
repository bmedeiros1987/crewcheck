import { getToken } from '@/lib/authClient';
import { peekPendingNavigationContext, setPendingNavigationContext } from '@/lib/navigationContext';

let binding: { token: string; eventId: string } | null = null;

/** Called only by an explicit stay tap. No hotel/room/time values travel in navigation. */
export function openStayProgramEditor(event: { id: string; kind?: string; date?: Date; destination?: string; origin?: string }) {
  const token = getToken();
  if (!token || event.kind !== 'stay' || !event.id) return false;
  binding = { token, eventId: event.id };
  setPendingNavigationContext({ sourceView: 'hotels', targetView: 'presentation', stayId: event.id,
    programId: event.id, dateEpochMs: event.date?.getTime(), airportCode: event.destination || event.origin,
    returnView: 'hotels', returnLabel: 'Voltar ao pernoite', policy: 'persistent-until-return' });
  window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'presentation' }));
  return true;
}

export function readStayEditorIntent(): string | null {
  const context = peekPendingNavigationContext('presentation');
  if (!binding || getToken() !== binding.token) { binding = null; return null; }
  return context?.sourceView === 'hotels' && context.stayId === binding.eventId ? binding.eventId : null;
}

export function returnFromStayProgramEditor() {
  const id = readStayEditorIntent();
  if (!id) return false;
  setPendingNavigationContext({ sourceView: 'presentation', targetView: 'hotels', stayId: id,
    programId: id, policy: 'once' });
  window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'hotels' }));
  return true;
}

/** Return preserves even a removed ID; the caller must show absence, never fall back. */
export function consumeStayEditorReturn(): string | null {
  const context = peekPendingNavigationContext('hotels');
  if (!binding || binding.token !== getToken() || context?.sourceView !== 'presentation' || context.stayId !== binding.eventId) return null;
  const id = binding.eventId;
  setPendingNavigationContext(null); binding = null;
  return id;
}
