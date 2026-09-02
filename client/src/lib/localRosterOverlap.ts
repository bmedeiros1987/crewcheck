type LocalRosterLegLike = {
  flightNumber?: string | null;
  origin?: string | null;
  destination?: string | null;
  departureTime?: string | null;
};

type LocalRosterDayLike<TLeg extends LocalRosterLegLike = LocalRosterLegLike> = {
  date?: string | null;
  type?: string | null;
  pairingCode?: string | null;
  dutyReport?: string | null;
  dutyDebrief?: string | null;
  dutyHours?: unknown;
  flyingHours?: unknown;
  isNextDay?: boolean | null;
  rawText?: string | null;
  legs?: TLeg[] | null;
};

function normalizeToken(value?: string | null): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const NON_IDENTIFYING_TOKENS = new Set([
  'UNKNOWN',
  'UNK',
  'INVALID',
  'MISSING',
  'NA',
  'NONE',
  'NULL',
  'UNDEFINED',
  'TBD',
  'TBA',
  'PLACEHOLDER',
]);

const NON_IDENTIFYING_AIRPORT_TOKENS = new Set([
  'XXX',
]);

function normalizeIdentityToken(value?: string | null): string | null {
  const token = normalizeToken(value);
  if (!token || NON_IDENTIFYING_TOKENS.has(token)) return null;
  return token;
}

function normalizeAirportIdentityToken(value?: string | null): string | null {
  // Airport identity has its own sentinel policy. Generic placeholders such as
  // UNK/TBA/TBD can also be legitimate IATA codes, so reusing the generic token
  // blacklist here would turn real airports into non-identifying values and let
  // duplicate carry-in legs survive. Reject only airport-specific sentinels and
  // malformed values in this context.
  const token = normalizeToken(value);
  if (!token || NON_IDENTIFYING_AIRPORT_TOKENS.has(token) || !/^[A-Z]{3}$/.test(token)) return null;
  return token;
}

function validDateKey(yearValue: string, monthValue: string, dayValue: string): string | null {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > daysInMonth) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeDateKey(value?: string | null): string | null {
  const raw = String(value || '').trim();
  let match = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return validDateKey(year, match[2], match[1]);
  }
  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return validDateKey(match[1], match[2], match[3]);
  // An unknown factual date cannot prove that two operational occurrences are
  // identical. Preserve the adjacent activity instead of guessing equality.
  return null;
}

function normalizeOperationalTime(value?: string | null): string {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})\s*(?:[:hH.]\s*)?(\d{2})$/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function legIdentityKey(day: LocalRosterDayLike, leg: LocalRosterLegLike): string | null {
  const date = normalizeDateKey(day.date);
  const flight = normalizeIdentityToken(leg.flightNumber);
  const origin = normalizeAirportIdentityToken(leg.origin);
  const destination = normalizeAirportIdentityToken(leg.destination);
  const departure = normalizeOperationalTime(leg.departureTime);
  // Identity must be composed only from verified values. In particular, never
  // truncate UNKNOWN into the airport-looking token UNK or let another placeholder
  // become evidence strong enough to delete an adjacent operation. A stable
  // alphanumeric published identifier need not contain a digit; placeholder
  // values are already rejected by normalizeIdentityToken().
  if (!date || !flight || !/^[A-Z0-9]{2,8}$/.test(flight) || !origin || !destination || !departure) return null;
  // Pairing/report metadata may legitimately change after reimport. Published
  // departure time is part of the occurrence identity so two operations with the
  // same flight/date/route are not collapsed when they happen at different times.
  // Missing/invalid time is deliberately non-deduplicable: uncertainty must
  // preserve data rather than guess that two occurrences are identical.
  return `F|${date}|${flight}|${origin}|${destination}|${departure}`;
}

