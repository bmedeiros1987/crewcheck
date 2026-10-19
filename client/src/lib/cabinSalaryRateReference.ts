import {actPayrollCompetences,ACT_PAYROLL_CYCLE_SOURCE} from './financialPayrollPeriods';
import {FINANCIAL_SOURCES} from './financialReferenceCatalog';

/** ACT3.2.7/3.2.8 explicitly label these printed amounts as Nov2025.
 * Apply50% of the independently published INPC4.18% once, to defaults only.
 * Preserve exact decimal multiplication until monetary display/aggregation;
 * company-specific tariff rounding and remunerable KM still need evidence.
 */
export function cabinSalaryRateReference(operationalMonth:string) {
 const cycle=actPayrollCompetences(operationalMonth,ACT_PAYROLL_CYCLE_SOURCE);
 if(!cycle||cycle.rateMonth<'2025-12'||cycle.rateMonth>'2026-11')return null;
 const indexed=(units:number,scale:number)=>Number(BigInt(units)*10209n)/(scale*10000);
 return {version:'cabin-variable:nov2025:inpc418-half:v1',rateMonth:cycle.rateMonth,
  dayKm:indexed(57349,1000000),nightKm:indexed(114698,1000000),
  reserveHour:indexed(4875,100),standbyHour:indexed(1625,100),excessHour:indexed(4875,100),
  referenceEffectiveFrom:'2025-12-01',referenceEffectiveTo:'2026-11-30',
  adjustmentBasisPoints:209,sources:[FINANCIAL_SOURCES.cabin,FINANCIAL_SOURCES.inpc],
  description:`Referência ACT derivada · produção ${operationalMonth} · mês tarifário ${cycle.rateMonth} · referência vigente de 2025-12 a 2026-11 · reajuste2,09% (50% INPC4,18%) · sem arredondamento intermediário; conferir tabela corporativa`};
}
