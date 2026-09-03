// Financeiro 2.0 — typed surface for the UI layer.
//
// The UI consumes this contract; it never reaches into the calculators' internals and
// never passes a roster/canonical structure across the port.

export type Competence = { readonly year: number; readonly month: number };

export type RubricNature =
  | 'fixed_remuneration'
  | 'variable_remuneration'
  | 'additional'
  | 'indemnity'
  | 'per_diem'
  | 'deduction';

export type RubricIntegration = 'integrates_vacation' | 'integrates_thirteenth' | 'non_integrating';

export type RubricDefinition = {
  readonly code: string;
  readonly name: string;
  readonly nature: RubricNature;
  readonly integratesVacation: boolean;
  readonly integratesThirteenth: boolean;
  readonly entersAverages: boolean;
  readonly isDeduction: boolean;
};

export type VacationSalePolicy = 'not_offered' | 'optional';

export type CompensationRule = {
  readonly id: string;
  readonly profile: string;
  readonly label: string;
  readonly effectiveFrom: Competence;
  readonly effectiveTo: Competence | null;
  readonly vacation: {
    readonly sale: VacationSalePolicy;
    readonly maxSaleDays: number;
    readonly entitlementDays: number;
    readonly maxFractions: number;
    readonly minFractionDays: number;
    readonly constitutionalThirdRate: number;
    readonly averagesWindowMonths: number;
    readonly monthlyDaysBasis: number;
  };
  readonly thirteenth: {
    readonly avosDenominator: number;
    readonly minDaysForAvo: number;
    readonly firstInstallmentRate: number;
    readonly averagesWindowMonths: number;
    readonly deductFirstInstallment: boolean;
  };
  readonly rubricOverrides: Readonly<Record<string, Partial<RubricDefinition>>>;
};

export type RuleProvenance = {
  readonly ruleId: string;
  readonly profile: string;
  readonly label: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
};

export type ExplainedItem = {
  readonly rubricCode: string;
  readonly rubricName: string;
  readonly nature: RubricNature;
  readonly competenceKey: string;
  readonly amountCents: number;
  readonly reason?: string;
};

export type AppliedDeduction = {
  readonly code: string;
  readonly name: string;
  readonly basis: 'gross' | 'proportional' | 'installment';
  readonly basisCents: number;
  readonly rate: number | null;
  readonly amountCents: number;
  readonly formula: string;
};

export type VacationPeriodResult = {
  readonly kind: 'vacation_period';
  readonly periodId: string;
  readonly competence: Competence;
  readonly competenceKey: string;
  readonly days: number;
  readonly requestedSoldDays: number;
  readonly soldDays: number;
  readonly baseCents: number;
  readonly averagesCents: number;
  readonly vacationBaseCents: number;
  readonly proportionalCents: number;
  readonly soldCents: number;
  readonly constitutionalThirdCents: number;
  readonly grossCents: number;
  readonly deductionsCents: number;
  readonly netCents: number;
  readonly explanation: {
    readonly rule: RuleProvenance;
    readonly formula: readonly string[];
    readonly averagesWindow: readonly string[];
    readonly monthlyTotalsCents: readonly number[];
    readonly includedItems: readonly ExplainedItem[];
    readonly excludedItems: readonly ExplainedItem[];
    readonly deductions: readonly AppliedDeduction[];
    readonly saleNote: string;
  };
};

export type VacationPlanResult = {
  readonly kind: 'vacation_plan';
  readonly profile: string;
  readonly totalDays: number;
  readonly periods: readonly VacationPeriodResult[];
  readonly grossCents: number;
  readonly deductionsCents: number;
  readonly netCents: number;
  readonly saleOffered: boolean;
  readonly violations: readonly string[];
  readonly valid: boolean;
};

export type ThirteenthInstallment = 'first' | 'second' | 'full';

export type ThirteenthResult = {
  readonly kind: 'thirteenth';
  readonly installment: ThirteenthInstallment;
  readonly competenceKey: string;
  readonly year: number;
  readonly avos: number;
  readonly avosDenominator: number;
  readonly baseCents: number;
  readonly averagesCents: number;
  readonly thirteenthBaseCents: number;
  readonly fullGrossCents: number;
  readonly firstInstallmentCents: number;
  readonly secondInstallmentCents: number;
  readonly payableGrossCents: number;
  readonly deductionsCents: number;
  readonly netCents: number;
  readonly explanation: Record<string, unknown>;
};

export type CompensationInput = {
  readonly profile: string;
  readonly referenceCompetence: Competence;
  readonly monthlyFixedCents: number;
  readonly earnings: readonly unknown[];
  readonly deductions: readonly unknown[];
  readonly workedMonths: readonly unknown[];
  readonly vacationPeriods: readonly unknown[];
};

export type CompensationProjection = {
  readonly kind: 'compensation_projection';
  readonly profile: string;
  readonly competences: readonly string[];
  readonly timeline: readonly {
    readonly competenceKey: string;
    readonly competence: Competence;
    readonly items: readonly Record<string, unknown>[];
    readonly grossCents: number;
    readonly deductionsCents: number;
    readonly netCents: number;
  }[];
  readonly vacation: VacationPlanResult;
  readonly thirteenth: unknown | null;
  readonly totals: { readonly grossCents: number; readonly deductionsCents: number; readonly netCents: number };
};

export function normalizeCompensationInput(raw: unknown): CompensationInput;
export function computeVacationPlan(args: { input: CompensationInput; catalog: Map<string, RubricDefinition>; rules: readonly CompensationRule[] }): VacationPlanResult;
export function computeThirteenth(args: { input: CompensationInput; catalog: Map<string, RubricDefinition>; rules: readonly CompensationRule[]; installment?: ThirteenthInstallment; year?: number | null }): ThirteenthResult;
export function simulateCompensation(args: { input: CompensationInput; catalog: Map<string, RubricDefinition>; rules: readonly CompensationRule[]; includeThirteenth?: boolean; year?: number | null }): CompensationProjection;
export function formatCents(cents: number, options?: { currency?: string; locale?: string }): string;
