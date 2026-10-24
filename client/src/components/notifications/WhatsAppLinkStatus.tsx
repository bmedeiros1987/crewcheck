import { useEffect, useRef, useState } from 'react';
import { authFetch, captureAuthSession } from '@/lib/authClient';

type Result = { ok: boolean; linked: boolean; consentConcierge: boolean; last4?: string;
  provider?: string; recorded?: boolean; canonicalVerified?: boolean;
  testWindow?: 'active' | 'expired' | 'not_started' | 'unavailable'; linkStartAvailable?: boolean };
export function WhatsAppLinkStatus() {
  const generation = useRef(0);
  const [status, setStatus] = useState<'unread' | 'loading' | 'ready' | 'unavailable'>('unread');
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    const reset = () => { generation.current++; setResult(null); setStatus('unread'); };
    const storage = (event: StorageEvent) => { if (event.key === null || ['crewcheck_auth_token', 'crewcheck_auth_user'].includes(event.key)) reset(); };
    const events = ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired'];
    for (const event of events) window.addEventListener(event, reset);
    window.addEventListener('storage', storage);
    return () => { generation.current++; for (const event of events) window.removeEventListener(event, reset); window.removeEventListener('storage', storage); };
  }, []);
  const refresh = async () => {
    const session = captureAuthSession(), request = ++generation.current;
    setResult(null); setStatus('loading');
    if (!session.token) { setStatus('unavailable'); return; }
    try {
      const value = await authFetch<Result>('/api/whatsapp/link/status?provider=infobip', { cache: 'no-store' });
      if (!session.isCurrent() || request !== generation.current) return;
      if (value?.ok !== true || typeof value.linked !== 'boolean' || typeof value.consentConcierge !== 'boolean') throw Error('STATUS_UNAVAILABLE');
      setResult(value); setStatus('ready');
    } catch {
      if (session.isCurrent() && request === generation.current) setStatus('unavailable');
    }
  };
  const last4 = /^\d{4}$/.test(result?.last4 || '') ? result!.last4 : '';
  const saved=result?.recorded===true||result?.linked===true;
  const verified=result?.provider==='infobip'&&result?.canonicalVerified===true&&result?.linked===true;
  const description=status==='unread'?'Vínculo ainda não consultado.':status==='loading'?'Consultando vínculo…':
    status==='unavailable'?'Não foi possível consultar o vínculo. Tente novamente.':
    !saved?'WhatsApp ainda não vinculado. Confira a disponibilidade antes de gerar um código.':
    !verified?`Há um vínculo salvo${last4?` · final ${last4}`:''}, mas a compatibilidade com o teste Infobip não foi confirmada. Isso não comprova recebimento pelo novo canal.`:
    `Vínculo compatível com o teste Infobip${last4?` · final ${last4}`:''}. ${result?.consentConcierge?'Concierge autorizado.':'Concierge não autorizado.'} Recebimento e entrega pelo canal ainda não confirmados.`;
  return <section aria-label="Vínculo WhatsApp">
    <button type="button" onClick={() => void refresh()} disabled={status === 'loading'}>Conferir vínculo WhatsApp</button>
    <p role="status">{description}</p>
    {status==='ready'&&result?.linkStartAvailable!==true&&<p>{result?.testWindow==='expired'?'Janela de vínculo Infobip encerrada.':'Geração de novo vínculo Infobip não liberada.'} Não gere nem envie outro código agora.</p>}
  </section>;
}
