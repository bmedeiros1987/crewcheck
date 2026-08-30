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
  rawText?: string | null;
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
  if (!date || !flight || !origin || !destination || !departure) return null;
  // Pairing/report metadata may legitimately change after reimport. Published
  // departure time is part of the occurrence identity so two operations with the
  // same flight/date/route are not collapsed when they happen at different times.
  // Missing/invalid time is deliberately non-deduplicable: uncertainty must
  // preserve data rather than guess that two occurrences are identical.
  return `F|${date}|${flight}|${origin}|${destination}|${departure}`;
}

function activityIdentityKey(day: LocalRosterDayLike): string | null {
  const date = normalizeDateKey(day.date);
  if (!date) return null;
  const type = normalizeToken(day.type);
  const pairing = normalizeToken(day.pairingCode);
  const semantic = type && !['OTHER', 'UNKNOWN'].includes(type) ? type : pairing;
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
