import type {NextPayment} from './nextFinancialPayment';
import {majorNumberToMinor} from '../../../shared/financialFx.mjs';
import {rosterOperationalIso} from './compensationPolicy';
import {validFinancialDay} from './financialHistoryPeriods';

// Projection of the already-calculated owner-bound snapshot, never a ledger,
// second calculator, payment confirmation or inferred salary credit cycle.
export function localUpcomingAllowance(payment:NextPayment|null,now=new Date()) {
 if(!payment||payment.kind!=='allowance'||!Number.isFinite(now.getTime()))return null;
 const today=rosterOperationalIso(now),until=new Date(today+'T12:00:00Z');until.setUTCDate(until.getUTCDate()+29);
 const last=until.toISOString().slice(0,10),groups=new Map<string,{date:string;currency:string;amount:number;partial:boolean}>();
 let incomplete=payment.calculationPartial===true;const invalid=new Set<string>();
 for(const line of payment.upcomingLines??payment.lines){
  const date=payment.upcomingLines?line.expectedPaymentDate:line.currency==='BRL'?payment.expectedPaymentDates?.BRL:line.expectedPaymentDate;
  if(!date||!validFinancialDay(date)){incomplete=true;continue;}
  if(date<today||date>last)continue;
  if(line.partial)incomplete=true;
  if(line.currency!=='BRL'&&line.expectedPaymentTimezone!=='America/Sao_Paulo'){incomplete=true;continue;}
  const minor=line.value===null?null:majorNumberToMinor(line.value,line.currency);
  if(minor===null||minor<0){incomplete=true;continue;}
  const key=date+':'+line.currency;if(invalid.has(key))continue;const old=groups.get(key),amount=(old?.amount||0)+minor;
  if(!Number.isSafeInteger(amount)){incomplete=true;groups.delete(key);invalid.add(key);continue;}
  groups.set(key,{date,currency:line.currency,amount,partial:old?.partial===true||incomplete||line.partial===true});
 }
 const events=[...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.currency.localeCompare(b.currency)).map(x=>({id:'calculated:'+x.date+':'+x.currency,category:'allowance',expectedPaymentDate:x.date,expectedPaymentTimezone:'America/Sao_Paulo',amountMinor:x.amount,currency:x.currency,status:'forecast' as const,partial:x.partial||incomplete}));
 return {state:incomplete?'incomplete' as const:events.length?'available' as const:'no_data' as const,events:events.slice(0,3),hasMore:events.length>3};
}
