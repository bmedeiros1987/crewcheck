import type { LearnedRate } from './financialStatementLearning';
export type AllowanceCategory='mainMeal'|'breakfast'|'taxi';
export type PersonalAllowanceEvent={revision:number;category:AllowanceCategory;sourceId:string;from:string;active:boolean;confirmed:true};
export type LegacyPersonalAllowanceHistory={schema:1;ownerId:string;revision:number;events:PersonalAllowanceEvent[]};
export type PersonalAllowanceChange={category:AllowanceCategory;sourceId?:string;from?:string;active:boolean};
export type PersonalAllowanceTimelineEvent={revision:number;category:AllowanceCategory;confirmed:true}&({kind:'activate';sourceId:string;from:string}|{kind:'revoke'});
export type PersonalAllowanceTimelineHistory={schema:2;ownerId:string;revision:number;legacyRaw:string|null;events:PersonalAllowanceTimelineEvent[]};
export type PersonalAllowanceHistory=LegacyPersonalAllowanceHistory|PersonalAllowanceTimelineHistory;
const categories:AllowanceCategory[]=['mainMeal','breakfast','taxi'];
const maxHistoryLength=1048576;
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
function parseLegacy(raw:string,ownerId:string):LegacyPersonalAllowanceHistory|null {
 try{
  if(raw.length>maxHistoryLength)return null;
  const x=JSON.parse(raw);
  if(!x||Object.keys(x).sort().join(',')!=='events,ownerId,revision,schema'||x.schema!==1||x.ownerId!==ownerId||!ownerId||!Array.isArray(x.events)||!Number.isSafeInteger(x.revision)||x.revision<0||x.revision!==x.events.length)return null;
  if(x.events.some((e:PersonalAllowanceEvent,index:number)=>!e||Object.keys(e).sort().join(',')!=='active,category,confirmed,from,revision,sourceId'||e.revision!==index+1||!['mainMeal','breakfast','taxi'].includes(e.category)||e.confirmed!==true||typeof e.active!=='boolean'||typeof e.sourceId!=='string'||!e.sourceId||e.sourceId.length>8192||!day(e.from)))return null;
  return x;
 }catch{return null;}
}
export function parsePersonalAllowanceHistory(raw:string,ownerId:string):PersonalAllowanceHistory|null {
 try{
  if(typeof raw!=='string'||raw.length>maxHistoryLength||!ownerId)return null;
  const x=JSON.parse(raw);
  if(x?.schema===1)return parseLegacy(raw,ownerId);
  if(!x||Object.keys(x).sort().join(',')!=='events,legacyRaw,ownerId,revision,schema'||x.schema!==2||x.ownerId!==ownerId||!Array.isArray(x.events)||!Number.isSafeInteger(x.revision)||x.revision<0)return null;
  const legacy=x.legacyRaw===null?null:typeof x.legacyRaw==='string'?parseLegacy(x.legacyRaw,ownerId):null;
  if(x.legacyRaw!==null&&(!legacy||!x.events.length))return null;
  const base=legacy?.revision??0;
  if(!Number.isSafeInteger(base+x.events.length)||x.revision!==base+x.events.length)return null;
  if(x.events.some((e:PersonalAllowanceTimelineEvent,index:number)=>{
   if(!e||e.revision!==base+index+1||!categories.includes(e.category)||e.confirmed!==true)return true;
   if(e.kind==='revoke')return Object.keys(e).sort().join(',')!=='category,confirmed,kind,revision';
   return e.kind!=='activate'||Object.keys(e).sort().join(',')!=='category,confirmed,from,kind,revision,sourceId'||typeof e.sourceId!=='string'||!e.sourceId||e.sourceId.length>8192||!day(e.from);
  }))return null;
  return x;
 }catch{return null;}
}
/** Live starts only; revoked generations remain audit data, never fallback. */
export function personalAllowanceTimeline(history:PersonalAllowanceHistory,category:AllowanceCategory):PersonalAllowanceEvent[]{
 if(history.schema===1){const last=history.events.filter(e=>e.category===category).at(-1);return last?.active?[last]:[];}
 const events=history.events.filter(e=>e.category===category),barrier=events.filter(e=>e.kind==='revoke').at(-1)?.revision??0;
 const legacy=history.legacyRaw===null?null:parseLegacy(history.legacyRaw,history.ownerId);
 const seed=barrier||!legacy?[]:personalAllowanceTimeline(legacy,category);
 const live=[...seed,...events.flatMap(e=>e.kind==='activate'&&e.revision>barrier?[{revision:e.revision,category:e.category,sourceId:e.sourceId,from:e.from,active:true,confirmed:true} as PersonalAllowanceEvent]:[])];
 const starts=new Map<string,PersonalAllowanceEvent>();
 for(const event of live){const prior=starts.get(event.from);if(!prior||event.revision>prior.revision)starts.set(event.from,event);}
 return [...starts.values()].sort((a,b)=>a.from.localeCompare(b.from)||a.revision-b.revision);
}
/** Latest recorded live start is useful for management, NOT date selection. */
export function currentPersonalAllowance(history:PersonalAllowanceHistory,category:AllowanceCategory){
 if(history.schema===1)return history.events.filter(e=>e.category===category).at(-1)||null;
 return personalAllowanceTimeline(history,category).sort((a,b)=>a.revision-b.revision).at(-1)||null;
}
export function personalAllowanceAt(history:PersonalAllowanceHistory,rates:readonly LearnedRate[],category:AllowanceCategory,date:string):{state:'none'}|{state:'unavailable';event:PersonalAllowanceEvent}|{state:'active';event:PersonalAllowanceEvent;rate:LearnedRate}{
 if(!day(date))return {state:'none'};
 const event=personalAllowanceTimeline(history,category).filter(e=>e.from<=date).at(-1);
 if(!event)return {state:'none'};
 // Select by date before checking source validity: invalid latest evidence must
 // not uncover an older source or masquerade as an absent personal premise.
 const rate=personalAllowanceSources(rates,history.ownerId).find(rate=>personalAllowanceSourceId(rate)===event.sourceId&&allowanceCategory(rate.key)===category);
 return rate&&event.from>=rate.effectiveFrom?{state:'active',rate,event}:{state:'unavailable',event};
}
export function resolvePersonalAllowance(history:PersonalAllowanceHistory,rates:readonly LearnedRate[],category:AllowanceCategory,date:string){
 const selected=personalAllowanceAt(history,rates,category,date);
 return selected.state==='active'?{rate:selected.rate,event:selected.event}:null;
}
/** Conversion is an explicit reviewed write. The exact v1 string is retained;
 * only its final current states seed the dated timeline. Reads never convert. */
