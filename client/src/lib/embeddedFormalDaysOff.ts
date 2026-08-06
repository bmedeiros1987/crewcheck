export type EmbeddedDayOffDayLike = {
  date?: string | null;
  type?: string | null;
  pairingCode?: string | null;
  rawText?: string | null;
  dutyReport?: string | null;
  dutyDebrief?: string | null;
  isNextDay?: boolean | null;
};

export type EmbeddedFormalDayOffInterval = {
  date: string;
  code: 'DO';
  startTime: string;
  endTime: string;
  isNextDay: true;
  key: string;
};

const EXPLICIT_DO_CODES = new Set(['DO']);

function normalizeClock(value: string): string | null {
  const match = String(value || '').match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function minutes(value: string): number {
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

function formalDoDurationMinutes(startTime: string, endTime: string): number {
  let duration = minutes(endTime) - minutes(startTime);
  if (duration <= 0) duration += 24 * 60;
  return duration;
}

function explicitDoKey(day: EmbeddedDayOffDayLike): string | null {
  const type = String(day.type || '').trim().toUpperCase();
  const pairing = String(day.pairingCode || '').trim().toUpperCase();
  if (!EXPLICIT_DO_CODES.has(type) && !EXPLICIT_DO_CODES.has(pairing)) return null;
  const startTime = normalizeClock(String(day.dutyReport || ''));
  const endTime = normalizeClock(String(day.dutyDebrief || ''));
  if (!startTime || !endTime) return null;
  const duration = formalDoDurationMinutes(startTime, endTime);
  if (duration < 23 * 60 || duration > 25 * 60) return null;
  return `${String(day.date || '').trim()}|DO|${startTime}|${endTime}|+1`;
}

export function collectMissingEmbeddedFormalDoIntervals(
  days: readonly EmbeddedDayOffDayLike[],
): EmbeddedFormalDayOffInterval[] {
  const explicit = new Set(days.map(explicitDoKey).filter((value): value is string => Boolean(value)));
  const found = new Map<string, EmbeddedFormalDayOffInterval>();

  for (const day of days) {
    const dayType = String(day.type || '').trim().toUpperCase();
    const pairing = String(day.pairingCode || '').trim().toUpperCase();
    if (EXPLICIT_DO_CODES.has(dayType) || EXPLICIT_DO_CODES.has(pairing)) continue;

    const raw = `${day.rawText || ''} ${day.pairingCode || ''}`.toUpperCase();
    for (const marker of raw.matchAll(/\bDO\b/g)) {
      const startIndex = Number(marker.index || 0) + marker[0].length;
      const segment = raw.slice(startIndex, startIndex + 140);
      const clocks = [...segment.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map((match) => normalizeClock(match[1])).filter((value): value is string => Boolean(value));
      if (clocks.length < 2) continue;
      const [startTime, endTime] = clocks;
      const duration = formalDoDurationMinutes(startTime, endTime);
      // O ticket CC-0001 trata uma folga formal de ~24h embutida depois da jornada.
      // Exigir 23–25h evita transformar qualquer ocorrência textual de "DO" em folga.
      if (duration < 23 * 60 || duration > 25 * 60) continue;
      const key = `${String(day.date || '').trim()}|DO|${startTime}|${endTime}|+1`;
      if (explicit.has(key) || found.has(key)) continue;
      found.set(key, {
        date: String(day.date || '').trim(),
        code: 'DO',
        startTime,
        endTime,
        isNextDay: true,
        key,
      });
    }
  }

  return [...found.values()];
}

export function countMissingEmbeddedFormalDoIntervals(
  days: readonly EmbeddedDayOffDayLike[],
): number {
  return collectMissingEmbeddedFormalDoIntervals(days).length;
}
