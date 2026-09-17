export const DOMESTIC_MAIN_MEAL_BRL = 109.44;
export const DOMESTIC_BREAKFAST_BRL = 27.36;
export const BREAKFAST_PERCENT = 0.25;

export const DOMESTIC_PER_DIEM_SOURCE = 'confirmed_statement' as const;
export const DOMESTIC_PER_DIEM_SOURCE_PERIOD = '2026-08-05/2026-09-01';

export function roundCurrencyAmount(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function perDiemSlotAmount(
  mainMeal: number,
  slot: string,
  breakfastPercent = BREAKFAST_PERCENT,
): number {
  return roundCurrencyAmount(slot === 'breakfast' ? mainMeal * breakfastPercent : mainMeal);
}
