import { carePresentationForScheduleActivity, classifyScheduleActivity, isJourneyRestScheduleActivity, type ScheduleActivityLike } from './scheduleActivityClassification';
import { getRosterCodeDefinition } from './rosterCodes';
import { airportCity } from './airports';
import { rosterDisplayIso, rosterInstantIso, rosterStrictInstant, ROSTER_DISPLAY_TIME_ZONE } from './rosterDisplayDate';

/** Read-only presentation. Never replaces the canonical activity classifier. */
export type RosterMode = 'operating' | 'extra' | 'stay' | 'rest' | 'journey-rest' | 'reserve' | 'standby' | 'training' | 'duty';
export type RosterFilter = 'all' | RosterMode;
type PresentationDay = NonNullable<ScheduleActivityLike['day']> & Record<string, any> & { date?: string };
export type RosterPresentationEvent = Omit<ScheduleActivityLike, 'day' | 'canonical'> & {
  id?: string; operationalTimeZone?: string; date?: Date | string;
  origin?: string; destination?: string; hotel?: string; workMode?: string;
  day?: PresentationDay | null; leg?: Record<string, any>; canonical?: Omit<NonNullable<ScheduleActivityLike['canonical']>, 'publishedDay'> & Record<string, any> & { date?: string; publishedDay?: PresentationDay | null; startDateTime?: string; endDateTime?: string };
};
export const rosterModes: readonly RosterMode[] = ['operating', 'extra', 'stay', 'rest', 'journey-rest', 'reserve', 'standby', 'training', 'duty'];
export const rosterModeMeta: Record<RosterMode, { label: string; shortLabel: string }> = {
  operating: { label: 'Voo tripulando', shortLabel: 'Tripulando' },
  extra: { label: 'Voo de deslocamento ou extra', shortLabel: 'Extra' },
  stay: { label: 'Pernoite', shortLabel: 'Pernoite' },
  rest: { label: 'Folga publicada', shortLabel: 'Folga' },
  'journey-rest': { label: 'Descanso · não operacional', shortLabel: 'Descanso' },
  reserve: { label: 'Reserva', shortLabel: 'Reserva' },
  standby: { label: 'Sobreaviso', shortLabel: 'Sobreaviso' },
  training: { label: 'Treinamento', shortLabel: 'Treinamento' },
  duty: { label: 'Programação · demais atividades ou tipo não confirmado', shortLabel: 'Programação' },
};
const normalized = (value: unknown) => String(value || '').trim().toUpperCase();

