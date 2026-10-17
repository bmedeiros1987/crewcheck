import {installNotificationPreferenceProjection} from './notificationPreferences';
import { installCrewCheckPushLifecycle } from './crewcheckPushRuntime';
import { installPwaUpdateCoordinator } from './pwaUpdateCoordinator';

type ConnectivityDetail = {
  online: boolean;
  changedAt: string;
};

function publishConnectivityState(): void {
  if (typeof window === 'undefined') return;
  const online = navigator.onLine;
  document.documentElement.dataset.crewcheckConnectivity = online ? 'online' : 'offline';
  window.dispatchEvent(new CustomEvent<ConnectivityDetail>('crewcheck:connectivity-change', {
    detail: {
      online,
      changedAt: new Date().toISOString(),
    },
  }));
}

export function installOfflineRuntime(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const stopPushLifecycle = installCrewCheckPushLifecycle();
  const stopPreferenceProjection=installNotificationPreferenceProjection();
  publishConnectivityState();
  window.addEventListener('online', publishConnectivityState);
  window.addEventListener('offline', publishConnectivityState);

  let stopCoordinator: () => void = () => undefined;
  let disposed = false;

  const register = async () => {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      if (!disposed) stopCoordinator = installPwaUpdateCoordinator();
    } catch {
      // Registration must never block CrewCheck boot. The app remains usable
      // online and can retry on the next navigation/session.
    }
  };

  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', register, { once: true });

  return () => {
    disposed = true;
    stopPushLifecycle();
    stopPreferenceProjection();
    stopCoordinator();
    window.removeEventListener('online', publishConnectivityState);
    window.removeEventListener('offline', publishConnectivityState);
    window.removeEventListener('load', register);
  };
}

installOfflineRuntime();
