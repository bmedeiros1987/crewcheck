import {salaryFloorReference} from '@/lib/financialReferenceCatalog';
import {cabinSalaryRateReference} from '@/lib/cabinSalaryRateReference';
import type {PayrollProjectionPeriod} from '@/lib/payrollProjectionPeriods';
import {useFinancialPrivacy} from './FinancialPrivacy';

/** Documentary defaults stay separate from observed individual earnings. */
export default function FinancialActPresetReference({period}:{period:PayrollProjectionPeriod}){
 const privacy=useFinancialPrivacy(),money=(minor:number)=>privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100));
 const during=salaryFloorReference({company:'TAM',role:'cabin',stage:'probation',month:period.fixedMonth});
 const after=salaryFloorReference({company:'TAM',role:'cabin',stage:'regular',month:period.fixedMonth});
 const rates=cabinSalaryRateReference(period.operationalVariableMonth);
 return <div data-financial-act-preset={period.basis}>
  <small>LATAM Brasil · comissários · {period.basis==='system_default'?'padrão de cálculo; vínculo individual não confirmado':'perfil financeiro declarado'}</small>
  <details><summary aria-label="Entender o padrão financeiro ACT">i · Referência ACT</summary>
   <p>Produção {period.operationalVariableMonth}; tarifa {period.rateMonth}; fixos da folha {period.fixedMonth}; crédito previsto {period.expectedCreditMonth}. A data e o recebimento não estão confirmados.</p>
   {during&&after?<p>Pisos de referência dos fixos, incluindo CO: experiência até 90 dias {money(during.amountMinor)}; após experiência {money(after.amountMinor)}. Etapa não comprovada: nenhum piso foi escolhido como salário pessoal nem somado ao subtotal.</p>:<p>Piso dos fixos de {period.fixedMonth} pendente de referência econômica vigente. Nenhum valor anterior foi prorrogado.</p>}
   {rates?<p>Tarifas de referência: KM base {privacy.amount(String(rates.dayKm))} R$/km; KM majorado {privacy.amount(String(rates.nightKm))} R$/km; reserva {privacy.amount(String(rates.reserveHour))} R$/h; sobreaviso {privacy.amount(String(rates.standbyHour))} R$/h. Reajuste de 2,09% já aplicado uma vez; não é tarifa individual homologada.</p>:<p>Tarifa de {period.rateMonth} ainda sem versão econômica comprovada. Os valores conhecidos das demais rubricas são preservados; não inventamos o próximo reajuste.</p>}
   <p>O padrão não confirma inventário integral, descontos, KM remunerável por trecho ou classificação corporativa noturna. Holerite revisado e valores pessoais têm precedência, inclusive zero, somente nas competências de origem.</p>
   <a href="/legal/ACT-Comissarios-2025-2027.pdf" target="_blank" rel="noopener noreferrer">ACT 2025–2027 · fonte documental</a>
  </details>
 </div>;
}