function formalCode(event: RosterPresentationEvent) {
  const values = [event.canonical?.code, event.code, event.type, event.canonical?.publishedDay?.type, event.day?.type].map(normalized).filter(Boolean);
  const specific = values.find(code => !['OTHER', 'FLIGHT', 'DUTY'].includes(code));
  // Only a coarse/absent formal wrapper can defer to its published pairing code.
  return specific || normalized(event.canonical?.publishedDay?.pairingCode || event.day?.pairingCode || event.pairingCode) || values[0] || '';
}
export function rosterProgramMode(event: RosterPresentationEvent): RosterMode {
  const category = classifyScheduleActivity(event);
  if (isJourneyRestScheduleActivity(event)) return 'journey-rest';
  if (category === 'FOLGA') return 'rest';
  if (category === 'REPOUSO') return 'journey-rest';
  if (category === 'PERNOITE') return 'stay';
  if (category !== 'PROGRAMACAO') return 'duty';
  if (event.canonical?.kind === 'flight' || event.kind === 'flight') {
    const work = normalized(event.canonical?.leg?.workType ?? event.leg?.workType ?? event.workMode);
    return /^(PS|PAX|DH|EXTRA|PASSAGEIRO)$/.test(work) ? 'extra' : 'operating';
  }
  const code = formalCode(event), definition = getRosterCodeDefinition(code);
  if (definition?.category === 'RESERVE') return 'reserve';
  if (definition?.category === 'STANDBY') return 'standby';
  if (definition?.category === 'SIMULATOR' || /^(CRM|CBF|EMER|EAD|SIM|CHECK|TREIN|TRAIN|MCK)$/.test(code)) return 'training';
  if (!definition && (event.canonical?.kind === 'reserve' || event.kind === 'reserve')) return 'reserve';
  if (!definition && (event.canonical?.kind === 'standby' || event.kind === 'standby')) return 'standby';
  return 'duty';
}
export function isBaseRest(event: RosterPresentationEvent) {
  if (classifyScheduleActivity(event) !== 'REPOUSO') return false;
  const published = event.canonical?.publishedDay;
  return [event.canonical?.code, published?.type, event.day?.type].some(value => normalized(value) === 'DESCANSO_BASE_CONTINUIDADE')
    || Boolean((published?.continuityInferred && published?.continuityAtBase === true) || (event.day?.continuityInferred && event.day?.continuityAtBase === true));
}
export function rosterPublishedCode(event: RosterPresentationEvent) {
  return String(event.flightNumber || event.canonical?.code || event.canonical?.publishedDay?.pairingCode || event.day?.pairingCode || event.canonical?.publishedDay?.type || event.day?.type || event.title || 'Programação');
}
function meaningful(value: unknown) { const text = String(value || '').trim(); return /^(?:—|-|N\/A|NA|A CONFIRMAR)$/i.test(text) ? '' : text; }
function sourceClock(value: unknown) { return String(value || '').trim() || '—'; }
function clockParts(value: string) { const match = /^(\d{1,2}):([0-5]\d)(?:\(\+\d+\))?$/.exec(value); return match && Number(match[1]) < 24 ? `${match[1].padStart(2, '0')}:${match[2]}` : null; }
function sameSourceClock(left: string, right: string) {
  const leftClock = clockParts(left), rightClock = clockParts(right);
  // An absent day suffix is not proof of (+0), and (+1) is not the same day.
  return Boolean(leftClock && rightClock && leftClock === rightClock
    && (left.match(/\(\+\d+\)$/)?.[0] || '') === (right.match(/\(\+\d+\)$/)?.[0] || ''));
}
function instantClock(value: unknown, zone: string) {
  const instant = rosterStrictInstant(typeof value === 'string' || value instanceof Date ? value : undefined);
  if (!instant) return null;
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant); } catch { return null; }
}
function clockBoundary(value: unknown, clock: string, displayedDay: string, zone: string) {
  const iso = rosterInstantIso(value as string, zone);
  const day = rosterStrictInstant(`${displayedDay}T12:00:00Z`);
  const explicitOffset = /\(\+(\d+)\)$/.exec(clock);
  const offset = iso && day ? (Date.parse(`${iso}T12:00:00Z`) - day.getTime()) / 86_400_000 : null;
  const matchesClock = Boolean(clockParts(clock) && instantClock(value, zone) === clockParts(clock));
  // A suffix is source evidence too. Do not call (+2) "the next day" merely
  // because an unrelated/inconsistent canonical instant has matching HH:mm.
  const conflict = Boolean(explicitOffset && (offset === null || offset !== Number(explicitOffset[1])));
  const hasBoundary = Boolean(explicitOffset || (iso && displayedDay && iso !== displayedDay));
  const unconfirmed = conflict || (hasBoundary && (!matchesClock || !day || !iso));
  if (!matchesClock || !day || !iso || conflict || iso === displayedDay) return { label: '', unconfirmed };
  return { label: offset === 1 ? 'dia seguinte' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00Z`)), unconfirmed };
}

function eventDisplayIso(event: RosterPresentationEvent) {
  return rosterDisplayIso({ ...event, day: event.day || undefined, canonical: event.canonical ? { ...event.canonical, publishedDay: event.canonical.publishedDay || undefined } : undefined });
}
export function rosterCardPresentation(event: RosterPresentationEvent, displayedDay = eventDisplayIso(event) || '') {
  const category = classifyScheduleActivity(event), mode = rosterProgramMode(event);
  const nonOperational = ['rest', 'stay', 'journey-rest'].includes(mode), atBase = isBaseRest(event);
  const published = event.canonical?.publishedDay || {}, day = event.day || {};
  const care = carePresentationForScheduleActivity(event);
  const location = meaningful(event.destination || event.origin || published.base || day.base);
  const city = airportCity(location, '');
  const code = rosterPublishedCode(event);
  const title = mode === 'rest' ? care?.label || 'Folga'
    : mode === 'journey-rest' ? atBase ? 'Descanso na base' : isJourneyRestScheduleActivity(event) ? 'Descanso entre jornadas' : 'Descanso'
    : mode === 'stay' ? `Pernoite${city ? ` · ${city}` : ''}`
    : mode === 'operating' || mode === 'extra' ? event.flightNumber || 'Voo' : code;
  const zone = event.operationalTimeZone || ROSTER_DISPLAY_TIME_ZONE;
  const flight = mode === 'operating' || mode === 'extra';
  let start = sourceClock(flight ? event.departure : published.dutyReport || day.dutyReport || published.startTime || day.startTime || event.departure);
  let end = sourceClock(flight ? event.arrival : published.dutyDebrief || day.dutyDebrief || published.endTime || day.endTime || event.arrival);
  if (nonOperational) {
    const hasStart = published.dutyReport || day.dutyReport || published.startTime || day.startTime;
    const hasEnd = published.dutyDebrief || day.dutyDebrief || published.endTime || day.endTime;
    // Only proven generated i/n segment edges are synthetic. A real published
    // midnight endpoint, or the first/last actual continuity bound, is retained.
    const inferred = published.continuityInferred ? published : day.continuityInferred ? day : null;
    const split = inferred && /^(?:DESCANSO BASE|PERNOITE) ([1-9]\d*)\/([1-9]\d*)$/.exec(normalized(inferred.pairingCode));
    const part = Number(split?.[1]), total = Number(split?.[2]);
    const segmented = Boolean(split && Number.isSafeInteger(part) && Number.isSafeInteger(total) && total > 1 && part <= total);
    const syntheticStart = segmented && part > 1 && (published.dutyReportSource || day.dutyReportSource) !== 'published';
    const syntheticEnd = segmented && part < total && (published.dutyDebriefSource || day.dutyDebriefSource) !== 'published';
    // Absent source-clock defaults are positioning scaffolding too.
    if ((!hasStart || syntheticStart) && clockParts(start) === '00:00') start = '—';
    if ((!hasEnd || syntheticEnd) && clockParts(end) === '23:59') end = '—';
    if (['estimated', 'absent', 'unknown'].includes(published.dutyReportSource || day.dutyReportSource)) start = '—';
    if (['estimated', 'absent', 'unknown'].includes(published.dutyDebriefSource || day.dutyDebriefSource)) end = '—';
  }
  if (isJourneyRestScheduleActivity(event)) {
    const proven = Number.isFinite(event.canonical?.restMinutes) && event.canonical!.restMinutes > 0;
    start = proven ? instantClock(event.canonical?.startDateTime, zone) || '—' : '—';
    end = proven ? instantClock(event.canonical?.endDateTime, zone) || '—' : '—';
  }
  const startBoundary = clockBoundary(event.canonical?.startDateTime, start, displayedDay, zone);
  const endBoundary = clockBoundary(event.canonical?.endDateTime, end, displayedDay, zone);
  const startDate = startBoundary.label, endDate = endBoundary.label;
  const startDay = rosterInstantIso(event.canonical?.startDateTime || '', zone), endDay = rosterInstantIso(event.canonical?.endDateTime || '', zone);
  const datesUnconfirmed = startBoundary.unconfirmed || endBoundary.unconfirmed || Boolean((event.canonical?.isNextDay || published.isNextDay || day.isNextDay) && (!startDay || !endDay));
  const presentation = !nonOperational && event.canonical?.showPresentation !== false && event.presentation !== 'Conexão/Solo' && clockParts(String(event.presentation || ''))
    && !sameSourceClock(sourceClock(event.presentation), start) ? sourceClock(event.presentation) : '';
  const context = nonOperational ? location : event.origin && event.destination && event.origin !== event.destination ? `${event.origin} → ${event.destination}` : meaningful(event.origin || event.destination);
  const hotel = mode === 'stay' ? meaningful(event.hotel || published.hotel || day.hotel) : '';
  const note = atBase ? 'Intervalo inferido entre jornadas na base. Não é folga publicada.'
    : isJourneyRestScheduleActivity(event) ? 'Intervalo entre jornadas, não operacional. Não certifica descanso regulamentar.'
    : mode === 'stay' && (published.continuityInferred || day.continuityInferred) ? 'Pernoite inferido por continuidade entre jornadas.'
    : mode === 'rest' ? 'Dia preservado conforme a escala publicada.' : '';
  return { category, mode, title, code, context, location, hotel, start, end, startDate, endDate, datesUnconfirmed, presentation, nonOperational, atBase, note };
}

function stableData(value: any): any {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (Array.isArray(value)) return value.map(stableData);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stableData(value[key])]));
  return value;
}
/** Exact in-memory semantic signature; never persisted or sent. */
export function rosterSourceSignature(events: readonly RosterPresentationEvent[]) { return JSON.stringify(stableData(events)); }
export function rosterOccurrenceCounts(events: readonly RosterPresentationEvent[]) {
  const counts = Object.fromEntries(rosterModes.map(mode => [mode, 0])) as Record<RosterMode, number>;
  const seen = new Set<string>(); let total = 0;
  for (const event of events) {
    const mode = rosterProgramMode(event);
    const canonicalId = typeof event.canonical?.id === 'string' ? event.canonical.id.trim() : '';
    const proof = canonicalId ? JSON.stringify([canonicalId, stableData(event.canonical), mode]) : null;
    if (proof && seen.has(proof)) continue;
    if (proof) seen.add(proof);
    counts[mode] += 1; total += 1;
  }
  return { counts, total };
}
export function filterRosterEvents<T extends RosterPresentationEvent>(events: readonly T[], filter: RosterFilter): T[] {
  return events.filter(event => filter === 'all' || rosterProgramMode(event) === filter);
}
