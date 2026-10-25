import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {fixture,sender,epoch,secrets} from './infobip-production-sql.mjs';
import {createPromotionalGrantWriter,promotionalGrantManifest} from '../../server/concierge-promotional-credit-sql.mjs';
import {finiteCohortManifest,finiteCohortMemberId,finiteCohortTariffKey,createFiniteCohortPrefunder} from '../../server/concierge-finite-reserve-off.mjs';
import {createInfobipProductionStore} from '../../server/infobip-whatsapp-store.mjs';
import {createInfobipInboundReceiver} from '../../server/infobip-whatsapp-candidate.mjs';
import {createInfobipFiniteBetaScope} from '../../server/infobip-whatsapp-finite-beta.mjs';
import {createInfobipSqlBudget} from '../../server/infobip-whatsapp-sql-budget.mjs';
import {configureWhatsAppConcierge} from '../../server/whatsapp.mjs';
import {isConciergeConversationWritesOnly} from '../../server/concierge-read-only-scope.mjs';
import {sharedCreditKey as key} from '../../server/concierge-shared-credit-candidate.mjs';
export {sender,epoch,secrets};
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const phoneHash=phone=>createHmac('sha256',secrets.linkHashKey).update(phone).digest('hex');
export const programId='crewcheck-concierge-shared-budget-v1';
export const ownerId=index=>'synthetic-cohort-owner-'+index;
export const ownerEmail=index=>'cohort-'+index+'@synthetic.invalid';

export function cohortPolicy(count=2){
 const members=Array.from({length:count},(_,i)=>{
  const ownerAccountKey=hash(ownerId(i)),perAttemptMicroUsd=12000+i*1000,recipient=String(12025551001+i);
  const grant={version:1,approvalId:'synthetic-cohort-original-grant-'+i,programId,ownerAccountKey,
   amountMicroUsd:perAttemptMicroUsd*2,validFrom:epoch,validUntil:epoch+86400000,monthlyBudgetMicroUsd:20000000};
  const bindingHash=phoneHash(JSON.stringify([ownerId(i),JSON.stringify(['2032-01-01 12:00:00.000','2032-01-01 12:00:00.000']),'infobip',sender,recipient]));
  return {ownerAccountKey,recipient,recipientHash:phoneHash(recipient),bindingHash,grant,grantManifest:promotionalGrantManifest(grant),
   totalMicroUsd:grant.amountMicroUsd,perAttemptMicroUsd,maxAttempts:2,
   observedTariff:{evidenceSha256:hash('synthetic-tariff-'+i),sourceId:'synthetic-account-price-'+i,observedAt:epoch,
    validUntil:epoch+6*3600000,observedUnitMicroUsd:8000+i*1000,setupMicroUsd:1000,markupMicroUsd:1000}};
 });
 return {v:2,basis:'explicit-risk-cohort',residualRiskAccepted:true,riskDisclosureVersion:'provisional-provider-cost-v1',
  approvalId:'synthetic-cohort-risk-approval',evidenceReference:'synthetic-private-cohort-consent',programId,sender,
  approvedAt:epoch,validFrom:epoch,validUntil:epoch+6*3600000,monthlyBudgetMicroUsd:20000000,
  totalMicroUsd:members.reduce((sum,m)=>sum+m.totalMicroUsd,0),maxAttempts:members.reduce((sum,m)=>sum+m.maxAttempts,0),
  observedBudget:{evidenceSha256:hash('synthetic-billing'),observedAt:epoch,knownSpentMicroUsd:10000,
   initialReservedMicroUsd:24000,outsideConsumersReserveMicroUsd:100000},members};
}

// Ingress-only staging for explicit-dispatch tests. A no-op scheduler does NOT
// disable the HTTP runtime's direct tick. Reuse the production owner/admission
// and authenticated receiver contracts, without binding that auto-dispatch loop.
// Engine/send capabilities are forbidden here; no SQL result is substituted.
export function createCohortIngressReceiver({configuration,admission,db,now}){
 const scope=createInfobipFiniteBetaScope(configuration,admission,{now});
 const forbidden=()=>assert.fail('INGRESS_STAGING_MUST_NOT_DISPATCH');
 const store=createInfobipProductionStore({db,sender:configuration.sender,
  encryptionKey:secrets.encryptionKey,linkHashKey:secrets.linkHashKey,now},
  {concierge:forbidden,send:forbidden,allowsOwner:scope.allowsOwner,admission:scope.createAdmission(secrets.linkHashKey)});
 return createInfobipInboundReceiver({sender:configuration.sender,
  authentication:{mode:'hmac-sha256',secretKey:secrets.webhookSecret},store,now,
  acceptEvent:scope.acceptEvent,queueLinkConfirmation:false});
}

