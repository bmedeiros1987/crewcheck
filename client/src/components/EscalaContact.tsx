import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone } from 'lucide-react';
import { authFetch, captureAuthSession } from '@/lib/authClient';
import { ESCALA_CONTACT_ADMIN_PATH, ESCALA_CONTACT_READ_PATH, escalaTelUri, validEscalaContact, validEscalaDialString, type EscalaContact } from '../../../shared/escala-contact.mjs';
import './EscalaContact.css';

type Session = ReturnType<typeof captureAuthSession>;
type ContactState = { status: 'loading' | 'unavailable' | 'ready'; contact?: EscalaContact; session?: Session };
const changedEvent = 'crewcheck:escala-contact-changed';
function responseContact(value: unknown) {
  const payload = value as { ok?: boolean; contact?: unknown } | null;
  if (payload?.ok !== true || !validEscalaContact(payload.contact)) throw new Error('Contato indisponível.');
  return payload.contact;
}
function useEscalaContact(admin: boolean) {
  const [state, setState] = useState<ContactState>({ status: 'loading' });
  const request = useRef(0);
  const refresh = useCallback(() => {
    const generation = ++request.current, session = captureAuthSession();
    setState({ status: 'loading', session });
    if (!session.token || !session.owner) { setState({ status: 'unavailable' }); return; }
    authFetch<unknown>(admin ? ESCALA_CONTACT_ADMIN_PATH : ESCALA_CONTACT_READ_PATH, { cache: 'no-store' })
      .then(responseContact).then(contact => {
        if (generation === request.current && session.isCurrent()) setState({ status: 'ready', contact, session });
      }).catch(() => {
        if (generation === request.current && session.isCurrent()) setState({ status: 'unavailable', session });
      });
  }, [admin]);
  useEffect(() => {
    const invalidate = () => { request.current++; setState({ status: 'unavailable' }); };
    const storage = (event: StorageEvent) => { if (event.key === null || ['crewcheck_auth_token', 'crewcheck_auth_user'].includes(event.key)) refresh(); };
    refresh();
    window.addEventListener('crewcheck:auth-will-change', invalidate);
    for (const event of ['crewcheck:auth-changed', 'crewcheck:auth-expired', changedEvent]) window.addEventListener(event, refresh);
    window.addEventListener('storage', storage);
    if (!admin) window.addEventListener('focus', refresh);
    return () => {
      request.current++;
      window.removeEventListener('crewcheck:auth-will-change', invalidate);
      for (const event of ['crewcheck:auth-changed', 'crewcheck:auth-expired', changedEvent]) window.removeEventListener(event, refresh);
      window.removeEventListener('storage', storage);
      if (!admin) window.removeEventListener('focus', refresh);
    };
  }, [admin, refresh]);
  const ready = state.status === 'ready' && Boolean(state.session?.isCurrent());
  return { state, ready, refresh };
}

export function EscalaContactButton() {
  const { state, ready } = useEscalaContact(false);
  const href = ready ? escalaTelUri(state.contact?.dialString) : null;
  return <span className="cc-escala-contact">
    {href ? <a className="cc-escala-dial" href={href} aria-label="Escala" title="Escala" onClick={event => { if (!state.session?.isCurrent()) event.preventDefault(); }}><Phone aria-hidden="true"/></a>
      : <button className="cc-escala-dial" type="button" disabled aria-label="Escala" title="Contato da Escala indisponível"><Phone aria-hidden="true"/></button>}
    {!ready && state.status !== 'loading' && <small role="status">Contato da Escala indisponível.</small>}
  </span>;
}

export function EscalaContactAdmin() {
  const { state, ready, refresh } = useEscalaContact(true);
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [mustReload, setMustReload] = useState(false);
  const pending = useRef(false);
  const saveGeneration = useRef(0);
  useEffect(() => {
    // An old account's unresolved write must neither lock the next editor nor
    // clear a newer editor's busy state when its response eventually arrives.
    const invalidate = () => { saveGeneration.current++; pending.current = false; setBusy(false); };
    const storage = (event: StorageEvent) => { if (event.key === null || ['crewcheck_auth_token', 'crewcheck_auth_user'].includes(event.key)) invalidate(); };
    for (const event of ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired']) window.addEventListener(event, invalidate);
    window.addEventListener('storage', storage);
    return () => { saveGeneration.current++; pending.current = false; for (const event of ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired']) window.removeEventListener(event, invalidate); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => { setDraft(ready ? state.contact!.dialString : ''); setMessage(''); setMustReload(false); }, [state, ready]);
  async function save() {
    if (pending.current || mustReload || !ready || !state.contact || !state.session?.isCurrent() || !validEscalaDialString(draft)) return;
    pending.current = true; setBusy(true); setMessage('');
    const generation = ++saveGeneration.current;
    const session = state.session;
    const expectedRevision = state.contact.revision;
    try {
      const contact = responseContact(await authFetch<unknown>(ESCALA_CONTACT_ADMIN_PATH, { method: 'PUT', body: JSON.stringify({ dialString: draft, expectedRevision }) }));
      if (generation !== saveGeneration.current || !session.isCurrent()) return;
      if (contact.dialString !== draft || contact.revision !== expectedRevision + 1) throw new Error('Resposta do contato não confirmada.');
      window.dispatchEvent(new Event(changedEvent));
    } catch {
      if (generation === saveGeneration.current && session.isCurrent()) { setMustReload(true); setMessage('Alteração não confirmada. Recarregue o contato antes de tentar novamente.'); }
    } finally { if (generation === saveGeneration.current) { pending.current = false; setBusy(false); } }
  }
  return <section className="cc-escala-admin" aria-label="Contato central da Escala">
    <h2>Contato da Escala</h2>
    <p>Contato central deste sistema. O ícone apenas abre o discador; a ligação depende da confirmação no celular.</p>
    {ready ? <><label>Telefone<input type="tel" autoComplete="off" value={draft} onChange={event => setDraft(event.target.value)} disabled={busy} aria-describedby="cc-escala-format"/></label>
      <small id="cc-escala-format">Use 8 a 15 dígitos, com + opcional para formato internacional. Zeros iniciais são preservados. Sem espaços, ramal ou códigos especiais.</small>
      <div><button type="button" onClick={save} disabled={busy || mustReload || !validEscalaDialString(draft) || draft === state.contact?.dialString}>Salvar contato</button><button type="button" disabled={busy} onClick={() => { setDraft(state.contact!.dialString); setMessage(''); }}>Cancelar edição</button></div></>
      : <p role="status">{state.status === 'loading' ? 'Consultando contato…' : 'Contato administrativo indisponível ou acesso não autorizado.'}</p>}
    <button type="button" disabled={busy || state.status === 'loading'} onClick={refresh}>Recarregar contato</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
