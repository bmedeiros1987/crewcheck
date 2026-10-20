import type { CrewRoster } from './pdfParser';

export type PublishedFreeDayStartEvidence = {
  date: string;
  code: string;
  clock: string | null;
  clockSource: 'published' | 'absent';
  utcOffsetMinutes: number | null;
  timeZoneSource: 'published' | 'unknown';
  tokenExcerpt: string;
  origin: 'AIMS published rest tokens';
  convertedDocument: boolean;
};
const REST = /^(DO|DOF|DOP|DOPR|DR|OFF)$/;
const CLOCK = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;

// A rest start is the first literal token after its own code. Flight arrivals,
// repeated clocks, midnight and duty presentation fallbacks are never consulted.
export function capturePublishedFreeDayStart(tokens: readonly string[], date: string): PublishedFreeDayStartEvidence | undefined {
  const code = String(tokens[0] || '').trim().toUpperCase();
  if (!REST.test(code)) return undefined;
  const candidate = String(tokens[1] || '').trim();
  const clock = CLOCK.test(candidate) ? candidate.padStart(5, '0') : null;
  return { date, code, clock, clockSource: clock ? 'published' : 'absent', utcOffsetMinutes: null,
    timeZoneSource: 'unknown', tokenExcerpt: tokens.slice(0, 3).join(' '), origin: 'AIMS published rest tokens', convertedDocument: false };
}

export function attachPublishedFreeDayTimeZone(roster: CrewRoster): CrewRoster {
  const offsets = Array.from(String(roster.rawText || '').matchAll(/Timezone\s*([+\-−]\d{1,2})(?::([0-5]\d))?\s*:/gi), match => {
    const hours = Number(match[1].replace('−', '-')), minutes = Number(match[2] || 0);
    return Math.abs(hours) <= 14 && !(Math.abs(hours) === 14 && minutes) ? hours * 60 + (hours < 0 ? -minutes : minutes) : NaN;
  });
  const offset = offsets.length && offsets.every(value => Number.isFinite(value) && value === offsets[0]) ? offsets[0] : null;
  const convertedDocument = /Convertida para padr[aã]o AIMS/i.test(roster.rawText || '');
  return { ...roster, days: roster.days.map(day => day.freeDayStartEvidence ? { ...day,
    freeDayStartEvidence: { ...day.freeDayStartEvidence, utcOffsetMinutes: offset,
      timeZoneSource: offset === null ? 'unknown' : 'published', convertedDocument },
  } : day) };
}
