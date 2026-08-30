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
  legs?: TLeg[] | null;
};

function normalizeToken(value?: string | null): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeDateKey(value?: string | null): string {
  const raw = String(value || '').trim();
  let match = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year.padStart(4, '0')}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return normalizeToken(raw);
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
  const flight = normalizeToken(leg.flightNumber);
  const origin = normalizeToken(leg.origin).slice(0, 3);
  const destination = normalizeToken(leg.destination).slice(0, 3);
  const departure = normalizeOperationalTime(leg.departureTime);
  if (!date || !flight || !origin || !destination) return null;
  // Pairing/report metadata may legitimately change after reimport. Published
  // departure time is part of the occurrence identity so two operations with the
  // same flight/date/route are not collapsed when they happen at different times.
  // If the time is absent/invalid, preserve a separate fail-safe identity rather
  // than guessing that two occurrences are the same and risking data loss.
  return `F|${date}|${flight}|${origin}|${destination}|${departure || 'TIME-UNKNOWN'}`;
}

function activityIdentityKey(day: LocalRosterDayLike): string | null {
  const date = normalizeDateKey(day.date);
  if (!date) return null;
  const type = normalizeToken(day.type);
  const pairing = normalizeToken(day.pairingCode);
  const semantic = type && !['OTHER', 'UNKNOWN'].includes(type) ? type : pairing;
  return semantic ? `A|${date}|${semantic}` : null;
}

export function dedupeAdjacentRosterDays<TLeg extends LocalRosterLegLike, TDay extends LocalRosterDayLike<TLeg>>(
  primaryDays: readonly TDay[],
  adjacentDays: readonly TDay[],
): TDay[] {
  const seen = new Set<string>();
  for (const day of primaryDays) {
    const legs = day.legs || [];
    if (legs.length) {
      for (const leg of legs) {
        const key = legIdentityKey(day, leg);
        if (key) seen.add(key);
      }
    } else {
      const key = activityIdentityKey(day);
      if (key) seen.add(key);
    }
  }

  const result: TDay[] = [];
  for (const day of adjacentDays) {
    const legs = day.legs || [];
    if (legs.length) {
      const kept: TLeg[] = [];
      for (const leg of legs) {
        const key = legIdentityKey(day, leg);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        kept.push(leg);
      }
      if (!kept.length) continue;
      result.push((kept.length === legs.length ? day : { ...day, legs: kept }) as TDay);
      continue;
    }

    const key = activityIdentityKey(day);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(day);
  }
  return result;
}
