export type PerDiemMealSlot = 'breakfast' | 'lunch' | 'dinner' | 'supper';

export const ACT_DOMESTIC_MAIN_MEAL_BRL = 109.95;
export const ACT_BREAKFAST_PERCENT = 0.25;

export function roundCurrencyAmount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function perDiemSlotAmount(
  mainMeal: number,
  slot: PerDiemMealSlot | string,
  breakfastPercent: number = ACT_BREAKFAST_PERCENT,
): number {
  if (!Number.isFinite(mainMeal) || mainMeal < 0) return 0;
  const percentage = Number.isFinite(breakfastPercent) && breakfastPercent >= 0
    ? breakfastPercent
    : ACT_BREAKFAST_PERCENT;
  return roundCurrencyAmount(slot === 'breakfast' ? mainMeal * percentage : mainMeal);
}