export function planPersonalAllowance(history:PersonalAllowanceHistory,rates:readonly LearnedRate[],expectedRevision:number,change:PersonalAllowanceChange,authority?:{raw:string|null;reviewedTimeline:true}):PersonalAllowanceHistory|null {
 try{
  if(!parsePersonalAllowanceHistory(JSON.stringify(history),history.ownerId)||history.revision!==expectedRevision||history.revision>=Number.MAX_SAFE_INTEGER||!categories.includes(change.category)||typeof change.active!=='boolean')return null;
  let timeline:PersonalAllowanceTimelineHistory;
  if(history.schema===1){
   if(authority?.reviewedTimeline!==true)return null;
   if(authority.raw===null){if(history.revision!==0||history.events.length)return null;}
   else {const original=parseLegacy(authority.raw,history.ownerId);if(!original||JSON.stringify(original)!==JSON.stringify(history))return null;}
   timeline={schema:2,ownerId:history.ownerId,revision:history.revision,legacyRaw:authority.raw,events:[]};
  }else timeline=history;
  let event:PersonalAllowanceTimelineEvent;
  const revision=history.revision+1;
  if(change.active){
   const rate=personalAllowanceSources(rates,history.ownerId).find(rate=>personalAllowanceSourceId(rate)===change.sourceId&&allowanceCategory(rate.key)===change.category);
   if(!rate||!day(change.from)||change.from<rate.effectiveFrom)return null;
   const selected=personalAllowanceAt(timeline,rates,change.category,change.from);
   if(history.schema===2&&selected.state==='active'&&selected.event.from===change.from&&selected.event.sourceId===change.sourceId)return history;
   event={revision,category:change.category,kind:'activate',sourceId:change.sourceId!,from:change.from,confirmed:true};
  }else{
   if(!personalAllowanceTimeline(timeline,change.category).length)return null;
   event={revision,category:change.category,kind:'revoke',confirmed:true};
  }
  const next:PersonalAllowanceTimelineHistory={...timeline,revision,events:[...timeline.events,event]};
  return parsePersonalAllowanceHistory(JSON.stringify(next),history.ownerId)?next:null;
 }catch{return null;}
}
