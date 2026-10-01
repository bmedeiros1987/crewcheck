import {
  crewcheckAuthHeader,
  persistExternalAuthSession,
  type AuthSession,
} from './authClient';

type GoogleIdentityStart = { ok: true; state: string; authUrl: string; expiresAt: string };
type GoogleIdentityStatus = {
  ok: boolean;
  state: 'pending' | 'exchanging' | 'link_required' | 'ready' | 'linked' | 'completed' | 'failed';
  linkRequired?: boolean;
  canComplete?: boolean;
  linked?: boolean;
  emailHint?: string;
  message?: string;
};

export type GoogleIdentityConnection = {
  ok: boolean;
  linked: boolean;
  provider?: 'google' | null;
  emailHint?: string;
  linkedAt?: string | null;
};

type GoogleIdentityWindow = Window & typeof globalThis & {
  CrewCheckNative?: { openExternal?: (url: string) => boolean };
};

async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) throw new Error(String(payload?.message || `Erro HTTP ${response.status}`));
  return payload as T;
}

function openSecureBrowser(url: string) {
  const nativeWindow = window as GoogleIdentityWindow;
  const openedNatively = Boolean(nativeWindow.CrewCheckNative?.openExternal?.(url));
  if (openedNatively) return;
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('O navegador bloqueou a janela do Google. Permita pop-ups e tente novamente.');
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForState(state: string, expected: 'login' | 'link'): Promise<GoogleIdentityStatus> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await delay(900);
    const status = await json<GoogleIdentityStatus>(`/api/auth/google/status?state=${encodeURIComponent(state)}`, { cache: 'no-store' });
    if (status.state === 'failed') throw new Error(status.message || 'O Google não concluiu a autenticação.');
    if (status.state === 'link_required') throw new Error('Esta Conta Google ainda não está vinculada. Entre com e-mail e senha uma vez e vincule-a em Configurações.');
    if (expected === 'login' && status.state === 'ready') return status;
    if (expected === 'link' && status.state === 'linked') return status;
  }
  throw new Error('O login Google demorou demais. Nenhuma sessão foi alterada; tente novamente.');
}

export async function loginWithGoogle(): Promise<AuthSession> {
  const start = await json<GoogleIdentityStart>('/api/auth/google/start', { method: 'POST', body: JSON.stringify({ intent: 'login' }) });
  openSecureBrowser(start.authUrl);
  await waitForState(start.state, 'login');
  const session = await json<AuthSession & { ok: true }>('/api/auth/google/complete', { method: 'POST', body: JSON.stringify({ state: start.state }) });
  persistExternalAuthSession(session);
  return session;
}

export async function linkGoogleIdentity(): Promise<GoogleIdentityConnection> {
  const start = await json<GoogleIdentityStart>('/api/auth/google/start', {
    method: 'POST',
    headers: crewcheckAuthHeader(),
    body: JSON.stringify({ intent: 'link', confirmLink: true }),
  });
  openSecureBrowser(start.authUrl);
  const status = await waitForState(start.state, 'link');
  return { ok: true, linked: true, provider: 'google', emailHint: status.emailHint };
}

export function getGoogleIdentityConnection(): Promise<GoogleIdentityConnection> {
  return json('/api/auth/google/connection', { headers: crewcheckAuthHeader(), cache: 'no-store' });
}

export function unlinkGoogleIdentity(): Promise<GoogleIdentityConnection> {
  return json('/api/auth/google/unlink', { method: 'POST', headers: crewcheckAuthHeader(), body: '{}' });
}
