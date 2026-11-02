import {installNotificationPreferenceProjection} from './notificationPreferences';
import { installCrewCheckPushLifecycle } from './crewcheckPushRuntime';
import { installPwaUpdateCoordinator } from './pwaUpdateCoordinator';
import { startupOwner, startupKey } from './rosterStartup';

/** Read-only provenance: never date a legacy cache on read or restore a roster. */
export function offlineRosterProvenance(owner: string, value: unknown, now = Date.now()): { source: string; updatedAt: string | null } | null {
  const payload = value as any;
  if (!owner || payload?.owner !== owner || payload?.cleared || payload?.selection === 'automatic'
      || payload?.cacheSchema !== 'p0-operational-date-anchor-v2' || !Array.isArray(payload?.roster?.days) || !payload.roster.days.length) return null;
  const source = typeof payload.sourceFileName === 'string' && payload.sourceFileName.trim()
    ? payload.sourceFileName.trim().slice(0, 180) : 'Escala salva neste aparelho';
  const instant = typeof payload.updatedAt === 'string' ? Date.parse(payload.updatedAt) : NaN;
  return { source, updatedAt: Number.isFinite(instant) && instant <= now ? new Date(instant).toISOString() : null };
}

function showOfflineStatus(suppressRoster = false): void {
  if (!document.body) return;
  const old = document.getElementById('crewcheck-offline-status');
  if (navigator.onLine !== false) { old?.remove(); return; }
  const notice = old || document.createElement('aside');
  notice.id = 'crewcheck-offline-status';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.style.cssText = 'position:relative;z-index:1001;padding:12px 16px;background:var(--background,#fff);color:var(--foreground,#17243b);border-bottom:1px solid #8b98aa;font:14px/1.5 system-ui,sans-serif';
  let provenance: ReturnType<typeof offlineRosterProvenance> = null;
  try {
    if (!suppressRoster) provenance = offlineRosterProvenance(startupOwner(), JSON.parse(localStorage.getItem(startupKey()) || 'null'));
  } catch { /* Missing or unreadable data is never presented as synchronized. */ }
  const detail = provenance
    ? `Fonte local: ${provenance.source}. Data da cópia: ${provenance.updatedAt ? new Date(provenance.updatedAt).toLocaleString('pt-BR') : 'não registrada'}.`
    : 'Nenhuma escala salva confirmada para esta sessão.';
  notice.textContent = `Sem conexão. ${detail} Meteorologia e status ao vivo, IA e envios precisam de conexão.`;
  if (!old) document.body.prepend(notice);
}

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
  showOfflineStatus();
}

export function installOfflineRuntime(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const stopPushLifecycle = installCrewCheckPushLifecycle();
  const stopPreferenceProjection=installNotificationPreferenceProjection();
  publishConnectivityState();
  window.addEventListener('online', publishConnectivityState);
  window.addEventListener('offline', publishConnectivityState);
  const refreshOfflineStatus = () => showOfflineStatus();
  const hidePriorAccount = () => showOfflineStatus(true);
  const refreshEvents = ['crewcheck:auth-changed', 'crewcheck:auth-expired', 'crewcheck:roster-updated', 'crewcheck:roster-cleared', 'storage', 'focus'];
  refreshEvents.forEach(event => window.addEventListener(event, refreshOfflineStatus));
  window.addEventListener('crewcheck:auth-will-change', hidePriorAccount);
  document.addEventListener('DOMContentLoaded', refreshOfflineStatus, { once: true });

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
    refreshEvents.forEach(event => window.removeEventListener(event, refreshOfflineStatus));
    window.removeEventListener('crewcheck:auth-will-change', hidePriorAccount);
    document.removeEventListener('DOMContentLoaded', refreshOfflineStatus);
    document.getElementById('crewcheck-offline-status')?.remove();
  };
}

installOfflineRuntime();
