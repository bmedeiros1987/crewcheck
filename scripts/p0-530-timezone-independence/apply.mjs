import fs from 'node:fs';

function patchOnce(path, oldBlock, newBlock, marker) {
  if (!fs.existsSync(path)) throw new Error(`[p0-530-timezone] arquivo ausente: ${path}`);
  const source = fs.readFileSync(path, 'utf8');
  if (source.includes(marker)) return;
  const count = source.split(oldBlock).length - 1;
  if (count !== 1) throw new Error(`[p0-530-timezone] ${path}: esperado 1 anchor, encontrado ${count}`);
  fs.writeFileSync(path, source.replace(oldBlock, newBlock), 'utf8');
}

patchOnce(
  'client/src/lib/canonicalRoster.ts',
`function dateAt(day: RosterDay, time: string | null, fallbackHour: number) {
  const parsed = parseRosterDate(day.date, day.month || 1, day.year || new Date().getFullYear());
  const date = new Date(parsed.year, parsed.month - 1, parsed.day, fallbackHour, 0, 0, 0);
  const normalized = normalizeTime(time);
  if (normalized) {
    const [h, m] = normalized.split(':').map(Number);
    date.setHours(h, m, 0, 0);
  }
  return date;
}`,
`const BRAZIL_UTC_OFFSET_MINUTES = 3 * 60; // P0_530_BRAZIL_WALL_CLOCK

function dateAt(day: RosterDay, time: string | null, fallbackHour: number) {
  const parsed = parseRosterDate(day.date, day.month || 1, day.year || new Date().getFullYear());
  const normalized = normalizeTime(time);
  const [hour, minute] = normalized ? normalized.split(':').map(Number) : [fallbackHour, 0];
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, hour, minute + BRAZIL_UTC_OFFSET_MINUTES, 0, 0));
}`,
  'P0_530_BRAZIL_WALL_CLOCK',
);

patchOnce(
  'client/src/lib/rosterContinuity.ts',
`function dateAt(day: RosterDay, roster: CrewRoster, value: string | null, fallbackHour: number) {
  const date = localDate(day, roster);
  const time = normalizeTime(value);
  if (time) {
    const [hours, minutes] = time.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
  } else date.setHours(fallbackHour, 0, 0, 0);
  return date;
}`,
`const BRAZIL_UTC_OFFSET_MINUTES = 3 * 60; // P0_530_BRAZIL_WALL_CLOCK
function dateAt(day: RosterDay, roster: CrewRoster, value: string | null, fallbackHour: number) {
  const parsed = parseDate(day.date, day.month || roster.month || 1, day.year || roster.year || new Date().getFullYear());
  const time = normalizeTime(value);
  const [hours, minutes] = time ? time.split(':').map(Number) : [fallbackHour, 0];
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, hours, minutes + BRAZIL_UTC_OFFSET_MINUTES, 0, 0));
}`,
  'P0_530_BRAZIL_WALL_CLOCK',
);

patchOnce(
  'client/src/lib/complianceEngine.ts',
`function nightKeysTouchedByInterval(start: number, end: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const keys: number[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  for (let nightKey = cursor.getTime(); nightKey < end; nightKey += NIGHT_DAY_MS) {
    const windowStart = nightKey;
    const windowEnd = nightKey + 6 * NIGHT_HOUR_MS;
    if (start < windowEnd && end > windowStart) keys.push(nightKey);
  }
  return keys;
}`,
`const BRAZIL_UTC_OFFSET_MS = -3 * NIGHT_HOUR_MS; // P0_530_BRAZIL_NIGHT_WINDOW
function nightKeysTouchedByInterval(start: number, end: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const keys: number[] = [];
  const civilCursor = new Date(start + BRAZIL_UTC_OFFSET_MS);
  civilCursor.setUTCHours(0, 0, 0, 0);
  for (let civilNightKey = civilCursor.getTime(); civilNightKey < end + BRAZIL_UTC_OFFSET_MS; civilNightKey += NIGHT_DAY_MS) {
    const windowStart = civilNightKey - BRAZIL_UTC_OFFSET_MS;
    const windowEnd = windowStart + 6 * NIGHT_HOUR_MS;
    if (start < windowEnd && end > windowStart) keys.push(windowStart);
  }
  return keys;
}`,
  'P0_530_BRAZIL_NIGHT_WINDOW',
);

// dateAt now returns absolute instants. Calendar-day increments in the canonical
// builder must therefore stay in UTC, otherwise process.env.TZ leaks back in.
{
  const path = 'client/src/lib/canonicalRoster.ts';
  let source = fs.readFileSync(path, 'utf8');
  const replacements = [
    ['start.setDate(start.getDate() + physicalDayOffset);', 'start.setUTCDate(start.getUTCDate() + physicalDayOffset);'],
    ['end.setDate(end.getDate() + arrivalOffset);', 'end.setUTCDate(end.getUTCDate() + arrivalOffset);'],
    ['end.setDate(end.getDate() + 1);', 'end.setUTCDate(end.getUTCDate() + 1);'],
    ['isNextDay: end.getDate() !== start.getDate(),', 'isNextDay: end.getUTCDate() !== start.getUTCDate(),'],
  ];
  for (const [oldValue, newValue] of replacements) {
    if (source.includes(oldValue)) source = source.replaceAll(oldValue, newValue);
    else if (!source.includes(newValue)) throw new Error(`[p0-530-timezone] canonical anchor ausente: ${oldValue}`);
  }
  fs.writeFileSync(path, source, 'utf8');
}

console.log('[p0-530-timezone] applied');
