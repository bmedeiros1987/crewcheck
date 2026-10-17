import {useEffect, useRef, useState} from 'react';
import {authFetch, getStoredUser, getToken} from '@/lib/authClient';
import {wakeDiagnosticLines} from '../../../../shared/wakeDiagnostic.mjs';

export function WakeDiagnostic() {
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const epoch = useRef(0);
  useEffect(() => {
    const refresh = () => {
      const ticket = ++epoch.current;
      const owner = getStoredUser()?.id;
      setSnapshot(null);
      if (navigator.onLine === false || !getToken() || !owner) return;
      authFetch<unknown>('/api/notifications/diagnostic', {cache: 'no-store'})
        .then(value => { if (ticket === epoch.current && owner === getStoredUser()?.id && getToken()) setSnapshot(value); })
        .catch(() => { if (ticket === epoch.current) setSnapshot(null); });
    };
    const onStorage = (event: StorageEvent) => { if (!event.key || ['crewcheck_auth_token', 'crewcheck_auth_user'].includes(event.key)) refresh(); };
    const events = ['crewcheck:auth-changed', 'crewcheck:auth-expired', 'crewcheck:notification-jobs-changed', 'online', 'offline'];
    refresh();
    events.forEach(name => window.addEventListener(name, refresh));
    window.addEventListener('storage', onStorage);
    return () => { epoch.current++; events.forEach(name => window.removeEventListener(name, refresh)); window.removeEventListener('storage', onStorage); };
  }, []);
  return <section aria-label="Estado do Wake nesta conta"><h3>Estado do Wake nesta conta</h3>
    <p>Preferências salvas não agendam um despertador. A ativação é uma ação separada.</p>
    <div role="status">{wakeDiagnosticLines(snapshot).map(line => <p key={line}>{line}</p>)}</div>
    <p>Histórico de Wake desta conta; não confirma o alarme desta programação, o recebimento nem o despertar. O estado do agendador global não comprova entrega.</p>
  </section>;
}
