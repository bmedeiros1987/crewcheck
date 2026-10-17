import { payrollMonthBounds } from './financialPayrollPeriods';

export const FINANCIAL_SOURCES = Object.freeze({
  cabin:'https://aeronautas.org.br/wp-content/uploads/2025/12/20251208-ACT-Aeronautas-Comissarios-25-27_v9-site.pdf',
  pilots:'https://aeronautas.org.br/wp-content/uploads/2025/12/20251209-ACT-Aeronautas-Pilotos-25-27_v13-site.pdf',
  inpc:'https://ftp.ibge.gov.br/Precos_Indices_de_Precos_ao_Consumidor/IPCA/Fasciculo_Indicadores_IBGE/2025/ipca-inpc_202511caderno.pdf',
  inss:'https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal',
  irrf:'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026',
});
export type FinancialCrewRole='cabin'|'copilot'|'captain';
export type EmploymentStage='probation'|'regular';
export const FLOOR_REFERENCE_VERSION='tam-floor-with-co:2025-12:inpc-2025-11:v1';
const printedFloors = {cabin:{probation:269480,regular:301365},copilot:{probation:579800,regular:953360},captain:{probation:1112271,regular:1638463}} as const;
const roles=new Set(Object.keys(printedFloors));

/** A floor including CO is not a guaranteed individual base salary. No writes,
 * automatic adoption, annual carry-forward or second indexation take place. */
export function salaryFloorReference(args:{company:string;role:FinancialCrewRole;stage:EmploymentStage;month:string}) {
  if(args.company!=='TAM'||!roles.has(args.role)||!['probation','regular'].includes(args.stage)||!payrollMonthBounds(args.month)||args.month<'2025-12'||args.month>'2026-11')return null;
  const printedMinor=printedFloors[args.role][args.stage];
  const amountMinor=Number((BigInt(printedMinor)*10209n+5000n)/10000n);
  return Object.freeze({id:`${FLOOR_REFERENCE_VERSION}:${args.role}:${args.stage}`,version:FLOOR_REFERENCE_VERSION,
    company:'TAM' as const,role:args.role,stage:args.stage,month:args.month,currency:'BRL' as const,amountMinor,
    kind:'derived_floor_including_co' as const,includesCO:true as const,individualSalaryGuaranteed:false as const,
    requiresConfirmation:true as const,effectiveFrom:'2025-12-01',effectiveTo:'2026-11-30',
    printedMinor,adjustmentBasisPoints:209,inpcBasisPoints:418,
    sources:Object.freeze([args.role==='cabin'?FINANCIAL_SOURCES.cabin:FINANCIAL_SOURCES.pilots,FINANCIAL_SOURCES.inpc]),
    clauses:'2.3.1/2.3.2',unconfigured:Object.freeze(['chiefSupplement','personalDeductions'])});
}

/** Explicitly chooses an already-personal value first, even zero. Catalogues
 * are suggestions: the consumer must separately confirm before adopting one. */
type ScopedSalaryValue={ownerId:string;month:string;amountMinor:number|null;sourceId:string;includesCO:boolean};
export function resolveSalaryReference(args:{ownerId:string;month:string;personal?:ScopedSalaryValue;reviewed?:ScopedSalaryValue;reference:ReturnType<typeof salaryFloorReference>}) {
  if(!args.ownerId||!payrollMonthBounds(args.month)||args.reference&&args.reference.month!==args.month)return {kind:'invalid_context' as const,amountMinor:null,reference:null};
  for(const [kind,value] of [['personal',args.personal],['reviewed_statement',args.reviewed]] as const){
    if(!value)continue;
    if(value.ownerId!==args.ownerId)return {kind:'owner_mismatch' as const,amountMinor:null,reference:args.reference};
    if(value.month!==args.month)return {kind:'period_mismatch' as const,amountMinor:null,reference:args.reference};
    if(!value.sourceId||value.amountMinor!==null&&(!Number.isSafeInteger(value.amountMinor)||value.amountMinor<0))return {kind:'invalid_value' as const,amountMinor:null,reference:args.reference};
    return {kind,amountMinor:value.amountMinor,includesCO:value.includesCO,sourceId:value.sourceId,reference:args.reference};
  }
  return {kind:'not_configured' as const,amountMinor:null,reference:args.reference};
}
