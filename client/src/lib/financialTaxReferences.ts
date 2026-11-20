import { FINANCIAL_SOURCES } from './financialReferenceCatalog';
import { payrollMonthBounds } from './financialPayrollPeriods';

export const TAX_REFERENCE_VERSION='BR-employee-monthly:2026:v2';
export const INSS_CALCULATION_SOURCE='https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-11-2026-com-marcacoes-retificada.pdf#page=384';
const THIRTEENTH_TAX_VERSION = 'BR-employee-thirteenth-settlement:2026:v1';
const THIRTEENTH_INSS_CALCULATION_SOURCE = 'https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-12-2026.pdf#page=388';
const THIRTEENTH_IRRF_CALCULATION_SOURCE = 'https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=57670&visao=anotado';
const irrfSimplifiedMinor2026 = 60720;
const brackets=Object.freeze([{upperMinor:162100,basisPoints:750},{upperMinor:290284,basisPoints:900},{upperMinor:435427,basisPoints:1200},{upperMinor:847555,basisPoints:1400}].map(item=>Object.freeze(item)));
export function employeeTaxReference(month:string) {
  if(!payrollMonthBounds(month)||month<'2026-01'||month>'2026-12')return null;
  return Object.freeze({version:TAX_REFERENCE_VERSION,effectiveFrom:'2026-01-01',effectiveTo:'2026-12-31',
    inss:brackets,irrfSimplifiedMinor:irrfSimplifiedMinor2026,dependentDeductionMinor:18959,sources:FINANCIAL_SOURCES,
    scope:'ordinary_monthly_employee_estimate' as const,paymentConfirmed:false as const});
}
const validMoney=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function round(numerator:bigint,denominator:bigint){return Number((numerator+denominator/2n)/denominator);}

function calculateInssMinor(contributionBaseMinor: number): number {
  let previous = 0;
  let amountMinor = 0n;
  for (const { upperMinor, basisPoints } of brackets) {
    const portion = Math.max(0, Math.min(contributionBaseMinor, upperMinor) - previous);
    amountMinor += BigInt(portion) * BigInt(basisPoints) / 10000n;
    previous = upperMinor;
  }
  return Number(amountMinor);
}

function calculateIrrf(income: number, deduction: number) {
  const base=Math.max(0,income-deduction);
  const band=base<=242880?{bp:0,d:0}:base<=282665?{bp:750,d:18216}:base<=375105?{bp:1500,d:39416}:base<=466468?{bp:2250,d:67549}:{bp:2750,d:90873};
  const ordinary=Math.max(0,round(BigInt(base)*BigInt(band.bp),10000n)-band.d);
  const reduction=income<=500000?Math.min(ordinary,31289):income<=735000?Math.min(ordinary,Math.max(0,round(97862000000n-133145n*BigInt(income),1000000n))):0;
  return {amountMinor:Math.max(0,ordinary-reduction),taxableBaseMinor:base,ordinaryTaxMinor:ordinary,reductionMinor:reduction};
}

/** Single employee relationship estimate; contribution competence selects the
 * table. eSocial MOS S-1.3 S-5001 2.13: truncate each bracket to cents.
 * Multiple employments and special payrolls require their own review. */
export function estimateEmployeeInss(args:{contributionMonth:string;contributionBaseMinor:number|null;singleEmploymentConfirmed:boolean}) {
  const {contributionBaseMinor}=args;
  const ref=employeeTaxReference(args.contributionMonth);if(!ref||args.singleEmploymentConfirmed!==true||!validMoney(contributionBaseMinor))return null;
  return {amountMinor:calculateInssMinor(contributionBaseMinor),version:ref.version,source:FINANCIAL_SOURCES.inss,calculationSource:INSS_CALCULATION_SOURCE,rounding:'truncate_each_bracket' as const,estimated:true as const};
}

/** legalDeductionsMinor is the complete known legal deduction, including INSS
 * where applicable. It is never added to the alternative simplified amount.
 * Reduction eligibility uses gross taxable income, before either deduction. */
