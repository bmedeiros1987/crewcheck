import type { CrewRoster } from './pdfParser';
import type { GymRecommendation } from './complianceEngine';
import type { RoutineSuggestion } from './routinePlanner';
import { generateICalendar, type CalendarExportMode } from './calendarExport';
import { t } from './i18n';
import { crewcheckAuthHeader } from './authClient';

export type GoogleCalendarSyncStatus = 'idle' | 'connecting' | 'loading-calendars' | 'syncing' | 'success' | 'error';

export interface GoogleCalendarOption {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
}

export type GoogleCalendarSyncMode = 'all' | 'flights' | 'flights-rest' | 'gym' | 'routine';

export interface GoogleCalendarSettings {
  selectedCalendarId: string;
  selectedCalendarName: string;
  autoSync: boolean;
  exportMode: GoogleCalendarSyncMode;
  includeFinancialNotes: boolean;
}

export interface GoogleCalendarSyncExtras {
  gymRecommendations?: GymRecommendation[];
  routineSuggestions?: RoutineSuggestion[];
}

export interface GoogleSyncResult {
  created: number;
  updated: number;
  deleted: number;
  /** Eventos CrewCheck já idênticos no Google (sem PATCH). */
  unchanged: number;
  total: number;
  calendarId: string;
  feedUrl?: string;
}

export interface CalendarFeedInfo {
  feedUrl: string;
  token?: string;
  updatedAt?: string | null;
  periodLabel?: string | null;
  mode?: string | null;
  hasContent: boolean;
}

type GoogleTokenPayload = {
  access_token: string;
  expires_at: number;
  scope?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
  callback?: (response: GoogleTokenResponse) => void;
};

type GoogleCalendarApiEvent = {
  id?: string;
  colorId?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  transparency?: 'opaque' | 'transparent';
  reminders?: { useDefault?: boolean; overrides?: { method: 'popup' | 'email'; minutes: number }[] };
  extendedProperties?: { private?: Record<string, string> };
};

const SETTINGS_KEY = 'crewcheck_google_calendar_settings';
const CLIENT_ID_OVERRIDE_KEY = 'crewcheck_google_client_id_override';
const TOKEN_KEY = 'crewcheck_google_calendar_token';
const GOOGLE_CLIENT_ID_FALLBACK = '777637106343-1s0tejmffsrl6253hl6qp03idfu1mphf.apps.googleusercontent.com';
// Menor privilégio: eventos apenas em calendários do próprio usuário (events.owned) e leitura da
// lista de calendários (calendarlist.readonly) para o usuário escolher o destino, ex. um calendário
// secundário próprio. Nunca o escopo amplo .../auth/calendar.
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ');
const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';
const TIME_ZONE = 'America/Sao_Paulo';
const GOOGLE_ANDROID_SHA1_FINGERPRINT = '88caeec365ff17a8d45606ab3a1401c57653a2fa';
const GOOGLE_SERVICE_ACCOUNT_EMAIL = 'crewcheck@sonic-charmer-399015.iam.gserviceaccount.com';


let tokenClient: GoogleTokenClient | null = null;
let loadingGoogleIdentity: Promise<void> | null = null;

function defaultGoogleCalendarSettings(): GoogleCalendarSettings {
  return {
    selectedCalendarId: 'primary',
    selectedCalendarName: 'Calendário principal',
    autoSync: true,
    exportMode: 'flights-rest',
    includeFinancialNotes: false,
  };
}


export function googleCalendarIntegrationDiagnostics(): { label: string; value: string; tone: 'ok' | 'warn' | 'info' }[] {
  return [
    { label: 'Conexão Google', value: isGoogleCalendarConfigured() ? 'Configurada' : 'Aguardando configuração', tone: isGoogleCalendarConfigured() ? 'ok' : 'warn' },
    { label: 'Permissões', value: 'Eventos em calendários próprios e lista de calendários (somente leitura)', tone: 'info' },
    { label: 'Calendário de destino', value: loadGoogleCalendarSettings().selectedCalendarName || 'Calendário principal', tone: 'ok' },
    { label: 'Sincronização', value: 'Reconexão assistida quando a autorização expira.', tone: 'ok' },
  ];
}