// Extend the existing serial synthetic transaction fixture only for distinct
// canonical links/profiles. It is NOT an InnoDB lock/concurrency substitute.
export async function cohortFixture({count=2,fund=true,grant=true,policy=cohortPolicy(count)}={}){
 const {state,db}=fixture(),p=structuredClone(policy),approved=structuredClone(p);let engines=0,sends=0,engineEffect=()=>{},sqlEffect=()=>{};
 const calls=[];let commitFailure=null,activeTransaction=null;
 let requestEffect=async message=>new Response(JSON.stringify({to:message.to,messageId:message.messageId,
  status:{groupId:1,groupName:'PENDING',id:26,name:'PENDING_ACCEPTED'}}));
 state.links=new Map(p.members.map((m,i)=>[m.recipientHash,{email:ownerEmail(i),phone_hash:m.recipientHash,phone_last4:m.recipient.slice(-4),
  consent_concierge:1,consent_alerts:0,revoked_at:null,linked_at:'2032-01-01 12:00:00.000',updated_at:'2032-01-01 12:00:00.000'}]));
 state.profiles=new Map(p.members.map((_m,i)=>[ownerEmail(i),{email:ownerEmail(i),public_id:ownerId(i),plan:'free'}]));
 state.subscriptions=new Map(p.members.map((_m,i)=>[ownerEmail(i),{email:ownerEmail(i),plan:'premium_monthly',status:'active',current_period_end:new Date(epoch+86400000),provider:'synthetic',product_id:null,cancel_at_period_end:0}]));
 const acquire=db.getConnection.bind(db);
 db.getConnection=async()=>{
  const c=await acquire(),query=c.query.bind(c),commit=c.commit.bind(c),begin=c.beginTransaction.bind(c),release=c.release.bind(c),destroy=c.destroy.bind(c);
  let finish,completion;
  c.beginTransaction=async()=>{await begin();completion=new Promise(resolve=>finish=resolve);activeTransaction=completion;};
  const finished=()=>{finish?.();if(activeTransaction===completion)activeTransaction=null;};
  c.release=()=>{release();finished();};c.destroy=()=>{destroy();finished();};
  c.query=async(sql,args=[])=>{
   let result;
   if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'){state.queries.push(sql);result=[[]];}
   else if(sql.startsWith('SELECT * FROM crewcheck_platform_profiles')){state.queries.push(sql);const row=state.profiles.get(args[0]);result=[row?[structuredClone(row)]:[]];}
   else if(sql.startsWith('SELECT * FROM crewcheck_platform_subscriptions')){state.queries.push(sql);const row=state.subscriptions.get(args[0]);result=[row?[structuredClone(row)]:[]];}
   else if(sql.includes('information_schema.')&&args?.includes('crewcheck_platform_subscriptions')){
    state.queries.push(sql);
    if(sql.includes('.TABLES'))result=[state.paidSchemaMissing?[]:[{name:'crewcheck_platform_subscriptions',engine:'InnoDB'}]];
    else if(sql.includes('.COLUMNS'))result=[[{name:'crewcheck_platform_profiles',column_name:'plan'},...['email','plan','status','current_period_end','provider','product_id','cancel_at_period_end'].map(column_name=>({name:'crewcheck_platform_subscriptions',column_name}))].filter(row=>!state.paidColumnMissing||row.column_name!=='plan')];
    else result=[state.paidIndexMissing?[]:[{name:'crewcheck_platform_subscriptions',index_name:'PRIMARY',column_name:'email',non_unique:0,sequence_no:1,sub_part:null}]];
   }
   else if(sql.startsWith('SELECT email,consent_concierge')){state.queries.push(sql);const row=state.links.get(args[0]);result=[row?[structuredClone(row)]:[]];}
   else if(sql.startsWith('SELECT public_id')){
    state.queries.push(sql);const byPublic=sql.includes('BINARY public_id=BINARY ?');
    if(sql.includes('=? AND BINARY ')){assert.equal(args.length,2);assert.equal(args[0],args[1],'indexed and byte-exact parameters must identify the same row');}
    result=[[...state.profiles.values()].filter(row=>(byPublic?row.public_id:row.email)===args[0]).map(row=>({public_id:row.public_id}))];
   }else result=await query(sql,args);
   await sqlEffect(sql,args,result);return result;
  };
  c.commit=async()=>{
   if(commitFailure==='before-any'){commitFailure=null;throw Error('SYNTHETIC_COMMIT_NOT_APPLIED');}
   if(sends&&commitFailure==='before'){commitFailure=null;throw Error('SYNTHETIC_FINAL_COMMIT_NOT_APPLIED');}
   await commit();if(commitFailure==='after-any'){commitFailure=null;throw Error('SYNTHETIC_COMMIT_ACK_LOST');}
   if(sends&&commitFailure==='after'){commitFailure=null;throw Error('SYNTHETIC_FINAL_COMMIT_ACK_LOST');}
  };
  return c;
 };
 const transaction=createInfobipSqlBudget(db,{repeatableRead:true}),globalKey=key('global',[p.programId,'2032-01']);
 const accountKey=m=>key('account',[p.programId,m.ownerAccountKey]);
 const authorityKey=m=>key('grant-authorization',[m.grant.approvalId]);
 const receiptKey=m=>key('grant-receipt',[m.grant.approvalId]);
 const cohortAuthorityKey=key('finite-reserve-authorization',[p.approvalId]);
 state.rows.set(globalKey,{v:1,kind:'global-credit',period:'2032-01',budgetMicroUsd:20000000,
  knownSpentMicroUsd:p.observedBudget.knownSpentMicroUsd,reservedMicroUsd:p.observedBudget.initialReservedMicroUsd,
  reconciled:true,reconciledAt:epoch,billingEvidenceSha256:p.observedBudget.evidenceSha256,promotionalAllocatedMicroUsd:0});
 state.rows.set(cohortAuthorityKey,{v:2,kind:'finite-reserve-authorization',status:'approved',manifest:finiteCohortManifest(p),approvedAt:p.approvedAt,evidenceReference:p.evidenceReference});
 for(const m of p.members){
  const t=m.observedTariff;
  state.rows.set(authorityKey(m),{v:1,kind:'promotional-grant-authorization',status:'approved',manifest:m.grantManifest,approvedAt:epoch,evidenceReference:'synthetic-original-grant-authority'});
  state.rows.set(finiteCohortTariffKey(p,m),{v:1,kind:'verified-tariff',currency:'USD',country:'BR',category:'service-text',sender,
   recipientHash:m.recipientHash,sourceId:t.sourceId,evidenceSha256:t.evidenceSha256,verifiedAt:t.observedAt,
   validUntil:t.validUntil,unitMicroUsd:t.observedUnitMicroUsd,setupMicroUsd:t.setupMicroUsd,markupMicroUsd:t.markupMicroUsd});
 }
 if(grant)for(const [i,m]of p.members.entries())assert.equal((await transaction(c=>createPromotionalGrantWriter({...m.grant,enabled:true},{now:()=>state.clock})(c,{ownerPublicId:ownerId(i)}))).status,'granted');
 const prefund=createFiniteCohortPrefunder(p,{enabled:true,now:()=>state.clock,linkHashKey:secrets.linkHashKey});
 if(fund)assert.equal((await transaction(prefund)).status,'reserved');
 const baseUrl='https://synthetic.api.infobip.com',publicOrigin='https://crewcheck.example.invalid';
 const configuration={finiteBeta:true,sender,baseUrl,allowedSenders:[sender],allowedBaseUrls:[baseUrl],authentication:'hmac-sha256',
  credentialReferences:{apiKey:'fixture/api',encryptionKey:'fixture/content',linkHashKey:'fixture/link',webhookSecret:'fixture/webhook'},
  deploymentBinding:{profileId:'synthetic-profile',subscriptionIds:['synthetic-subscription'],sender,baseUrl,publicOrigin,linkHashKeyReference:'fixture/link'}};
 configureWhatsAppConcierge(async input=>{
  engines++;assert(isConciergeConversationWritesOnly({email:input.email}));
  const profile=state.profiles.get(input.email);assert(profile&&approved.members.some(m=>m.ownerAccountKey===hash(profile.public_id)));
  // Model engine DB work on its own client: it cannot alter committed rows
  // until the invoking authorization transaction has released its locks.
  const authorizedTransaction=activeTransaction;if(authorizedTransaction)await authorizedTransaction;
  await engineEffect(input);return 'SYNTHETIC OWN SAVED SCHEDULE';
 });
 const admission={enabled:true,finiteCohort:p};
 const envelope={version:1,mode:'finite-risk-cohort-v1',maxCostUsd:(p.totalMicroUsd/1000000).toFixed(6),configuration,admission};
 const options={enabled:true,configuration,admission,db,now:()=>state.clock,ingress:{mode:'direct-tls',publicOrigin},
  credentials:{resolve:async(_ref,{purpose})=>secrets[purpose]},scheduler:{set:()=>1,clear(){}},
  request:async(_url,{body})=>{
   sends++;const message=JSON.parse(body);calls.push(message.to);const m=approved.members.find(m=>m.recipient===message.to);assert(m);
   assert(state.rows.get(accountKey(m)).reservedMicroUsd>=m.perAttemptMicroUsd);return requestEffect(message);
  }};
 const eventKey=id=>hash(JSON.stringify(['infobip-inbound-v1',sender,id]));
 const requestKey=id=>key('request',[p.programId,eventKey(id)]);
 const job=(index,id)=>{
  const m=p.members[index],link=state.links.get(m.recipientHash),profile=state.profiles.get(link?.email);
  return {provider:'infobip',kind:'text',sender,recipient:m.recipient,eventKey:eventKey(id),receivedAt:state.clock,
   bindingStamp:JSON.stringify([profile?.public_id,JSON.stringify([String(link?.linked_at),String(link?.updated_at)]),'infobip',sender,m.recipient])};
 };
 const receiveStaged=createCohortIngressReceiver(options);
 async function stage(index,id,text='qual minha próxima jornada?',{validHmac=true,from=p.members[index].recipient}={}){
  const before={global:structuredClone(state.rows.get(globalKey)),accounts:p.members.map(m=>structuredClone(state.rows.get(accountKey(m)))),request:structuredClone(state.rows.get(requestKey(id))),engines,sends};
  const rawBody=Buffer.from(JSON.stringify({results:[{from,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(state.clock).toISOString(),messageId:id,message:{type:'TEXT',text}}]}));
  const result=await receiveStaged({method:'POST',rawHeaders:['x-hub-signature','SHA256='+(validHmac?createHmac('sha256',secrets.webhookSecret).update(rawBody).digest('hex'):'0'.repeat(64))],rawBody});
  assert.deepEqual(state.rows.get(globalKey),before.global);assert.deepEqual(p.members.map(m=>state.rows.get(accountKey(m))),before.accounts);
  assert.deepEqual(state.rows.get(requestKey(id)),before.request);assert.equal(engines,before.engines);assert.equal(sends,before.sends);
  if(result.accepted===1){const held=state.rows.get('crewcheck-infobip-inbound-v1:'+eventKey(id));assert.equal(held.v,1);assert.equal(held.status,'held');assert.equal(held.marker,null);assert(held.sealed);assert.equal(held.ownerHash,phoneHash(ownerId(index)));}
  return result;
 }
 async function route(runtime,index,id,text='qual minha próxima jornada?',{validHmac=true,from=p.members[index].recipient}={}){
  const rawBody=Buffer.from(JSON.stringify({results:[{from,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(state.clock).toISOString(),messageId:id,message:{type:'TEXT',text}}]}));
  const req=Readable.from([rawBody]);Object.assign(req,{method:'POST',rawHeaders:['x-hub-signature','SHA256='+(validHmac?createHmac('sha256',secrets.webhookSecret).update(rawBody).digest('hex'):'0'.repeat(64))],headers:{host:'crewcheck.example.invalid','content-type':'application/json'},socket:{encrypted:true}});
  const res={writeHead(status){this.status=status;},end(){this.writableEnded=true;}};await runtime.handleRoute(req,res,new URL('/api/infobip/whatsapp/webhook',publicOrigin));return res.status;
 }
 return {state,db,p,transaction,prefund,globalKey,accountKey,authorityKey,receiptKey,cohortAuthorityKey,envelope,options,
  eventKey,requestKey,job,route,stage,memberId:m=>finiteCohortMemberId(p,m),calls,stats:()=>({engines,sends}),
  setEngine:fn=>engineEffect=fn,setSql:fn=>sqlEffect=fn,setRequest:fn=>requestEffect=fn,setCommitFailure:value=>commitFailure=value};
}
