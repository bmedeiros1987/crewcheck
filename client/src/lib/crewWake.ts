export type CrewWakeCanonical = {
  journeyId?: string | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
  kind?: string | null;
};

export type CrewWakeEvent = {
  id: string;
  date?: Date | string;
  day?: { date?: string; base?: string; pairingCode?: string; type?: string; [key: string]: unknown };
  kind?: string;
  hotel?: string;
  origin?: string;
  destination?: string;
  presentation?: string;
  departure?: string;
  arrival?: string;
  placeholder?: boolean;
  canonical?: CrewWakeCanonical | null;
};

export type MyCrewCareTransport = {
  direction: 'to_airport' | 'to_hotel' | 'unknown';
  date?: string;
  time?: string;
  transitMinutes?: number | null;
  pairingId?: string;
  airport?: string;
  hotel?: string;
};

export type MyCrewCareSnapshot = {
  connected: boolean;
  syncedAt?: string;
  records: MyCrewCareTransport[];
};

export type CrewWakeState = {
  automatic: boolean;
  manualPickup?: string;
  autoPickup?: string;
  wakeLeadMinutes: number;
  mirrorSystemAlarm: boolean;
  infobipFallback: boolean;
  active: boolean;
  scheduledWakeAt?: string;
  fallbackJobKey?: string;
};

export type EffectivePickup = {
  time: string;
  source: 'manual' | 'mycrewcare' | 'automatic' | 'presentation' | 'none';
  dateTime: Date | null;
};

const WAKE_PREFIX = 'crewcheck:wake:v2:';
const MYCREWCARE_KEY = 'crewcheck:mycrewcare:snapshot:v1';
const MYCREWCARE_STATUS_KEY = 'crewcheck:mycrewcare:status';
const MYCREWCARE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MYCREWCARE_FUTURE_SKEW_MS = 5 * 60 * 1000;
const BRIEFING_LEAD_KEY = 'crewcheck:briefing:lead-hours';

function storageGet(key: string, fallback = ''): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch {}
}

function sanitizeMyCrewCareRecords(records: unknown): MyCrewCareTransport[] {
  if (!Array.isArray(records)) return [];
  return records.slice(0, 20).flatMap((value: any) => {
    if (!value || typeof value !== 'object') return [];
    const rawDirection = String(value.direction || '').trim();
    const direction: MyCrewCareTransport['direction'] =
      rawDirection === 'to_airport' || rawDirection === 'to_hotel' ? rawDirection : 'unknown';
    const transit = Number(value.transitMinutes);
    return [{
      direction,
      date: String(value.date || '').trim() || undefined,
      time: String(value.time || '').trim() || undefined,
      transitMinutes: Number.isFinite(transit) ? transit : null,
      pairingId: String(value.pairingId || '').trim() || undefined,
      airport: String(value.airport || '').trim().toUpperCase() || undefined,
      hotel: String(value.hotel || '').trim() || undefined,
    }];
  });
}

export function crewWakeEventKey(event: CrewWakeEvent): string {
  const journey = String(event.canonical?.journeyId || '').trim();
  const day = String(event.day?.date || event.date || '').trim();
  const place = String(event.destination || event.origin || '').trim().toUpperCase();
  return [journey || 'stay', day || 'date', place || 'place', String(event.id || 'event')].join(':').replace(/\s+/g, '-').slice(0, 220);
}

export function defaultCrewWakeState(): CrewWakeState {
  const lead = Math.max(20, Math.min(240, Number(storageGet('crewcheck_wakeup_lead_minutes', '60')) || 60));
  return {
    automatic: storageGet('crewcheck:wake:auto', '0') === '1',
    wakeLeadMinutes: lead,
    mirrorSystemAlarm: storageGet('crewcheck:wake:mirror-system', '0') === '1',
    infobipFallback: storageGet('crewcheck:wake:infobip-fallback', '0') === '1',
    active: false,
  };
}

export function readCrewWakeState(event: CrewWakeEvent): CrewWakeState {
  const fallback = defaultCrewWakeState();
  try {
    const parsed = JSON.parse(storageGet(WAKE_PREFIX + crewWakeEventKey(event), '{}'));
    return {
      ...fallback,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      wakeLeadMinutes: Math.max(20, Math.min(240, Number(parsed?.wakeLeadMinutes ?? fallback.wakeLeadMinutes) || fallback.wakeLeadMinutes)),
    };
  } catch {
    return fallback;
  }
}

export function writeCrewWakeState(event: CrewWakeEvent, patch: Partial<CrewWakeState>): CrewWakeState {
  const next = { ...readCrewWakeState(event), ...patch };
  storageSet(WAKE_PREFIX + crewWakeEventKey(event), JSON.stringify(next));
  storageSet('crewcheck:wake:auto', next.automatic ? '1' : '0');
  storageSet('crewcheck:wake:mirror-system', next.mirrorSystemAlarm ? '1' : '0');
  storageSet('crewcheck:wake:infobip-fallback', next.infobipFallback ? '1' : '0');
  storageSet('crewcheck_wakeup_lead_minutes', String(next.wakeLeadMinutes));
  return next;
}