export function getGoogleClientId(): string {
  const env = String((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID || '').trim();
  const override = getGoogleClientIdOverride();
  return env || override || GOOGLE_CLIENT_ID_FALLBACK;
}

export function getGoogleClientIdOverride(): string {
  try { return localStorage.getItem(CLIENT_ID_OVERRIDE_KEY) || ''; } catch { return ''; }
}

export function saveGoogleClientIdOverride(value: string): void {
  try {
    const normalized = value.trim();
    if (normalized) localStorage.setItem(CLIENT_ID_OVERRIDE_KEY, normalized);
    else localStorage.removeItem(CLIENT_ID_OVERRIDE_KEY);
    tokenClient = null;
  } catch {}
}

export function hasGoogleClientIdFromEnv(): boolean {
  return Boolean(String((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID || '').trim());
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

function readToken(): GoogleTokenPayload | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GoogleTokenPayload;
    if (!parsed.access_token || !parsed.expires_at) return null;
    return parsed;
  } catch { return null; }
}

function saveToken(response: GoogleTokenResponse): void {
  if (!response.access_token) throw new Error(t('googleNoToken') || 'Google não retornou token de acesso.');
  const expiresIn = Math.max(60, Number(response.expires_in || 3600));
  const payload: GoogleTokenPayload = {
    access_token: response.access_token,
    expires_at: Date.now() + expiresIn * 1000 - 60_000,
    scope: response.scope || GOOGLE_SCOPES,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(payload));
}

export function hasGoogleCalendarToken(): boolean {
  const token = readToken();
  return Boolean(token?.access_token && token.expires_at > Date.now());
}

function getValidAccessToken(): string | null {
  const token = readToken();
  if (!token?.access_token || token.expires_at <= Date.now()) return null;
  return token.access_token;
}

function googleIdentityGlobal(): any {
  return (window as unknown as { google?: any }).google;
}

function loadGoogleIdentityScript(): Promise<void> {
  if (googleIdentityGlobal()?.accounts?.oauth2) return Promise.resolve();
  if (loadingGoogleIdentity) return loadingGoogleIdentity;
  loadingGoogleIdentity = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(t('googleScriptFailed') || 'Não foi possível carregar o Google Identity Services.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(t('googleScriptFailed') || 'Não foi possível carregar o Google Identity Services.'));
    document.head.appendChild(script);
  }).finally(() => { loadingGoogleIdentity = null; });
  return loadingGoogleIdentity;
}

async function getTokenClient(): Promise<GoogleTokenClient> {
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error(t('googleNotConfigured') || 'Configure o Google Client ID para ativar a sincronização com Google Calendar.');
  await loadGoogleIdentityScript();
  const google = googleIdentityGlobal();
  if (!google?.accounts?.oauth2?.initTokenClient) throw new Error(t('googleScriptFailed') || 'Não foi possível carregar o Google Identity Services.');
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      prompt: '',
      callback: () => undefined,
      include_granted_scopes: true,
    });
  }
  return tokenClient as GoogleTokenClient;
}

export async function connectGoogleCalendar(prompt = 'consent select_account'): Promise<void> {
  const client = await getTokenClient();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(t('googleTimeout') || 'O login do Google Calendar demorou demais ou foi bloqueado. Permita pop-ups e tente novamente.'));
      }
    }, 90_000);
    client.callback = (response: GoogleTokenResponse) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (response.error) {
        reject(new Error(response.error_description || response.error || t('googleAuthOpenFailed') || 'Não foi possível abrir a autorização do Google.'));
        return;
      }
      try {
        saveToken(response);
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    try {
      client.requestAccessToken({ prompt });
    } catch (error) {
      window.clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(t('googleAuthOpenFailed') || 'Não foi possível abrir a autorização do Google.'));
    }
  });
}

