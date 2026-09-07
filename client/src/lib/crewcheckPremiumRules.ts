// CrewCheck v10.8.37 — métricas de confiança para diárias e descanso.
export const CREWCHECK_MAIN_MEAL_VALUE = 109.95;
export const CREWCHECK_BREAKFAST_VALUE = 27.49;
export const CREWCHECK_REFERENCE_PER_DIEM_TOTAL = 549.75;
export const CREWCHECK_REFERENCE_PER_DIEM_EXPLANATION = '5 refeições principais x R$ 109,95 = R$ 549,75';

export function roundCrewMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function crewcheckRequiredRestHours(input: { original?: boolean; activationOrChange?: boolean; dutyHours?: number }): 12 | 13 | 16 {
  if (input.activationOrChange) return 12;
  if ((input.dutyHours || 0) > 15) return 16;
  return input.original ? 13 : 12;
}
