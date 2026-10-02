/** Presentation adapter for the existing canonical contract: published date first,
 * instants require an explicitly supplied operational timezone. */
export const ROSTER_DISPLAY_TIME_ZONE = 'Etc/GMT+3';
type DisplayEvent = { operationalTimeZone?: string; date?: Date | string; day?: { date?: string }; canonical?: { date?: string; publishedDay?: { date?: string }; startDateTime?: string } };
const months: Record<string, number> = { JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAI: 5, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8, SET: 9, SEP: 9, OUT: 10, OCT: 10, NOV: 11, DEZ: 12, DEC: 12 };
function publishedIso(raw?: string): string | null {
  const value = String(raw || '').trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const numeric = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(value);
  const named = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (numeric) [y, m, d] = [Number(numeric[3]), Number(numeric[2]), Number(numeric[1])];
  else if (named) [y, m, d] = [Number(named[3]), months[named[2].toUpperCase()], Number(named[1])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function rosterStrictInstant(value: Date | string | undefined): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(String(value || ''));
  if (!match || !publishedIso(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] || 0) > 59) return null;
  if (match[5] !== 'Z') {
    const [hour, minute] = match[5].slice(1).split(':').map(Number);
    if (hour > 14 || minute > 59 || (hour === 14 && minute !== 0)) return null;
  }
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}
export function rosterInstantIso(value: Date | string, operationalTimeZone: string): string | null {
  const date = rosterStrictInstant(value);
  if (!date || !operationalTimeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: operationalTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = (type: string) => parts.find(p => p.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch { return null; }
}
export function rosterDisplayIso(event: DisplayEvent): string | null {
  // An invalid supplied civil date cannot be repaired as a timestamp or silently
  // replaced by another candidate. Keep it visible as unconfirmed instead.
  for (const value of [event.canonical?.date, event.canonical?.publishedDay?.date, event.day?.date]) {
    if (value != null && String(value).trim()) return publishedIso(value);
  }
  if (typeof event.date === 'string' && !event.date.includes('T')) return publishedIso(event.date);
  const instant = event.canonical?.startDateTime || event.date;
  return instant && event.operationalTimeZone ? rosterInstantIso(instant, event.operationalTimeZone) : null;
}
export function rosterUnconfirmedDateText(event: DisplayEvent): string {
  const value = event.canonical?.date || event.canonical?.publishedDay?.date || event.day?.date || event.canonical?.startDateTime || event.date;
  if (!value) return 'Sem data ou instante informado.';
  const text = value instanceof Date ? Number.isFinite(value.getTime()) ? value.toISOString() : 'Data inválida' : String(value);
  return `Valor informado: ${text}. Confirme a data operacional e o fuso na fonte.`;
}
/** A formatting-only representation of a confirmed civil date; never an event instant. */
export function rosterLabelDate(event: DisplayEvent): Date | null {
  const iso = rosterDisplayIso(event);
  return iso ? new Date(`${iso}T12:00:00-03:00`) : null;
}

/** Keep proven instants in canonical chronology. Civil-only items form a
 * separate class; never interleave them using an invented instant. Stable
 * sort preserves source order for equal instants and unconfirmed items. */
export function rosterDisplayCompare(a: DisplayEvent, b: DisplayEvent): number {
  const aDay = rosterDisplayIso(a), bDay = rosterDisplayIso(b);
  const aInstant = aDay ? rosterStrictInstant(a.canonical?.startDateTime || a.date) : null;
  const bInstant = bDay ? rosterStrictInstant(b.canonical?.startDateTime || b.date) : null;
  const aClass = !aDay ? 2 : aInstant ? 0 : 1;
  const bClass = !bDay ? 2 : bInstant ? 0 : 1;
  if (aClass !== bClass) return aClass - bClass;
  if (aInstant && bInstant) return aInstant.getTime() - bInstant.getTime();
  return aDay && bDay ? aDay.localeCompare(bDay) : 0;
}
