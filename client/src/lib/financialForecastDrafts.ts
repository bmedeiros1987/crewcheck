import {captureAuthSession} from './authClient';
import {financialRateOwner, financialRateSession} from './financialStatementLearning';
import {THIRTEENTH_RULE} from '../../../shared/financialThirteenthForecast.mjs';
import {VACATION_FORECAST_RULE} from '../../../shared/financialVacationForecast.mjs';

export type ForecastKind = 'vacation' | 'thirteenth';
type ThirteenthValues = {year:string;start:string;end:string;avos:string;amount:string;basis:'full_year_equivalent'|'annual_proportional_amount';source:string;tax:string;loan:string;advance:string};
type VacationValues = {acquisitionStart:string;acquisitionEnd:string;split:boolean;starts:[string,string];basis:'monthly_average'|'period_amount';amounts:[string,string];source:string;retentions:[string,string];consigned:[string,string];advances:[string,string]};
export type ForecastValues<K extends ForecastKind = ForecastKind> = K extends 'vacation' ? VacationValues : ThirteenthValues;
export type ForecastContext = {guard:ReturnType<typeof captureAuthSession>;session:string};
export type StoredForecast<K extends ForecastKind = ForecastKind> = {schema:1;ownerId:string;kind:K;planId:string;rule:string;revision:string;savedAt:string;values:ForecastValues<K>};
type Failure = {status:'unavailable'|'invalid'|'stale'};
export type ForecastDraftRead<K extends ForecastKind = ForecastKind> = {status:'found';record:StoredForecast<K>}|{status:'missing'}|Failure;
export type ForecastDraftSave<K extends ForecastKind = ForecastKind> = {status:'saved';record:StoredForecast<K>}|{status:'conflict'}|Failure;
export type ForecastDraftRemove = {status:'removed'|'missing'|'conflict'}|Failure;

// Explicit opt-in input drafts only. Never payroll, a reviewed source or a result.
export const FORECAST_DRAFT_PREFIX = 'crewcheck:financial-forecast:draft:v1:';
const MAX_RAW_LENGTH = 32_768;
const rules:Record<ForecastKind,string> = {vacation:VACATION_FORECAST_RULE,thirteenth:THIRTEENTH_RULE};
const fields = {
 thirteenth:['year','start','end','avos','amount','basis','source','tax','loan','advance'],
 vacation:['acquisitionStart','acquisitionEnd','split','starts','basis','amounts','source','retentions','consigned','advances'],
} as const;
type Bound = {context:ForecastContext;guard:ForecastContext['guard'];ownerId:string;session:string};
const isKind = (value:unknown):value is ForecastKind => value==='vacation'||value==='thirteenth';
const revision = (value:unknown):value is string => typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const object = (value:unknown):value is Record<string,unknown> => value!==null&&typeof value==='object'&&!Array.isArray(value);
const ownFields = (value:Record<string,unknown>, allowed:readonly string[]) => {
 const keys=Reflect.ownKeys(value);
 return keys.length===allowed.length&&keys.every(key=>typeof key==='string'&&allowed.includes(key));
};
const text = (value:unknown,max:number):value is string => typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const civil = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const dateDraft = (value:unknown):value is string => text(value,10)&&(value===''||civil(value));
const yearPlan = (value:string) => /^\d{4}$/.test(value)&&Number(value)>=1965;
function pair(value:unknown, valid:(item:unknown)=>boolean):[string,string]|null {
 if(!Array.isArray(value)||value.length!==2||!ownFields(value as unknown as Record<string,unknown>,['0','1','length']))return null;
 const first:unknown=value[0],second:unknown=value[1];
 return valid(first)&&valid(second)?[first as string,second as string]:null;
}

