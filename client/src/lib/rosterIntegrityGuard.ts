import type { CrewRoster, FlightLeg, RosterDay } from './pdfParser';
import { buildCanonicalRosterEvents, normalizeRosterDays, type CanonicalRosterEvent } from './canonicalRoster';

export type RosterIntegritySeverity = 'blocker' | 'review';

export type RosterIntegrityIssueCode =
  | 'CANONICAL_EVENT_MISSING'
  | 'PUBLISHED_PRESENTATION_MUTATED'
  | 'PUBLISHED_PRESENTATION_HIDDEN'
  | 'MIDNIGHT_DEPARTURE_DATE_MISMATCH'
  | 'IMPOSSIBLE_SHORT_REST_BOUNDARY'
  | 'GROUND_INTERVAL_MISMATCH';

export type RosterIntegrityIssue = {
  code: RosterIntegrityIssueCode;
  severity: RosterIntegritySeverity;
  message: string;
  date?: string;
  flightNumber?: string;
  expected?: string;
  actual?: string;
};

export type RosterIntegrityReport = {
  ok: boolean;
  blockers: RosterIntegrityIssue[];
  reviews: RosterIntegrityIssue[];
  issues: RosterIntegrityIssue[];
  checkedFlights: number;
  checkedPublishedPresentations: number;
};

const OPERATIONAL_UTC_OFFSET_MINUTES = 3 * 60;
const MAX_PUBLISHED_PRESENTATION_LEAD_MINUTES = 180;
const MIN_REST_BETWEEN_JOURNEYS_MINUTES = 12 * 60;

