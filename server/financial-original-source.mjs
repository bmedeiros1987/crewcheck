import {createHash,verify} from 'node:crypto';
import {prepareReviewedForecastBatch} from './financial-forecast-producer.mjs';
const unavailable=reason=>({state:'unavailable',reason});
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const hash=value=>createHash('sha256').update(value).digest('hex');
// Commit the validated canonical semantic payload, excluding only storage revision
// counters. A caller-supplied fingerprint alone is not evidence of the amounts.
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export function financialOriginalCaptureDigest({identity,source}){
 const payload=prepareReviewedForecastBatch({identity,source}).map(write=>{
  const {id,revision,...record}=write.snapshot.record;
  return {entryId:write.entryId,...write.snapshot,record};
 }).sort((a,b)=>a.entryId.localeCompare(b.entryId));
 return hash(JSON.stringify(stable(payload)));
}
// Transitions may preserve prior payment timing. Only certify receipts whose
// persisted semantic record exactly matches the signed canonical input.
export function financialOriginalRecordsMatch({identity,source,receipts,records}){
 const strip=({id,revision,...record})=>stable(record);
 const writes=prepareReviewedForecastBatch({identity,source});
 return writes.length===receipts?.length&&writes.every(write=>{
  const receipt=receipts.find(r=>r.id===write.entryId),matches=records.filter(r=>r.id===receipt?.id&&r.revision===receipt?.revision);
  return matches.length===1&&JSON.stringify(strip(matches[0]))===JSON.stringify(strip(write.snapshot.record));
 });
}
// No live employer adapter currently proves a global publication timestamp.
// A signed original can be verified by this concrete adapter when supplied by
// a trusted existing ingestion host. Browser fields/PDF creation time/SQL time
// are never promoted to original publication evidence. No key is configured here.
export function createFinancialOriginalSourceProvider({loadOriginalPublication=async()=>null,publicKey=null,maxSourceAgeMs=null,now=()=>new Date()}={}){
 return async function originalEvidence({identity,source}){
  if(!publicKey)return unavailable('original_publication_authority_unconfigured');
  if(!Number.isSafeInteger(maxSourceAgeMs)||maxSourceAgeMs<=0||maxSourceAgeMs>86400000)return unavailable('original_publication_policy_unconfigured');
  try{
   const original=await loadOriginalPublication(identity,source.fingerprint);
   if(!original||!(original.bytes instanceof Uint8Array)||original.bytes.length>1048576||!(original.signature instanceof Uint8Array))return unavailable('original_publication_missing');
   const bytes=Buffer.from(original.bytes),signature=Buffer.from(original.signature);
   if(!verify(null,bytes,publicKey,signature))return unavailable('original_publication_unverified');
   const document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),time=now().getTime();
   if(document?.schema!==1||document.kind!=='financial_source_publication'||document.ownerId!==identity.ownerId||document.financialFingerprint!==source.fingerprint
    ||document.captureDigest!==financialOriginalCaptureDigest({identity,source})
    ||!iso(document.publishedAt)||!Number.isFinite(time)||Date.parse(document.publishedAt)>time)return unavailable('original_publication_mismatch');
   if(time-Date.parse(document.publishedAt)>maxSourceAgeMs)return unavailable('original_publication_stale');
   return {state:'available',validUntil:new Date(Date.parse(document.publishedAt)+maxSourceAgeMs).toISOString(),observation:{kind:'published_source_timestamp',sourceFingerprint:source.fingerprint,sourceAsOf:document.publishedAt,evidenceDigest:hash(Buffer.concat([bytes,signature]))}};
  }catch{return unavailable('original_publication_unavailable');}
 };
}
