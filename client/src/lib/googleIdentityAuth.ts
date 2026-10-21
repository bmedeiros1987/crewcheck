import {
  captureAuthSession,
  crewcheckAuthHeader,
  persistExternalAuthSession,
  type AuthSession,
} from './authClient';

type GoogleIdentityStart = { ok: true; state: string; authUrl: string; expiresAt: string };
type GoogleIdentityStatus = {
  ok: boolean;
  state: 'pending' | 'exchanging' | 'link_required' | 'ready' | 'link_ready' | 'linked' | 'completed' | 'failed';
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

let operationGeneration=0;
function captureOperation(requireAuth=false) {
  const session=captureAuthSession(),generation=++operationGeneration;
  if(requireAuth&&(!session.token||!session.owner)) throw new Error('Entre no CrewCheck antes de gerenciar o vínculo Google.');
  return () => {
    if(generation!==operationGeneration||!session.isCurrent()) throw new Error('Sua sessão mudou. Inicie o login Google novamente.');
  };
}
if(typeof window!=='undefined') {
  for(const name of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired']) window.addEventListener(name,()=>{operationGeneration+=1;});
  window.addEventListener('storage',(event:StorageEvent)=>{if(event.key===null||event.key==='crewcheck_auth_token'||event.key==='crewcheck_auth_user')operationGeneration+=1;});
}

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
  // noopener intentionally makes Window.open return null in real browsers.
  // Only the authenticated callback/poll can confirm progress; a blocked or
  // cancelled popup times out without adopting a session. Keep opener isolation.
  window.open(url, '_blank', 'noopener,noreferrer');
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForState(state: string, expected: 'login' | 'link', requireCurrent: () => void): Promise<GoogleIdentityStatus> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await delay(900);
    requireCurrent();
    const status = await json<GoogleIdentityStatus>(`/api/auth/google/status?state=${encodeURIComponent(state)}`, { cache: 'no-store' });
    requireCurrent();
    if (status.state === 'failed') throw new Error(status.message || 'O Google não concluiu a autenticação.');
    if (status.state === 'link_required') throw new Error('Esta Conta Google ainda não está vinculada. Entre com e-mail e senha uma vez e vincule-a em Configurações.');
    if (expected === 'login' && status.state === 'ready') return status;
    if (expected === 'link' && status.state === 'link_ready') return status;
  }
  throw new Error('O login Google demorou demais. Nenhuma sessão foi alterada; tente novamente.');
}

export async function loginWithGoogle(): Promise<AuthSession> {
  const requireCurrent=captureOperation();
  const start = await json<GoogleIdentityStart>('/api/auth/google/start', { method: 'POST', body: JSON.stringify({ intent: 'login' }) });
  requireCurrent();
  openSecureBrowser(start.authUrl);
  await waitForState(start.state, 'login',requireCurrent);
  requireCurrent();
  const session = await json<AuthSession & { ok: true }>('/api/auth/google/complete', { method: 'POST', headers:crewcheckAuthHeader(), body: JSON.stringify({ state: start.state }) });
  requireCurrent();
  persistExternalAuthSession(session);
  return session;
}

export async function linkGoogleIdentity(): Promise<GoogleIdentityConnection> {
  const requireCurrent=captureOperation(true);
  const start = await json<GoogleIdentityStart>('/api/auth/google/start', {
    method: 'POST',
    headers: crewcheckAuthHeader(),
    body: JSON.stringify({ intent: 'link', confirmLink: true }),
  });
  requireCurrent();
  openSecureBrowser(start.authUrl);
  await waitForState(start.state, 'link',requireCurrent);
  requireCurrent();
  const result=await json<GoogleIdentityConnection>('/api/auth/google/link/complete',{method:'POST',headers:crewcheckAuthHeader(),body:JSON.stringify({state:start.state,confirmLink:true})});
  requireCurrent();
  return result;
}

export async function getGoogleIdentityConnection(): Promise<GoogleIdentityConnection> {
  const requireCurrent=captureOperation(true);
  const result=await json<GoogleIdentityConnection>('/api/auth/google/connection',{headers:crewcheckAuthHeader(),cache:'no-store'});
  requireCurrent();
  return result;
}

export async function unlinkGoogleIdentity(): Promise<GoogleIdentityConnection> {
  const requireCurrent=captureOperation(true);
  const result=await json<GoogleIdentityConnection>('/api/auth/google/unlink',{method:'POST',headers:crewcheckAuthHeader(),body:'{}'});
  requireCurrent();
  return result;
}
