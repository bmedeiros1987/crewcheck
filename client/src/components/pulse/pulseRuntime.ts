import { playCrewCheckNoticeSound, stopCrewCheckNotificationSound } from './pulseSound';
import { createPulseSession, type PulseSessionState } from './pulseSession';
import type {
  CrewCheckPulseMessage,
  CrewCheckPulsePriority,
  CrewCheckPulseSystemNotification,
  CrewCheckPulseTone,
} from './pulseTypes';

declare global {
  interface Window {
    CrewCheckNative?: any;
    AndroidCrewCheckNative?: any;
    CrewCheckPremium?: any;
    __crewcheckPulseEventBridgeV2?: boolean;
  }
}

export const CREWCHECK_PULSE_EVENT = 'crewcheck:pulse';
export const PULSE_ENABLED_KEY = 'crewcheck_pulse_enabled';
export const DEVICE_NOTIFICATIONS_KEY = 'crewcheck_device_notifications';

type Listener = (state: PulseSessionState) => void;

let runtimeState: PulseSessionState = { message: null, leaving: false, queued: 0 };
const listeners = new Set<Listener>();
const notificationMemory = new Map<string, number>();

const session = createPulseSession((next) => {
  runtimeState = next;
  for (const listener of listeners) listener(next);
});

const DEFAULT_PRIORITY: Record<CrewCheckPulseTone, CrewCheckPulsePriority> = {
  informativo: 'normal',
  sucesso: 'normal',
  atencao: 'alta',
  erro: 'alta',
  operacional: 'normal',
  lembrete: 'alta',
};

const DEFAULT_AUTO_DISMISS: Partial<Record<CrewCheckPulseTone, number>> = {
  informativo: 9_000,
  sucesso: 6_500,
  operacional: 12_000,
  lembrete: 12_000,
};

function safeLocalGet(key: string, fallback = ''): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function safeLocalSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch {}
}

function safeSessionGet(key: string, fallback = ''): string {
  try { return sessionStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function safeSessionSet(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch {}
}

function normalizeMessage(message: CrewCheckPulseMessage): CrewCheckPulseMessage {
  const tone: CrewCheckPulseTone = message.tone || 'informativo';
  const priority = message.priority || DEFAULT_PRIORITY[tone];
  const autoDismissMs = message.autoDismissMs ?? DEFAULT_AUTO_DISMISS[tone];
  return {
    ...message,
    tone,
    priority,
    dismissible: message.dismissible !== false,
    ...(Number.isFinite(Number(autoDismissMs)) && Number(autoDismissMs) > 0
      ? { autoDismissMs: Number(autoDismissMs) }
      : {}),
  };
}

function pulseEnabled(): boolean {
  return safeLocalGet(PULSE_ENABLED_KEY, '1') !== '0';
}

function deviceNotificationsEnabled(): boolean {
  return safeLocalGet(DEVICE_NOTIFICATIONS_KEY, '0') !== '0';
}

type SeenMap = Record<string, number>;
const PULSE_SEEN_KEY = 'crewcheck:pulse-seen:v2';

function recentlySeen(key: string, cooldownMs: number): boolean {
  if (!key || !Number.isFinite(cooldownMs) || cooldownMs <= 0) return false;
  const now = Date.now();
  let map: SeenMap = {};
  try { map = JSON.parse(safeSessionGet(PULSE_SEEN_KEY, '{}')) || {}; } catch {}
  const previous = Number(map[key] || 0);
  if (previous > 0 && now - previous < cooldownMs) return true;
  map[key] = now;
  const entries = Object.entries(map)
    .filter(([, at]) => Number.isFinite(Number(at)) && now - Number(at) < 24 * 60 * 60_000)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 60);
  safeSessionSet(PULSE_SEEN_KEY, JSON.stringify(Object.fromEntries(entries)));
  return false;
}

function bridge(): any {
  if (typeof window === 'undefined') return null;
  return window.CrewCheckPremium || window.CrewCheckNative || window.AndroidCrewCheckNative || null;
}

export type CrewCheckNotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export function crewCheckNotificationPermission(): CrewCheckNotificationPermission {
  const native = bridge();
  try {
    if (native?.permissionStatus) {
      const raw = native.permissionStatus();
      const status = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (status?.notifications === true) return 'granted';
      if (status?.notifications === false) return 'denied';
    }
  } catch {}

  if (typeof Notification === 'undefined') {
    return native?.requestNotifications ? 'prompt' : 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

export async function requestCrewCheckNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const native = bridge();

  try {
    if (native?.requestNotifications) {
      // Android devolve o estado anterior imediatamente e abre a folha de permissão
      // na UI thread. Reconsultar evita declarar "negado" enquanto o prompt está aberto.
      try { native.requestNotifications(); } catch {}
      for (const wait of [250, 500, 900, 1400, 2200]) {
        await new Promise((resolve) => window.setTimeout(resolve, wait));
        if (crewCheckNotificationPermission() === 'granted') {
          window.dispatchEvent(new CustomEvent('crewcheck:notification-permission', { detail: { ok: true } }));
          return true;
        }
      }
      const ok = crewCheckNotificationPermission() === 'granted';
      window.dispatchEvent(new CustomEvent('crewcheck:notification-permission', { detail: { ok } }));
      return ok;
    }

    if (typeof Notification !== 'undefined') {
      const ok = (Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission()) === 'granted';
      window.dispatchEvent(new CustomEvent('crewcheck:notification-permission', { detail: { ok } }));
      return ok;
    }
  } catch {}

  window.dispatchEvent(new CustomEvent('crewcheck:notification-permission', { detail: { ok: false } }));
  return false;
}

function systemNotificationAllowed(policy: CrewCheckPulseSystemNotification): boolean {
  if (policy === 'never' || !deviceNotificationsEnabled()) return false;
  if (policy === 'background' && typeof document !== 'undefined' && document.visibilityState !== 'hidden') return false;
  return crewCheckNotificationPermission() === 'granted';
}

function deliverSystemNotification(message: CrewCheckPulseMessage): boolean {
  const policy = message.systemNotification || 'never';
  if (!systemNotificationAllowed(policy)) return false;

  const key = String(message.notificationTag || message.dedupeKey || message.id || `${message.title}|${message.detail || ''}`);
  const cooldownMs = Math.max(0, Number(message.notificationCooldownMs ?? 5 * 60_000));
  const now = Date.now();
  const previous = notificationMemory.get(key) || 0;
  if (previous && now - previous < cooldownMs) return false;

  const title = String(message.title || 'CrewCheck');
  const body = String(message.detail || '');
  const native = bridge();

  try {
    if (native?.notify && Boolean(native.notify(title, body))) {
      notificationMemory.set(key, now);
      return true;
    }
  } catch {}

  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, tag: key });
      notificationMemory.set(key, now);
      return true;
    }
  } catch {}

  return false;
}

