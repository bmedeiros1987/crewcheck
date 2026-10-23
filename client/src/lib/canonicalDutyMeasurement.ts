import type { CanonicalRosterEvent } from './canonicalRoster';

export type CanonicalDutyMeasurement = {
  state: 'available' | 'incomplete';
  journeyId: string;
  date: string;
  program: string;
  base: string;
  label: string;
  minutes: number | null;
  groundMinutes: number | null;
  start: string | null;
  end: string | null;
  reasons: string[];
  source: 'canonical_published_roster';
  limitConfirmed: false;
  reportSource: 'published' | 'estimated' | 'absent' | 'unknown';
  debriefSource: 'published' | 'estimated' | 'absent' | 'unknown';
};

function clock(value: string | null | undefined): string | null {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})(?:\(\+\d+\))?$/);
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}
function clockNear(reference: number, value: string, direction: 'before' | 'after'): number {
  // Same BRT reference as canonicalRoster.dateAt; never device-local setters.
  const iso = new Date(reference - 3 * 60 * 60_000).toISOString().slice(0, 10);
  let result = Date.parse(`${iso}T${value}:00-03:00`);
  if (direction === 'before' && result > reference) result -= 24 * 60 * 60_000;
  if (direction === 'after' && result < reference) result += 24 * 60 * 60_000;
  return result;
}

// Canonical clock identity keeps explicit civil-day offsets distinct while
// accepting equivalent padded/unpadded hour spellings. Never compare raw text.
function clockIdentity(value: unknown): string | null {
  if (typeof value !== 'string' || !clock(value)) return null;
  const offset = Number(value.match(/\(\+(\d+)\)$/)?.[1] || 0);
  return Number.isSafeInteger(offset) && offset <= 370 ? `${clock(value)}|${offset}` : null;
}
function reserveDay(event: CanonicalRosterEvent): boolean {
  return /\b(?:ASB|RES|RESERVA|RSV)\b/.test(`${event.publishedDay.type || ''} ${event.publishedDay.pairingCode || ''}`.toUpperCase());
}

/** Read every preserved node, including container evidence and nested records.
 * Bound both traversal and clock work. A cycle, malformed node or exhausted
 * budget means unavailable proof, never permission to ignore that uncertainty. */
function originalClockRecords(day: CanonicalRosterEvent['publishedDay']): { record: any; container: boolean }[] | null {
  const stack: { record: any; depth: number; exit?: boolean }[] = [{ record: (day as any).publishedClockEvidence, depth: 0 }];
  const active = new Set<object>(), records: { record: any; container: boolean }[] = [];
  let visits = 0, clocks = 0;
  while (stack.length) {
    const { record, depth, exit } = stack.pop()!;
    if (exit) { active.delete(record); continue; }
    if (++visits > 4440 || depth > 64 || !record || typeof record !== 'object' || Array.isArray(record) || active.has(record)
      || !Array.isArray(record.legs) || !record.legs.length || (clocks += record.legs.length) > 4440) return null;
    if (record.legs.some((leg: any) => !leg || typeof leg !== 'object' || Array.isArray(leg)
      || !clockIdentity(leg.departureTime) || !clockIdentity(leg.arrivalTime)
      || (leg.presentationTime != null && leg.presentationTime !== '' && !clockIdentity(leg.presentationTime)))) return null;
    const container = record.records !== undefined;
    if (container && (!Array.isArray(record.records) || !record.records.length || record.records.length > 4440)) return null;
    records.push({ record, container });
    if (container) {
      active.add(record); stack.push({ record, depth, exit: true });
      for (const child of record.records) stack.push({ record: child, depth: depth + 1 });
    }
  }
  return records;
}

function reserveFlightEvidence(events: readonly CanonicalRosterEvent[], first: CanonicalRosterEvent): { record: any; container: boolean; event: CanonicalRosterEvent }[] | null {
  const departure = clockIdentity(first.leg?.departureTime), arrival = clockIdentity(first.leg?.arrivalTime);
  if (!departure || !arrival) return null;
  const replicas = events.filter(e => e.kind === 'flight' && e.date === first.date
    && e.flightNumber === first.flightNumber && e.origin === first.origin && e.destination === first.destination
    && clockIdentity(e.leg?.departureTime) === departure && clockIdentity(e.leg?.arrivalTime) === arrival);
  const proofs: { record: any; container: boolean; event: CanonicalRosterEvent }[] = [];
  const presentations = new Set<string | null>();
  for (const event of replicas) {
    const records = originalClockRecords(event.publishedDay);
    if (!records || proofs.length + records.length > 4440) return null;
    for (const { record, container } of records) {
      const matches = record.legs.filter((leg: any) => clockIdentity(leg.departureTime) === departure && clockIdentity(leg.arrivalTime) === arrival);
      // Container legs may aggregate identical duplicates; original leaves must
      // identify a unique occurrence. Conflicting literal APZ stays unknown.
      if (!matches.length || (!container && matches.length !== 1)) return null;
      for (const leg of matches) presentations.add(clockIdentity(leg.presentationTime));
      proofs.push({ record, container, event });
    }
  }
  return proofs.length && presentations.size === 1 ? proofs : null;
}