export function readMyCrewCareSnapshot(): MyCrewCareSnapshot {
  try {
    const parsed = JSON.parse(storageGet(MYCREWCARE_KEY, '{}'));
    return {
      connected: storageGet(MYCREWCARE_STATUS_KEY, parsed?.connected ? 'connected' : 'disconnected') === 'connected',
      syncedAt: String(parsed?.syncedAt || ''),
      records: sanitizeMyCrewCareRecords(parsed?.records),
    };
  } catch {
    return { connected: storageGet(MYCREWCARE_STATUS_KEY, 'disconnected') === 'connected', records: [] };
  }
}

export function writeMyCrewCareSnapshot(input: Partial<MyCrewCareSnapshot> | null | undefined): MyCrewCareSnapshot {
  const previous = readMyCrewCareSnapshot();
  const connected = Boolean(input?.connected);
  const hasRecords = Array.isArray(input?.records);
  const next: MyCrewCareSnapshot = {
    connected,
    syncedAt: connected ? String(input?.syncedAt ?? previous.syncedAt ?? '') : '',
    records: connected ? (hasRecords ? sanitizeMyCrewCareRecords(input?.records) : previous.records) : [],
  };
  storageSet(MYCREWCARE_KEY, JSON.stringify(next));
  storageSet(MYCREWCARE_STATUS_KEY, connected ? 'connected' : 'disconnected');
  return next;
}

export function isFreshMyCrewCareSnapshot(snapshot: MyCrewCareSnapshot, now = Date.now()): boolean {
  if (!snapshot.connected) return false;
  const syncedAt = Date.parse(String(snapshot.syncedAt || ''));
  if (!Number.isFinite(syncedAt)) return false;
  if (syncedAt > now + MYCREWCARE_FUTURE_SKEW_MS) return false;
  return now - syncedAt <= MYCREWCARE_MAX_AGE_MS;
}

export function myCrewCareConnectionStatus(): 'connected' | 'disconnected' {
  return readMyCrewCareSnapshot().connected ? 'connected' : 'disconnected';
}

function dateFromLoose(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value);
  const raw = String(value || '').trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12, 0, 0, 0);
  const iso = new Date(raw);
  return Number.isFinite(iso.getTime()) ? iso : null;
}

export function eventStart(event: CrewWakeEvent): Date | null {
  const canonical = dateFromLoose(event.canonical?.startDateTime);
  if (canonical) return canonical;
  const base = dateFromLoose(event.date) || dateFromLoose(event.day?.date);
  if (!base) return null;
  const match = String(event.presentation || event.departure || '').match(/(\d{1,2}):(\d{2})/);
  if (match) base.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return base;
}

export function eventEnd(event: CrewWakeEvent): Date | null {
  const canonical = dateFromLoose(event.canonical?.endDateTime);
  if (canonical) return canonical;
  const start = eventStart(event);
  if (!start) return null;
  const end = new Date(start);
  const match = String(event.arrival || event.presentation || '').match(/(\d{1,2}):(\d{2})/);
  if (match) end.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  return end;
}

