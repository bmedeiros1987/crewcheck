/**
 * CrewCheck Life Operations — organiza o calendário "Academia" a partir da escala oficial.
 *
 * Escala → Wellness Scheduler (wellnessScheduler.ts) → Google Calendar "Academia".
 * - Só altera/remove eventos com extendedProperties.private crewcheck=true e crewcheckDomain=wellness.
 * - Compromissos pessoais são lidos apenas como intervalos ocupados (sem título) e nunca alterados.
 * - Nunca apaga calendários. Cria o calendário "Academia" somente se ele não existir.
 * - Upsert idempotente: igual → nada; mudou → PATCH; novo → POST; saiu do plano → DELETE.
 */
import type { CrewRoster } from './pdfParser';
import { airportTimeZone, rosterDutyIntervals } from './calendarExport';
import { getGymRecommendations, type GymRecommendation } from './complianceEngine';
import {
  crewcheckGoogleCalendarRequest,
  crewcheckSyncCrewKey,
  hasGoogleCalendarToken,
  loadGoogleCalendarSettings,
  normalizeGoogleCalendarId,
  saveGoogleCalendarSettings,
  syncRosterToGoogleCalendar,
} from './googleCalendarSync';
import {
  normalizeWellnessPreferences,
  planWellness,
  wellnessEventDescription,
  type ReferenceAvailability,
  type WellnessBusyInterval,
  type WellnessDayPlan,
  type WellnessHealthDay,
  type WellnessPreferences,
  type WellnessReferenceWindow,
} from './wellnessScheduler';

const PREFERENCES_KEY = 'crewcheck:wellness:preferences:v1';
const AUTO_STATE_KEY = 'crewcheck:wellness:auto-state:v1';
const HEALTH_HISTORY_KEY = 'crewcheck:life:health-history:v1';
const LIFE_EVENTS_KEY = 'crewcheck:life:adaptive-events:v1';
const KEY_VERSION = '2';
const AUTO_INTERVAL_MS = 6 * 3_600_000;

type ApiEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  colorId?: string;
  transparency?: 'opaque' | 'transparent';
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  reminders?: { useDefault?: boolean; overrides?: { method: 'popup'; minutes: number }[] };
  extendedProperties?: { private?: Record<string, string> };
};

export interface WellnessSyncResult {
  calendarId: string;
  calendarName: string;
  calendarCreated: boolean;
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  total: number;
  plans: WellnessDayPlan[];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function loadWellnessPreferences(): WellnessPreferences {
  return normalizeWellnessPreferences(readJson<Partial<WellnessPreferences>>(PREFERENCES_KEY, {}));
}

export function saveWellnessPreferences(value: Partial<WellnessPreferences>): WellnessPreferences {
  const next = normalizeWellnessPreferences({ ...loadWellnessPreferences(), ...value });
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next)); } catch {}
  try { window.dispatchEvent(new CustomEvent('crewcheck:wellness-preferences', { detail: next })); } catch {}
  return next;
}

function isoFromRosterDate(value: string): string {
  const br = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  return String(value || '').slice(0, 10);
}

/** Janelas de academia do relatório CrewCheck (referência; o motor recalcula com as regras rígidas). */
export function referenceWindowsFromReport(recommendations: GymRecommendation[]): WellnessReferenceWindow[] {
  const valid: ReferenceAvailability[] = ['ideal', 'good', 'moderate', 'limited'];
  return recommendations
    .filter((item) => item && valid.includes(item.availability) && /^\d{2}:\d{2}$/.test(item.startTime) && /^\d{2}:\d{2}$/.test(item.endTime) && item.planType !== 'evitar')
    .map((item) => ({ date: isoFromRosterDate(item.date), start: item.startTime, end: item.endTime, availability: item.availability }));
}

function localIsoDate(epochMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(epochMs));
  return parts.slice(0, 10);
}

