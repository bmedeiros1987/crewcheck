// CrewCheck v10.8.37 — métricas de confiança para diárias e descanso.
export const CREWCHECK_MAIN_MEAL_VALUE = 109.44;
export const CREWCHECK_BREAKFAST_VALUE = 27.36;
export const CREWCHECK_REFERENCE_PER_DIEM_TOTAL = 547.20;
export const CREWCHECK_REFERENCE_PER_DIEM_EXPLANATION = '5 refeições principais x R$ 109,44 = R$ 547,20';

export function roundCrewMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function crewcheckRequiredRestHours(input: { original?: boolean; activationOrChange?: boolean; dutyHours?: number }): 12 | 13 | 16 {
  if (input.activationOrChange) return 12;
  if ((input.dutyHours || 0) > 15) return 16;
  return input.original ? 13 : 12;
}
