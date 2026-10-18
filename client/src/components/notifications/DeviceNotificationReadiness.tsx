import {NotificationHelp} from './NotificationHelp';
import { useEffect, useState } from 'react';

type Status = { notifications?: boolean; notificationAppEnabled?: boolean; notificationChannelEnabled?: boolean | null };

export function readStatus(): { native: boolean; status: Status } {
  const native = window.CrewCheckNative || window.AndroidCrewCheckNative;
  try {
    if (native?.permissionStatus) {
      const value = native.permissionStatus();
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return { native: true, status: parsed && typeof parsed === 'object' ? parsed : {} };
    }
  } catch { return { native: Boolean(native), status: {} }; }
  if (native) return { native: true, status: {} };
  return { native: false, status: { notifications: 'Notification' in window ? Notification.permission === 'granted' : undefined } };
}

export function DeviceNotificationReadiness() {
  const [snapshot, setSnapshot] = useState(readStatus);
  const [requesting, setRequesting] = useState(false);
  useEffect(() => {
    const refresh = () => setSnapshot(readStatus());
    const events = ['crewcheck:native-ready', 'crewcheck:permissions-updated', 'crewcheck:auth-changed', 'crewcheck:auth-expired', 'focus'];
    events.forEach(event => window.addEventListener(event, refresh));
    document.addEventListener('visibilitychange', refresh);
    return () => { events.forEach(event => window.removeEventListener(event, refresh)); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const { native, status } = snapshot;
  const message = status.notifications === false ? 'Notificações não autorizadas.'
    : status.notifications !== true ? 'Permissão não verificada.'
    : native && status.notificationAppEnabled === false ? 'App bloqueado no Android.'
    : native && status.notificationChannelEnabled === false ? 'Canal Alertas CrewCheck bloqueado.'
    : native && (status.notificationAppEnabled !== true || status.notificationChannelEnabled !== true) ? 'Permissão concedida · canal não verificado.'
    : 'Permissão disponível.';
  async function request() {
    if (requesting) return;
    setRequesting(true);
    try {
      const bridge = window.CrewCheckNative || window.AndroidCrewCheckNative;
      if (bridge?.requestNotifications) await bridge.requestNotifications();
      else if ('Notification' in window) await Notification.requestPermission();
    } finally { setSnapshot(readStatus()); setRequesting(false); }
  }
  return <div aria-label="Notificações neste aparelho">
    <h3>Permissão</h3>
    <p role="status">{message}</p>
    {status.notifications === false && <button type="button" disabled={requesting} onClick={() => { request().catch(() => undefined); }}>{requesting ? 'Consultando…' : 'Autorizar notificações'}</button>}
    <NotificationHelp label="Permissão e outros aparelhos"><p>O relógio tem seu próprio canal e permissão. Confira “Notificações” no CrewWatch. Esta consulta não envia avisos nem altera preferências de outros aparelhos. Permissão disponível não comprova envio ou recebimento.</p></NotificationHelp>
  </div>;
}
