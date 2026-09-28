import { crewcheckAuthHeader } from './authClient';

const SERVER_MARKER_KEY = 'crewcheck_google_calendar_server_bridge_v1';
const SERVER_CONNECTION_TIMEOUT_MS = 150_000;

export type GoogleCalendarBridgeErrorCode =
  | 'GOOGLE_OAUTH_SERVER_NOT_CONFIGURED'
  | 'GOOGLE_OAUTH_START_FAILED'
  | 'GOOGLE_OAUTH_POPUP_BLOCKED'
  | 'GOOGLE_OAUTH_TIMEOUT'
  | 'GOOGLE_OAUTH_CANCELLED'
  | 'GOOGLE_OAUTH_FAILED'
  | 'GOOGLE_RECONNECT_REQUIRED'
  | 'GOOGLE_CALENDAR_PROXY_FAILED';

export class GoogleCalendarBridgeError extends Error {
  code: GoogleCalendarBridgeErrorCode | string;
  status?: number;
  payload?: any;

  constructor(message: string, code: GoogleCalendarBridgeErrorCode | string, status?: number, payload?: any) {
    super(message);
    this.name = 'GoogleCalendarBridgeError';
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

function nativeBridge(): { openExternal?: (url: string) => boolean } | null {
  try {
    return (window as any).CrewCheckNative || (window as any).CrewCheckPremium || null;
  } catch {
    return null;
  }
}

export function isEmbeddedCrewCheckWebView(): boolean {
  try {
    const ua = String(navigator.userAgent || '');
    return Boolean(nativeBridge()) || /;\s*wv\)|\bVersion\/4\.0\b.*\bChrome\//i.test(ua);
  } catch {
    return false;
  }
}

export function hasServerGoogleCalendarMarker(): boolean {
  try { return localStorage.getItem(SERVER_MARKER_KEY) === 'connected'; }
  catch { return false; }
}

function setServerGoogleCalendarMarker(connected: boolean): void {
  try {
    if (connected) localStorage.setItem(SERVER_MARKER_KEY, 'connected');
    else localStorage.removeItem(SERVER_MARKER_KEY);
  } catch {}
}

async function readPayload(response: Response): Promise<any> {
  const raw = await response.text().catch(() => '');
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { return { message: raw }; }
}

function prepareBrowserPopup(): Window | null {
  if (nativeBridge()) return null;
  try {
    const popup = window.open('about:blank', '_blank');
    if (popup) {
      try {
        popup.opener = null;
        popup.document.title = 'Conectando Google Calendar…';
        popup.document.body.innerHTML = '<main style="font-family:system-ui;padding:28px;color:#071d33"><h1>Conectando ao Google Calendar…</h1><p>Aguarde a tela segura do Google.</p></main>';
      } catch {}
    }
    return popup;
  } catch {
    return null;
  }
}

function openAuthorizationUrl(url: string, preparedPopup: Window | null): boolean {
  const bridge = nativeBridge();
  try {
    if (bridge?.openExternal) return bridge.openExternal(url) !== false;
  } catch {}
  try {
    if (preparedPopup && !preparedPopup.closed) {
      preparedPopup.location.replace(url);
      return true;
    }
    const popup = window.open(url, '_blank');
    if (popup) {
      try { popup.opener = null; } catch {}
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function bridgeStatus(state = ''): Promise<any> {
  const response = await fetch(`/api/google-calendar/oauth/status${state ? `?state=${encodeURIComponent(state)}` : ''}`, {
    method: 'GET',
    headers: crewcheckAuthHeader(),
    cache: 'no-store',
  });
  const payload = await readPayload(response);
  if (!response.ok || payload?.ok === false) {
    throw new GoogleCalendarBridgeError(
      String(payload?.message || 'Não foi possível consultar a conexão do Google Calendar.'),
      String(payload?.code || 'GOOGLE_OAUTH_FAILED'),
      response.status,
      payload,
    );
  }
  return payload;
}

export async function serverGoogleCalendarHealth(): Promise<{ configured: boolean; redirectUri?: string; scope?: string; message?: string }> {
  try {
    const response = await fetch('/api/google-calendar/oauth/health', { cache: 'no-store' });
    const payload = await readPayload(response);
    return {
      configured: Boolean(response.ok && payload?.configured),
      redirectUri: payload?.redirectUri,
      scope: payload?.scope,
      message: payload?.message,
    };
  } catch {
    return { configured: false, message: 'Ponte segura do Google Calendar indisponível.' };
  }
}

export async function connectGoogleCalendarViaServer(): Promise<void> {
  const preparedPopup = prepareBrowserPopup();
  let response: Response;
  try {
    response = await fetch('/api/google-calendar/oauth/start', {
      method: 'POST',
      headers: crewcheckAuthHeader({ 'content-type': 'application/json' }),
      body: '{}',
      cache: 'no-store',
    });
  } catch (error) {
    try { preparedPopup?.close(); } catch {}
    throw new GoogleCalendarBridgeError(
      error instanceof Error ? error.message : 'O servidor do CrewCheck não iniciou a autorização do Google Calendar.',
      'GOOGLE_OAUTH_START_FAILED',
    );
  }
  const payload = await readPayload(response);
  if (!response.ok || payload?.ok === false || !payload?.authUrl || !payload?.state) {
    try { preparedPopup?.close(); } catch {}
    throw new GoogleCalendarBridgeError(
      String(payload?.message || 'Não foi possível iniciar a conexão segura com o Google Calendar.'),
      String(payload?.code || (response.status === 503 ? 'GOOGLE_OAUTH_SERVER_NOT_CONFIGURED' : 'GOOGLE_OAUTH_START_FAILED')),
      response.status,
      payload,
    );
  }
  if (!openAuthorizationUrl(String(payload.authUrl), preparedPopup)) {
    throw new GoogleCalendarBridgeError(
      'O navegador seguro não abriu. Permita pop-ups ou abra o CrewCheck no Chrome e tente novamente.',
      'GOOGLE_OAUTH_POPUP_BLOCKED',
    );
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < SERVER_CONNECTION_TIMEOUT_MS) {
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    const status = await bridgeStatus(String(payload.state));
    if (status?.connected || status?.state === 'connected') {
      setServerGoogleCalendarMarker(true);
      try { if (preparedPopup && !preparedPopup.closed) preparedPopup.close(); } catch {}
      return;
    }
    if (status?.state === 'failed') {
      try { if (preparedPopup && !preparedPopup.closed) preparedPopup.close(); } catch {}
      throw new GoogleCalendarBridgeError(
        String(status?.error || status?.message || 'O Google não concluiu a autorização.'),
        'GOOGLE_OAUTH_FAILED',
        undefined,
        status,
      );
    }
  }
  try { if (preparedPopup && !preparedPopup.closed) preparedPopup.close(); } catch {}
  throw new GoogleCalendarBridgeError(
    'A autorização demorou mais de dois minutos. Volte ao CrewCheck e tente novamente.',
    'GOOGLE_OAUTH_TIMEOUT',
  );
}

export async function shouldUseServerGoogleCalendarBridge(): Promise<boolean> {
  if (isEmbeddedCrewCheckWebView() || hasServerGoogleCalendarMarker()) return true;
  try {
    const status = await bridgeStatus();
    if (status?.connected) {
      setServerGoogleCalendarMarker(true);
      return true;
    }
  } catch {}
  return false;
}

export async function serverGoogleCalendarFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = String(init.method || 'GET').toUpperCase();
  const response = await fetch('/api/google-calendar/oauth/proxy', {
    method: 'POST',
    headers: crewcheckAuthHeader({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      path,
      method,
      body: typeof init.body === 'string' ? init.body : init.body || null,
    }),
    cache: 'no-store',
  });
  const payload = await readPayload(response);
  if (!response.ok || payload?.ok === false) {
    if (payload?.code === 'GOOGLE_RECONNECT_REQUIRED' || response.status === 401) setServerGoogleCalendarMarker(false);
    throw new GoogleCalendarBridgeError(
      String(payload?.message || `Google Calendar retornou erro ${response.status}.`),
      String(payload?.code || 'GOOGLE_CALENDAR_PROXY_FAILED'),
      response.status,
      payload,
    );
  }
  return payload?.data as T;
}

export function disconnectGoogleCalendarServerBridge(): void {
  setServerGoogleCalendarMarker(false);
  fetch('/api/google-calendar/oauth/disconnect', {
    method: 'POST',
    headers: crewcheckAuthHeader({ 'content-type': 'application/json' }),
    body: '{}',
    cache: 'no-store',
  }).catch(() => undefined);
}

export function serverGoogleCalendarDiagnosticLabel(): string {
  if (isEmbeddedCrewCheckWebView()) return 'Navegador seguro externo';
  if (hasServerGoogleCalendarMarker()) return 'Ponte segura no servidor';
  return 'Google Identity Services no navegador';
}
