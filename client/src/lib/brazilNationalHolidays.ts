/** Brazilian national holidays only. Local/religious holidays require base evidence.
 * Sources: Laws 662/1949 (as amended), 6802/1980 and 14759/2023.
 * 20 November is applied from 2024; no Carnival/Corpus Christi/optional closures.
 */
const holidays: Readonly<Record<string, string>> = {
  '01-01': 'Confraternização Universal',
  '04-21': 'Tiradentes',
  '05-01': 'Dia do Trabalho',
  '09-07': 'Independência do Brasil',
  '10-12': 'Nossa Senhora Aparecida',
  '11-02': 'Finados',
  '11-15': 'Proclamação da República',
  '12-25': 'Natal',
};

// Civil date keys, never device-local instants. Reject rollover/ambiguous dates.
export function validHolidayDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

export function brazilNationalHolidayName(iso: string): string | null {
  if (!validHolidayDate(iso)) return null;
  if (iso.slice(5) === '11-20' && Number(iso.slice(0, 4)) >= 2024) return 'Dia Nacional de Zumbi e da Consciência Negra';
  return holidays[iso.slice(5)] || null;
}

export function classifyBrazilCalendarDate(iso: string, configured: readonly string[] = []) {
  const valid = validHolidayDate(iso);
  const nationalHoliday = brazilNationalHolidayName(iso);
  const sunday = valid && new Date(iso + 'T00:00:00Z').getUTCDay() === 0;
  const configuredHoliday = valid && configured.includes(iso);
  return { sunday, nationalHoliday, configuredHoliday, special: sunday || Boolean(nationalHoliday) || configuredHoliday };
}
