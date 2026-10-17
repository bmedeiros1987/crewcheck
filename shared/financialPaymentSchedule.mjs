import {spBankDay} from './spBankCalendar2026.mjs';
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const timezone = value => {if(typeof value!=='string'||!value)return false;try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}};
const id = value => typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value);
// Explicit account policy, based on the owner's report. This is not a global
// airline/ACT rule and does not identify a flight by guessing from a meal/day.
export function expectedAllowancePayment({identity,record,policy,airline,flightLink,cycle,bankDay=spBankDay}={}) {
  const pending=reason=>({state:'pending',reason,expectedPaymentDate:null});
  if(identity?.authenticated!==true||identity.role!=='owner'||!identity.ownerId||record?.ownerId!==identity.ownerId)return pending('owner_not_confirmed');
  if(record?.status==='payment_confirmed')return {state:'preserved',expectedPaymentDate:record.expectedPaymentDate??null};
  if(record.category!=='allowance')return pending('not_allowance');
  if(policy?.timing==='brl_thursday_sp_bank_holiday'){
    if(typeof airline!=='string'||!airline.trim()||record.currency!=='BRL'||policy.ownerId!==identity.ownerId||policy.airline!==airline||!id(policy.id)||!id(policy.reportReference)||policy.provenance!=='owner_report'||!day(policy.effectiveFrom)||!day(policy.effectiveTo)||policy.effectiveFrom>record.periodStart||policy.effectiveTo<record.periodEnd)return pending('applicable_policy_not_confirmed');
    // The producer must supply the reviewed payment cycle/date. The owner's
    // Thursday rule does not establish a payroll cutoff or an accrual mapping.
    if(cycle?.kind!=='reviewed_allowance_payment_date'||!id(cycle.reference)||!day(cycle.date)||new Date(cycle.date+'T12:00:00Z').getUTCDay()!==4)return pending('payment_cycle_not_proven');
    const thursday=bankDay(cycle.date);let expected=cycle.date;
    if(['unknown','closed_nonholiday','weekend'].includes(thursday.state))return pending(thursday.state==='closed_nonholiday'?'nonholiday_bank_closure_policy_pending':'calendar_not_verified');
    if(thursday.state==='holiday'){
      const date=new Date(cycle.date+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-1);expected=date.toISOString().slice(0,10);
      if(!['open','partial'].includes(bankDay(expected).state))return pending('wednesday_closed_or_unknown_no_rule');
    }
    return {state:'scheduled',expectedPaymentDate:expected,expectedPaymentTimezone:'America/Sao_Paulo',timingRuleId:policy.id,provenance:'owner_report',reportReference:policy.reportReference,calendarSource:thursday.source};
  }
  if(!policy||policy.ownerId!==identity.ownerId||policy.timing!=='foreign_allowance_flight_day'||!id(policy.id)||!id(policy.reportReference)||policy.provenance!=='owner_report'||!Array.isArray(policy.currencies)||!policy.currencies.includes(record.currency)||record.currency==='BRL'||typeof airline!=='string'||!airline||policy.airline!==airline||!day(policy.effectiveFrom)||!day(policy.effectiveTo)||policy.effectiveFrom>record.periodStart||policy.effectiveTo<record.periodEnd)return pending('applicable_policy_not_confirmed');
  if(!['item','day'].includes(record.aggregationLevel))return pending('flight_day_requires_item_or_day');
  // Exactly one source link for this logical allowance. Never one advance per leg.
  if(!flightLink||Array.isArray(flightLink)||flightLink.kind!=='published_allowance_flight_link'||flightLink.allowanceSourceId!==record.sourceId||!id(flightLink.reference)||!day(flightLink.localDate)||!timezone(flightLink.timezone)||!/^([A-Z]{3})$/.test(flightLink.airport))return pending('flight_link_not_proven');
  return {state:'scheduled',expectedPaymentDate:flightLink.localDate,expectedPaymentTimezone:flightLink.timezone,flightDate:flightLink.localDate,flightDateTimezone:flightLink.timezone,flightAirport:flightLink.airport,timingRuleId:policy.id,provenance:'owner_report',reportReference:policy.reportReference};
}
// No recursion to Tuesday; no 2027 complete-calendar claim or cutoff inference.