export function disconnectGoogleCalendar(): void {
  try {
    const token = readToken();
    if (token?.access_token && googleIdentityGlobal()?.accounts?.oauth2?.revoke) {
      googleIdentityGlobal().accounts.oauth2.revoke(token.access_token, () => undefined);
    }
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function ensureAccessToken(promptFallback = true): Promise<string> {
  const existing = getValidAccessToken();
  if (existing) return existing;
  try {
    await connectGoogleCalendar('');
  } catch (silentError) {
    if (!promptFallback) throw silentError;
    await connectGoogleCalendar('consent select_account');
  }
  const fresh = getValidAccessToken();
  if (!fresh) throw new Error(t('googleNoToken') || 'Google não retornou token de acesso.');
  return fresh;
}

async function googleFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await ensureAccessToken();
  const response = await fetch(`${GOOGLE_API}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if ((response.status === 401 || response.status === 403) && retry) {
    try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch {}
    await connectGoogleCalendar('consent select_account');
    return googleFetch<T>(path, init, false);
  }
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { error: { message: text } }; }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error_description || `Google Calendar retornou erro ${response.status}.`;
    throw new Error(`${message} Reconecte o Google Calendar no CrewCheck e confirme se o calendário selecionado permite edição.`);
  }
  return payload as T;
}

export function loadGoogleCalendarSettings(): GoogleCalendarSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...defaultGoogleCalendarSettings(), ...parsed };
  } catch {
    return defaultGoogleCalendarSettings();
  }
}

export function normalizeGoogleCalendarId(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 254) return '';
  if (raw === 'primary') return 'primary';
  if (/[\s\/\\?#%]|\.\./.test(raw) || /[\u0000-\u001f\u007f]/.test(raw)) return '';
  if (!/^[A-Za-z0-9._+-]{1,128}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(raw)) return '';
  return raw;
}

export function saveGoogleCalendarSettings(settings: GoogleCalendarSettings): GoogleCalendarSettings {
  const selectedCalendarId = normalizeGoogleCalendarId(settings?.selectedCalendarId) || 'primary';
  const saved: GoogleCalendarSettings = {
    ...defaultGoogleCalendarSettings(),
    ...settings,
    selectedCalendarId,
    selectedCalendarName: selectedCalendarId === 'primary' && !settings?.selectedCalendarName ? 'Calendário principal' : settings?.selectedCalendarName || selectedCalendarId,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
  return saved;
}

export async function listGoogleCalendars(): Promise<GoogleCalendarOption[]> {
  // Somente calendários dos quais o usuário é proprietário: o escopo events.owned não grava nos demais.
  const primaryOption: GoogleCalendarOption = { id: 'primary', summary: 'Calendário principal', primary: true, accessRole: 'owner' };
  let payload: { items?: Array<{ id: string; summary: string; summaryOverride?: string; primary?: boolean; accessRole?: string; backgroundColor?: string }> };
  try {
    payload = await googleFetch('/users/me/calendarList?minAccessRole=owner&showHidden=false');
  } catch (error) {
    // Autorização antiga (sem calendarlist.readonly): mantém o calendário principal disponível.
    console.warn('[CrewCheck] Lista de calendários indisponível; reconecte o Google Calendar para escolher outro calendário.', error);
    return [primaryOption];
  }
  const items: GoogleCalendarOption[] = (payload.items || [])
    .filter((item) => item.id && normalizeGoogleCalendarId(item.id) && item.accessRole === 'owner')
    .map((item) => ({ id: item.primary ? 'primary' : item.id, summary: item.summaryOverride || item.summary || item.id, primary: item.primary, accessRole: item.accessRole, backgroundColor: item.backgroundColor }));
  if (!items.some((item) => item.id === 'primary')) items.unshift(primaryOption);
  return items;
}

export async function getCalendarFeedInfo(): Promise<CalendarFeedInfo> {
  try {
    const response = await fetch('/api/calendar-feed', { headers: crewcheckAuthHeader(), cache: 'no-store' });
    const payload = await response.json().catch(() => null) as CalendarFeedInfo | null;
    if (response.ok && payload?.feedUrl) return payload;
  } catch {
    // Mantém o fallback local quando o usuário ainda não está autenticado no CrewCheck.
  }
  return {
    feedUrl: '',
    updatedAt: null,
    periodLabel: null,
    mode: 'google-api',
    hasContent: hasGoogleCalendarToken(),
  };
}

export async function syncRosterToGoogleCalendar(roster: CrewRoster, settings = loadGoogleCalendarSettings(), extras: GoogleCalendarSyncExtras = {}): Promise<GoogleSyncResult> {
  const calendarId = normalizeGoogleCalendarId(settings.selectedCalendarId) || 'primary';
  const mode = normalizeExportMode(settings.exportMode || 'flights-rest');
  const ical = generateICalendar(roster, extras.gymRecommendations, {
    mode,
    titleFormat: 'route-flight',
    calendarStyle: 'operational-detailed',
    includeReminders: true,
    flightReminderMinutes: [120, 30],
    dutyReminderMinutes: [120, 30],
    gymReminderMinutes: [60],
    routineReminderMinutes: [60],
    routineSuggestions: extras.routineSuggestions || [],
    includeFinancialNotes: Boolean(settings.includeFinancialNotes),
  });
  const periodKey = buildPeriodKey(roster, mode);
  const identity = buildSyncIdentity(roster);
  const googleEvents = parseIcalEvents(ical, periodKey, identity);
  const counts = await upsertCrewCheckEvents(calendarId, roster, identity, googleEvents);
  let feedUrl = '';
  try {
    const feedResponse = await fetch('/api/calendar-feed', {
      method: 'POST',
      headers: crewcheckAuthHeader({ 'content-type': 'application/json' }),
      body: JSON.stringify({ ical, periodLabel: periodKey, mode, eventsCount: googleEvents.length, enriched: true }),
      cache: 'no-store',
    });
    const feedPayload = await feedResponse.json().catch(() => null) as { feedUrl?: string } | null;
    feedUrl = feedPayload?.feedUrl || '';
  } catch {
    // Google sync não deve falhar se a assinatura iCal não puder ser atualizada.
  }
  return { ...counts, total: googleEvents.length, calendarId, feedUrl };
}

type CrewCheckSyncIdentity = { crew: string; scope: string; legacyPrefix: string };

function buildSyncIdentity(roster: CrewRoster): CrewCheckSyncIdentity {
  const crew = crewSlug(roster);
  const month = `${roster.year}-${String(roster.month).padStart(2, '0')}`;
  return { crew, scope: `crewcheck:${crew}:${month}`, legacyPrefix: `crewcheck:${crew}:${month}:` };
}

/**
 * Upsert idempotente: identifica eventos CrewCheck SOMENTE pela propriedade privada crewcheck=true
 * (nunca por texto da descrição), casa pela chave operacional estável e:
 *  - PATCH quando o conteúdo mudou; nada quando é idêntico;
 *  - POST para o que falta;
 *  - DELETE apenas de eventos CrewCheck do mesmo tripulante/mês que saíram da escala, e duplicatas.
 * Eventos pessoais (sem a propriedade privada) nunca são lidos para alteração nem removidos.
 */
async function upsertCrewCheckEvents(calendarId: string, roster: CrewRoster, identity: CrewCheckSyncIdentity, desired: GoogleCalendarApiEvent[]): Promise<{ created: number; updated: number; deleted: number; unchanged: number }> {
  const { timeMin, timeMax } = rosterPeriodBounds(roster);
  const eventsPath = `/calendars/${encodeURIComponent(calendarId)}/events`;
  const existing: GoogleCalendarApiEvent[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({
      maxResults: '2500', singleEvents: 'true', showDeleted: 'false', timeMin, timeMax,
      privateExtendedProperty: 'crewcheck=true',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const payload = await googleFetch<{ items?: GoogleCalendarApiEvent[]; nextPageToken?: string }>(`${eventsPath}?${query.toString()}`);
    existing.push(...(payload.items || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);

  // Datas cobertas por esta escala (inclui continuações após a virada do mês).
  const coveredDates = new Set(roster.days.map((day) => {
    const date = parseRosterDateSafe(day.date, new Date(roster.year, roster.month - 1, 1, 12));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }));
  const desiredByKey = new Map<string, GoogleCalendarApiEvent>();
  for (const event of desired) desiredByKey.set(String(event.extendedProperties?.private?.crewcheckEventKey || ''), event);
  const matched = new Map<string, GoogleCalendarApiEvent>();
  const toDelete: string[] = [];

  for (const event of existing) {
    const props = event.extendedProperties?.private || {};
    if (!event.id || props.crewcheck !== 'true') continue; // defesa extra: só eventos CrewCheck.
    const legacyPeriod = String(props.crewcheckPeriodKey || '');
    const sameCrew = props.crewcheckCrew === identity.crew || legacyPeriod.startsWith(`crewcheck:${identity.crew}:`);
    if (!sameCrew) continue; // outro tripulante: não tocar.
    const sameScope = props.crewcheckScope === identity.scope || legacyPeriod === identity.scope || legacyPeriod.startsWith(identity.legacyPrefix);
    const key = props.crewcheckKeyVersion === SYNC_KEY_VERSION ? String(props.crewcheckEventKey || '') : '';
    if (key && desiredByKey.has(key) && !matched.has(key)) {
      matched.set(key, event);
      continue;
    }
    // Chave fora da escala atual (ou duplicata) — remove só se pertencer a este mês. Evento legado
    // (formato antigo, sem chave operacional) do mesmo tripulante numa data coberta por esta escala
    // é substituído pela versão nova, evitando duplicar continuações entre meses.
    const legacyCovered = !key && coveredDates.has(String(event.start?.date || event.start?.dateTime || '').slice(0, 10));
    if (sameScope || legacyCovered || (key && matched.has(key))) toDelete.push(event.id);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const [key, event] of desiredByKey) {
    const current = matched.get(key);
    if (!current) {
      await googleFetch<GoogleCalendarApiEvent>(eventsPath, { method: 'POST', body: JSON.stringify(event) });
      created += 1;
    } else if (current.extendedProperties?.private?.crewcheckHash !== event.extendedProperties?.private?.crewcheckHash) {
      await googleFetch<GoogleCalendarApiEvent>(`${eventsPath}/${encodeURIComponent(String(current.id))}`, { method: 'PATCH', body: JSON.stringify(event) });
      updated += 1;
    } else {
      unchanged += 1;
    }
  }
  let deleted = 0;
  for (const id of toDelete) {
    await googleFetch<void>(`${eventsPath}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    deleted += 1;
  }
  return { created, updated, deleted, unchanged };
}

const SYNC_KEY_VERSION = '2';

function parseIcalEvents(ical: string, periodKey: string, identity: CrewCheckSyncIdentity): GoogleCalendarApiEvent[] {
  const blocks = ical.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  const seen = new Map<string, number>();
  const events: GoogleCalendarApiEvent[] = [];
  blocks.forEach((block, index) => {
    const event = blockToGoogleEvent(block, periodKey, identity, index);
    if (!event) return;
    const props = event.extendedProperties!.private!;
    const count = seen.get(props.crewcheckEventKey) || 0;
    seen.set(props.crewcheckEventKey, count + 1);
    if (count) props.crewcheckEventKey = `${props.crewcheckEventKey}#${count + 1}`;
    events.push(event);
  });
  return events;
}

function blockToGoogleEvent(block: string, periodKey: string, identity: CrewCheckSyncIdentity, index: number): GoogleCalendarApiEvent | null {
  const lines = unfoldIcal(block);
  const summary = getIcalValue(lines, 'SUMMARY') || 'CrewCheck';
  const description = getIcalValue(lines, 'DESCRIPTION') || '';
  const location = getIcalValue(lines, 'LOCATION') || '';
  const categories = getIcalValue(lines, 'CATEGORIES') || 'CrewCheck';
  const colorHex = getIcalValue(lines, 'COLOR') || '';
  const transparency = /TRANSP:TRANSPARENT/i.test(block) ? 'transparent' : 'opaque';
  const startLine = lines.find((line) => line.startsWith('DTSTART'));
  const endLine = lines.find((line) => line.startsWith('DTEND'));
  if (!startLine || !endLine) return null;
  const start = parseIcalDateLine(startLine);
  const end = parseIcalDateLine(endLine);
  if (!start || !end) return null;
  // Identidade operacional estável (data/voo/rota) gerada pelo exportador; nunca o texto da descrição.
  const operationalKey = getIcalValue(lines, 'X-CREWCHECK-KEY')
    || `${categories.split(',').slice(0, 2).join('/')}|${start.dateTime || start.date || ''}|${index}`;
  const alarms = parseAlarms(block);
  const body: GoogleCalendarApiEvent = {
    summary,
    description,
    location,
    start,
    end,
    colorId: googleColorIdFromCrewCheck(colorHex, categories),
    transparency,
    // Sem alarmes no iCal (etapas/folgas) = sem notificação extra; não herda o padrão da agenda.
    reminders: alarms.length ? { useDefault: false, overrides: alarms.map((minutes) => ({ method: 'popup' as const, minutes })) } : { useDefault: false },
  };
  return {
    ...body,
    extendedProperties: {
      private: {
        crewcheck: 'true',
        crewcheckCrew: identity.crew,
        crewcheckScope: identity.scope,
        crewcheckPeriodKey: periodKey,
        crewcheckKeyVersion: SYNC_KEY_VERSION,
        crewcheckEventKey: operationalKey,
        crewcheckHash: stableEventKey([JSON.stringify(body)]),
      },
    },
  };
}

function googleColorIdFromCrewCheck(colorHex: string, categories: string): string | undefined {
  const source = `${colorHex || ''} ${categories || ''}`.toLowerCase();
  if (source.includes('positioning') || source.includes('#858585') || source.includes('#64748b')) return '8';
  if (source.includes('vacation') || source.includes('#0b8043')) return '10';
  if (source.includes('pairing') || source.includes('#6f72c9')) return '9';
  if (source.includes('flight') || source.includes('#9aa5df')) return '1';
  if (source.includes('reserve') || source.includes('standby') || source.includes('#ea5038') || source.includes('#e74f37')) return '11';
  if (source.includes('rest') || source.includes('layover') || source.includes('#67c58d') || source.includes('#52aaa0')) return '2';
  if (source.includes('training') || source.includes('duty') || source.includes('#ff7248')) return '6';
  if (source.includes('checkin') || source.includes('#facc15')) return '5';
  if (source.includes('routine') || source.includes('meal') || source.includes('recovery')) return '7';
  return undefined;
}

function unfoldIcal(block: string): string[] {
  const raw = block.replace(/\r/g, '').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if (!line) continue;
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  return lines;
}

function getIcalValue(lines: string[], key: string): string | null {
  const line = lines.find((item) => item.startsWith(`${key}`));
  if (!line) return null;
  const value = line.slice(line.indexOf(':') + 1);
  return unescapeIcal(value);
}

function unescapeIcal(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseIcalDateLine(line: string): { dateTime?: string; date?: string; timeZone?: string } | null {
  const [left, rawValue] = line.split(/:(.+)/);
  if (!rawValue) return null;
  if (/VALUE=DATE/i.test(left)) {
    return { date: `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}` };
  }
  const tzMatch = left.match(/TZID=([^;]+)/i);
  const timeZone = tzMatch?.[1] || TIME_ZONE;
  const dateTime = `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}T${rawValue.slice(9, 11)}:${rawValue.slice(11, 13)}:${rawValue.slice(13, 15) || '00'}`;
  return { dateTime, timeZone };
}

function parseAlarms(block: string): number[] {
  const alarms: number[] = [];
  for (const match of block.matchAll(/TRIGGER:-PT(\d+)M/g)) {
    const minutes = Number(match[1]);
    if (Number.isFinite(minutes) && minutes > 0) alarms.push(minutes);
  }
  return Array.from(new Set(alarms));
}

function parseRosterDateSafe(value: string, fallback: Date): Date {
  const raw = String(value || '').trim();
  const safeFallback = fallback instanceof Date && Number.isFinite(fallback.getTime()) ? fallback : new Date();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
    return Number.isFinite(parsed.getTime()) ? parsed : safeFallback;
  }
  const br = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (br) {
    const yearRaw = br[3] ? Number(br[3]) : safeFallback.getFullYear();
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const parsed = new Date(year, Number(br[2]) - 1, Number(br[1]), 12, 0, 0, 0);
    return Number.isFinite(parsed.getTime()) ? parsed : safeFallback;
  }
  const monthMap: Record<string, number> = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const textual = normalized.match(/(?:DOM|SEG|TER|QUA|QUI|SEX|SAB)?\s*(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{4}))?/);
  if (textual && monthMap[textual[2]]) {
    const parsed = new Date(textual[3] ? Number(textual[3]) : safeFallback.getFullYear(), monthMap[textual[2]] - 1, Number(textual[1]), 12, 0, 0, 0);
    return Number.isFinite(parsed.getTime()) ? parsed : safeFallback;
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : safeFallback;
}

function rosterPeriodBounds(roster: CrewRoster): { timeMin: string; timeMax: string } {
  const base = new Date(Number(roster.year) || new Date().getFullYear(), Math.max(0, (Number(roster.month) || new Date().getMonth() + 1) - 1), 1, 12, 0, 0, 0);
  const first = parseRosterDateSafe(roster.days[0]?.date || '', base);
  const lastBase = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12, 0, 0, 0);
  const last = parseRosterDateSafe(roster.days[roster.days.length - 1]?.date || '', lastBase);
  const min = new Date(first);
  min.setDate(min.getDate() - 3);
  min.setHours(0, 0, 0, 0);
  const max = new Date(last);
  max.setDate(max.getDate() + 7);
  max.setHours(23, 59, 59, 0);
  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

function crewSlug(roster: CrewRoster): string {
  return String(roster.crewName || 'tripulante').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'tripulante';
}

function buildPeriodKey(roster: CrewRoster, mode: CalendarExportMode): string {
  return `crewcheck:${crewSlug(roster)}:${roster.year}-${String(roster.month).padStart(2, '0')}:${mode}`;
}

/** Hash de conteúdo (FNV-1a 64 bits em duas metades) — detecta mudança para decidir PATCH. */
function stableEventKey(parts: string[]): string {
  const input = parts.join('|');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x5bd1e995) >>> 0;
  }
  return `cc-${h1.toString(36)}${h2.toString(36)}`;
}

function normalizeExportMode(mode: GoogleCalendarSyncMode): CalendarExportMode {
  if (mode === 'flights') return 'flights';
  if (mode === 'flights-rest') return 'flights-rest';
  if (mode === 'gym') return 'gym';
  if (mode === 'routine') return 'routine';
  return 'all';
}

export function explainCalendarFeed(): string {
  return 'Google Calendar direto via API: o CrewCheck pede autorização pelo Google, lista seus calendários próprios e sincroniza a escala sem duplicar eventos, atualizando apenas eventos CrewCheck.';
}

export function googleCalendarSimpleLabel(): string {
  return t('primaryCalendar') || 'Google Calendar';
}
