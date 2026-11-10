import {NotificationHelp} from './NotificationHelp';
import { useEffect, useRef, useState } from 'react';
import { authFetch, getStoredUser, getToken } from '@/lib/authClient';
import { DeviceNotificationReadiness } from './DeviceNotificationReadiness';

const jobLabels = {
  pending: 'Pendentes', processing: 'Em processamento', dispatching: 'Envio em andamento',
  sent: 'Aceitos pelo provedor; entrega não confirmada', failed: 'Falha no envio',
  expired: 'Prazo de envio expirado', uncertain: 'Resultado do envio incerto', cancelled: 'Cancelados',
  partial: 'Envio parcial; entrega não confirmada', held: 'Retidos', other: 'Outros estados; verificação necessária',
};
type JobState = keyof typeof jobLabels;
type Summary = { total: number; counts: Record<JobState, number>; overdue: number };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function notificationDiagnosticSummary(value: unknown): Summary | null {
  if (!record(value) || value.ok !== true || value.observational !== true || !record(value.alarms)) return null;
  const alarms = value.alarms;
  if (alarms.scope !== 'current_account_notification_job_history' || typeof alarms.status !== 'string' || !['absent', 'recorded'].includes(alarms.status)
    || alarms.received !== null || alarms.sentMeaning !== 'provider_accepted_unconfirmed' || !record(alarms.counts)) return null;
  const counts = alarms.counts;
  if (Object.keys(counts).length !== Object.keys(jobLabels).length || Object.keys(jobLabels).some(key => !Object.hasOwn(counts, key)
    || !Number.isSafeInteger(counts[key]) || Number(counts[key]) < 0)) return null;
  const total = Object.values(counts).reduce<number>((sum, count) => sum + Number(count), 0);
  if (!Number.isSafeInteger(total) || total !== alarms.total || (alarms.status === 'absent') !== (total === 0)
    || !Number.isSafeInteger(alarms.pendingPastDispatchWindow) || Number(alarms.pendingPastDispatchWindow) < 0
    || Number(alarms.pendingPastDispatchWindow) > Number(counts.pending)) return null;
  return { total, counts: counts as Record<JobState, number>, overdue: Number(alarms.pendingPastDispatchWindow) };
}
export function NotificationReadiness() {
  const [snapshot, setSnapshot] = useState<Summary | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    const refresh = () => {
      const version = ++epoch.current;
      setSnapshot(null); setUnavailable(false);
      const token = getToken(), owner = getStoredUser()?.id;
      if (!token || !owner || navigator.onLine === false) { setUnavailable(true); return; }
      authFetch<unknown>('/api/notifications/diagnostic', { cache: 'no-store' }).then(value => {
        if (epoch.current !== version || token !== getToken() || owner !== getStoredUser()?.id) return;
        const summary = notificationDiagnosticSummary(value);
        setSnapshot(summary); setUnavailable(!summary);
      }).catch(() => { if (epoch.current === version) setUnavailable(true); });
    };
    const invalidate = () => { epoch.current++; setSnapshot(null); setUnavailable(true); };
    const storage = (event: StorageEvent) => { if (event.key === null || ['crewcheck_auth_token', 'crewcheck_auth_user'].includes(event.key)) refresh(); };
    refresh();
    window.addEventListener('crewcheck:auth-changed', refresh);
    window.addEventListener('crewcheck:auth-expired', refresh);
    window.addEventListener('crewcheck:notification-jobs-changed', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', invalidate);
    window.addEventListener('crewcheck:auth-will-change', invalidate);
    window.addEventListener('storage', storage);
    return () => {
      epoch.current++;
      window.removeEventListener('crewcheck:auth-changed', refresh);
      window.removeEventListener('crewcheck:auth-expired', refresh);
      window.removeEventListener('crewcheck:notification-jobs-changed', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', invalidate);
      window.removeEventListener('crewcheck:auth-will-change', invalidate);
      window.removeEventListener('storage', storage);
    };
  }, []);
  return <section className="cz-toolbox" aria-label="Entrega fora do app">
    <DeviceNotificationReadiness />
    <h3>Histórico de notificações desta conta</h3>
    <p role="status">{unavailable ? 'Diagnóstico indisponível.' : !snapshot ? 'Consultando…' : snapshot.total === 0 ? 'Nenhum registro no histórico desta conta.' : `${snapshot.total} registro(s) no servidor · recebimento não confirmado.`}</p>
    {snapshot && <ul aria-label="Estados dos registros no servidor">{(Object.keys(jobLabels) as JobState[]).filter(key => snapshot.counts[key] > 0).map(key => <li key={key}>{jobLabels[key]}: {snapshot.counts[key]}</li>)}</ul>}
    {snapshot && snapshot.overdue > 0 && <p>Pendentes fora da janela de envio: {snapshot.overdue}.</p>}
    <NotificationHelp label="Entrega e últimos registros"><p>O histórico reúne registros da conta, não comprova o alerta desta programação. Aceitação pelo provedor não confirma entrega no aparelho; resultados incertos não são repetidos automaticamente.</p>
    <p>Configuração e vínculo dos canais não foram observados neste diagnóstico. Permissão disponível, avisos internos, agendador e timers da página não comprovam envio ou recebimento. A entrega no Android/PWA fechado, relógio e CrewCierge permanece não verificada.</p></NotificationHelp>
  </section>;
}