/** Resumos autorizados do relógio já guardados neste aparelho (Health Connect / Companion / manual). */
export function readAuthorizedHealthDays(timeZone: string): WellnessHealthDay[] {
  const snapshots = readJson<any[]>(HEALTH_HISTORY_KEY, []);
  const events = readJson<any[]>(LIFE_EVENTS_KEY, []);
  const byDate = new Map<string, WellnessHealthDay>();
  for (const item of (Array.isArray(snapshots) ? [...snapshots] : []).sort((a, b) => Date.parse(b?.capturedAt || '') - Date.parse(a?.capturedAt || ''))) {
    const at = Date.parse(String(item?.capturedAt || ''));
    if (!Number.isFinite(at)) continue;
    // NativeSleep is the last session in the query window, never the capture day.
    const start = Date.parse(String(item.sleepStart || ''));
    const end = Date.parse(String(item.sleepEnd || ''));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > at || end - start > 86_400_000) continue;
    const date = localIsoDate(end, timeZone);
    const minutes = Number(item.sleepMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || byDate.has(date)) continue;
    byDate.set(date, {
      date, sleepMinutes: minutes, capturedAt: item.capturedAt, summaryPeriodDays: item.periodDays,
      provenance: { sleepMinutes: { start: item.sleepStart, end: item.sleepEnd, periodDays: 1 } },
    });
    // RHR, steps and activity summaries have no daily measurement timestamps.
    // Keep them in local history; do not manufacture daily observations.
  }

  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type !== 'exercise' || event?.status !== 'completed') continue;
    const at = Date.parse(String(event.occurredAt || ''));
    const minutes = Number(event.durationMinutes);
    if (!Number.isFinite(at) || !Number.isFinite(minutes) || minutes <= 0) continue;
    const date = localIsoDate(at, timeZone);
    const day = byDate.get(date) || { date };
    day.exerciseMinutes = (day.exerciseMinutes || 0) + minutes;
    byDate.set(date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildWellnessPlan(roster: CrewRoster, options: {
  preferences?: Partial<WellnessPreferences>;
  busy?: WellnessBusyInterval[];
  health?: WellnessHealthDay[];
  references?: WellnessReferenceWindow[];
  fromDate?: string;
} = {}): WellnessDayPlan[] {
  const homeTimeZone = airportTimeZone(roster.base);
  const intervals = rosterDutyIntervals(roster);
  const references = options.references ?? referenceWindowsFromReport(getGymRecommendations(roster));
  const plans = planWellness({
    intervals,
    references,
    busy: options.busy || [],
    health: options.health || [],
    preferences: options.preferences,
    homeTimeZone,
  });
  return options.fromDate ? plans.filter((plan) => plan.date >= options.fromDate!) : plans;
}

// ---------- Google Calendar ----------
type CalendarListItem = { id: string; summary?: string; summaryOverride?: string; accessRole?: string; primary?: boolean };

async function listOwnedCalendars(): Promise<CalendarListItem[]> {
  const payload = await crewcheckGoogleCalendarRequest<{ items?: CalendarListItem[] }>('/users/me/calendarList?minAccessRole=owner&showHidden=false');
  return (payload?.items || []).filter((item) => item?.id && item.accessRole === 'owner');
}

function calendarName(item: CalendarListItem): string {
  return String(item.summaryOverride || item.summary || '').trim();
}

/** Localiza calendário próprio pelo nome exato; cria só quando `createIfMissing` e ele não existir. */
export async function ensureOwnedCalendar(name: string, options: { createIfMissing: boolean; timeZone: string }): Promise<{ id: string; created: boolean }> {
  const target = name.trim();
  const calendars = await listOwnedCalendars();
  const existing = calendars.find((item) => calendarName(item) === target);
  if (existing) return { id: existing.primary ? 'primary' : existing.id, created: false };
  if (!options.createIfMissing) throw new Error(`Calendário "${target}" não encontrado entre os calendários próprios.`);
  return createOwnedCalendar(target, options.timeZone);
}

async function createOwnedCalendar(target: string, timeZone: string): Promise<{ id: string; created: boolean }> {
  const created = await crewcheckGoogleCalendarRequest<{ id?: string }>('/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: target, timeZone, description: 'Calendário gerenciado pelo CrewCheck (bem-estar). Você pode editar ou remover eventos; o CrewCheck só altera eventos que ele criou.' }),
  });
  const id = normalizeGoogleCalendarId(created?.id);
  if (!id) throw new Error(`Não foi possível criar o calendário "${target}". Crie-o no Google Calendar e sincronize de novo.`);
  return { id, created: true };
}