export function publishCrewCheckPulse(message: CrewCheckPulseMessage): boolean {
  if (!pulseEnabled() || !message || !String(message.title || '').trim()) return false;
  const normalized = normalizeMessage(message);
  const dedupeKey = String(normalized.dedupeKey || normalized.id || '').trim();
  if (dedupeKey && recentlySeen(dedupeKey, Number(normalized.pulseCooldownMs || 0))) return false;
  session.publish(normalized);
  return true;
}

export function publishCrewCheckNotice(message: CrewCheckPulseMessage): { pulse: boolean; notification: boolean } {
  const normalized = normalizeMessage(message);
  const pulse = publishCrewCheckPulse(normalized);
  const notification = deliverSystemNotification(normalized);
  if (pulse) playCrewCheckNoticeSound(String(normalized.notificationTag || normalized.dedupeKey || normalized.id || normalized.title));
  return { pulse, notification };
}

export function subscribeCrewCheckPulse(listener: Listener): () => void {
  listeners.add(listener);
  listener(runtimeState);
  return () => listeners.delete(listener);
}

export function currentCrewCheckPulseState(): PulseSessionState {
  return runtimeState;
}

export function dismissCrewCheckPulse(): void {
  stopCrewCheckNotificationSound();
  session.dismiss();
}

export function clearCrewCheckPulse(): void {
  stopCrewCheckNotificationSound();
  session.clear();
}

export function setCrewCheckPulseEnabled(enabled: boolean): void {
  safeLocalSet(PULSE_ENABLED_KEY, enabled ? '1' : '0');
  if (!enabled) { stopCrewCheckNotificationSound(); session.clear(); }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('crewcheck:pulse-preference', { detail: { enabled } }));
  }
}

export function setCrewCheckDeviceNotificationsEnabled(enabled: boolean): void {
  safeLocalSet(DEVICE_NOTIFICATIONS_KEY, enabled ? '1' : '0');
}

if (typeof window !== 'undefined' && !window.__crewcheckPulseEventBridgeV2) {
  window.__crewcheckPulseEventBridgeV2 = true;
  window.addEventListener(CREWCHECK_PULSE_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<CrewCheckPulseMessage>).detail;
    if (detail?.title) publishCrewCheckPulse(detail);
  });
}