export function isOperationalLegChainVerifiable<TLeg extends LocalRosterLegLike, TDay extends LocalRosterDayLike<TLeg>>(day: TDay): boolean {
  const legs = day.legs || [];
  if (!legs.length) return false;
  for (const leg of legs) {
    if (!legIdentityKey(day, leg)) return false;
  }
  for (let index = 0; index < legs.length - 1; index += 1) {
    const destination = normalizeAirportIdentityToken(legs[index]?.destination);
    const nextOrigin = normalizeAirportIdentityToken(legs[index + 1]?.origin);
    if (!destination || !nextOrigin || destination !== nextOrigin) return false;
  }
  return true;
}

function looksLikeFlightWithoutLegs(day: LocalRosterDayLike): boolean {
  const type = normalizeToken(day.type);
  const pairing = normalizeToken(day.pairingCode);
  if (['FLIGHT', 'VOO'].includes(type)) return true;
  // A flight-number-like activity without parsed legs is incomplete evidence.
  // It must survive overlap reconciliation rather than being collapsed against
  // another activity that merely shares the same pairing/label.
  return /^LA\d{2,5}$/.test(pairing);
}

function activityIdentityKey(day: LocalRosterDayLike): string | null {
  const date = normalizeDateKey(day.date);
  if (!date || looksLikeFlightWithoutLegs(day)) return null;
  const type = normalizeIdentityToken(day.type);
  const pairing = normalizeIdentityToken(day.pairingCode);
  // CRM is a broad parser category: distinct published activities such as CBF and
  // EMER can both map to type CRM, with pairingCode retaining the distinguishing
  // code. Preserve that specificity without making every mutable pairing label part
  // of identity for activities such as VC, where reimports may legitimately rename
  // the pairing while the semantic activity remains the same.
  const semantic = type === 'CRM' && pairing && pairing !== 'OTHER'
    ? `CRM:${pairing}`
    : type && type !== 'OTHER'
      ? type
      : pairing && pairing !== 'OTHER'
        ? pairing
        : null;
  // Placeholder/unknown labels are not proof that two non-flight activities are
  // the same occurrence. Uncertainty must preserve the adjacent row fail-closed.
  return semantic ? `A|${date}|${semantic}` : null;
}

function incrementCount(counts: Map<string, number>, key: string | null): void {
  if (!key) return;
  counts.set(key, (counts.get(key) || 0) + 1);
}

function consumeCount(counts: Map<string, number>, key: string | null): boolean {
  if (!key) return false;
  const available = counts.get(key) || 0;
  if (available <= 0) return false;
  if (available === 1) counts.delete(key);
  else counts.set(key, available - 1);
  return true;
}

function clearPartialDutyMetadata<TDay extends LocalRosterDayLike>(day: TDay): TDay {
  return {
    ...day,
    dutyReport: null,
    dutyDebrief: null,
    dutyHours: null,
    flyingHours: null,
    // Partial-leg filtering invalidates day-level rollover metadata. Preserving a
    // stale true value can make compliance treat a retained daytime leg as crossing
    // midnight and inflate the operational window by 24 hours.
    isNextDay: null,
    rawText: null,
  } as TDay;
}

export function dedupeAdjacentRosterDays<TLeg extends LocalRosterLegLike, TDay extends LocalRosterDayLike<TLeg>>(
  primaryDays: readonly TDay[],
  adjacentDays: readonly TDay[],
): TDay[] {
  const availablePrimary = new Map<string, number>();
  for (const day of primaryDays) {
    const legs = day.legs || [];
    if (legs.length) {
      for (const leg of legs) incrementCount(availablePrimary, legIdentityKey(day, leg));
    } else {
      incrementCount(availablePrimary, activityIdentityKey(day));
    }
  }

  const result: TDay[] = [];
  for (const day of adjacentDays) {
    const legs = day.legs || [];
    if (legs.length) {
      const kept: TLeg[] = [];
      for (const leg of legs) {
        const key = legIdentityKey(day, leg);
        if (consumeCount(availablePrimary, key)) continue;
        kept.push(leg);
      }
      if (!kept.length) continue;
      if (kept.length === legs.length) result.push(day);
      else result.push({ ...clearPartialDutyMetadata(day), legs: kept } as TDay);
      continue;
    }

    const key = activityIdentityKey(day);
    if (consumeCount(availablePrimary, key)) continue;
    result.push(day);
  }
  return result;
}