async function listEvents(calendarId: string, params: Record<string, string>): Promise<ApiEvent[]> {
  const out: ApiEvent[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ singleEvents: 'true', showDeleted: 'false', maxResults: '2500', ...params });
    if (pageToken) query.set('pageToken', pageToken);
    const payload = await crewcheckGoogleCalendarRequest<{ items?: ApiEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`);
    out.push(...(payload?.items || []));
    pageToken = payload?.nextPageToken || '';
  } while (pageToken);
  return out;
}

/** Compromissos pessoais → apenas intervalos ocupados. Eventos CrewCheck, livres e de dia inteiro não bloqueiam. */
export function busyIntervalsFromEvents(events: ApiEvent[]): WellnessBusyInterval[] {
  return events
    .filter((event) => event.status !== 'cancelled' && event.transparency !== 'transparent')
    .filter((event) => event.extendedProperties?.private?.crewcheck !== 'true')
    .filter((event) => event.start?.dateTime && event.end?.dateTime)
    .map((event) => ({ startUtcMs: Date.parse(String(event.start!.dateTime)), endUtcMs: Date.parse(String(event.end!.dateTime)) }))
    .filter((item) => Number.isFinite(item.startUtcMs) && Number.isFinite(item.endUtcMs) && item.endUtcMs > item.startUtcMs);
}


function contentHash(value: unknown): string {
  const input = JSON.stringify(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x5bd1e995) >>> 0;
  }
  return `cc-${h1.toString(36)}${h2.toString(36)}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

export function wellnessPlanToEvent(plan: WellnessDayPlan, crew: string): ApiEvent {
  const body: ApiEvent = plan.window
    ? {
      summary: plan.window ? 'Academia · Atividade pessoal' : 'Academia · Reserva pessoal',
      description: wellnessEventDescription(plan),
      colorId: '2',
      transparency: 'opaque',
      start: { dateTime: `${plan.date}T${plan.window.startLocal}:00`, timeZone: plan.timeZone },
      end: { dateTime: `${localEndDate(plan)}T${plan.window.endLocal}:00`, timeZone: plan.timeZone },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
    }
    : {
      summary: plan.window ? 'Academia · Atividade pessoal' : 'Academia · Reserva pessoal',
      description: wellnessEventDescription(plan),
      colorId: '2',
      transparency: 'transparent',
      start: { date: plan.date },
      end: { date: addDaysIso(plan.date, 1) },
      reminders: { useDefault: false },
    };
  return {
    ...body,
    extendedProperties: {
      private: {
        crewcheck: 'true',
        crewcheckDomain: 'wellness',
        crewcheckCrew: crew,
        crewcheckKeyVersion: KEY_VERSION,
        crewcheckEventKey: plan.key,
        crewcheckHash: contentHash(body),
      },
    },
  };
}

function localEndDate(plan: WellnessDayPlan): string {
  // Janela nunca cruza a meia-noite (limite latestWorkoutEnd), mas mantemos o cálculo explícito.
  return plan.window && plan.window.endLocal < plan.window.startLocal ? addDaysIso(plan.date, 1) : plan.date;
}

/**
 * Sincroniza o plano no calendário de bem-estar. `fromDate` evita reescrever o passado:
 * eventos de dias anteriores ficam como estão.
 */
export async function syncWellnessToGoogleCalendar(roster: CrewRoster, options: {
  now?: number;
  preferences?: Partial<WellnessPreferences>;
  health?: WellnessHealthDay[];
  references?: WellnessReferenceWindow[];
} = {}): Promise<WellnessSyncResult> {
  const prefs = normalizeWellnessPreferences({ ...loadWellnessPreferences(), ...(options.preferences || {}) });
  const homeTimeZone = airportTimeZone(roster.base);
  const now = options.now ?? Date.now();
  const fromDate = localIsoDate(now, homeTimeZone);
  const existingAcademia = (await listOwnedCalendars()).find((item) => calendarName(item) === prefs.academiaCalendarName);
  const existingAcademiaId = existingAcademia ? (existingAcademia.primary ? 'primary' : existingAcademia.id) : null;

  const intervals = rosterDutyIntervals(roster);
  const rosterDates = intervals.map((item) => item.date).sort();
  const lastDate = rosterDates[rosterDates.length - 1] || fromDate;
  const timeMin = new Date(Math.min(now, Date.parse(`${fromDate}T00:00:00Z`)) - 86_400_000).toISOString();
  const timeMax = new Date(Date.parse(`${addDaysIso(lastDate, 3)}T23:59:59Z`)).toISOString();

  // Compromissos pessoais: calendário principal, calendário da escala e o próprio Academia (eventos do usuário).
  const scheduleSettings = loadGoogleCalendarSettings();
  const busyCalendars = Array.from(new Set(['primary', normalizeGoogleCalendarId(scheduleSettings.selectedCalendarId) || 'primary', ...(existingAcademiaId ? [existingAcademiaId] : [])]));
  const busy: WellnessBusyInterval[] = [];
  for (const id of busyCalendars) {
    try { busy.push(...busyIntervalsFromEvents(await listEvents(id, { timeMin, timeMax }))); }
    catch { throw new Error('Disponibilidade da agenda não verificada. Sincronização de Academia interrompida sem alterar eventos.'); }
  }

  // All required availability reads succeeded before the first external mutation.
  const academia = existingAcademiaId ? { id: existingAcademiaId, created: false }
    : await createOwnedCalendar(prefs.academiaCalendarName, homeTimeZone);
  const health = prefs.useHealthData ? (options.health ?? readAuthorizedHealthDays(homeTimeZone)) : [];
  const plans = buildWellnessPlan(roster, { preferences: prefs, busy, health, references: options.references, fromDate });
  const crew = crewcheckSyncCrewKey(roster);
  const desired = new Map<string, ApiEvent>();
  for (const plan of plans) if (plan.publishEvent) desired.set(plan.key, wellnessPlanToEvent(plan, crew));
  // Horizonte replanejado: de hoje até o último dia desta escala. Passado e outros meses ficam intactos.
  const horizonEnd = [lastDate, ...plans.map((plan) => plan.date)].sort().pop() || lastDate;
  const inHorizon = (date: string) => date >= fromDate && date <= horizonEnd;

  const existing = await listEvents(academia.id, { timeMin, timeMax, privateExtendedProperty: 'crewcheckDomain=wellness' });
  const matched = new Map<string, ApiEvent>();
  const toDelete: string[] = [];
  for (const event of existing) {
    const props = event.extendedProperties?.private || {};
    if (!event.id || props.crewcheck !== 'true' || props.crewcheckDomain !== 'wellness' || props.crewcheckCrew !== crew) continue;
    const key = String(props.crewcheckEventKey || '');
    const date = key.startsWith('wellness|') ? key.slice('wellness|'.length) : '';
    if (key && desired.has(key) && !matched.has(key)) { matched.set(key, event); continue; }
    if (date && inHorizon(date)) toDelete.push(event.id); // saiu do plano (ou duplicata) — só no horizonte replanejado
  }

  const base = `/calendars/${encodeURIComponent(academia.id)}/events`;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const [key, event] of desired) {
    const current = matched.get(key);
    if (!current) {
      await crewcheckGoogleCalendarRequest(base, { method: 'POST', body: JSON.stringify(event) });
      created += 1;
    } else if (current.extendedProperties?.private?.crewcheckHash !== event.extendedProperties?.private?.crewcheckHash) {
      const timedChange = Boolean(current.start?.date) !== Boolean(event.start?.date);
      if (timedChange) {
        // Dia inteiro ↔ horário: recria para não deixar campos mistos no Google.
        await crewcheckGoogleCalendarRequest(`${base}/${encodeURIComponent(String(current.id))}`, { method: 'DELETE' });
        await crewcheckGoogleCalendarRequest(base, { method: 'POST', body: JSON.stringify(event) });
      } else {
        await crewcheckGoogleCalendarRequest(`${base}/${encodeURIComponent(String(current.id))}`, { method: 'PATCH', body: JSON.stringify(event) });
      }
      updated += 1;
    } else {
      unchanged += 1;
    }
  }
  let deleted = 0;
  for (const id of toDelete) {
    await crewcheckGoogleCalendarRequest(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    deleted += 1;
  }
  return { calendarId: academia.id, calendarName: prefs.academiaCalendarName, calendarCreated: academia.created, created, updated, deleted, unchanged, total: desired.size, plans };
}

// ---------- automação ----------
function fingerprint(value: unknown): string {
  return contentHash(value);
}

export interface AutoOrganizeOutcome {
  ran: boolean;
  reason: string;
  schedule?: { created: number; updated: number; deleted: number; total: number; calendarId: string };
  wellness?: Omit<WellnessSyncResult, 'plans'>;
}

/**
 * Recalcula quando escala, saúde ou preferências mudam (ou a cada 6h para captar compromissos
 * pessoais novos). Executa no aparelho, só com Google conectado e "Auto-organizar" ligado.
 */
export async function maybeAutoOrganize(roster: CrewRoster | null | undefined, options: { force?: boolean; now?: number } = {}): Promise<AutoOrganizeOutcome> {
  const prefs = loadWellnessPreferences();
  if (!roster?.days?.length) return { ran: false, reason: 'Sem escala ativa.' };
  if (!prefs.autoOrganize && !options.force) return { ran: false, reason: 'Auto-organizar desligado.' };
  if (!hasGoogleCalendarToken()) return { ran: false, reason: 'Google Calendar não conectado.' };
  const now = options.now ?? Date.now();
  const homeTimeZone = airportTimeZone(roster.base);
  const health = readAuthorizedHealthDays(homeTimeZone);
  const print = fingerprint({ days: roster.days, health: prefs.useHealthData ? health.slice(-3) : [], prefs, bucket: Math.floor(now / AUTO_INTERVAL_MS) });
  const state = readJson<{ fingerprint?: string }>(AUTO_STATE_KEY, {});
  if (!options.force && state.fingerprint === print) return { ran: false, reason: 'Nada mudou desde a última organização.' };

  const outcome: AutoOrganizeOutcome = { ran: true, reason: 'Organizado.' };
  if (prefs.syncSchedule) {
    let settings = loadGoogleCalendarSettings();
    if (prefs.scheduleCalendarName) {
      try {
        const target = await ensureOwnedCalendar(prefs.scheduleCalendarName, { createIfMissing: false, timeZone: homeTimeZone });
        settings = saveGoogleCalendarSettings({ ...settings, selectedCalendarId: target.id, selectedCalendarName: prefs.scheduleCalendarName });
      } catch { /* mantém o calendário escolhido manualmente */ }
    }
    const result = await syncRosterToGoogleCalendar(roster, settings);
    outcome.schedule = { created: result.created, updated: result.updated, deleted: result.deleted, total: result.total, calendarId: result.calendarId };
  }
  if (prefs.syncAcademia) {
    const { plans: _plans, ...wellness } = await syncWellnessToGoogleCalendar(roster, { now, preferences: prefs, health });
    outcome.wellness = wellness;
  }
  try { localStorage.setItem(AUTO_STATE_KEY, JSON.stringify({ fingerprint: print, at: new Date(now).toISOString() })); } catch {}
  return outcome;
}