/** Copy only bounded input fields; confirmations and capabilities are rejected. */
function copyValues<K extends ForecastKind>(kind:K, value:unknown):ForecastValues<K>|null {
 try {
  if(!object(value)||!ownFields(value,fields[kind]))return null;
  const out:Record<string,unknown>={};
  for(const field of fields[kind]) {
   const item=value[field];
   if(field==='split') {if(typeof item!=='boolean')return null;out[field]=item;}
   else if(['starts','amounts','retentions','consigned','advances'].includes(field)) {
    const copied=pair(item,field==='starts'?dateDraft:(entry)=>text(entry,32));
    if(!copied)return null;out[field]=copied;
   } else if(field==='basis') {
    const allowed=kind==='vacation'?['monthly_average','period_amount']:['full_year_equivalent','annual_proportional_amount'];
    if(typeof item!=='string'||!allowed.includes(item))return null;out[field]=item;
   } else {
    const valid=field==='source'?text(item,256):field==='year'?text(item,4)&&/^\d*$/.test(item):field==='avos'?text(item,2)&&/^\d*$/.test(item):['start','end','acquisitionStart','acquisitionEnd'].includes(field)?dateDraft(item):text(item,32);
    if(!valid)return null;out[field]=item;
   }
  }
  return out as ForecastValues<K>;
 } catch {return null;}
}

function planFrom(kind:ForecastKind, values:ForecastValues):string|null {
 if(kind==='thirteenth') {const year=(values as ThirteenthValues).year;return yearPlan(year)?year:null;}
 const {acquisitionStart:start,acquisitionEnd:end}=values as VacationValues;
 return start&&end&&civil(start)&&civil(end)&&start<=end?start+'..'+end:null;
}
function validPlan(kind:ForecastKind, planId:unknown):planId is string {
 if(typeof planId!=='string')return false;
 if(kind==='thirteenth')return yearPlan(planId);
 const dates=planId.split('..');return dates.length===2&&civil(dates[0])&&civil(dates[1])&&dates[0]<=dates[1];
}
export function deriveForecastPlan(kind:ForecastKind, values:unknown):string|null {
 // UI identity only, never storage admission or proof that the draft is valid.
 // Read/save independently validate every input, rule, owner and current session.
 try {
  if(!isKind(kind)||!object(values))return null;
  if(kind==='thirteenth') {const year=values.year;return typeof year==='string'&&yearPlan(year)?year:null;}
  const start=values.acquisitionStart,end=values.acquisitionEnd;
  return typeof start==='string'&&typeof end==='string'&&civil(start)&&civil(end)&&start<=end?start+'..'+end:null;
 } catch {return null;}
}
const ownerPrefix = (owner:string) => FORECAST_DRAFT_PREFIX+encodeURIComponent(owner)+':';
const prefix = (owner:string,kind:ForecastKind) => ownerPrefix(owner)+kind+':';
const key = (owner:string,kind:ForecastKind,planId:string) => prefix(owner,kind)+encodeURIComponent(planId);

