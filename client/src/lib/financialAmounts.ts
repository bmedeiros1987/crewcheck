export const BREAKFAST_PERCENT = 0.25;

export const DEMONSTRATED_DOMESTIC_MAIN_MEAL_BRL = 109.44;
export const DEMONSTRATED_DOMESTIC_BREAKFAST_BRL = 27.36;
export const DEMONSTRATED_DOMESTIC_EFFECTIVE_FROM = '2026-08-05';
export const DEMONSTRATED_DOMESTIC_EFFECTIVE_TO = '2026-09-01';

export type DomesticPerDiemRateSource = 'manual' | 'learned' | 'demonstrated' | 'act';

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

export function demonstratedDomesticPerDiemAt(date: string): { mainMeal: number; breakfast: number } | null {
  const value = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (value < DEMONSTRATED_DOMESTIC_EFFECTIVE_FROM || value > DEMONSTRATED_DOMESTIC_EFFECTIVE_TO) return null;
  return {
    mainMeal: DEMONSTRATED_DOMESTIC_MAIN_MEAL_BRL,
    breakfast: DEMONSTRATED_DOMESTIC_BREAKFAST_BRL,
  };
}

export function resolveDomesticPerDiemRate(args: {
  effectiveDate: string;
  actMainMeal: number;
  manualOverride: number | null;
  learnedMainMeal: number | null;
  learnedBreakfast: number | null;
  breakfastPercent?: number;
}): {
  mainMeal: number;
  breakfast: number;
  source: DomesticPerDiemRateSource;
} {
  const demonstrated = demonstratedDomesticPerDiemAt(args.effectiveDate);
  const breakfastPercent = Number.isFinite(args.breakfastPercent)
    ? Number(args.breakfastPercent)
    : BREAKFAST_PERCENT;

  let source: DomesticPerDiemRateSource = 'act';
  let mainMeal = Number(args.actMainMeal);

  if (args.manualOverride !== null && Number.isFinite(args.manualOverride)) {
    source = 'manual';
    mainMeal = Number(args.manualOverride);
  } else if (args.learnedMainMeal !== null && Number.isFinite(args.learnedMainMeal)) {
    source = 'learned';
    mainMeal = Number(args.learnedMainMeal);
  } else if (demonstrated) {
    source = 'demonstrated';
    mainMeal = demonstrated.mainMeal;
  }

  const breakfast = args.learnedBreakfast !== null && Number.isFinite(args.learnedBreakfast)
    ? roundCurrencyAmount(Number(args.learnedBreakfast))
    : source === 'demonstrated' && demonstrated
      ? demonstrated.breakfast
      : perDiemSlotAmount(mainMeal, 'breakfast', breakfastPercent);

  return {
    mainMeal: roundCurrencyAmount(mainMeal),
    breakfast: roundCurrencyAmount(breakfast),
    source,
  };
}