export function clockOnOrAfter(anchor: Date | null, clock: string, dateHint?: string): Date | null {
  const match = String(clock || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hinted = dateFromLoose(dateHint);
  const base = hinted || (anchor ? new Date(anchor) : null);
  if (!base) return null;
  base.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (!hinted && anchor && base.getTime() <= anchor.getTime()) base.setDate(base.getDate() + 1);
  return base;
}

function normalizedDateKey(value: unknown): string {
  const date = dateFromLoose(value);
  if (!date) return '';
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function eventDateKeys(event: CrewWakeEvent): Set<string> {
  const keys = new Set<string>();
  [event.date, event.day?.date, event.canonical?.startDateTime, event.canonical?.endDateTime].forEach((value) => {
    const key = normalizedDateKey(value);
    if (key) keys.add(key);
  });
  const start = eventStart(event);
  if (start) {
    const next = new Date(start);
    next.setDate(next.getDate() + 1);
    keys.add(normalizedDateKey(next));
  }
  return keys;
}

export function matchMyCrewCarePickup(event: CrewWakeEvent, snapshot = readMyCrewCareSnapshot()): MyCrewCareTransport | null {
  if (!isFreshMyCrewCareSnapshot(snapshot)) return null;
  const airport = String(event.destination || event.origin || '').trim().toUpperCase();
  const dates = eventDateKeys(event);
  const candidates = (snapshot.records || []).filter((record) => record?.direction === 'to_airport' && /^\d{1,2}:\d{2}$/.test(String(record?.time || '')));
  const exact = candidates.find((record) => {
    const sameDate = !record.date || dates.has(normalizedDateKey(record.date));
    const sameAirport = !record.airport || !airport || String(record.airport).toUpperCase() === airport;
    return sameDate && sameAirport;
  });
  return exact || candidates.find((record) => !record.date || dates.has(normalizedDateKey(record.date))) || null;
}

export function effectivePickup(event: CrewWakeEvent, state = readCrewWakeState(event), snapshot = readMyCrewCareSnapshot()): EffectivePickup {
  const start = eventStart(event);
  if (state.manualPickup) {
    return { time: state.manualPickup, source: 'manual', dateTime: clockOnOrAfter(start, state.manualPickup) };
  }
  if (state.automatic) {
    const record = matchMyCrewCarePickup(event, snapshot);
    if (record?.time) return { time: record.time, source: 'mycrewcare', dateTime: clockOnOrAfter(start, record.time, record.date) };
    if (state.autoPickup) return { time: state.autoPickup, source: 'automatic', dateTime: clockOnOrAfter(start, state.autoPickup) };
  }
  const fallback = String(event.presentation || '').match(/(\d{1,2}:\d{2})/)?.[1] || '';
  return fallback
    ? { time: fallback, source: 'presentation', dateTime: clockOnOrAfter(start, fallback) }
    : { time: '', source: 'none', dateTime: null };
}

export function wakeAtForEvent(event: CrewWakeEvent, state = readCrewWakeState(event), snapshot = readMyCrewCareSnapshot()): Date | null {
  const pickup = effectivePickup(event, state, snapshot);
  const target = pickup.dateTime || eventEnd(event);
  if (!target) return null;
  const wake = new Date(target);
  wake.setMinutes(wake.getMinutes() - Math.max(20, Math.min(240, state.wakeLeadMinutes || 60)));
  return wake;
}

export function stayWindow(event: CrewWakeEvent, state = readCrewWakeState(event), snapshot = readMyCrewCareSnapshot()) {
  const start = eventStart(event);
  const pickup = effectivePickup(event, state, snapshot);
  const end = pickup.dateTime || eventEnd(event);
  const minutes = start && end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : null;
  return { start, end, minutes, pickup, wakeAt: wakeAtForEvent(event, state, snapshot) };
}

export function formatClock(value: Date | null): string {
  if (!value || !Number.isFinite(value.getTime())) return '—';
  return value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(minutes: number | null): string {
  if (!Number.isFinite(Number(minutes))) return '—';
  const total = Math.max(0, Number(minutes));
  return `${Math.floor(total / 60)}h${String(Math.round(total % 60)).padStart(2, '0')}`;
}

export function isNativeCrewCheck(): boolean {
  try { return Boolean((window as any).CrewCheckNative || (window as any).AndroidCrewCheckNative); } catch { return false; }
}

export function isPwaLike(): boolean {
  if (isNativeCrewCheck()) return false;
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as any).standalone === true;
  } catch {
    return false;
  }
}

export function briefingLeadHours(): number {
  return Math.max(3, Math.min(72, Number(storageGet(BRIEFING_LEAD_KEY, '24')) || 24));
}

export function setBriefingLeadHours(hours: number): number {
  const next = Math.max(3, Math.min(72, Number(hours) || 24));
  storageSet(BRIEFING_LEAD_KEY, String(next));
  return next;
}

export function nextTripBriefing(events: CrewWakeEvent[], now = new Date(), leadHours = briefingLeadHours()) {
  const sorted = [...events]
    .filter((event) => !event.placeholder)
    .map((event) => ({ event, start: eventStart(event), end: eventEnd(event) }))
    .filter((item): item is { event: CrewWakeEvent; start: Date; end: Date | null } => Boolean(item.start))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const firstIndex = sorted.findIndex(({ event, start }) => start.getTime() >= now.getTime() - 15 * 60_000 && ['flight', 'duty'].includes(String(event.kind || '')));
  if (firstIndex < 0) return null;

  const first = sorted[firstIndex];
  const base = String(first.event.day?.base || first.event.origin || '').trim().toUpperCase();
  const cap = first.start.getTime() + 6 * 86_400_000;
  const trip: CrewWakeEvent[] = [];
  let seenStay = false;

  for (let index = firstIndex; index < sorted.length; index += 1) {
    const item = sorted[index];
    if (item.start.getTime() > cap) break;
    trip.push(item.event);
    const isStay = item.event.kind === 'stay' || Boolean(item.event.hotel);
    if (isStay) seenStay = true;
    if (seenStay && item.event.kind === 'flight' && base && String(item.event.destination || '').toUpperCase() === base) break;
  }

  const stays = trip.filter((event) => event.kind === 'stay' || Boolean(event.hotel));
  const briefingAt = new Date(first.start.getTime() - leadHours * 60 * 60_000);
  return {
    startsAt: first.start,
    briefingAt,
    available: now.getTime() >= briefingAt.getTime(),
    base,
    events: trip,
    stays,
  };
}
