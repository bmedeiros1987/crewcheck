// Reviewed personal scenario, never a payroll writer or automatic service-month
// classifier. Aeronaut remuneration/ACT averages must be proved independently.
export const THIRTEENTH_RULE='reviewed-aeronaut-thirteenth:v1';
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const period=p=>p&&date(p.start)&&date(p.end)&&p.start<=p.end;
const revision=n=>Number.isSafeInteger(n)&&n>0;
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
const source=s=>s&&typeof s.id==='string'&&s.id.trim()&&revision(s.revision)&&s.reviewed===true;
export function thirteenthForecast({ownerId,plan,evidence,lawApplicable,activeEmployment}={}){
 const base={rule:THIRTEENTH_RULE,knownSubtotalMinor:null,grossMinor:null,netMinor:null,deductionsMinor:null,firstAdvanceEstimateMinor:null,finalDeadlineDate:null,expectedDepositDate:null,paymentConfirmed:false,taxableBaseMinor:null};
 const blocked=reason=>({...base,state:'pending',reason});
 if(typeof ownerId!=='string'||!ownerId.trim()||plan?.ownerId!==ownerId)return blocked('owner_mismatch');
 if(!revision(plan.revision)||!Number.isInteger(plan.year)||plan.year<1965||plan.year>9999||!period(plan.averagePeriod)||plan.averagePeriod.end>`${plan.year}-12-31`)return blocked('year_period_or_revision_missing');
 if(lawApplicable!==true||activeEmployment!==true)return blocked('applicability_unconfirmed');
 const result={...base,finalDeadlineDate:`${plan.year}-12-20`,firstAdvanceWindow:'February-November',state:'partial',reason:'remuneration_or_avos_unconfirmed'};
 const bound=evidence?.ownerId===ownerId&&evidence.planRevision===plan.revision&&evidence.year===plan.year&&evidence.averagePeriod?.start===plan.averagePeriod.start&&evidence.averagePeriod?.end===plan.averagePeriod.end;
 if(!bound||!source(evidence.source)||!money(evidence.amountMinor)||!Number.isInteger(evidence.avos)||evidence.avos<0||evidence.avos>12||!['full_year_equivalent','annual_proportional_amount'].includes(evidence.basis))return result;
 if(evidence.basis==='annual_proportional_amount'&&evidence.avos===0&&evidence.amountMinor!==0)return {...result,reason:'contradictory_proportion'};
 const known=evidence.basis==='full_year_equivalent'?Math.floor((evidence.amountMinor*evidence.avos+6)/12):evidence.amountMinor;
 result.knownSubtotalMinor=known;
 result.grossMinor=evidence.earningsComplete===true?known:null;
 result.reason=result.grossMinor===null?'earnings_inventory':'retentions_and_offsets';
 const ids=new Set();let valid=Array.isArray(evidence.deductions)&&evidence.deductions.length<=128;
 if(valid)for(const r of evidence.deductions){if(!r||typeof r.id!=='string'||!r.id.trim()||ids.has(r.id)||!money(r.amountMinor)||!source(r.source)||!['retention','consigned','advance'].includes(r.kind)){valid=false;break;}ids.add(r.id);}
 if(valid&&evidence.deductionsComplete===true){result.deductionsMinor=evidence.deductions.reduce((sum,r)=>sum+r.amountMinor,0);if(result.grossMinor!==null){result.netMinor=result.grossMinor-result.deductionsMinor;result.state='estimate';result.reason=null;}}
 return result;
}
