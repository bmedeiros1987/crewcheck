/** Public ACT minima and separately authorized product references. No storage,
 * employment inference, payment confirmation, FX or entitlement calculation. */
export type AllowanceRole = 'cabin' | 'pilot';
export type AllowanceCurrency = 'BRL' | 'USD' | 'EUR' | 'GBP';
export type AllowanceCategory = 'domestic' | 'north_america' | 'mexico' | 'south_america_caribbean' | 'argentina' | 'chile' | 'england' | 'europe' | 'africa' | 'other_international';
export type AllowanceSlot = 'mainMeal' | 'breakfast' | 'taxi';
export type AllowanceReferenceState = 'resolved_enterprise_reference' | 'calculable_minimum_reference' | 'printed_reference_only' | 'unresolved_scope' | 'unresolved_index' | 'expired' | 'inapplicable';
export const LATAM_ACT_FROM = '2025-12-01';
export const LATAM_ACT_THROUGH = '2027-11-30';
export const LATAM_ADMIN_FROM = '2026-01-01';
export const LATAM_ADMIN_REVIEW_THROUGH = '2026-11-30';
export const LATAM_ALLOWANCE_SOURCES = Object.freeze({
  cabin: 'https://aeronautas.org.br/wp-content/uploads/2025/12/20251208-ACT-Aeronautas-Comissarios-25-27_v9-site.pdf',
  pilot: 'https://aeronautas.org.br/wp-content/uploads/2025/12/20251209-ACT-Aeronautas-Pilotos-25-27_v13-site.pdf',
  inpc: 'https://api.sidra.ibge.gov.br/values/t/1736/n1/all/v/all/p/202411,202511?formato=json',
});
export const LATAM_PRINTED_ALLOWANCES = Object.freeze({
  domestic: Object.freeze({ label: 'Nacional', currency: 'BRL', minor: 10504 }),
  north_america: Object.freeze({ label: 'América do Norte', currency: 'USD', minor: 2570 }),
  mexico: Object.freeze({ label: 'México', currency: 'USD', minor: 2300 }),
  south_america_caribbean: Object.freeze({ label: 'América do Sul e Caribe', currency: 'USD', minor: 2100 }),
  argentina: Object.freeze({ label: 'Argentina', currency: 'USD', minor: 2205 }),
  chile: Object.freeze({ label: 'Chile', currency: 'USD', minor: 2515 }),
  england: Object.freeze({ label: 'Inglaterra', currency: 'GBP', minor: 2400 }),
  europe: Object.freeze({ label: 'Europa', currency: 'EUR', minor: 2300 }),
  africa: Object.freeze({ label: 'África', currency: 'USD', minor: 2470 }),
  other_international: Object.freeze({ label: 'Demais países conhecidos', currency: 'USD', minor: 2105 }),
} as const);
export function validAllowanceDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T12:00:00Z'))
    && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