/** Row ownership depends on original evidence across all physical replicas,
 * never the incidental post-normalization legIndex or source iteration order. */
function reserveRowBinding(events: readonly CanonicalRosterEvent[], first: CanonicalRosterEvent): 'owned' | 'other' | 'unproven' {
  const proofs = reserveFlightEvidence(events, first), report = clockIdentity(first.publishedDay.dutyReport);
  const departure = clockIdentity(first.leg?.departureTime), arrival = clockIdentity(first.leg?.arrivalTime);
  if (!proofs) return 'unproven';
  // Once original evidence places this flight in a later block, an independent
  // literal APZ belongs to that block. The earlier row report's unknown source
  // cannot erase it or contribute reserve hours to its integral duration.
  if (proofs.some(({ record }) => clockIdentity(record.legs[0].departureTime) !== departure
    || clockIdentity(record.legs[0].arrivalTime) !== arrival)) {
    return clock(first.leg?.presentationTime) && clockIdentity(first.leg?.presentationTime) !== departure ? 'other' : 'unproven';
  }
  return report && report !== departure && proofs.every(({ record, event }) => reserveDay(event)
    && clockIdentity(record.dutyReport) === report && record.dutyReportSource === 'published'
    && clockIdentity(event.publishedDay.dutyReport) === report && event.publishedDay.dutyReportSource === 'published') ? 'owned' : 'unproven';
}

function reserveReleaseProven(events: readonly CanonicalRosterEvent[], last: CanonicalRosterEvent): boolean {
  const proofs = reserveFlightEvidence(events, last), release = clockIdentity(last.publishedDay.dutyDebrief);
  return Boolean(proofs && release && proofs.every(({ record, event }) => record.dutyDebriefSource === 'published'
    && clockIdentity(record.dutyDebrief) === release && event.publishedDay.dutyDebriefSource === 'published'
    && clockIdentity(event.publishedDay.dutyDebrief) === release));
}

function publishedFlightClocksKnown(events: readonly CanonicalRosterEvent[], event: CanonicalRosterEvent): boolean {
  if (!clock(event.leg?.departureTime) || !clock(event.leg?.arrivalTime)) return false;
  if (reserveDay(event)) return reserveFlightEvidence(events, event) !== null;
  return !(((event.publishedDay as any).publishedClockEvidence?.legs || event.publishedDay.legs)
    .some((leg: any) => !clock(leg.departureTime) || !clock(leg.arrivalTime)));
}

/** Read the selected canonical journey. Ground remains inside its elapsed span;
 * another journey/rest on the same day is never added. No generic duty limit,
 * activation, estimated presentation or estimated cut is confirmed here. */