function live(bound:Bound):boolean {
 try {
  if(bound.context.guard!==bound.guard||bound.context.session!==bound.session||!bound.guard.token||!bound.guard.isCurrent())return false;
  const owner=financialRateOwner(),session=financialRateSession();
  return owner===bound.ownerId&&session===bound.session&&bound.guard.owner===bound.ownerId.trim().toLowerCase()
   &&bound.context.guard===bound.guard&&bound.context.session===bound.session&&bound.guard.isCurrent();
 } catch {return false;}
}
function bind(context:ForecastContext):Bound|null {
 try {
  const guard=context.guard,session=context.session,ownerId=financialRateOwner();
  if(!ownerId||typeof session!=='string'||!session||!guard)return null;
  const bound={context,guard,ownerId,session};return live(bound)?bound:null;
 } catch {return null;}
}
function storageFor(bound:Bound):{status:'available';store:Storage}|Failure {
 if(!live(bound))return {status:'stale'};
 try {const store=globalThis.localStorage;return live(bound)?{status:'available',store}:{status:'stale'};}
 catch {return {status:live(bound)?'unavailable':'stale'};}
}
function recordFrom<K extends ForecastKind>(value:unknown,kind:K,planId:string,ownerId:string):StoredForecast<K>|null {
 try {
  if(!object(value)||!ownFields(value,['schema','ownerId','kind','planId','rule','revision','savedAt','values'])||value.schema!==1||value.ownerId!==ownerId||value.kind!==kind||value.planId!==planId||value.rule!==rules[kind])return null;
  if(!revision(value.revision)||typeof value.savedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.savedAt)||!Number.isFinite(Date.parse(value.savedAt))||new Date(value.savedAt).toISOString()!==value.savedAt)return null;
  const values=copyValues(kind,value.values);
  if(!values||planFrom(kind,values)!==planId)return null;
  return {schema:1,ownerId,kind,planId,rule:rules[kind],revision:value.revision,savedAt:value.savedAt,values};
 } catch {return null;}
}
function readBound<K extends ForecastKind>(kind:K,planId:string,bound:Bound,store:Storage):ForecastDraftRead<K> {
 if(!live(bound))return {status:'stale'};
 let raw:string|null;
 try {
  raw=store.getItem(key(bound.ownerId,kind,planId));
  if(!live(bound))return {status:'stale'};
 } catch {return {status:live(bound)?'unavailable':'stale'};}
 if(raw===null)return {status:'missing'};
 if(typeof raw!=='string'||raw.length>MAX_RAW_LENGTH)return {status:'invalid'};
 try {
  const parsed:unknown=JSON.parse(raw);
  if(!live(bound))return {status:'stale'};
  const record=recordFrom(parsed,kind,planId,bound.ownerId);
  if(!live(bound))return {status:'stale'};
  return record?{status:'found',record}:{status:'invalid'};
 } catch {return {status:live(bound)?'invalid':'stale'};}
}
export function readForecastDraft<K extends ForecastKind>(kind:K,planId:string,context:ForecastContext):ForecastDraftRead<K> {
 const bound=bind(context);if(!bound)return {status:'stale'};
 if(!isKind(kind)||!validPlan(kind,planId))return {status:'invalid'};
 const storage=storageFor(bound);return storage.status==='available'?readBound(kind,planId,bound,storage.store):storage;
}
function namesFor(bound:Bound,kind:ForecastKind,store:Storage):string[]|Failure {
 try {
  const count=store.length,names:string[]=[];
  if(!live(bound))return {status:'stale'};
  if(!Number.isSafeInteger(count)||count<0)return {status:'unavailable'};
  for(let i=0;i<count;i++) {
   const name=store.key(i);if(!live(bound))return {status:'stale'};
   if(typeof name==='string'&&name.startsWith(prefix(bound.ownerId,kind)))names.push(name);
  }
  if(store.length!==count||!live(bound))return {status:'stale'};
  return [...new Set(names)].sort();
 } catch {return {status:live(bound)?'unavailable':'stale'};}
}
export function readLatestForecastDraft<K extends ForecastKind>(kind:K,context:ForecastContext):ForecastDraftRead<K> {
 const bound=bind(context);if(!bound)return {status:'stale'};
 if(!isKind(kind))return {status:'invalid'};
 const storage=storageFor(bound);if(storage.status!=='available')return storage;
 const names=namesFor(bound,kind,storage.store);if(!Array.isArray(names))return names;
 const records:StoredForecast<K>[]=[];
 for(const name of names) {
  let planId:string;try {planId=decodeURIComponent(name.slice(prefix(bound.ownerId,kind).length));}catch{return {status:'invalid'};}
  if(!validPlan(kind,planId)||name!==key(bound.ownerId,kind,planId))return {status:'invalid'};
  const result=readBound(kind,planId,bound,storage.store);
  if(result.status!=='found')return result.status==='missing'?{status:'stale'}:result;
  records.push(result.record);
 }
 const after=namesFor(bound,kind,storage.store);
 if(!Array.isArray(after))return after;
 if(names.length!==after.length||names.some((name,i)=>name!==after[i]))return {status:'stale'};
 records.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
 if(records.length>1&&records[0].savedAt===records[1].savedAt)return {status:'invalid'};
 return !live(bound)?{status:'stale'}:records.length?{status:'found',record:records[0]}:{status:'missing'};
}

/** Call only after confirmed account deletion, using the owner of the request. */
export async function eraseDeletedOwnerForecastDrafts(owner:string|null|undefined):Promise<boolean> {
 if(typeof owner!=='string'||!owner.trim())return false;
 try {
  const store=globalThis.localStorage;
  const vacationPrefix=prefix(owner,'vacation'),thirteenthPrefix=prefix(owner,'thirteenth');
  const ownNames=()=>{
   const names:string[]=[];
   const count=store.length;
   for(let i=0;i<count;i++){
    const name=store.key(i);
    if(name&&(name.startsWith(vacationPrefix)||name.startsWith(thirteenthPrefix)))names.push(name);
   }
   return names;
  };
  const erase=()=>{
   for(const name of ownNames())store.removeItem(name);
   return ownNames().length===0;
  };
  const locks=globalThis.navigator?.locks;
  // Draft writers also use the owner lock. Readers and other accounts remain independent.
  return typeof locks?.request==='function'?await locks.request(ownerPrefix(owner),{mode:'exclusive'},erase):erase();
 } catch {return false;}
}

