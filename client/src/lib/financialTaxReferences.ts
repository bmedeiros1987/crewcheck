import { FINANCIAL_SOURCES } from './financialReferenceCatalog';
import { payrollMonthBounds } from './financialPayrollPeriods';

export const TAX_REFERENCE_VERSION='BR-employee-monthly:2026:v2';
export const INSS_CALCULATION_SOURCE='https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-11-2026-com-marcacoes-retificada.pdf#page=384';
const brackets=Object.freeze([{upperMinor:162100,basisPoints:750},{upperMinor:290284,basisPoints:900},{upperMinor:435427,basisPoints:1200},{upperMinor:847555,basisPoints:1400}].map(item=>Object.freeze(item)));
export function employeeTaxReference(month:string) {
  if(!payrollMonthBounds(month)||month<'2026-01'||month>'2026-12')return null;
  return Object.freeze({version:TAX_REFERENCE_VERSION,effectiveFrom:'2026-01-01',effectiveTo:'2026-12-31',
    inss:brackets,irrfSimplifiedMinor:60720,dependentDeductionMinor:18959,sources:FINANCIAL_SOURCES,
    scope:'ordinary_monthly_employee_estimate' as const,paymentConfirmed:false as const});
}
const validMoney=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function round(numerator:bigint,denominator:bigint){return Number((numerator+denominator/2n)/denominator);}

/** Single employee relationship estimate; contribution competence selects the
 * table. eSocial MOS S-1.3 S-5001 2.13: truncate each bracket to cents.
 * Multiple employments and special payrolls require their own review. */
export function estimateEmployeeInss(args:{contributionMonth:string;contributionBaseMinor:number|null;singleEmploymentConfirmed:boolean}) {
  const {contributionBaseMinor}=args;
  const ref=employeeTaxReference(args.contributionMonth);if(!ref||args.singleEmploymentConfirmed!==true||!validMoney(contributionBaseMinor))return null;
  let previous=0,amountMinor=0n;
  for(const bracket of brackets){const portion=Math.max(0,Math.min(contributionBaseMinor,bracket.upperMinor)-previous);amountMinor+=BigInt(portion)*BigInt(bracket.basisPoints)/10000n;previous=bracket.upperMinor;}
  return {amountMinor:Number(amountMinor),version:ref.version,source:FINANCIAL_SOURCES.inss,calculationSource:INSS_CALCULATION_SOURCE,rounding:'truncate_each_bracket' as const,estimated:true as const};
}

/** legalDeductionsMinor is the complete known legal deduction, including INSS
 * where applicable. It is never added to the alternative simplified amount.
 * Reduction eligibility uses gross taxable income, before either deduction. */
export function estimateMonthlyIrrf(args:{paymentMonth:string;taxableIncomeMinor:number|null;mode:'legal'|'simplified'|'best_known';legalDeductionsMinor:number|null;ordinaryMonthlyConfirmed:boolean}) {
  const ref=employeeTaxReference(args.paymentMonth),income=args.taxableIncomeMinor;
  if(!ref||args.ordinaryMonthlyConfirmed!==true||!validMoney(income)||!['legal','simplified','best_known'].includes(args.mode)||(args.mode==='legal'&&!validMoney(args.legalDeductionsMinor))||(args.mode==='best_known'&&args.legalDeductionsMinor!==null&&!validMoney(args.legalDeductionsMinor)))return null;
  const deductionMode=args.mode==='best_known'?(validMoney(args.legalDeductionsMinor)&&args.legalDeductionsMinor>=ref.irrfSimplifiedMinor?'legal':'simplified'):args.mode;
  const deduction=deductionMode==='simplified'?ref.irrfSimplifiedMinor:args.legalDeductionsMinor!;
  const base=Math.max(0,income-deduction);
  const band=base<=242880?{bp:0,d:0}:base<=282665?{bp:750,d:18216}:base<=375105?{bp:1500,d:39416}:base<=466468?{bp:2250,d:67549}:{bp:2750,d:90873};
  const ordinary=Math.max(0,round(BigInt(base)*BigInt(band.bp),10000n)-band.d);
  const reduction=income<=500000?Math.min(ordinary,31289):income<=735000?Math.min(ordinary,Math.max(0,round(97862000000n-133145n*BigInt(income),1000000n))):0;
  return {amountMinor:Math.max(0,ordinary-reduction),taxableIncomeMinor:income,requestedMode:args.mode,deductionMode,deductionMinor:deduction,
    taxableBaseMinor:base,ordinaryTaxMinor:ordinary,reductionMinor:reduction,version:ref.version,source:FINANCIAL_SOURCES.irrf,estimated:true as const};
}
