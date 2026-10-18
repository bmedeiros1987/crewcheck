import fs from 'node:fs';
import assert from 'node:assert/strict';
import {asaasEnvelope,receiveAsaasEvent,asaasInboxSummary} from '../server/asaas-webhook-inbox.mjs';
import {createAsaasMemory} from './fixtures/asaas-inbox-memory.mjs';
globalThis.fetch=()=>{throw Error('External network forbidden in Asaas HTTP fixtures');};
const source=fs.readFileSync('server/platform.mjs','utf8');
const begin=source.indexOf('async function handleAsaasWebhook('),end=source.indexOf('\nasync function handleGoogleRtdn(',begin);assert(begin>0&&end>begin);
let fixture=createAsaasMemory(),identity={},poolReads=0,bodyReads=0,dbAvailable=true;
const sendJson=(res,status,body)=>Object.assign(res,{status,body});
const {webhook,admin}=new Function('env','safeEqual','readBody','pool','sendJson','asaasEnvelope','receiveAsaasEvent','asaasInboxSummary','mainIdentity',source.slice(begin,end)+';return {webhook:handleAsaasWebhook,admin:handleAdminAsaasInbox};')(
  ()=> 'synthetic-hook',(a,b)=>a===b,async req=>{bodyReads++;return req.body;},async()=>{poolReads++;return dbAvailable?fixture.db:null;},sendJson,asaasEnvelope,receiveAsaasEvent,asaasInboxSummary,()=>identity);
const call=async(handler,req)=>{const res={};await handler(req,res);return res;};
const event={id:'evt_synthetic_http',event:'PAYMENT_CONFIRMED',dateCreated:'2026-10-09 14:54:00',payment:{id:'pay_synthetic',subscription:'sub_synthetic',status:'CONFIRMED',confirmedDate:'2026-10-09'}};
const req={method:'POST',headers:{'asaas-access-token':'synthetic-hook'},body:event};
assert.equal((await call(webhook,{...req,method:'GET'})).status,405);
assert.equal((await call(webhook,{...req,headers:{}})).status,403);assert.equal(poolReads,0);assert.equal(bodyReads,0);
assert.equal((await call(webhook,{...req,body:{}})).status,400);assert.equal(poolReads,0);
dbAvailable=false;assert.equal((await call(webhook,req)).status,503);dbAvailable=true;
const orphan=await call(webhook,req);assert.equal(orphan.status,200);assert.equal(orphan.body.reconciled,false);assert.equal(orphan.body.disposition,'quarantined');
fixture={db:{async connect(){throw Error('synthetic migration missing');}}};assert.equal((await call(webhook,req)).status,503);
const before=poolReads;
for(const test of [{authenticated:false},{authenticated:true,admin:true},{authenticated:true,admin:true,token:{aud:'crewcheck-visitor'}},{authenticated:true,admin:true,role:'visitor',token:{}},{authenticated:true,admin:false,token:{}}]){identity=test;assert([401,403].includes((await call(admin,{method:'GET'})).status));}
assert.equal(poolReads,before,'unauthorized diagnostic never touches database');
identity={authenticated:true,admin:true,token:{}};
assert.equal((await call(admin,{method:'POST'})).status,405);
let summaryQueries=0;fixture={db:{async query(sql){summaryQueries++;assert.equal(/INSERT|UPDATE|DELETE|payload|event_id|subscription_ref/i.test(sql),false);return{rows:[{disposition:'quarantined',reason:'subscription_not_reconciled',count:1,oldestReceivedAt:'2026-10-09 14:54:00'}]};}}};
const summary=await call(admin,{method:'GET'});assert.equal(summary.status,200);assert.equal(summary.body.automaticReplay,false);assert.equal(summaryQueries,1);
assert(source.includes("url.pathname === '/api/platform/admin/diagnostics/asaas-webhooks'"));
assert(source.includes('DELETE FROM crewcheck_asaas_webhook_inbox WHERE subscription_ref=$1'));
// Exercise the real exported dispatcher too, not merely the extracted private wrapper.
for(const name of ['DATABASE_URL','CREWCHECK_DATABASE_URL','MYSQL_URL'])delete process.env[name];
process.env.ASAAS_WEBHOOK_TOKEN='synthetic-hook';process.env.NODE_ENV='test';process.env.CREWCHECK_AUTH_SECRET='synthetic-secret';
const {handlePlatformRoute}=await import('../server/platform.mjs');
for(const path of ['/api/platform/billing/asaas/webhook',...(source.includes('const asaasWebhookAlias =')?['/api/webhooks/asaas']:[])]){
  for(const [method,expected] of [['GET',405],['POST',403]]){
    const res={headers:{},setHeader(key,value){this.headers[key]=value;},writeHead(status){this.status=status;},end(text){this.body=JSON.parse(text);}};
    assert.equal(await handlePlatformRoute({method,headers:{},on(){throw Error('Unauthorized request must not read body');}},res,new URL('https://example.test'+path)),true);
    assert.equal(res.status,expected);
    if(method==='GET'&&path.startsWith('/api/platform/'))assert.equal(res.headers.Allow,'POST');
  }
}
console.log('PASS actual Asaas HTTP wrapper: method/token/body-before-DB, durable/quarantine vs503, admin-only aggregate read and scoped erasure.');