export function estimateMonthlyIrrf(args:{paymentMonth:string;taxableIncomeMinor:number|null;mode:'legal'|'simplified'|'best_known';legalDeductionsMinor:number|null;ordinaryMonthlyConfirmed:boolean}) {
  const ref=employeeTaxReference(args.paymentMonth),income=args.taxableIncomeMinor;
  if(!ref||args.ordinaryMonthlyConfirmed!==true||!validMoney(income)||!['legal','simplified','best_known'].includes(args.mode)||(args.mode==='legal'&&!validMoney(args.legalDeductionsMinor))||(args.mode==='best_known'&&args.legalDeductionsMinor!==null&&!validMoney(args.legalDeductionsMinor)))return null;
  const deductionMode=args.mode==='best_known'?(validMoney(args.legalDeductionsMinor)&&args.legalDeductionsMinor>=ref.irrfSimplifiedMinor?'legal':'simplified'):args.mode;
  const deduction=deductionMode==='simplified'?ref.irrfSimplifiedMinor:args.legalDeductionsMinor!;
  return {...calculateIrrf(income,deduction),taxableIncomeMinor:income,requestedMode:args.mode,deductionMode,deductionMinor:deduction,
    version:ref.version,source:FINANCIAL_SOURCES.irrf,estimated:true as const};
}

interface ThirteenthWithholdingScope {
  ownerId: string;
  employmentId: string;
  year: number;
  revision: number;
}

interface ThirteenthWithholdingEvidence extends ThirteenthWithholdingScope {
  reviewed: boolean;
  settlement: 'ordinary_annual';
  singleActiveRgpsEmploymentConfirmed: boolean;
  ordinaryResidentIrrfConfirmed: boolean;
  annualGrossMinor: number | null;
  contributionBaseMinor: number | null;
  taxableIncomeMinor: number | null;
  // Complete eligible deductions specific to this settlement, excluding its
  // employee INSS, which the estimator computes below. Zero requires review.
  otherLegalDeductionsMinor: number | null;
  // Use null only when a review found no confirmed retention to preserve.
  // Any confirmed amount, combined or individual, takes precedence.
  confirmedRetentionMinor: number | null;
}

/** Estimate only the two withholdings for an ordinary 2026 annual settlement.
 * The fiscal month is December under IN RFB 1.500 art. 13 §1. Neither that
 * month nor this estimate establishes a deposit date or payment status.
 */
export function estimateThirteenthSettlementWithholding({ scope, evidence }: {
  scope: ThirteenthWithholdingScope | null;
  evidence: ThirteenthWithholdingEvidence | null;
}) {
  if (!scope || !evidence || scope.year !== 2026 || !Number.isSafeInteger(scope.revision) || scope.revision <= 0
    || typeof scope.ownerId !== 'string' || !scope.ownerId.trim()
    || typeof scope.employmentId !== 'string' || !scope.employmentId.trim()
    || evidence.ownerId !== scope.ownerId || evidence.employmentId !== scope.employmentId
    || evidence.year !== scope.year || evidence.revision !== scope.revision || evidence.reviewed !== true
    || evidence.settlement !== 'ordinary_annual' || evidence.singleActiveRgpsEmploymentConfirmed !== true
    || evidence.ordinaryResidentIrrfConfirmed !== true
    || evidence.confirmedRetentionMinor !== null) return null;

  const { annualGrossMinor, contributionBaseMinor, taxableIncomeMinor, otherLegalDeductionsMinor } = evidence;
  if (!validMoney(annualGrossMinor) || !validMoney(contributionBaseMinor) || !validMoney(taxableIncomeMinor)
    || !validMoney(otherLegalDeductionsMinor) || contributionBaseMinor > annualGrossMinor
    || taxableIncomeMinor > annualGrossMinor) return null;

  const inssMinor = calculateInssMinor(contributionBaseMinor);
  const legalDeductionsMinor = inssMinor + otherLegalDeductionsMinor;
  if (!validMoney(legalDeductionsMinor)) return null;
  const useLegal = legalDeductionsMinor >= irrfSimplifiedMinor2026;
  const deductionMinor = useLegal ? legalDeductionsMinor : irrfSimplifiedMinor2026;

  // The IRRF stages use the calculator's cent-rounding convention. The MOS
  // per-bracket truncation applies to the INSS computation above.
  return {
    version: THIRTEENTH_TAX_VERSION,
    estimated: true as const,
    inss: {
      amountMinor: inssMinor,
      rounding: 'truncate_each_bracket' as const,
      source: FINANCIAL_SOURCES.inss,
      calculationSource: THIRTEENTH_INSS_CALCULATION_SOURCE,
    },
    irrf: {
      ...calculateIrrf(taxableIncomeMinor, deductionMinor),
      taxableIncomeMinor,
      deductionMinor,
      deductionMode: useLegal ? 'legal' as const : 'simplified' as const,
      rounding: 'estimate_half_up_per_stage' as const,
      source: FINANCIAL_SOURCES.irrf,
      calculationSource: THIRTEENTH_IRRF_CALCULATION_SOURCE,
    },
  };
}
