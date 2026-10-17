import {createHash} from 'node:crypto';
import {ledgerOwner,prepareFinancialWrite,validateFinancialTransition,FinancialLedgerError} from './financial-ledger.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const object=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const reject=()=>{throw new FinancialLedgerError('FINANCIAL_REVIEWED_FORECAST_REQUIRED');};
// Explicit invocation only. No roster lifecycle hook, startup task, UI effect,
// environment lookup, socket, or real-data fixture lives in this producer.
export function prepareReviewedForecastBatch({identity,source}={}){
 const ownerId=ledgerOwner(identity);
 if(!object(source)||Object.keys(source).some(key=>!['kind','ownerId','scopeId','reviewReference','ruleVersion','fingerprint','items'].includes(key))||source.kind!=='reviewed_financial_forecast'||source.ownerId!==ownerId||!id(source.scopeId)||!id(source.reviewReference)||!id(source.ruleVersion)||!/^[a-f0-9]{64}$/.test(source.fingerprint)||!Array.isArray(source.items)||source.items.length<1||source.items.length>1000)reject();
 const seen=new Set();
 // Validate the entire batch before storage sees any write. Stable scope/key
 // identify logical income; upload/revision IDs belong only to provenance.
 return source.items.map(item=>{
  if(!object(item)||Object.keys(item).some(key=>!['key','expectedRevision','record','schedule'].includes(key))||!id(item.key)||!object(item.record)||['sourceId','ownerId','id','revision','status','ruleVersion','paymentDate'].some(key=>key in item.record))reject();
  const input={record:{...item.record,sourceId:hash([source.scopeId,item.key]),ruleVersion:source.ruleVersion,status:'forecast'},expectedRevision:item.expectedRevision,idempotencyKey:hash([source.scopeId,item.key,item.record.category,item.record.currency,item.record.aggregationLevel,item.record.periodStart,item.record.periodEnd,source.fingerprint,item.expectedRevision]),sourceFingerprint:source.fingerprint,action:'capture_forecast',provenance:{kind:'roster_snapshot',reference:source.reviewReference},...(item.schedule===undefined?{}:{schedule:item.schedule})};
  const write=prepareFinancialWrite(identity,input);
  if(seen.has(write.entryId))reject();seen.add(write.entryId);return write;
 });
}
export async function captureReviewedFinancialForecast({identity,source,store}={}){
 const writes=prepareReviewedForecastBatch({identity,source});
 if(!store||typeof store.append!=='function')throw new FinancialLedgerError('FINANCIAL_STORAGE_UNAVAILABLE',503);
 const receipts=[];
 // Each append is transactional and replayable, not a claim of batch atomicity.
 // A failed batch can be retried identically: prior successes replay once.
 for(const write of writes)receipts.push(await store.append(write,validateFinancialTransition));
 return {source:'reviewed_forecast_producer',receipts};
}
