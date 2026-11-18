import type { CrewLanguage } from './i18n';

/**
 * Civil roster dates (dd/mm/yyyy or yyyy-mm-dd) grouped and shown in the selected language.
 * Dates are calendar days of the published roster, never instants: no time zone conversion.
 * Only dates present in the evidence are grouped; a missing day always splits a range.
 */
export type CivilDate = { iso: string; year: number; month: number; day: number; serial: number };
export type CivilDateRange = { start: CivilDate; end: CivilDate };

const LOCALES: Record<CrewLanguage, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', de: 'de-DE' };
const PHRASES: Record<CrewLanguage, { range(a: string, b: string): string; single(a: string): string }> = {
  pt: { range: (a, b) => `do dia ${a} ao dia ${b}`, single: a => `dia ${a}` },
  en: { range: (a, b) => `${a} to ${b}`, single: a => a },
  es: { range: (a, b) => `del ${a} al ${b}`, single: a => `día ${a}` },
  fr: { range: (a, b) => `du ${a} au ${b}`, single: a => `le ${a}` },
  it: { range: (a, b) => `dal ${a} al ${b}`, single: a => `il ${a}` },
  de: { range: (a, b) => `${a} bis ${b}`, single: a => a },
};

export function parseCivilDate(value: unknown): CivilDate | null {
  const text = String(value ?? '').trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text), iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const [year, month, day] = br ? [Number(br[3]), Number(br[2]), Number(br[1])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [NaN, NaN, NaN];
  const epoch = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(epoch)) return null;
  const check = new Date(epoch);
  // Rejects impossible calendar days (31/02) instead of rolling them into another date.
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { iso: check.toISOString().slice(0, 10), year, month, day, serial: epoch / 86_400_000 };
}

/** Unique valid dates, sorted, split wherever a calendar day is missing. Invalid values are dropped. */
export function groupCivilDates(values: readonly unknown[]): CivilDateRange[] {
  const unique = new Map<number, CivilDate>();
  for (const value of values) { const date = parseCivilDate(value); if (date) unique.set(date.serial, date); }
  const sorted = [...unique.values()].sort((a, b) => a.serial - b.serial);
  const ranges: CivilDateRange[] = [];
  for (const date of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && date.serial === last.end.serial + 1) last.end = date; else ranges.push({ start: date, end: date });
  }
  return ranges;
}

export function formatCivilDate(date: CivilDate, language: CrewLanguage, withYear = false): string {
  if (language === 'pt') return `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}${withYear ? `/${date.year}` : ''}`;
  return new Intl.DateTimeFormat(LOCALES[language], { timeZone: 'UTC', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).format(Date.UTC(date.year, date.month - 1, date.day));
}

/** The year is shown only when the grouped dates span more than one year. */
export const rangesNeedYear = (ranges: readonly CivilDateRange[]) => ranges.length > 0 && ranges[0].start.year !== ranges[ranges.length - 1].end.year;

export function formatCivilDateRange({ start, end }: CivilDateRange, language: CrewLanguage, withYear: boolean): string {
  const phrase = PHRASES[language] || PHRASES.pt;
  return start.serial === end.serial ? phrase.single(formatCivilDate(start, language, withYear))
    : phrase.range(formatCivilDate(start, language, withYear), formatCivilDate(end, language, withYear));
}

/** "do dia 03/11 ao dia 05/11; dia 09/11". */
export function formatCivilDateRanges(ranges: readonly CivilDateRange[], language: CrewLanguage): string {
  const withYear = rangesNeedYear(ranges);
  return ranges.map(range => formatCivilDateRange(range, language, withYear)).join('; ');
}