/** Nonnegative integer arithmetic; half-up is a calculation convention, not an ACT quotation. */
export function allowanceRatioMinor(minor: number, numerator: number, denominator: number): number {
  if (![minor, numerator, denominator].every(Number.isSafeInteger) || minor < 0 || numerator < 0 || denominator <= 0) return NaN;
  const n = BigInt(minor) * BigInt(numerator), d = BigInt(denominator);
  const value = Number((n * 2n + d) / (d * 2n));
  return Number.isSafeInteger(value) ? value : NaN;
}
export interface LatamAllowanceReference {
  state: AllowanceReferenceState;
  role: AllowanceRole | null;
  category: AllowanceCategory | null;
  slot: AllowanceSlot | null;
  label: string;
  currency: AllowanceCurrency | null;
  amountMinor: number | null;
  /** Literal table row is always a main-meal amount, even for breakfast inspection. */
  publishedFloorMinor: number | null;
  publishedFloorBasis: 'main_meal';
  computedFloorMinor: number | null;
  sourceKind: 'published_act_floor' | 'computed_act_floor' | 'admin_enterprise_reference' | null;
  version: string;
  from: string | null;
  through: string | null;
  sourceUrls: readonly string[];
  clause: string;
  reason: string;
  calculableReference: boolean;
  exactCurrentRate: false;
  rounding: 'half_up_cent_calculation_assumption';
}
export function resolveLatamAllowanceReference(input: { role: unknown; category: unknown; date: unknown; slot: unknown }): LatamAllowanceReference {
  const role = input.role === 'cabin' || input.role === 'pilot' ? input.role : null;
  const category = typeof input.category === 'string' && Object.prototype.hasOwnProperty.call(LATAM_PRINTED_ALLOWANCES, input.category) ? input.category as AllowanceCategory : null;
  const slot = input.slot === 'mainMeal' || input.slot === 'breakfast' || input.slot === 'taxi' ? input.slot : null;
  const row = category ? LATAM_PRINTED_ALLOWANCES[category] : null;
  const amountForSlot = (minor: number) => slot === 'breakfast' ? allowanceRatioMinor(minor, 1, 4) : minor;
  const base: LatamAllowanceReference = {
    state: 'inapplicable', role, category, slot, label: row?.label || 'Referência não identificada', currency: row?.currency || null,
    amountMinor: null, publishedFloorMinor: row && slot !== 'taxi' ? row.minor : null, publishedFloorBasis: 'main_meal', computedFloorMinor: null,
    sourceKind: null, version: '', from: null, through: null, sourceUrls: role ? [LATAM_ALLOWANCE_SOURCES[role]] : [],
    clause: category === 'domestic' ? '2.4.1' : '2.4.2', reason: 'Contexto da referência inválido.', calculableReference: false,
    exactCurrentRate: false, rounding: 'half_up_cent_calculation_assumption',
  };
  if (!role || !category || !slot || !validAllowanceDay(input.date)) return base;
  const date = input.date;
  if (date < LATAM_ACT_FROM || date > LATAM_ACT_THROUGH) return { ...base, state: date > LATAM_ACT_THROUGH ? 'expired' : 'inapplicable', reason: 'Data fora da vigência documentada deste ACT; nenhum valor histórico ou futuro presumido.' };
  if (slot === 'taxi' && category !== 'domestic') return { ...base, reason: 'Esta referência de táxi não é uma tarifa internacional.' };
  const secondYear = date >= '2026-12-01';
  const period = { from: secondYear ? '2026-12-01' : LATAM_ACT_FROM, through: secondYear ? LATAM_ACT_THROUGH : '2026-11-30' };
  if (category === 'domestic') {
    if (secondYear) return { ...base, ...period, state: 'unresolved_index', reason: 'Reajuste nacional de dezembro/2026 ainda sem índice consolidado; a referência anterior não foi prorrogada.' };
    const computed = slot === 'taxi' ? null : amountForSlot(allowanceRatioMinor(10504, 755450, 725154));
    if (date >= LATAM_ADMIN_FROM) return {
      ...base, state: 'resolved_enterprise_reference', amountMinor: slot === 'mainMeal' ? 10944 : 2736, computedFloorMinor: computed,
      sourceKind: 'admin_enterprise_reference', version: 'tam-allowance-admin-2026-01-v1', from: LATAM_ADMIN_FROM, through: LATAM_ADMIN_REVIEW_THROUGH,
      sourceUrls: slot === 'taxi' ? [] : [...base.sourceUrls, LATAM_ALLOWANCE_SOURCES.inpc],
      reason: slot === 'taxi'
        ? 'Referência de táxi informada pela administração do produto; não consta como valor/regra de táxi no ACT. Revisão em dezembro/2026; pagamento não confirmado.'
        : 'Referência empresarial informada pela administração do produto desde janeiro/2026; distinta do piso calculado do ACT. Revisão em dezembro/2026; pagamento não confirmado.',
      calculableReference: true,
    };
    if (slot === 'taxi') return { ...base, ...period, state: 'printed_reference_only', reason: 'Nenhum valor de táxi foi estabelecido pelo ACT ou pela referência administrativa neste período.' };
    return { ...base, ...period, state: 'calculable_minimum_reference', amountMinor: computed, computedFloorMinor: computed,
      sourceKind: 'computed_act_floor', version: 'tam-allowance-act-2025-12-v1', sourceUrls: [...base.sourceUrls, LATAM_ALLOWANCE_SOURCES.inpc],
      reason: 'Piso calculado: valor impresso × INPC novembro/2025 ÷ novembro/2024; arredondamento operacional ao centavo. Não confirma tarifa empresarial.', calculableReference: true };
  }
  if (category === 'mexico' || category === 'england') return {
    ...base, ...period, state: 'unresolved_scope', sourceKind: 'published_act_floor', version: 'tam-allowance-act-printed-2025-v1',
    reason: category === 'mexico'
      ? 'México: interação entre a rubrica específica e o reajuste regional não esclarecida; piso impresso apenas para consulta.'
      : 'Inglaterra: interação com reajuste europeu e moeda GBP não esclarecida; Inglaterra não equivale a todo o Reino Unido. Piso impresso apenas para consulta.',
  };
  const increment = category === 'north_america' ? 300 : category === 'europe' ? 200 : 0;
  const minor = amountForSlot(row!.minor + increment * (secondYear ? 2 : 1));
  return { ...base, ...period, state: 'calculable_minimum_reference', amountMinor: minor, computedFloorMinor: increment ? minor : null,
    sourceKind: increment ? 'computed_act_floor' : 'published_act_floor', version: secondYear ? 'tam-allowance-act-2026-12-v1' : 'tam-allowance-act-2025-12-v1',
    reason: 'Estimativa da referência mínima do ACT na moeda original; tarifa empresarial e reajuste pelo custo de vida local não consolidados. A moeda da tabela não comprova a moeda efetiva de pagamento.', calculableReference: true };
}
