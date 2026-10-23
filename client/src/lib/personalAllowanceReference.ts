import type { LearnedRate } from './financialStatementLearning';
export type AllowanceCategory='mainMeal'|'breakfast'|'taxi';
export type PersonalAllowanceEvent={revision:number;category:AllowanceCategory;sourceId:string;from:string;active:boolean;confirmed:true};
export type PersonalAllowanceHistory={schema:1;ownerId:string;revision:number;events:PersonalAllowanceEvent[]};
export const allowanceCategory=(key:string):AllowanceCategory|null=>['per_diem.lunch','per_diem.dinner','per_diem.supper'].includes(key)?'mainMeal':key==='per_diem.breakfast'?'breakfast':key==='per_diem.taxi'?'taxi':null;
export const personalAllowanceSourceId=(rate:LearnedRate)=>JSON.stringify([rate.key,rate.sourceFingerprint,rate.effectiveFrom,rate.effectiveTo,rate.revision||1,rate.value]);
const day=(value:unknown):value is string=>typeof value==='string'&&/^(?:20|21)\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
/** Select only the current revision of an original account-owned reference.
 * Reuse does not change its observed payment period or company applicability. */
export function personalAllowanceSources(rates:readonly LearnedRate[],ownerId:string) {
 const latest=new Map<string,LearnedRate>(),ownerReviews=new Map<string,LearnedRate>();
 for(const rate of rates){
  if(rate.ownerId!==ownerId||!rate.confirmed||!allowanceCategory(rate.key)||rate.currency!=='BRL')continue;
  const scope=JSON.stringify([rate.key,rate.currency,rate.effectiveFrom]),prior=latest.get(scope);
  if(!prior||(rate.revision||1)>(prior.revision||1))latest.set(scope,rate);
  if(rate.key==='per_diem.lunch'&&rate.valueOrigin==='owner_confirmed'){
   const review=ownerReviews.get(scope);
   if(!review||(rate.revision||1)>(review.revision||1))ownerReviews.set(scope,rate);
  }
 }
 return [...latest.values()].filter(rate=>{
  const quarter=rate.key==='per_diem.breakfast'?'breakfastQuarter':rate.key==='per_diem.taxi'?'taxiQuarter':null;
  // Monthly reviews preserve withdrawn quarter rows for audit. Their latest
  // principal-meal review controls whether those derived owner sources survive.
  const review=ownerReviews.get(JSON.stringify(['per_diem.lunch',rate.currency,rate.effectiveFrom]));
  if(quarter&&rate.valueOrigin==='owner_confirmed'&&review?.valueOrigin==='owner_confirmed'&&review.perDiemReview?.[quarter]===false)return false;
  return (rate.valueOrigin===undefined||['printed','owner_confirmed'].includes(rate.valueOrigin))&&Number.isFinite(rate.value)&&rate.value>0;
 });
}
export function parsePersonalAllowanceHistory(raw:string,ownerId:string):PersonalAllowanceHistory|null {
 try{
  if(raw.length>1048576)return null;
  const x=JSON.parse(raw);
  if(!x||Object.keys(x).sort().join(',')!=='events,ownerId,revision,schema'||x.schema!==1||x.ownerId!==ownerId||!ownerId||!Array.isArray(x.events)||!Number.isSafeInteger(x.revision)||x.revision<0||x.revision!==x.events.length)return null;
  if(x.events.some((e:PersonalAllowanceEvent,index:number)=>!e||Object.keys(e).sort().join(',')!=='active,category,confirmed,from,revision,sourceId'||e.revision!==index+1||!['mainMeal','breakfast','taxi'].includes(e.category)||e.confirmed!==true||typeof e.active!=='boolean'||typeof e.sourceId!=='string'||!e.sourceId||e.sourceId.length>8192||!day(e.from)))return null;
  return x;
 }catch{return null;}
}
export function currentPersonalAllowance(history:PersonalAllowanceHistory,category:AllowanceCategory){return history.events.filter(e=>e.category===category).at(-1)||null;}
export function resolvePersonalAllowance(history:PersonalAllowanceHistory,rates:readonly LearnedRate[],category:AllowanceCategory,date:string){
 const event=currentPersonalAllowance(history,category);
 if(!event?.active||!day(date)||event.from>date)return null;
 const rate=personalAllowanceSources(rates,history.ownerId).find(rate=>personalAllowanceSourceId(rate)===event.sourceId&&allowanceCategory(rate.key)===category);
 return rate&&event.from>=rate.effectiveFrom?{rate,event}:null;
}
export function planPersonalAllowance(history:PersonalAllowanceHistory,rates:readonly LearnedRate[],expectedRevision:number,change:{category:AllowanceCategory;sourceId?:string;from?:string;active:boolean}):PersonalAllowanceHistory|null {
 if(history.revision!==expectedRevision||!Number.isSafeInteger(history.revision)||history.revision>=Number.MAX_SAFE_INTEGER||!['mainMeal','breakfast','taxi'].includes(change.category))return null;
 const prior=currentPersonalAllowance(history,change.category);
 let sourceId=prior?.sourceId,from=prior?.from;
 if(change.active){
  const rate=personalAllowanceSources(rates,history.ownerId).find(rate=>personalAllowanceSourceId(rate)===change.sourceId&&allowanceCategory(rate.key)===change.category);
  if(!rate||!day(change.from)||change.from<rate.effectiveFrom)return null;
  sourceId=change.sourceId;from=change.from;
 }else if(!prior?.active)return null;
 if(!sourceId||!from)return null;
 if(prior?.active===change.active&&prior.sourceId===sourceId&&prior.from===from)return history;
 const revision=history.revision+1;
 return {...history,revision,events:[...history.events,{revision,category:change.category,sourceId,from,active:change.active,confirmed:true}]};
}
