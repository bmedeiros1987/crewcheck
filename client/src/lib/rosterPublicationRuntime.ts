import { getStoredUser, getToken } from './authClient';
import { consultedChange, observePublication, publication, readReview, reviewKey, writeReview, type PublishedEvent, type ReviewState } from './rosterPublicationReview';
const notification = 'crewcheck:publication-review';
let failure: { owner: string; message: string } | null = null;
export function publicationReviewStatus() {
  const owner = publicationOwner();
  if (!navigator.locks?.request) return 'Acompanhamento de leitura indisponível neste navegador. Nenhuma leitura será registrada.';
  return owner && failure?.owner === owner ? failure.message : '';
}
function unavailable(owner: string) { failure = { owner, message: 'Não foi possível salvar o acompanhamento local. A leitura permanece pendente.' }; window.dispatchEvent(new Event(notification)); return false; }
export function publicationOwner(): string | null {
  try { return getToken() ? getStoredUser()?.id || null : null; } catch { return null; }
}
export function currentPublicationReview(): ReviewState | null {
  const owner = publicationOwner();
  return owner ? readReview(localStorage, owner) : null;
}
/** Serialize read/modify/write across tabs. Unsupported/blocked storage fails closed. */
async function mutate(owner: string | null, update: (state: ReviewState | null) => ReviewState | null): Promise<boolean> {
  if (!owner || owner !== publicationOwner() || !navigator.locks?.request) return false;
  try {
    return await navigator.locks.request(reviewKey(owner), () => {
      if (owner !== publicationOwner()) return false;
      const next = update(readReview(localStorage, owner));
      if (!next) return false;
      if (!writeReview(localStorage, next)) return unavailable(owner);
      failure = null;
      window.dispatchEvent(new Event(notification));
      return true;
    });
  } catch { return unavailable(owner); }
}
/** Only confirmed imports or authenticated account publications may call this. Never cache rendering. */
export function recordPublication(owner: string | null, events: PublishedEvent[], expectedRevision?: string | null) {
  const incoming = publication(events);
  return mutate(owner, state => {
    if (expectedRevision !== undefined && (state?.publication.revision ?? null) !== expectedRevision && state?.publication.revision !== incoming.revision) {
      failure = { owner: owner!, message: 'Outra publicação chegou durante esta consulta. A comparação desta resposta não foi registrada; consulte a escala oficial.' };
      window.dispatchEvent(new Event(notification));
      return null;
    }
    return observePublication(owner!, state, incoming);
  });
}
export function consultPublicationChange(owner: string, id: number, version: number) {
  return mutate(owner, state => state ? consultedChange(state, owner, id, version) : null);
}
export function subscribePublicationReview(refresh: () => void) {
  const onStorage = (event: StorageEvent) => {
    const owner = publicationOwner();
    if (!event.key || event.key === 'crewcheck_auth_user' || event.key === 'crewcheck_auth_token' || (owner && event.key === reviewKey(owner))) refresh();
  };
  window.addEventListener(notification, refresh);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', refresh);
  window.addEventListener('crewcheck:auth-expired', refresh);
  return () => { window.removeEventListener(notification, refresh); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refresh); window.removeEventListener('crewcheck:auth-expired', refresh); };
}
