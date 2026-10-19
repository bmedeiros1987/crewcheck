import type { LearnedRate } from './financialStatementLearning';

/** A review draft only. No account writes, default tariff or eligibility rule. */
export function ownerPerDiemReview(input: { ownerId: string; month: string; meal: string; reference: string; breakfastQuarter: boolean; taxiQuarter: boolean }): LearnedRate[] {
  if (!input.ownerId.trim() || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)
    || !/^\d{1,6}[,.]\d{2}$/.test(input.meal) || !input.reference.trim()) return [];
  const cents = Number(input.meal.replace(',', '').replace('.', ''));
  if (!Number.isSafeInteger(cents) || cents <= 0 || ((input.breakfastQuarter || input.taxiQuarter) && cents % 4 !== 0)) return [];
  const [year, month] = input.month.split('-').map(Number);
  const effectiveTo = input.month + '-' + new Date(Date.UTC(year, month, 0)).getUTCDate();
  const entries: [string, string, number][] = [['lunch', 'Almoço', cents], ['dinner', 'Jantar', cents], ['supper', 'Ceia', cents]];
  if (input.breakfastQuarter) entries.push(['breakfast', 'Café', cents / 4]);
  if (input.taxiQuarter) entries.push(['taxi', 'Táxi', cents / 4]);
  return entries.map(([key, label, value]) => ({ ownerId: input.ownerId, key: 'per_diem.' + key, label, value: value / 100,
    unit: key === 'taxi' ? 'amount' : 'meal', currency: 'BRL', effectiveFrom: input.month + '-01', effectiveTo,
    sourceDocument: 'Confirmação do titular: ' + input.reference.trim(),
    sourceFingerprint: JSON.stringify(['owner-per-diem-v1', input.ownerId, input.month, cents, input.breakfastQuarter, input.taxiQuarter, input.reference.trim()]),
    valueOrigin: 'owner_confirmed', perDiemReview: { breakfastQuarter: input.breakfastQuarter, taxiQuarter: input.taxiQuarter }, confidence: 'review', confirmed: false }));
}