export function measureCanonicalDuty(events: readonly CanonicalRosterEvent[], selectedId: string): CanonicalDutyMeasurement | null {
  const selected = events.find(e => e.id === selectedId);
  if (!selected || !['flight', 'duty'].includes(selected.kind)) return null;
  let code = `${selected.publishedDay.type || ''} ${selected.publishedDay.pairingCode || ''}`.toUpperCase();
  let reserveDeclared = /\b(?:ASB|RES|RESERVA|RSV)\b/.test(code);
  const result: CanonicalDutyMeasurement = {
    state: 'incomplete', journeyId: selected.journeyId, date: selected.date,
    program: selected.flightNumber || selected.publishedDay.pairingCode || code,
    base: selected.publishedDay.base || selected.origin,
    label: selected.kind === 'flight' ? 'Jornada publicada' : /HSB|SOBREAVISO/.test(code) ? 'Sobreaviso publicado' : /ASB|RES/.test(code) ? 'Reserva publicada' : 'Programação publicada',
    minutes: null, groundMinutes: null, start: null, end: null, reasons: [],
    source: 'canonical_published_roster', limitConfirmed: false,
    reportSource: selected.publishedDay.dutyReportSource || (selected.publishedDay.dutyReport ? 'unknown' : 'absent'),
    debriefSource: selected.publishedDay.dutyDebriefSource || (selected.publishedDay.dutyDebrief ? 'unknown' : 'absent'),
  };
  if (!selected.journeyId) { result.reasons.push('Identidade da jornada ausente.'); return result; }
  const unique = new Map<string, CanonicalRosterEvent>();
  for (const e of events) if (e.kind === selected.kind && e.journeyId === selected.journeyId) {
    const key = [e.journeyId, e.startDateTime, e.endDateTime, e.flightNumber, e.origin, e.destination].join('|');
    unique.set(key, e);
  }
  const group = [...unique.values()].sort((a,b) => Date.parse(a.startDateTime)-Date.parse(b.startDateTime));
  const first = group[0], last = group.at(-1)!;
  // The elapsed span belongs to the whole journey, not the selected leg.
  // Retain each published work type (including PS) without reclassifying it.
  result.date = first.date;
  result.base = first.publishedDay.base || first.origin;
  result.program = group.map(e => `${e.flightNumber || e.publishedDay.pairingCode || 'Atividade'}${e.leg?.workType ? ` (${e.leg.workType})` : ''}`).join(' → ');
  code = group.map(e => `${e.publishedDay.type || ''} ${e.publishedDay.pairingCode || ''}`).join(' ').toUpperCase();
  reserveDeclared = /\b(?:ASB|RES|RESERVA|RSV)\b/.test(code);
  result.reportSource = first.leg?.presentationTime ? 'published' : first.publishedDay.dutyReportSource || (first.publishedDay.dutyReport ? 'unknown' : 'absent');
  result.debriefSource = last.publishedDay.dutyDebriefSource || (last.publishedDay.dutyDebrief ? 'unknown' : 'absent');
  if (group.some(e => !Number.isFinite(Date.parse(e.startDateTime)) || !Number.isFinite(Date.parse(e.endDateTime)) || Date.parse(e.endDateTime) < Date.parse(e.startDateTime))) {
    result.reasons.push('Horários canônicos incompletos ou intervalo inválido.'); return result;
  }
  if (selected.kind === 'flight' && group.some(e => !publishedFlightClocksKnown(events, e))) {
    result.reasons.push('Partida/chegada publicada incompleta; instante canônico de fallback não comprova a etapa.'); return result;
  }
  let start = Date.parse(first.startDateTime), end = Date.parse(last.endDateTime);
  let groundMinutes = 0;
  if (selected.kind === 'flight') {
    const reserveBinding = reserveDeclared ? reserveRowBinding(events, first) : null;
    const rowOwnsStart = reserveDeclared ? reserveBinding === 'owned' : first.legIndex === 0;
    if (reserveBinding === 'unproven') result.reasons.push('Origem/vínculo do início da reserva não comprovados; duração integral pendente.');
    const presentation = clock(first.leg?.presentationTime) || (rowOwnsStart ? clock(first.publishedDay.dutyReport) : null);
    const explicitPresentation = clock(first.leg?.presentationTime) === presentation && presentation !== clock(first.departure)
      || rowOwnsStart && clock(first.publishedDay.dutyReport) === presentation && presentation !== clock(first.departure);
    const debrief = clock(last.publishedDay.dutyDebrief);
    if (!presentation || !explicitPresentation || result.reportSource !== 'published') result.reasons.push('Apresentação publicada não comprovada.');
    if (!debrief || result.debriefSource !== 'published' || last.legIndex !== last.legCount - 1 || reserveDay(last) && !reserveReleaseProven(events, last)) result.reasons.push('Liberação publicada não comprovada; corte estimado não confirma jornada.');
    if (result.reasons.length) return result;
    start = clockNear(start, presentation!, 'before');
    end = clockNear(end, debrief!, 'after');
    if (!reserveDeclared && Date.parse(first.startDateTime) - start > 180 * 60_000) {
      result.reasons.push('Apresentação incompatível com a primeira etapa publicada.'); return result;
    }
    for (let i=1;i<group.length;i++) {
      const gap = (Date.parse(group[i].startDateTime) - Date.parse(group[i-1].endDateTime)) / 60_000;
      if (gap < 0 || group[i-1].destination !== group[i].origin) { result.reasons.push('Continuidade física da jornada não comprovada.'); return result; }
      groundMinutes += gap;
    }
    // An independently published leg APZ cannot promote an estimated row
    // report or bind a reserve belonging to a different original flight block.
    if (reserveDeclared && rowOwnsStart) {
      start = Math.min(start, clockNear(Date.parse(first.startDateTime), clock(first.publishedDay.dutyReport)!, 'before'));
    }
    if (/HSB|SOBREAVISO/.test(code)) {
      result.reasons.push('Acionamento/composição e regra de sobreaviso pendentes.'); return result;
    }
  } else if (!clock(first.publishedDay.dutyReport) || !clock(last.publishedDay.dutyDebrief) || result.reportSource !== 'published' || result.debriefSource !== 'published') {
    result.reasons.push('Início/fim da programação não comprovados.'); return result;
  }
  if (end < start) { result.reasons.push('Intervalo de jornada inválido.'); return result; }
  return { ...result, state: 'available', minutes: (end-start)/60_000, groundMinutes, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

export function canonicalDutyDurationLabel(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return 'Duração pendente';
  const whole = Math.round(minutes);
  return `${Math.floor(whole / 60)}h${String(whole % 60).padStart(2, '0')}`;
}

/** Departure is an upper bound for presentation; arrival is a lower bound for
 * release. Bounds never turn missing literal endpoints into a measured duty. */
export function publishedFlightClockBounds(group: readonly CanonicalRosterEvent[]): { latestStart: number; earliestEnd: number } | null {
  if (!group.length || group.some(e => e.kind !== 'flight' || !publishedFlightClocksKnown(group, e)
    || !Number.isFinite(Date.parse(e.startDateTime)) || !Number.isFinite(Date.parse(e.endDateTime))
    || Date.parse(e.endDateTime) < Date.parse(e.startDateTime))) return null;
  return { latestStart: Math.min(...group.map(e => Date.parse(e.startDateTime))), earliestEnd: Math.max(...group.map(e => Date.parse(e.endDateTime))) };
}

/** Independent published boundaries for free-time proofs. An incomplete duration
 * must not erase a valid presentation, or turn an arrival/default into a release.
 */
export function publishedDutyEndpoints(events: readonly CanonicalRosterEvent[], selectedId: string): { start: number | null; end: number | null } {
  const selected = events.find(e => e.id === selectedId);
  if (!selected || !['flight', 'duty'].includes(selected.kind) || !selected.journeyId) return { start: null, end: null };
  const complete = measureCanonicalDuty(events, selectedId);
  if (complete?.state === 'available') return { start: Date.parse(complete.start!), end: Date.parse(complete.end!) };
  const group = events.filter(e => e.kind === selected.kind && e.journeyId === selected.journeyId)
    .sort((a,b) => Date.parse(a.startDateTime)-Date.parse(b.startDateTime));
  const first = group[0], last = group.at(-1)!;
  const firstInstant = Date.parse(first.startDateTime), lastInstant = Date.parse(last.endDateTime);
  if (!Number.isFinite(firstInstant) || !Number.isFinite(lastInstant)) return { start: null, end: null };
  let start: number | null = null, end: number | null = null;
  if (first.kind === 'flight') {
    // Retain the original clock-evidence guard used by the full measurement.
    const clocksKnown = group.every(e => publishedFlightClocksKnown(events, e));
    if (!clocksKnown) return { start, end };
    const reserve = /\b(?:ASB|RES|RESERVA|RSV)\b/.test(`${first.publishedDay.type || ''} ${first.publishedDay.pairingCode || ''}`.toUpperCase());
    const rowOwnsStart = reserve ? reserveRowBinding(events, first) === 'owned' : first.legIndex === 0;
    const presentation = clock(first.leg?.presentationTime) || (rowOwnsStart ? clock(first.publishedDay.dutyReport) : null);
    const source = first.leg?.presentationTime ? 'published' : first.publishedDay.dutyReportSource;
    if (presentation && source === 'published' && presentation !== clock(first.departure)) {
      const value = clockNear(firstInstant, presentation, 'before');
      if (reserve || firstInstant - value <= 180 * 60_000) start = value;
    }
    const release = clock(last.publishedDay.dutyDebrief);
    if (release && last.publishedDay.dutyDebriefSource === 'published' && last.legIndex === last.legCount - 1
      && (!reserveDay(last) || reserveReleaseProven(events, last))) end = clockNear(lastInstant, release, 'after');
  } else {
    if (clock(first.publishedDay.dutyReport) && first.publishedDay.dutyReportSource === 'published') start = firstInstant;
    // With no start or explicit date-qualified endpoint, do not accept the
    // canonical midnight fallback as evidence of the release's civil day.
    if (start !== null && clock(last.publishedDay.dutyDebrief) && last.publishedDay.dutyDebriefSource === 'published') end = lastInstant;
  }
  return { start, end };
}
