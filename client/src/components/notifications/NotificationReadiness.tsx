import { useEffect, useRef, useState } from 'react';
import { authFetch, getToken } from '@/lib/authClient';

type Snapshot = { readiness: { telegramConfigured: boolean; telegramLinked: boolean }; jobs: Array<{ id: number; status: string }> };
export function NotificationReadiness() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    const refresh = () => {
      const version = ++epoch.current;
      setSnapshot(null); setUnavailable(false);
      if (!getToken()) { setUnavailable(true); return; }
      authFetch<Snapshot>('/api/alarm/scheduled', { cache: 'no-store' }).then(value => {
        if (epoch.current === version) setSnapshot(value);
      }).catch(() => { if (epoch.current === version) setUnavailable(true); });
    };
    const storage = (event: StorageEvent) => { if (['crewcheck_auth_token', 'crewcheck_auth_user'].includes(event.key || '')) refresh(); };
    refresh();
    window.addEventListener('crewcheck:auth-changed', refresh);
    window.addEventListener('crewcheck:auth-expired', refresh);
    window.addEventListener('crewcheck:notification-jobs-changed', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('storage', storage);
    return () => {
      epoch.current++;
      window.removeEventListener('crewcheck:auth-changed', refresh);
      window.removeEventListener('crewcheck:auth-expired', refresh);
      window.removeEventListener('crewcheck:notification-jobs-changed', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('storage', storage);
    };
  }, []);
  const readiness = snapshot?.readiness;
  const count = (states: string[]) => snapshot?.jobs.filter(job => states.includes(job.status)).length || 0;
  return <section className="cz-toolbox" aria-label="Entrega fora do app">
    <h2>Entrega fora do app</h2>
    <p>{unavailable ? 'Disponibilidade não verificada. Reconecte para consultar.' : !readiness ? 'Consultando vínculo e fila desta conta…' : !readiness.telegramConfigured ? 'Canal Telegram indisponível no servidor.' : !readiness.telegramLinked ? 'Esta conta não tem vínculo Telegram válido.' : 'Telegram vinculado a esta conta. Só os lembretes gravados no servidor podem ser enviados com o CrewCheck fechado.'}</p>
    {readiness && <p>Últimos {snapshot!.jobs.length} registros: {count(['pending'])} pendentes · {count(['sent'])} aceitos pelo provedor · {count(['uncertain', 'partial'])} com resultado desconhecido · {count(['expired'])} expirados · {count(['cancelled'])} cancelados. Aceitação não confirma entrega no aparelho; resultados desconhecidos não são repetidos automaticamente.</p>}
    <p>O app Android usa notificações locais previamente agendadas. Novos alertas do servidor não chegam diretamente ao app Android ou PWA fechado. Avisos internos e timers da página não comprovam entrega externa.</p>
  </section>;
}