async function locked<T>(bound:Bound,operation:()=>T):Promise<T|Failure> {
 try {
  if(!live(bound))return {status:'stale'};
  const locks=globalThis.navigator?.locks;
  if(!live(bound))return {status:'stale'};
  const randomUUID=globalThis.crypto?.randomUUID;
  if(!live(bound))return {status:'stale'};
  if(!locks||typeof locks.request!=='function'||typeof randomUUID!=='function')return {status:'unavailable'};
  const result=await locks.request(ownerPrefix(bound.ownerId),{mode:'exclusive'},()=>live(bound)?operation():{status:'stale' as const});
  return live(bound)?result:{status:'stale'};
 } catch {return {status:live(bound)?'unavailable':'stale'};}
}
export async function saveForecastDraft<K extends ForecastKind>(kind:K,values:unknown,expectedRevision:string|null,context:ForecastContext):Promise<ForecastDraftSave<K>> {
 const bound=bind(context);if(!bound)return {status:'stale'};
 if(!isKind(kind)||(expectedRevision!==null&&!revision(expectedRevision)))return {status:'invalid'};
 const copied=copyValues(kind,values);
 if(!live(bound))return {status:'stale'};
 const planId=copied?planFrom(kind,copied):null;if(!copied||!planId)return {status:'invalid'};
 return locked(bound,()=>{
  const storage=storageFor(bound);if(storage.status!=='available')return storage;
  const current=readBound(kind,planId,bound,storage.store);
  if(!['found','missing'].includes(current.status))return current as Failure;
  const currentRevision=current.status==='found'?current.record.revision:null;
  if(currentRevision!==expectedRevision)return {status:'conflict' as const};
  let nextRevision:string;
  try {nextRevision=globalThis.crypto.randomUUID();}catch{return {status:live(bound)?'unavailable' as const:'stale' as const};}
  if(!live(bound))return {status:'stale' as const};
  if(!revision(nextRevision)||nextRevision===currentRevision)return {status:'unavailable' as const};
  // An opaque data version, never an authentication capability. Fresh recreation
  // cannot reuse a deleted revision; deletion retains no tombstone or values.
  const record:StoredForecast<K>={schema:1,ownerId:bound.ownerId,kind,planId,rule:rules[kind],revision:nextRevision,savedAt:new Date().toISOString(),values:copied};
  let raw:string;try {raw=JSON.stringify(record);}catch{return {status:live(bound)?'invalid' as const:'stale' as const};}
  if(!live(bound))return {status:'stale' as const};
  if(raw.length>MAX_RAW_LENGTH)return {status:'invalid' as const};
  try {
   const slot=key(bound.ownerId,kind,planId);
   storage.store.setItem(slot,raw);if(!live(bound))return {status:'stale' as const};
   const confirmed=storage.store.getItem(slot);if(!live(bound))return {status:'stale' as const};
   return confirmed===raw?{status:'saved' as const,record}:{status:'unavailable' as const};
  } catch {return {status:live(bound)?'unavailable' as const:'stale' as const};}
 });
}
export async function removeForecastDraft(kind:ForecastKind,planId:string,expectedRevision:string|null,context:ForecastContext):Promise<ForecastDraftRemove> {
 const bound=bind(context);if(!bound)return {status:'stale'};
 if(!isKind(kind)||!validPlan(kind,planId)||!revision(expectedRevision))return {status:'invalid'};
 return locked(bound,()=>{
  const storage=storageFor(bound);if(storage.status!=='available')return storage;
  const current=readBound(kind,planId,bound,storage.store);
  if(current.status!=='found')return current;
  if(current.record.revision!==expectedRevision)return {status:'conflict' as const};
  try {
   const slot=key(bound.ownerId,kind,planId);if(!live(bound))return {status:'stale' as const};
   storage.store.removeItem(slot);if(!live(bound))return {status:'stale' as const};
   const confirmed=storage.store.getItem(slot);if(!live(bound))return {status:'stale' as const};
   return {status:confirmed===null?'removed' as const:'unavailable' as const};
  } catch {return {status:live(bound)?'unavailable' as const:'stale' as const};}
 });
}
