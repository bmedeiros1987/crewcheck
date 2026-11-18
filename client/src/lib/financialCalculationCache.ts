import {financialCalculationDigest} from './financialCalculationDigest';
/** Device-local disposable calculation cache. Never a ledger, reviewed statement or payment proof. */
export const FINANCIAL_CACHE_PREFIX='crewcheck_financial_calculation_cache_v1:';
export type CalculationContext={owner:string;session:string;period:string;scope:string;version:string;signature:string};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>&Partial<Pick<Storage,'length'|'key'>>;
type Envelope={schema:1;owner:string;period:string;scope:string;version:string;signature:string;checksum:string;value:unknown};
const MAX_BYTES=128_000,MAX_MEMORY=12,MAX_TOTAL_BYTES=1_000_000;
// Tagged tuples preserve unknown numbers, dates and undefined without conflating them with null/zero.
function pack(value:any,seen=new Set<object>(),canonical=false):any {
 if(value===undefined)return ['u'];
 if(typeof value==='number')return ['n',Number.isNaN(value)?'NaN':value===Infinity?'Infinity':value===-Infinity?'-Infinity':value];
 if(value===null||typeof value==='string'||typeof value==='boolean')return ['p',value];
 if(value instanceof Date)return ['d',value.toISOString()];
 if(typeof value!=='object'||seen.has(value))throw Error('unsupported cache value');
 if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('unsupported cache object');
 seen.add(value);const result=Array.isArray(value)?['a',value.map(x=>pack(x,seen,canonical))]:['o',(canonical?Object.keys(value).sort():Object.keys(value)).map(k=>[k,pack(value[k],seen,canonical)])];seen.delete(value);return result;
}
function unpack(value:any,depth=0):any {
 if(depth>80||!Array.isArray(value))throw Error('invalid cache');
 const [kind,data]=value;
 if(kind==='u'&&value.length===1)return undefined;
 if(value.length!==2)throw Error('invalid cache');
 if(kind==='p'&&(data===null||typeof data==='string'||typeof data==='boolean'))return data;
 if(kind==='n'){if(typeof data==='number'&&Number.isFinite(data))return data;if(data==='NaN')return NaN;if(data==='Infinity')return Infinity;if(data==='-Infinity')return -Infinity;}
 if(kind==='d'&&typeof data==='string'){const date=new Date(data);if(Number.isFinite(+date)&&date.toISOString()===data)return date;}
 if(kind==='a'&&Array.isArray(data))return data.map(x=>unpack(x,depth+1));
 if(kind==='o'&&Array.isArray(data)){const entries=data.map((pair:any)=>{if(!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string')throw Error('invalid cache');return [pair[0],unpack(pair[1],depth+1)];});if(new Set(entries.map((x:any)=>x[0])).size!==entries.length)throw Error('invalid cache');return Object.fromEntries(entries);}
 throw Error('invalid cache');
}
export function financialInputSignature(value:unknown){return financialCalculationDigest(JSON.stringify(pack(value,new Set(),true)));}
const valid=(c:CalculationContext|null):c is CalculationContext=>Boolean(c?.owner&&c.session&&/^\d{4}-(0[1-9]|1[0-2])$/.test(c.period)&&Number(c.period.slice(0,4))>=2000&&Number(c.period.slice(0,4))<=2200&&c.scope&&c.version&&c.signature);
const same=(a:CalculationContext,b:CalculationContext)=>a.owner===b.owner&&a.session===b.session&&a.period===b.period&&a.scope===b.scope&&a.version===b.version&&a.signature===b.signature;
const key=(c:CalculationContext)=>FINANCIAL_CACHE_PREFIX+encodeURIComponent(c.owner)+':'+c.period+':'+encodeURIComponent(c.scope);
export function createFinancialCalculationCache(){
 const memory=new Map<string,{context:CalculationContext;value:any}>();let session='';
 return {
 clear(){memory.clear();session='';},
 read<T>(current:()=>CalculationContext|null,calculate:()=>T,storage?:Store,accept:(value:any)=>boolean=()=>true):{value:T;state:'memory'|'saved'|'calculated'|'not_saved'|'changed'} {
  let context:CalculationContext|null=null;try{context=current();}catch{}
  if(!valid(context))return {value:calculate(),state:'not_saved'};
  if(session!==context.session){memory.clear();session=context.session;}
  const slot=key(context),cached=memory.get(slot);
  const live=()=>{try{const next=current();return valid(next)&&same(context!,next);}catch{return false;}};
  if(cached&&same(context,cached.context)&&live())return {value:unpack(pack(cached.value)),state:'memory'};
  try{
   const raw=storage?.getItem(slot);
   if(raw&&raw.length<=MAX_BYTES){const entry:Envelope=JSON.parse(raw);
    if(entry.schema===1&&entry.owner===context.owner&&entry.period===context.period&&entry.scope===context.scope&&entry.version===context.version&&entry.signature===context.signature&&live()){
     if(entry.checksum!==financialCalculationDigest(JSON.stringify(entry.value)))throw Error('corrupt cache');const value=unpack(entry.value);if(!accept(value))throw Error('invalid result');memory.set(slot,{context,value});if(memory.size>MAX_MEMORY)memory.delete(memory.keys().next().value!);return {value:unpack(pack(value)),state:'saved'};
    }
   }
  }catch{/* Corruption, blocked storage or unsupported cache falls back to the real calculator. */}
  const value=calculate();
  if(!live())throw Error('FINANCIAL_CALCULATION_CONTEXT_CHANGED');
  try{
   const packed=pack(value),entry:Envelope={schema:1,owner:context.owner,period:context.period,scope:context.scope,version:context.version,signature:context.signature,checksum:financialCalculationDigest(JSON.stringify(packed)),value:packed};
   memory.set(slot,{context,value:unpack(packed)});if(memory.size>MAX_MEMORY)memory.delete(memory.keys().next().value!);
   const raw=JSON.stringify(entry);if(!storage||raw.length>MAX_BYTES)return {value,state:'not_saved'};
   // One atomic localStorage replacement. Other tabs may overwrite the disposable slot;
   // exact dependency matching prevents an older computation from becoming current.
   if(typeof storage.length==='number'&&storage.key){let bytes=raw.length*2;for(let i=0;i<storage.length;i++){const other=storage.key(i);if(other&&other!==slot&&other.startsWith(FINANCIAL_CACHE_PREFIX))bytes+=(storage.getItem(other)?.length||0)*2;}if(bytes>MAX_TOTAL_BYTES)return {value,state:'not_saved'};}
   storage.setItem(slot,raw);if(!live())throw Error('FINANCIAL_CALCULATION_CONTEXT_CHANGED');
   return {value,state:storage.getItem(slot)===raw?'calculated':'not_saved'};
  }catch{if(!live())throw Error('FINANCIAL_CALCULATION_CONTEXT_CHANGED');return {value,state:'not_saved'};}
 }
 };
}

/** Successful account deletion only: erase this owner's disposable entries, never another account/history. */
export function eraseFinancialCalculationCache(owner:string,storage:Store):boolean {
 if(!owner||typeof storage.length!=='number'||!storage.key)return false;
 try{const prefix=FINANCIAL_CACHE_PREFIX+encodeURIComponent(owner)+':',keys:string[]=[];for(let i=0;i<storage.length;i++){const candidate=storage.key(i);if(candidate?.startsWith(prefix))keys.push(candidate);}for(const candidate of keys)storage.removeItem(candidate);return keys.every(candidate=>storage.getItem(candidate)===null);}catch{return false;}
}
