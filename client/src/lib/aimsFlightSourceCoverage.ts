import type { CrewRoster, FlightLeg } from './pdfParser';
import { validFinancialDay } from './financialHistoryPeriods';
import { nominalFinancialCompetencePrefix } from './financialJourneyGrouping';

export type AimsSourceFlightOccurrence = { sourceDate: string; flightNumber: string; identity: string | null };
export type AimsFlightSourceCoverage = {
  version: 1;
  authority: 'aims_text' | 'aims_visual';
  sourceChecksum: string;
  authorityPeriod: string;
  unresolvedSourceDates: boolean;
  sourceDates: string[];
  occurrences: AimsSourceFlightOccurrence[];
  publishedFlights: Array<{ date: string; identity: string | null }>;
};
export type AimsSourceCoveragePending = {
  iso: string;
  airport: string;
  reason: string;
  pendingKind: 'source_coverage';
  sourceIssueId: string;
};
type FlightLike = Pick<FlightLeg, 'flightNumber' | 'origin' | 'destination' | 'departureTime' | 'arrivalTime'> & { aimsSourceDate?: string };
type EventLike = { kind: string; day?: { date?: string }; leg?: FlightLike; canonical?: { leg?: FlightLike } | null };

export function aimsSourceDateIso(value: unknown): string {
  const raw = String(value || '');
  const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(raw) ? raw.split('/').reverse().join('-') : raw;
  return validFinancialDay(iso) ? iso : '';
}
// Change detection only, not authentication or proof of company publication.
export function aimsSourceChecksum(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `aims-v1:${value.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
export function aimsFlightSourceIdentity(date: string, leg: FlightLike): string | null {
  const sourceDate = aimsSourceDateIso(date);
  const flight = String(leg.flightNumber || '').replace(/\s+/g, '').toUpperCase();
  const origin = String(leg.origin || '').toUpperCase(), destination = String(leg.destination || '').toUpperCase();
  const clock = (value: string) => /^(?:[01]?\d|2[0-3]):[0-5]\d(?:\(\+\d+\))?$/.test(String(value || ''));
  if (!sourceDate || !/^LA\d{3,4}$/.test(flight) || !/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)
    || origin === destination || !clock(leg.departureTime) || !clock(leg.arrivalTime)) return null;
  return JSON.stringify([sourceDate, flight, origin, destination, leg.departureTime, leg.arrivalTime]);
}
export function newAimsFlightSourceCoverage(authority: AimsFlightSourceCoverage['authority']): AimsFlightSourceCoverage {
  return { version: 1, authority, sourceChecksum: '', authorityPeriod: '', unresolvedSourceDates: false, sourceDates: [], occurrences: [], publishedFlights: [] };
}
function publishedFlights(roster: CrewRoster) {
  return (roster.days || []).flatMap(day => (day.legs || []).map(leg => ({ date: aimsSourceDateIso(day.date), identity: aimsFlightSourceIdentity(leg.aimsSourceDate || '', leg) })));
}
function coverageChecksum(rawText: string, evidence: AimsFlightSourceCoverage): string {
  return aimsSourceChecksum(JSON.stringify([rawText, evidence.authority, evidence.authorityPeriod, evidence.unresolvedSourceDates, evidence.sourceDates, evidence.occurrences, evidence.publishedFlights]));
}
export function finalizeAimsFlightSourceCoverage(roster: CrewRoster): CrewRoster {
  const evidence = roster.aimsFlightSourceCoverage;
  if (!evidence) return roster;
  const finalized = { ...evidence, authorityPeriod: nominalFinancialCompetencePrefix(roster) || '', sourceDates: [...new Set(evidence.sourceDates)], publishedFlights: publishedFlights(roster) };
  return { ...roster, aimsFlightSourceCoverage: { ...finalized, sourceChecksum: coverageChecksum(roster.rawText || '', finalized) } };
}
export function mergeAimsFlightSourceCoverage(primary: CrewRoster, secondary: CrewRoster): AimsFlightSourceCoverage | undefined {
  const a = primary.aimsFlightSourceCoverage, b = secondary.aimsFlightSourceCoverage;
  if (!a || !b) return a;
  // A reliable visual date cannot inherit warnings from contaminated linear text.
  // A genuinely absent source date can retain the secondary reader's evidence.
  const primaryDates = new Set(a.sourceDates);
  return { ...a, sourceDates: [...a.sourceDates, ...b.sourceDates.filter(date => !primaryDates.has(date))],
    occurrences: [...a.occurrences, ...b.occurrences.filter(item => !primaryDates.has(item.sourceDate))] };
}

function validIdentity(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parts = JSON.parse(value);
    return Array.isArray(parts) && parts.length === 6 && parts.every(part => typeof part === 'string')
      && aimsFlightSourceIdentity(parts[0], { flightNumber: parts[1], origin: parts[2], destination: parts[3], departureTime: parts[4], arrivalTime: parts[5] }) === value;
  } catch { return false; }
}
function validWitness(value: unknown): value is AimsFlightSourceCoverage {
  if (!value || typeof value !== 'object') return false;
  const v = value as AimsFlightSourceCoverage;
  return v.version === 1 && ['aims_text', 'aims_visual'].includes(v.authority) && typeof v.sourceChecksum === 'string'
    && typeof v.unresolvedSourceDates === 'boolean'
    && typeof v.authorityPeriod === 'string' && validFinancialDay(`${v.authorityPeriod}-01`)
    && Array.isArray(v.sourceDates) && v.sourceDates.length > 0 && v.sourceDates.every(validFinancialDay)
    && new Set(v.sourceDates).size === v.sourceDates.length
    && Array.isArray(v.occurrences) && v.occurrences.every(item => item && validFinancialDay(item.sourceDate)
      && v.sourceDates.includes(item.sourceDate) && /^LA\d{3,4}$/.test(item.flightNumber)
      && (item.identity === null || validIdentity(item.identity) && JSON.parse(item.identity)[0] === item.sourceDate && JSON.parse(item.identity)[1] === item.flightNumber))
    && Array.isArray(v.publishedFlights) && v.publishedFlights.every(item => item && validFinancialDay(item.date) && (item.identity === null || validIdentity(item.identity)));
}
function counts(values: readonly string[]) {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) || 0) + 1);
  return result;
}

// This guard covers positively identified AIMS sources only. Other formats and
// erased source origins are unchanged; this is NOT universal import certification.
export function aimsFlightSourceCoveragePending(roster: CrewRoster, events: readonly EventLike[]): AimsSourceCoveragePending[] {
  const hasWitness = Object.prototype.hasOwnProperty.call(roster, 'aimsFlightSourceCoverage') && roster.aimsFlightSourceCoverage !== undefined;
  const isAims = /Convertida para padr(?:ão|ao|)/i.test(String(roster.rawText || ''));
  if (!hasWitness && !isAims) return [];
  const prefix = nominalFinancialCompetencePrefix(roster);
  const scopeStart = prefix ? `${prefix}-01` : '';
  const scopeEnd = prefix ? new Date(Date.UTC(Number(roster.year), Number(roster.month), 0)).toISOString().slice(0, 10) : '';
  const issues: Array<{ date: string; id: string; reason: string; unscoped?: boolean }> = [];
  const add = (date: string, id: string, detail: string, unscoped = false) => issues.push({ date, id, unscoped, reason: `Cobertura da fonte AIMS não verificada: ${detail} Os valores conhecidos são apenas subtotal; não há diária ou duração presumida.` });
  const evidence = roster.aimsFlightSourceCoverage;
  if (!prefix || validWitness(evidence) && evidence.authorityPeriod !== prefix) {
    add('', 'aims-authority-unverified', 'a competência desta fonte está inválida ou mudou depois da leitura.', true);
  } else if (!validWitness(evidence) || evidence.sourceChecksum !== coverageChecksum(String(roster.rawText || ''), evidence)) {
    add('', 'aims-source-unverified', 'a evidência desta leitura está ausente, inválida ou não corresponde à fonte. Revise a origem; reimportar o PDF pode fornecer nova evidência.');
  } else {
    if (evidence.unresolvedSourceDates) add('', 'aims-source-date-unverified', 'há referência de voo ou marcador de data sem data legível na fonte selecionada.');
    evidence.publishedFlights.forEach((item, index) => { if (!item.identity) add(item.date, `aims-published-unverified:${index}`, 'há voo publicado cuja identidade de origem não pôde ser verificada.'); });
    // Detect real flight edits without invalidating benign hotel/crew annotations.
    const previous = counts(evidence.publishedFlights.map(item => JSON.stringify(item)));
    const current = counts(publishedFlights(roster).map(item => JSON.stringify(item)));
    for (const key of new Set([...previous.keys(), ...current.keys()])) {
      if (previous.get(key) !== current.get(key)) {
        const item = JSON.parse(key); add(item.date, `aims-changed:${key}`, 'uma identidade ou data de voo mudou após a leitura da fonte.');
      }
    }
    const actual = counts(events.filter(event => event.kind === 'flight').map(event => {
      const leg = event.leg || event.canonical?.leg;
      const identity = leg ? aimsFlightSourceIdentity(leg.aimsSourceDate || '', leg) : null;
      if (!identity) add(aimsSourceDateIso(event.day?.date), `aims-event-unverified:${issues.length}`, 'há voo calculado cuja identidade de origem não pôde ser verificada.');
      return identity;
    }).filter((key): key is string => key !== null));
    evidence.occurrences.forEach((item, index) => {
      const count = item.identity ? actual.get(item.identity) || 0 : 0;
      if (count) actual.set(item.identity!, count - 1);
      else add(item.sourceDate, `aims-occurrence:${index}`, `o voo ${item.flightNumber}, indicado na fonte em ${item.sourceDate}, não está integralmente representado na programação calculada.`);
    });
    for (const [identity, count] of actual) if (count > 0) add(JSON.parse(identity)[0], `aims-extra:${identity}`, 'há voo calculado sem correspondência única na fonte selecionada.');
  }
  const pending: AimsSourceCoveragePending[] = [];
  for (const issue of issues) {
    // The end is the authority period of this snapshot, NOT an invented arrival.
    // An unknown endpoint can affect later days in this source, not earlier ones.
    const first = validFinancialDay(issue.date) && issue.date > scopeStart ? issue.date : scopeStart;
    if (issue.unscoped || !validFinancialDay(first) || !validFinancialDay(scopeEnd)) { pending.push({ iso: '', airport: '', reason: issue.reason, pendingKind: 'source_coverage', sourceIssueId: issue.id }); continue; }
    for (const day = new Date(`${first}T12:00:00Z`); day.toISOString().slice(0, 10) <= scopeEnd; day.setUTCDate(day.getUTCDate() + 1)) {
      pending.push({ iso: day.toISOString().slice(0, 10), airport: '', reason: issue.reason, pendingKind: 'source_coverage', sourceIssueId: issue.id });
    }
    // Some source documents explicitly print spillover dates. Keep those known
    // dates for all-row/weekly consumers, without inventing a later authority
    // period or silently dropping an occurrence beyond the nominal month.
    const represented = validWitness(evidence) ? evidence.sourceDates : [];
    for (const iso of new Set([issue.date, ...represented])) {
      if (validFinancialDay(iso) && iso > scopeEnd && iso >= first) pending.push({ iso, airport: '', reason: issue.reason, pendingKind: 'source_coverage', sourceIssueId: issue.id });
    }
  }
  return pending;
}
