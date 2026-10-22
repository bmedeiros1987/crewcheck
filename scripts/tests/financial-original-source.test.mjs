import {prepareReviewedForecastBatch} from '../../server/financial-forecast-producer.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createFinancialOriginalSourceProvider,financialOriginalCaptureDigest,financialOriginalRecordsMatch} from '../../server/financial-original-source.mjs';
const {publicKey,privateKey}=generateKeyPairSync('ed25519'); // disposable fixture only; no configured production key
const identity={authenticated:true,role:'owner',ownerId:'synthetic-source@example.invalid'},source={kind:'reviewed_financial_forecast',ownerId:identity.ownerId,scopeId:'fixture-source',reviewReference:'fixture-review',ruleVersion:'fixture-v1',fingerprint:'a'.repeat(64),items:[{key:'meal',expectedRevision:0,record:{category:'allowance',currency:'BRL',amountMinor:9876,periodStart:'2032-12-19',periodEnd:'2032-12-19',aggregationLevel:'item',timezone:'UTC'}}]};
const time='2032-12-20T12:00:00.000Z',base={schema:1,kind:'financial_source_publication',ownerId:identity.ownerId,financialFingerprint:source.fingerprint,captureDigest:financialOriginalCaptureDigest({identity,source}),publishedAt:'2032-12-20T11:00:00.000Z'};
const signed=body=>{const bytes=Buffer.from(JSON.stringify(body));return{bytes,signature:sign(null,bytes,privateKey)};};
const read=async(document=base,options={})=>createFinancialOriginalSourceProvider({publicKey,maxSourceAgeMs:7200000,now:()=>new Date(time),loadOriginalPublication:async()=>signed(document),...options})({identity,source});
test('original signed timestamp survives read unchanged, never now or SQL time',async()=>{const result=await read();assert.equal(result.state,'available');assert.equal(result.observation.sourceAsOf,base.publishedAt);assert.notEqual(result.observation.sourceAsOf,time);assert.match(result.observation.evidenceDigest,/^[a-f0-9]{64}$/);assert.equal((await read()).observation.evidenceDigest,result.observation.evidenceDigest);});
for(const patch of [{ownerId:'other@example.invalid'},{financialFingerprint:'b'.repeat(64)},{publishedAt:time.replace('2032','2033')},{publishedAt:null},{publishedAt:'2032-12-19T00:00:00.000Z'},{kind:'pdf_creation_time'}])test('cannot promote unproven publication '+JSON.stringify(patch),async()=>assert.equal((await read({...base,...patch})).state,'unavailable'));
test('missing authority/source/policy and tampering are unavailable',async()=>{assert.equal((await read(base,{publicKey:null})).state,'unavailable');assert.equal((await read(base,{maxSourceAgeMs:null})).state,'unavailable');assert.equal((await read(base,{loadOriginalPublication:async()=>null})).state,'unavailable');assert.equal((await read(base,{loadOriginalPublication:async()=>({...signed(base),bytes:Buffer.from(JSON.stringify({...base,publishedAt:time}))})})).state,'unavailable');assert.equal((await read(base,{loadOriginalPublication:async()=>{throw Error('fixture offline');}})).state,'unavailable');});

test('signed fingerprint cannot certify changed canonical money or policy',async()=>{
 const provider=createFinancialOriginalSourceProvider({publicKey,maxSourceAgeMs:7200000,now:()=>new Date(time),loadOriginalPublication:async()=>signed(base)});
 for(const mutate of [s=>s.items[0].record.amountMinor=111111,s=>s.ruleVersion='changed',s=>s.items[0].record.currency='USD',s=>s.reviewReference='changed']){
  const changed=structuredClone(source);mutate(changed);assert.equal((await provider({identity,source:changed})).state,'unavailable');
 }
 const rebased=structuredClone(source);rebased.items[0].expectedRevision=2;assert.equal(financialOriginalCaptureDigest({identity,source:rebased}),base.captureDigest);
});

test('actual receipt payload cannot inherit unsigned payment timing',()=>{
 const write=prepareReviewedForecastBatch({identity,source})[0],record=structuredClone(write.snapshot.record),receipts=[{id:record.id,revision:record.revision}];
 assert(financialOriginalRecordsMatch({identity,source,receipts,records:[record]}));
 record.expectedPaymentDate='2032-12-29';record.expectedPaymentTimezone='UTC';
 assert.equal(financialOriginalRecordsMatch({identity,source,receipts,records:[record]}),false);
 assert.equal(financialOriginalRecordsMatch({identity,source,receipts,records:[]}),false);
});
