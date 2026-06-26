export interface AuthUser {
  id: string | null;
  name: string;
  email: string;
  emailVerified?: boolean;
  role?: string;
  crewId?: string | null;
  base?: string | null;
  rank?: string | null;
  hasVirtualBase?: boolean;
  virtualBase?: string | null;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  premiumAccess?: boolean;
  trialEligible?: boolean;
  trialExpiresAt?: string | null;
  premiumExpiresAt?: string | null;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
  expiresAt?: string;
}

const TOKEN_KEY = 'crewcheck_auth_token';
const USER_KEY = 'crewcheck_auth_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

function persistSession(session: AuthSession) {
  try {
    const previousRaw = localStorage.getItem(USER_KEY);
    const previous = previousRaw ? JSON.parse(previousRaw) as AuthUser : null;
    const previousKey = String(previous?.id || previous?.email || '').toLowerCase();
    const nextKey = String(session.user?.id || session.user?.email || '').toLowerCase();
    if (previousKey && nextKey && previousKey !== nextKey) {
      sessionStorage.removeItem('crewcheck_roster');
      sessionStorage.removeItem('crewcheck_compliance');
      sessionStorage.removeItem('crewcheck_gym');
      sessionStorage.removeItem('crewcheck_source_file');
      localStorage.removeItem('crewcheck_roster_sync_latest_v108134');
      localStorage.removeItem('crewcheck_latest_roster_bundle');
    }
  } catch {
    // Se o storage estiver bloqueado, segue com a sessão nova.
  }
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  try {
    sessionStorage.removeItem('crewcheck_roster');
    sessionStorage.removeItem('crewcheck_compliance');
    sessionStorage.removeItem('crewcheck_gym');
    sessionStorage.removeItem('crewcheck_source_file');
    localStorage.removeItem('crewcheck_roster_sync_latest_v108134');
    localStorage.removeItem('crewcheck_latest_roster_bundle');
  } catch {}
}

export class AuthClientError extends Error {
  status?: number;
  code?: string;
  payload?: any;

  constructor(message: string, status?: number, code?: string, payload?: any) {
    super(message);
    this.name = 'AuthClientError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    if (response.status === 401) clearSession();
    throw new AuthClientError([payload?.message, payload?.detail && !String(payload?.message || '').includes(String(payload.detail)) ? `Detalhe: ${payload.detail}` : '', payload?.code ? `Código: ${payload.code}` : ''].filter(Boolean).join(' | ') || `Erro HTTP ${response.status}`, response.status, payload?.code, payload);
  }
  return payload as T;
}

export async function getAuthConfig(): Promise<{ ok: boolean; emailVerificationRequired: boolean; captchaRequired: boolean; turnstileSiteKey?: string | null; captchaProvider?: string | null }> {
  return jsonFetch('/api/auth/config');
}

export async function register(payload: {
  email: string;
  password: string;
  confirmPassword: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  role?: string;
  turnstileToken?: string | null;
  hasVirtualBase?: boolean;
  virtualBase?: string;
  usageIntent?: string;
  telegramUsername?: string;
}): Promise<AuthSession | { ok: boolean; verificationRequired: true; emailSent?: boolean; message?: string }> {
  const response = await jsonFetch<(AuthSession & { ok: boolean }) | { ok: boolean; verificationRequired: true; emailSent?: boolean; message?: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if ('token' in response && response.token) persistSession(response);
  return response;
}

export async function verifyEmail(email: string, code: string): Promise<AuthSession> {
  const session = await jsonFetch<AuthSession & { ok: boolean }>('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  persistSession(session);
  return session;
}

export async function resendVerification(email: string): Promise<{ ok: boolean; sent?: boolean; emailSent?: boolean; message?: string }> {
  return jsonFetch('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const session = await jsonFetch<AuthSession & { ok: boolean }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  persistSession(session);
  return session;
}


export async function requestPasswordReset(email: string): Promise<{ ok: boolean; emailSent?: boolean; emailStatus?: unknown }> {
  return jsonFetch<{ ok: boolean; emailSent?: boolean; emailStatus?: unknown }>('/api/auth/request-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}


export async function confirmPasswordReset(payload: { email: string; code: string; password: string; confirmPassword: string }): Promise<{ ok: boolean; message?: string }> {
  return jsonFetch<{ ok: boolean; message?: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getMe(): Promise<AuthUser> {
  const payload = await jsonFetch<{ ok: boolean; user: AuthUser }>('/api/auth/me');
  localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  return payload.user;
}

export async function logout(): Promise<void> {
  try {
    await jsonFetch('/api/auth/logout', { method: 'POST', body: '{}' });
  } catch {
    // Mesmo offline, removemos a sessão local.
  } finally {
    clearSession();
  }
}

export async function authFetch<T>(url: string, init?: RequestInit): Promise<T> {
  return jsonFetch<T>(url, init);
}
