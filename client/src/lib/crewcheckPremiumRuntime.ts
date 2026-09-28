// CrewCheck v14.3.43 — runtime premium para permissões explícitas, notificações locais e radar privado.

declare global {
  interface Window {
    AndroidCrewCheckNative?: any;
    CrewCheckNative?: any;
    CrewCheckPremium?: any;
  }
}

function crewcheckAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('crewcheck_auth_token');
  return token ? { authorization: `Bearer ${token}` } : {};
}

function bridge(): any {
  return window.CrewCheckNative || window.AndroidCrewCheckNative || null;
}

function persistLocation(lat?: number, lng?: number, accuracy?: number) {
  try {
    localStorage.setItem('crewcheck_location_permission', 'granted');
    if (Number.isFinite(lat) && Number.isFinite(lng)) localStorage.setItem('crewcheck_last_geo', `${lat},${lng}`);
    window.dispatchEvent(new CustomEvent('crewcheck:location-updated', { detail: { coordinates: { lat, lng, accuracy } } }));
  } catch {}
}

async function requestLocation(): Promise<boolean> {
  const native = bridge();
  try {
    if (native?.requestLocation) {
      const allowed = Boolean(await native.requestLocation());
      if (allowed) persistLocation();
      else localStorage.setItem('crewcheck_location_permission', 'denied');
      return allowed;
    }
    if (!navigator.geolocation) return false;
    const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }));
    persistLocation(Number(position.coords.latitude), Number(position.coords.longitude), Number(position.coords.accuracy || 0));
    return true;
  } catch {
    try { localStorage.setItem('crewcheck_location_permission', 'denied'); } catch {}
    return false;
  }
}

async function requestNotifications(): Promise<boolean> {
  const native = bridge();
  try {
    if (native?.requestNotifications) return Boolean(native.requestNotifications());
    if ('Notification' in window && Notification.permission !== 'granted') return (await Notification.requestPermission()) === 'granted';
    return 'Notification' in window && Notification.permission === 'granted';
  } catch {
    return false;
  }
}

function permissionStatus(): { location?: boolean; notifications?: boolean } {
  const native = bridge();
  try {
    if (native?.permissionStatus) {
      const raw = native.permissionStatus();
      if (typeof raw === 'string') return JSON.parse(raw);
      if (raw && typeof raw === 'object') return raw;
    }
  } catch {}
  const locationState = localStorage.getItem('crewcheck_location_permission');
  return {
    location: locationState === 'granted' ? true : locationState === 'denied' ? false : undefined,
    notifications: 'Notification' in window ? Notification.permission === 'granted' : undefined,
  };
}

function notify(title: string, body: string): boolean {
  const native = bridge();
  try {
    if (native?.notify) return Boolean(native.notify(title, body));
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
      return true;
    }
  } catch {}
  return false;
}

function scheduleNotification(title: string, body: string, epochMillis: number): boolean {
  const native = bridge();
  try {
    if (native?.scheduleNotification) return Boolean(native.scheduleNotification(title, body, String(Math.round(epochMillis))));
  } catch {}
  const delay = Math.max(0, Number(epochMillis) - Date.now());
  if (delay <= 2147483647) window.setTimeout(() => notify(title, body), delay);
  return true;
}

async function fetchFlightStatus(flight: string, date?: string) {
  const params = new URLSearchParams({ flight, flightNumber: flight });
  if (date) params.set('date', date);
  const response = await fetch(`/api/radar/private-status?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin', headers: crewcheckAuthHeader() });
  return response.json();
}

function installDelegates() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest('button,a,[role="button"]') as HTMLElement | null;
    const text = String(button?.textContent || target?.textContent || '').toLowerCase();
    if (!text) return;
    if (text.includes('ativar localização') || text.includes('ativar localizacao') || text.includes('liberar localização') || text.includes('liberar localizacao')) {
      void requestLocation().then((ok) => window.dispatchEvent(new CustomEvent('crewcheck:location-permission', { detail: { ok } })));
    }
    if (text.includes('ativar notificação') || text.includes('ativar notificacao') || text.includes('liberar notificação') || text.includes('liberar notificacao')) {
      void requestNotifications().then((ok) => window.dispatchEvent(new CustomEvent('crewcheck:notification-permission', { detail: { ok } })));
    }
  }, true);
}

window.CrewCheckPremium = {
  version: '14.3.43',
  requestLocation,
  requestNotifications,
  permissionStatus,
  notify,
  scheduleNotification,
  fetchFlightStatus,
  scheduleLeaveReminder(title: string, body: string, departureEpochMillis: number, offsetMinutes = 90) {
    return scheduleNotification(title || 'Hora de sair', body || 'CrewCheck calculou sua saída para a próxima programação.', Number(departureEpochMillis) - offsetMinutes * 60_000);
  },
};

installDelegates();

function applyCrewCheckVisualColors() {
  try {
    const root = document.documentElement;
    const map: Array<[string, string, string]> = [
      ['crewcheck_color_flight_bg', '--cc-scale-flight-bg', '#e0f2fe'],
      ['crewcheck_color_flight_fg', '--cc-scale-flight-fg', '#082f49'],
      ['crewcheck_color_extra_bg', '--cc-scale-extra-bg', '#e2e8f0'],
      ['crewcheck_color_extra_fg', '--cc-scale-extra-fg', '#0f172a'],
      ['crewcheck_color_routine_bg', '--cc-routine-pill-bg', '#ffffff'],
      ['crewcheck_color_routine_fg', '--cc-routine-pill-fg', '#0f172a'],
      ['crewcheck_color_safe_bg', '--cc-routine-safe-bg', '#d1fae5'],
      ['crewcheck_color_safe_fg', '--cc-routine-safe-fg', '#064e3b'],
    ];
    for (const [key, cssVar, fallback] of map) {
      root.style.setProperty(cssVar, localStorage.getItem(key) || fallback);
    }
  } catch {}
}

window.addEventListener('crewcheck:visual-colors-change', applyCrewCheckVisualColors);
window.addEventListener('storage', applyCrewCheckVisualColors);
applyCrewCheckVisualColors();

export {};