function normalizeTime(value?: string | null): string | null {
  const match = String(value || '').trim().match(/(\d{1,2})[:hH](\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function clockMinutes(value?: string | null): number | null {
  const time = normalizeTime(value);
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function publishedPresentationLeadMinutes(presentation?: string | null, departure?: string | null): number | null {
  const report = clockMinutes(presentation);
  const takeoff = clockMinutes(departure);
  if (report == null || takeoff == null) return null;
  return (takeoff - report + 1440) % 1440;
}

export function isCrediblePublishedPresentation(presentation?: string | null, departure?: string | null): boolean {
  const lead = publishedPresentationLeadMinutes(presentation, departure);
  return lead != null && lead > 0 && lead <= MAX_PUBLISHED_PRESENTATION_LEAD_MINUTES;
}

function parseDateKey(value?: string | null): { day: number; month: number; year: number } | null {
  const raw = String(value || '').trim();
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) };
  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return { day: Number(match[3]), month: Number(match[2]), year: Number(match[1]) };
  return null;
}

function isoDateKey(parts: { day: number; month: number; year: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function addCivilDays(value: string, amount: number): string | null {
  const parts = parseDateKey(value);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount, 12, 0, 0, 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function operationalDateFromIso(value: string): string | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const shifted = new Date(timestamp - OPERATIONAL_UTC_OFFSET_MINUTES * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function flightSignature(day: RosterDay, leg: FlightLeg): string {
  return [
    String(day.date || '').trim(),
    String(leg.flightNumber || '').trim().toUpperCase(),
    String(leg.origin || '').trim().toUpperCase(),
    String(leg.destination || '').trim().toUpperCase(),
    normalizeTime(leg.departureTime) || '',
    normalizeTime(leg.arrivalTime) || '',
  ].join('|');
}

function eventSignature(event: CanonicalRosterEvent): string {
  const leg = event.leg;
  return [
    String(event.date || '').trim(),
    String(event.flightNumber || '').trim().toUpperCase(),
    String(event.origin || '').trim().toUpperCase(),
    String(event.destination || '').trim().toUpperCase(),
    normalizeTime(event.departure) || '',
    normalizeTime(event.arrival) || '',
  ].join('|');
}

function sourcePresentation(day: RosterDay, leg: FlightLeg, index: number): { value: string; source: 'leg' | 'day' } | null {
  const departure = normalizeTime(leg.departureTime);
  const legPresentation = normalizeTime(leg.presentationTime);
  if (legPresentation && legPresentation !== departure && isCrediblePublishedPresentation(legPresentation, departure)) {
    return { value: legPresentation, source: 'leg' };
  }
  const dayReport = index === 0 ? normalizeTime(day.dutyReport) : null;
  if (dayReport && dayReport !== departure && isCrediblePublishedPresentation(dayReport, departure)) {
    return { value: dayReport, source: 'day' };
  }
  return null;
}

function sourcePresentationForEvent(event: CanonicalRosterEvent): string | null {
  const day = event.publishedDay;
  const leg = event.leg;
  if (!day || !leg) return null;
  const legs = Array.isArray(day.legs) ? day.legs : [];
  const signature = flightSignature(day, leg);
  const index = Math.max(0, legs.findIndex((candidate) => flightSignature(day, candidate) === signature));
  return sourcePresentation(day, leg, index)?.value || null;
}

function issue(
  code: RosterIntegrityIssueCode,
  severity: RosterIntegritySeverity,
  message: string,
  event?: CanonicalRosterEvent | null,
  expected?: string,
  actual?: string,
): RosterIntegrityIssue {
  return {
    code,
    severity,
    message,
    date: event?.date,
    flightNumber: event?.flightNumber,
    expected,
    actual,
  };
}

/**
 * Fail-closed integrity audit between the published roster and the canonical
 * operational timeline. It never repairs or guesses source data.
 *
 * Blockers are deliberately narrow: only high-confidence contradictions that
 * would make CrewCheck display a different APZ/date/journey than the published
 * roster are allowed to block activation.
 */
export function auditRosterIntegrity(roster: CrewRoster): RosterIntegrityReport {
  const normalized = normalizeRosterDays(roster);
  const canonical = buildCanonicalRosterEvents(normalized);
  const flights = canonical.filter((event) => event.kind === 'flight' && event.leg);
  const bySignature = new Map<string, CanonicalRosterEvent[]>();
  for (const event of flights) {
    const key = eventSignature(event);
    const list = bySignature.get(key) || [];
    list.push(event);
    bySignature.set(key, list);
  }

  const issues: RosterIntegrityIssue[] = [];
  let checkedPublishedPresentations = 0;

  for (const day of normalized.days || []) {
    const legs = Array.isArray(day.legs) ? day.legs : [];
    legs.forEach((leg, index) => {
      const published = sourcePresentation(day, leg, index);
      if (!published) return;
      checkedPublishedPresentations += 1;
      const key = flightSignature(day, leg);
      const event = bySignature.get(key)?.[0] || null;
      if (!event) {
        issues.push(issue(
          'CANONICAL_EVENT_MISSING',
          'blocker',
          'Uma etapa com apresentação publicada desapareceu da linha temporal canônica.',
          null,
          published.value,
          'ausente',
        ));
        return;
      }

      const canonicalPresentation = normalizeTime(event.presentation);
      if (canonicalPresentation !== published.value) {
        issues.push(issue(
          'PUBLISHED_PRESENTATION_MUTATED',
          'blocker',
          `A apresentação publicada ${published.value} foi projetada como ${canonicalPresentation || '—'}.`,
          event,
          published.value,
          canonicalPresentation || '—',
        ));
      }
      if (!event.showPresentation) {
        issues.push(issue(
          'PUBLISHED_PRESENTATION_HIDDEN',
          'blocker',
          'Uma apresentação publicada foi rebaixada para continuação/conexão.',
          event,
          published.value,
          event.journeyBoundary || 'continuação',
        ));
      }

      const reportMinute = clockMinutes(published.value);
      const departureMinute = clockMinutes(leg.departureTime);
      const lead = publishedPresentationLeadMinutes(published.value, leg.departureTime);
      if (
        reportMinute != null
        && departureMinute != null
        && reportMinute > departureMinute
        && lead != null
        && lead > 0
        && lead <= MAX_PUBLISHED_PRESENTATION_LEAD_MINUTES
      ) {
        const expectedDate = addCivilDays(day.date, 1);
        const actualDate = operationalDateFromIso(event.startDateTime);
        if (expectedDate && actualDate !== expectedDate) {
          issues.push(issue(
            'MIDNIGHT_DEPARTURE_DATE_MISMATCH',
            'blocker',
            'A etapa decolando após 00:00 não foi deslocada para o dia civil seguinte da apresentação publicada.',
            event,
            expectedDate,
            actualDate || 'inválido',
          ));
        }
      }
    });
  }

  const chronologicalFlights = [...flights].sort((a, b) => Date.parse(a.startDateTime) - Date.parse(b.startDateTime));
  for (let index = 1; index < chronologicalFlights.length; index += 1) {
    const previous = chronologicalFlights[index - 1];
    const current = chronologicalFlights[index];
    const sameStation = String(previous.destination || '').trim().toUpperCase()
      && String(previous.destination || '').trim().toUpperCase() === String(current.origin || '').trim().toUpperCase();
    if (!sameStation) continue;

    const gapMinutes = Math.round((Date.parse(current.startDateTime) - Date.parse(previous.endDateTime)) / 60_000);
    if (!Number.isFinite(gapMinutes) || gapMinutes < 0) continue;

    const published = sourcePresentationForEvent(current);
    if (
      gapMinutes < MIN_REST_BETWEEN_JOURNEYS_MINUTES
      && !published
      && current.journeyBoundary === 'repouso-entre-jornadas'
    ) {
      issues.push(issue(
        'IMPOSSIBLE_SHORT_REST_BOUNDARY',
        'blocker',
        `Um intervalo físico de ${gapMinutes} min foi transformado em nova jornada por repouso.`,
        current,
        'continuação da jornada',
        current.journeyBoundary,
      ));
    }

    if (current.journeyId === previous.journeyId && gapMinutes < MIN_REST_BETWEEN_JOURNEYS_MINUTES) {
      const ground = current.groundBeforeMinutes;
      if (ground == null || Math.abs(ground - gapMinutes) > 1) {
        issues.push(issue(
          'GROUND_INTERVAL_MISMATCH',
          'blocker',
          'O tempo em solo canônico diverge do intervalo físico entre etapas da mesma jornada.',
          current,
          String(gapMinutes),
          ground == null ? 'ausente' : String(ground),
        ));
      }
    }
  }

  const blockers = issues.filter((item) => item.severity === 'blocker');
  const reviews = issues.filter((item) => item.severity === 'review');
  return {
    ok: blockers.length === 0,
    blockers,
    reviews,
    issues,
    checkedFlights: flights.length,
    checkedPublishedPresentations,
  };
}

export function rosterIntegrityBlockingSummary(report: RosterIntegrityReport): string {
  const details = report.blockers.slice(0, 4).map((item) => {
    const flight = item.flightNumber ? ` ${item.flightNumber}` : '';
    const date = item.date ? ` · ${item.date}` : '';
    return `• ${item.code}${flight}${date}: ${item.message}`;
  });
  return [
    'A escala foi lida, mas o CrewCheck encontrou uma divergência entre a fonte publicada e a linha temporal operacional.',
    'Por segurança, esta importação NÃO substituirá a escala ativa.',
    ...details,
    report.blockers.length > details.length ? `• +${report.blockers.length - details.length} divergência(s) adicional(is).` : '',
    'Reimporte o PDF oficial ou mantenha a escala atual até a revisão.',
  ].filter(Boolean).join('\n');
}
