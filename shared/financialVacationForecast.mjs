import {vacationPaymentTiming} from './financialVacationTiming.mjs';
import {reviewedComponents,cashCoverage,compatibleSourceSets,cashState} from './financialReviewedComponents.mjs';

// Pure presentation contract. Reviewed evidence is supplied explicitly; this
// module neither certifies an import nor writes a payroll/credit/owner record.
export const VACATION_FORECAST_RULE = 'aeronaut-vacation-reviewed-base:v2';
const civil = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T12:00:00Z')) && new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const revision = n => Number.isSafeInteger(n)&&n>0;
const interval = a => a&&civil(a.start)&&civil(a.end)&&a.start<=a.end;
const round = (n,d) => Math.floor((n+Math.floor(d/2))/d);

export function vacationForecast({ownerId,plan,evidence,lawApplicable}={}) {
  const assessments={entitlementAssessment:'not_assessed',employerRoundingConfirmed:false,roundingPolicy:'half_up_component_then_third'};
  const blocked = reason => ({rule:VACATION_FORECAST_RULE,state:'pending',reason,periods:[],paymentConfirmed:false,...assessments});
  if(typeof ownerId!=='string'||!ownerId.trim()||plan?.ownerId!==ownerId)return blocked('owner_mismatch');
  if(!revision(plan.revision)||!interval(plan.acquisition))return blocked('acquisition_or_revision_missing');
  if(!Array.isArray(plan.periods)||plan.periods.length<1||plan.periods.length>2)return blocked('periods_invalid');
  const ids=new Set();
  for(const p of plan.periods){
    if(!p||typeof p.id!=='string'||!p.id.trim()||ids.has(p.id)||![15,30].includes(p.days)||(plan.periods.length===2&&p.days!==15)||(p.startDate!=null&&!civil(p.startDate)))return blocked('periods_invalid');
    ids.add(p.id);
  }
  const dated=plan.periods.filter(p=>p.startDate).sort((a,b)=>a.startDate.localeCompare(b.startDate));
  for(let i=1;i<dated.length;i++)if((Date.parse(dated[i].startDate+'T12:00:00Z')-Date.parse(dated[i-1].startDate+'T12:00:00Z'))/86400000<dated[i-1].days)return blocked('periods_overlap');
  const bound=evidence?.ownerId===ownerId&&evidence.planRevision===plan.revision&&evidence.acquisition?.start===plan.acquisition.start&&evidence.acquisition?.end===plan.acquisition.end;
  const scoped=lawApplicable===true&&bound;
  const valid=scoped&&reviewedComponents(evidence?.earnings,{earning:true,periodIds:ids});
  const validDeductions=scoped&&reviewedComponents(evidence?.deductions,{periodIds:ids})&&(!valid||compatibleSourceSets(evidence.earnings,evidence.deductions));
  const periods=plan.periods.map(p=>{
    const timing=vacationPaymentTiming({ownerId,plan:{...plan,startDate:p.startDate},lawApplicable});
    const rows=valid?evidence.earnings.filter(r=>r.periodId===p.id):[];
    const earnings=rows.length?rows.reduce((sum,r)=>sum+(r.basis==='monthly_average'?round(r.amountMinor*p.days,30):r.amountMinor),0):null;
    const third=earnings===null?null:round(earnings,3);
    const knownSubtotal=earnings===null?null:earnings+third;
    const complete=valid&&rows.length>0&&evidence.earningsComplete===true;
    const gross=complete?knownSubtotal:null;
    const deductions=validDeductions?evidence.deductions.filter(r=>r.periodId===p.id):[];
    const deductionsMinor=validDeductions&&evidence.deductionsComplete===true&&cashCoverage(deductions,p.id)?deductions.reduce((sum,r)=>sum+r.amountMinor,0):null;
    const net=gross!==null&&deductionsMinor!==null?gross-deductionsMinor:null;
    return {id:p.id,days:p.days,startDate:p.startDate??null,deadlineDate:timing.deadlineDate,
      earningsMinor:earnings,thirdMinor:third,knownSubtotalMinor:knownSubtotal,grossMinor:gross,
      deductionsMinor,netMinor:net,cashState:cashState(net),
      sources:rows.map(r=>({...r.source})),deductions:deductions.map(r=>({...r,source:{...r.source}})),
      pending:[...(!valid?['evidence_unconfirmed']:[]),...(!complete?['earnings_inventory']:[]),...(deductionsMinor===null?['retentions_and_offsets']:[]),...(net!==null&&net<0?['negative_balance_review']:[])],
      paymentConfirmed:false,expectedDepositDate:null};
  });
  return {rule:VACATION_FORECAST_RULE,state:periods.some(p=>p.cashState==='negative_review')?'review_required':periods.every(p=>!p.pending.length)?'estimate':'partial',reason:null,periods,paymentConfirmed:false,...assessments};
}
