import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
import {createInfobipSqlBudget,isOwnedInfobipRepeatableRead} from '../server/infobip-whatsapp-sql-budget.mjs';
import {lockCanonicalCreditIdentities} from '../server/concierge-promotional-credit-sql.mjs';
import {readPaidCanonicalEntitlement,paidEntitlementValid} from '../server/concierge-paid-entitlement.mjs';
import {readLockedPlatformEntitlement} from '../server/platform-entitlement.mjs';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
import {epoch,secrets,sender} from './fixtures/infobip-cohort-sql.mjs';

// Called ONLY by the existing socket-only owned disposable MySQL runner after
// ordinary/v1 scenarios. These are synthetic fixture DDL/data, never provisioning.
export async function preparePaidCohortFixture(db){
  const [[database]]=await db.query('SELECT DATABASE() AS name');assert.equal(database.name,'crewcheck_credit_qa');
  await db.query("ALTER TABLE crewcheck_platform_profiles ADD COLUMN plan VARCHAR(40) NOT NULL DEFAULT 'free'");
  const source=readFileSync(new URL('../migrations/20260715_003_aiven_mysql_full_platform.sql',import.meta.url),'utf8');
  const ddl=source.match(/CREATE TABLE IF NOT EXISTS crewcheck_platform_subscriptions[\s\S]*?;/)?.[0];assert(ddl);
  await db.query(ddl);
}
export async function seedPaidCohortMember(db,email,at){
  await db.query("INSERT INTO crewcheck_platform_subscriptions(email,plan,status,provider,current_period_end) VALUES(?,'premium_monthly','active','synthetic',?)",[email,new Date(at+86400000)]);
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SYNTHETIC_BARRIER_NOT_ESTABLISHED')),2000);})]);}finally{clearTimeout(timer);}}

export async function runPaidCohortSqlScenarios({db}){
  const email='paid-locks@synthetic.invalid',publicId='synthetic-paid-lock-owner',recipient='12025559901';
  const accountKey=createHash('sha256').update(publicId).digest('hex'),phoneHash=createHmac('sha256',secrets.linkHashKey).update(recipient).digest('hex');
  await db.query("INSERT INTO crewcheck_platform_profiles(email,public_id,plan) VALUES(?,?,'premium_monthly')",[email,publicId]);
  await db.query('INSERT INTO crewcheck_whatsapp_links(phone_hash,email,consent_concierge,revoked_at,linked_at,updated_at) VALUES(?,?,1,NULL,?,?)',[phoneHash,email,new Date(epoch),new Date(epoch)]);
  const ledger=async()=>JSON.stringify((await db.query('SELECT state_key,payload FROM crewcheck_telegram_state ORDER BY state_key'))[0]);
  const before=await ledger(),errors=[],checks=[];
  let clock=epoch,profileReached;
  const lane=await db.getConnection();let busy=false,destroyed=false;
  const [[original]]=await lane.query('SELECT @@SESSION.transaction_isolation AS isolation');
  assert.equal(original.isolation,'REPEATABLE-READ');
  await lane.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED'); // disposable QA negative basis only
  const pool={async getConnection(){assert.equal(busy,false);busy=true;return {
    async query(sql,args){try{const result=await lane.query(sql,args);if(sql.startsWith('SELECT public_id')&&sql.includes('WHERE email='))profileReached?.resolve();return result;}catch(error){errors.push({source:'reader',code:error.code,errno:error.errno});throw error;}},
    beginTransaction:lane.beginTransaction.bind(lane),commit:lane.commit.bind(lane),rollback:lane.rollback.bind(lane),
    release(){busy=false;},destroy(){destroyed=true;busy=false;lane.destroy();},
  };}};
  const run=createInfobipSqlBudget(pool,{repeatableRead:true});
  const read=async c=>{
    assert(isOwnedInfobipRepeatableRead(c));
    const identities=await lockCanonicalCreditIdentities(c,[{ownerAccountKey:accountKey,sender,recipient,phoneHash}]);
    assert(identities);const identity=identities.get(accountKey);
    const paid=await readPaidCanonicalEntitlement(c,identity,{now:()=>clock});
    return {paid,binding:{accountKey,bindingStamp:identity.bindingStamp}};
  };
  const observePool={async getConnection(){const raw=await db.getConnection();return {
    async query(sql,args){try{return await raw.query(sql,args);}catch(error){errors.push({source:'writer',code:error.code,errno:error.errno});throw error;}},
    beginTransaction:raw.beginTransaction.bind(raw),commit:raw.commit.bind(raw),rollback:raw.rollback.bind(raw),release:raw.release.bind(raw),destroy:raw.destroy.bind(raw),
  };}};
  const writer=createInfobipSqlBudget(observePool);
  const insertSql="INSERT INTO crewcheck_platform_subscriptions(email,plan,status,provider,current_period_end) VALUES(?,'premium_monthly','active','synthetic',?)";
  const reset=async()=>{await db.query('DELETE FROM crewcheck_platform_subscriptions WHERE email=?',[email]);};
  try {
    // Existing-reader control: RC alone does not protect an absent unique row.
    await reset();const held=deferred(),release=deferred();let inserted=false,controlError;
    const control=createInfobipSqlBudget(pool)(async c=>{
      const result=await readLockedPlatformEntitlement(mysqlAdapter(c),{email,expectedPublicId:publicId,now:clock});assert.equal(result.billing.premiumAccess,false);
      held.resolve();await bounded(release.promise);
    });control.catch(error=>{controlError=error;});
    try {await bounded(held.promise);await writer(c=>c.query(insertSql,[email,new Date(epoch+86400000)]));inserted=true;}
    finally {release.resolve();await bounded(control);}
    if(controlError)throw controlError;assert(inserted);checks.push('RC negative control permits missing-row insert while low-level reader alone holds profile');

    for(const kind of ['insert','upsert']){
      await reset();const held=deferred(),release=deferred(),entered=deferred();let settled=false,writing,writeError;
      const holding=run(async c=>{assert.equal((await read(c)).paid,null);held.resolve();await bounded(release.promise);});holding.catch(()=>{});
      try {
        await bounded(held.promise);
        writing=writer(async c=>{entered.resolve();await c.query(insertSql+(kind==='upsert'?" ON DUPLICATE KEY UPDATE plan=VALUES(plan),status=VALUES(status),current_period_end=VALUES(current_period_end)":''),[email,new Date(epoch+86400000)]);});
        writing.then(()=>{settled=true;},error=>{settled=true;writeError=error;});await bounded(entered.promise);await pause(100);
        assert.equal(settled,false,'owned per-transaction RR must hold the unique-email gap');
      } finally {release.resolve();await bounded(Promise.allSettled([holding,writing]));}
      await holding;await writing;if(writeError)throw writeError;
      assert.equal(settled,true);await run(async c=>{const p=await read(c);assert(paidEntitlementValid(c,p.paid,p.binding));});
      const [[defaults]]=await lane.query('SELECT @@SESSION.transaction_isolation AS isolation');assert.equal(defaults.isolation,'READ-COMMITTED');
      checks.push('RR-before-BEGIN blocks '+kind+' despite RC session default; next transaction default remains RC');
    }

    for(const kind of ['downgrade','delete']){
      const held=deferred(),release=deferred(),entered=deferred();let settled=false,writing;
      const holding=run(async c=>{const p=await read(c);assert(paidEntitlementValid(c,p.paid,p.binding));held.resolve();await bounded(release.promise);assert(paidEntitlementValid(c,p.paid,p.binding));});holding.catch(()=>{});
      try {await bounded(held.promise);writing=writer(async c=>{entered.resolve();await c.query(kind==='delete'?'DELETE FROM crewcheck_platform_subscriptions WHERE email=?':"UPDATE crewcheck_platform_subscriptions SET status='canceled' WHERE email=?",[email]);});writing.then(()=>{settled=true;},()=>{settled=true;});await bounded(entered.promise);await pause(100);assert.equal(settled,false);}
      finally {release.resolve();await bounded(Promise.allSettled([holding,writing]));}
      await holding;await writing;await run(async c=>assert.equal((await read(c)).paid,null));
      await reset();await seedPaidCohortMember(db,email,epoch);checks.push('locked current subscription serializes '+kind+'; later read denies stale monthly profile');
    }
    // Google-shaped writes deliberately commit subscription UPSERT separately
    // from profile.plan. The canonical subscription, not a stale monthly/free
    // profile, must govern the visible intermediate state. No billing API runs.
    for(const kind of ['upgrade','downgrade']){
      const upgrading=kind==='upgrade',initialPlan=upgrading?'free':'premium_monthly',finalPlan=upgrading?'premium_monthly':'free';
      const status=upgrading?'active':'canceled';
      const setup=async()=>{
        await reset();await db.query('UPDATE crewcheck_platform_profiles SET plan=? WHERE email=?',[initialPlan,email]);
        if(!upgrading)await seedPaidCohortMember(db,email,epoch);
      };
      const splitWrite=async({entered,subscriptionCommitted,beforeProfile}={})=>{
        await writer(async c=>{
          entered?.resolve();await c.query("INSERT INTO crewcheck_platform_subscriptions(email,plan,status,provider,current_period_end) VALUES(?,'premium_monthly',?,'synthetic-google',?) ON DUPLICATE KEY UPDATE plan=VALUES(plan),status=VALUES(status),provider=VALUES(provider),current_period_end=VALUES(current_period_end)",[email,status,new Date(epoch+86400000)]);
        });
        subscriptionCommitted?.resolve();await beforeProfile?.();
        await writer(c=>c.query('UPDATE crewcheck_platform_profiles SET plan=? WHERE email=?',[finalPlan,email]));
        return 'both-separate-commits';
      };
      await setup();assert.equal(await splitWrite(),'both-separate-commits'); // uncontended fidelity control
      await setup();const held=deferred(),release=deferred(),entered=deferred(),subscriptionCommitted=deferred(),allowProfile=deferred();
      let firstCommitted=false,writing;
      subscriptionCommitted.promise.then(()=>{firstCommitted=true;});
      const holding=run(async c=>{assert.equal(Boolean((await read(c)).paid),!upgrading);held.resolve();await bounded(release.promise);});holding.catch(()=>{});
      try{
        await bounded(held.promise);
        writing=splitWrite({entered,subscriptionCommitted,beforeProfile:()=>bounded(allowProfile.promise)});writing.catch(()=>{});
        await bounded(entered.promise);await pause(100);assert.equal(firstCommitted,false,'Google-shaped UPSERT must wait on the owned current-row/gap lock');
        release.resolve();await bounded(holding);await bounded(subscriptionCommitted.promise);
        await run(async c=>{
          const result=await read(c);assert.equal(Boolean(result.paid),upgrading);
          if(upgrading)assert(paidEntitlementValid(c,result.paid,result.binding));
          const [profiles]=await c.query('SELECT plan FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]);
          assert.equal(profiles[0].plan,initialPlan,'reader must exercise the actual committed-subscription/stale-profile window');
        });
      }finally{release.resolve();allowProfile.resolve();await bounded(Promise.allSettled([holding,writing]));}
      await holding;assert.equal(await writing,'both-separate-commits');
      const [[profile]]=await db.query('SELECT plan FROM crewcheck_platform_profiles WHERE email=?',[email]);assert.equal(profile.plan,finalPlan);
      checks.push('Google-shaped '+kind+' serializes UPSERT and reads current subscription between two separate commits');
    }

    // DELETE followed by reinsert is two real commits, not a reset after the
    // test. Prove the old-row lock blocks deletion, then the newly absent gap
    // blocks the same writer's reinsertion; the replacement is canceled.
    await reset();await seedPaidCohortMember(db,email,epoch);
    await db.query("UPDATE crewcheck_platform_profiles SET plan='premium_monthly' WHERE email=?",[email]);
    const replaceSubscription=async({deleteEntered,deleted,beforeInsert,insertEntered}={})=>{
      await writer(async c=>{deleteEntered?.resolve();await c.query('DELETE FROM crewcheck_platform_subscriptions WHERE email=?',[email]);});
      deleted?.resolve();await beforeInsert?.();
      await writer(async c=>{insertEntered?.resolve();await c.query("INSERT INTO crewcheck_platform_subscriptions(email,plan,status,provider,current_period_end) VALUES(?,'premium_monthly','canceled','synthetic-reinsert',?)",[email,new Date(epoch+86400000)]);});
      return 'deleted-and-reinserted';
    };
    assert.equal(await replaceSubscription(),'deleted-and-reinserted'); // both operations must work uncontended
    await reset();await seedPaidCohortMember(db,email,epoch);
    {
      const rowHeld=deferred(),releaseRow=deferred(),deleteEntered=deferred(),deleted=deferred(),allowInsert=deferred(),insertEntered=deferred(),gapHeld=deferred(),releaseGap=deferred();
      let deletionCommitted=false,replacementSettled=false,writing,gapHolding;
      deleted.promise.then(()=>{deletionCommitted=true;});
      const rowHolding=run(async c=>{assert((await read(c)).paid);rowHeld.resolve();await bounded(releaseRow.promise);});rowHolding.catch(()=>{});
      try{
        await bounded(rowHeld.promise);
        writing=replaceSubscription({deleteEntered,deleted,beforeInsert:()=>bounded(allowInsert.promise),insertEntered});writing.then(()=>{replacementSettled=true;},()=>{replacementSettled=true;});
        await bounded(deleteEntered.promise);await pause(100);assert.equal(deletionCommitted,false);
        releaseRow.resolve();await bounded(rowHolding);await bounded(deleted.promise);
        gapHolding=run(async c=>{assert.equal((await read(c)).paid,null);gapHeld.resolve();await bounded(releaseGap.promise);});gapHolding.catch(()=>{});
        await bounded(gapHeld.promise);allowInsert.resolve();await bounded(insertEntered.promise);await pause(100);assert.equal(replacementSettled,false,'reinsert must wait on the new owned gap lock');
      }finally{releaseRow.resolve();allowInsert.resolve();releaseGap.resolve();await bounded(Promise.allSettled([rowHolding,gapHolding,writing]));}
      await rowHolding;await gapHolding;assert.equal(await writing,'deleted-and-reinserted');
      await run(async c=>assert.equal((await read(c)).paid,null));
      checks.push('separate DELETE/reinsert commits serialize against both current-row and subsequent absent-row locks');
    }
    assert.deepEqual(errors,[],'all uncontended/gap/row/split-write controls must succeed without swallowed SQL errors');

    // The existing Asaas writer's subscription -> profile order can conflict
    // with canonical profile -> subscription. No retry or relaxed acceptance.
    await db.query("UPDATE crewcheck_platform_subscriptions SET provider='asaas',provider_ref='synthetic-paid-reference',status='active' WHERE email=?",[email]);
    const asaasShape=async(c,barrier)=>{
      const [rows]=await c.query("SELECT * FROM crewcheck_platform_subscriptions WHERE provider='asaas' AND provider_ref=? LIMIT 2 FOR UPDATE",['synthetic-paid-reference']);assert.equal(rows.length,1);
      await barrier?.();
      const [profiles]=await c.query('SELECT plan FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]);assert.equal(profiles.length,1);
      await c.query("UPDATE crewcheck_platform_subscriptions SET status='canceled' WHERE email=?",[email]);return 'downgraded';
    };
    assert.equal(await writer(c=>asaasShape(c)),'downgraded');await db.query("UPDATE crewcheck_platform_subscriptions SET status='active' WHERE email=?",[email]);
    await run(async c=>assert((await read(c)).paid));
    const subscriptionHeld=deferred();profileReached=deferred();
    const writing=writer(c=>asaasShape(c,async()=>{subscriptionHeld.resolve();await bounded(profileReached.promise);}));writing.catch(()=>{});
    await bounded(subscriptionHeld.promise);
    const reading=run(async c=>{const result=await read(c);assert(result.paid);return 'paid';});reading.catch(()=>{});
    const results=await bounded(Promise.allSettled([reading,writing]));profileReached=null;
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);
    assert.equal(errors.length,1);assert.equal(errors[0].code,'ER_LOCK_DEADLOCK');assert.equal(errors[0].errno,1213);
    checks.push('actual subscription/profile inversion has exactly one native1213 victim, successful controls and no automatic retry');

    await db.query("UPDATE crewcheck_platform_subscriptions SET status='active',current_period_end=? WHERE email=?",[new Date(epoch+1),email]);
    await run(async c=>{const result=await read(c);assert(result.paid);clock=epoch+1;assert.equal(paidEntitlementValid(c,result.paid,result.binding),false);});clock=epoch;
    await db.query('DELETE FROM crewcheck_platform_profiles WHERE email=?',[email]);
    await run(async c=>{assert.equal(await lockCanonicalCreditIdentities(c,[{ownerAccountKey:accountKey,sender,recipient,phoneHash}]),null);});
    await db.query("INSERT INTO crewcheck_platform_profiles(email,public_id,plan) VALUES(?,'synthetic-new-paid-owner','free')",[email]);
    await run(async c=>{assert.equal(await lockCanonicalCreditIdentities(c,[{ownerAccountKey:accountKey,sender,recipient,phoneHash}]),null);});
    checks.push('natural expiry under locks and recreated canonical owner cannot reuse old proof');
    assert.equal(await ledger(),before,'plan-only probes must not mutate any financial row');
    console.log(JSON.stringify({suite:'paid cohort owned MySQL current-plan locks',checks,nativeErrors:errors,stubProviderCalls:0,realProviderCalls:0,externalCalls:0}));
    return checks;
  } finally {
    assert.equal(busy,false);
    if(!destroyed){await lane.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');lane.release();}
  }
}

// Actual production-caller phase transitions, isolated in another synthetic
// month of the SAME fixed program. No financial hold/account is reset.
export async function runPaidCohortCallerTransitions({db,transaction,p,owners,at,prefund,globalKey,read}){
  const {createInfobipWhatsAppProduction}=await import('../server/infobip-whatsapp-production.mjs');
  const {configureWhatsAppConcierge}=await import('../server/whatsapp.mjs');
  const {createCohortIngressReceiver}=await import('./fixtures/infobip-cohort-sql.mjs');
  const {finiteCohortState,finiteCohortMemberId}=await import('../server/concierge-finite-reserve-off.mjs');
  const {sharedCreditKey:key}=await import('../server/concierge-shared-credit-candidate.mjs');
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const eventKey=id=>hash(JSON.stringify(['infobip-inbound-v1',sender,id]));
  let phase='',engines=0,sends=0,independentProfileLocks=0,freeReads=0,postInvocationWrite,engineStarted=deferred(),engineLockProofs=0;
  const sqlErrors=[],commitFaults=[];
  const phaseDb={async getConnection(){const raw=await db.getConnection();let preparing=false,readActivePreparation=false,clearedEngine=false;return {
    async query(sql,args){try{
      const result=await raw.query(sql,args);
      if(sql.startsWith('UPDATE crewcheck_telegram_state SET payload=?')){
        const value=JSON.parse(args[0]);if(value.status==='preparing'&&phase==='before-engine')preparing=true;
        if(value.engineActive===false)clearedEngine=true;
      }
      if(sql.startsWith('SELECT payload')&&result[0]?.[0]?.payload){
        const value=typeof result[0][0].payload==='string'?JSON.parse(result[0][0].payload):result[0][0].payload;
        if(value.status==='preparing'&&value.engineActive===true)readActivePreparation=true;
      }
      if(sql.startsWith('SELECT * FROM crewcheck_platform_subscriptions')&&result[0]?.[0]?.status==='canceled')freeReads++;
      return result;
    }catch(error){sqlErrors.push({code:error.code,errno:error.errno});throw error;}},
    beginTransaction:raw.beginTransaction.bind(raw),rollback:raw.rollback.bind(raw),release:raw.release.bind(raw),destroy:raw.destroy.bind(raw),
    async commit(){
      const authorization=readActivePreparation&&!clearedEngine;
      if(authorization&&['after-engine','accepted','engine-commit-before','engine-commit-after'].includes(phase)){
        // Labeled QA barrier, bounded by the ORIGINAL owned COMMIT deadline.
        // Require engine work to have entered its actual independent SELECT
        // while the authorizing profile lock is still held. It cannot settle
        // until this COMMIT/rollback; neither moving invocation after COMMIT
        // nor awaiting engine inside the SQL callback can satisfy this proof.
        const probe=await bounded(engineStarted.promise);await bounded(probe.entered.promise);
        await pause(100);assert.equal(probe.settled,false);engineLockProofs++;
      }
      if(authorization&&phase==='engine-commit-before'){phase='';commitFaults.push('before');throw Error('SYNTHETIC_ENGINE_AUTH_COMMIT_NOT_APPLIED');}
      await raw.commit();
      if(authorization&&phase==='engine-commit-after'){phase='';commitFaults.push('after');throw Error('SYNTHETIC_ENGINE_AUTH_COMMIT_ACK_LOST');}
      if(preparing&&phase==='before-engine'){
      phase='';await db.query("UPDATE crewcheck_platform_subscriptions SET status='canceled' WHERE email=?",[owners[0].email]);
    }},
  };}};
  const baseUrl='https://synthetic.api.infobip.com',publicOrigin='https://crewcheck.example.invalid';
  const configuration={finiteBeta:true,sender,baseUrl,allowedSenders:[sender],allowedBaseUrls:[baseUrl],authentication:'hmac-sha256',credentialReferences:{apiKey:'fixture/api',encryptionKey:'fixture/content',linkHashKey:'fixture/link',webhookSecret:'fixture/webhook'},deploymentBinding:{profileId:'synthetic-paid-phases',subscriptionIds:['synthetic-paid-phases'],sender,baseUrl,publicOrigin,linkHashKeyReference:'fixture/link'}};
  const admission={enabled:true,finiteCohort:p},now=()=>at;
  const receive=createCohortIngressReceiver({configuration,admission,db:phaseDb,now});
  configureWhatsAppConcierge(async input=>{
    engines++;
    // This actual independent SQL client must wait for the invoking
    // authorization transaction's profile lock. Awaiting this work inside
    // that transaction would fail the existing2s budget, not pass by timeout.
    const probe={entered:deferred(),settled:false};engineStarted.resolve(probe);
    const engineTransaction=createInfobipSqlBudget({async getConnection(){const raw=await db.getConnection();return {
      async query(sql,args){probe.entered.resolve();try{const result=await raw.query(sql,args);probe.settled=true;return result;}catch(error){probe.settled=true;sqlErrors.push({source:'engine',code:error.code,errno:error.errno});throw error;}},
      beginTransaction:raw.beginTransaction.bind(raw),commit:raw.commit.bind(raw),rollback:raw.rollback.bind(raw),release:raw.release.bind(raw),destroy:raw.destroy.bind(raw),
    };}});
    await engineTransaction(async c=>{const [rows]=await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[input.email]);assert.equal(rows.length,1);const expectedOwner=owners.find(owner=>owner.email===input.email);assert(expectedOwner);assert.equal(rows[0].public_id,expectedOwner.publicId);independentProfileLocks++;});
    if(phase==='after-engine'){phase='';await db.query("UPDATE crewcheck_platform_subscriptions SET status='canceled' WHERE email=?",[owners[1].email]);}
    return 'SYNTHETIC PAID CANONICAL SCHEDULE';
  });
  const options={enabled:true,configuration,admission,db:phaseDb,now,ingress:{mode:'direct-tls',publicOrigin},credentials:{resolve:async(_ref,{purpose})=>secrets[purpose]},scheduler:{set:()=>1,clear(){}},request:async(_url,{body})=>{
    sends++;const message=JSON.parse(body);assert.equal(message.to,p.members[2].recipient);
    // A real concurrent downgrade remains blocked through provider invocation
    // and its await. The provider itself is only this synthetic stub.
    const entered=deferred();let settled=false;
    postInvocationWrite=transaction(async c=>{entered.resolve();await c.query("UPDATE crewcheck_platform_subscriptions SET status='canceled' WHERE email=?",[owners[2].email]);});
    postInvocationWrite.then(()=>{settled=true;},()=>{settled=true;});await bounded(entered.promise);await pause(100);assert.equal(settled,false);
    return new Response(JSON.stringify({to:message.to,messageId:message.messageId,status:{groupId:1,groupName:'PENDING',id:26,name:'PENDING_ACCEPTED'}}));
  }};
  async function stage(index,id){
    const rawBody=Buffer.from(JSON.stringify({results:[{from:p.members[index].recipient,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(at).toISOString(),messageId:id,message:{type:'TEXT',text:'qual minha próxima jornada?'}}]}));
    const result=await receive({method:'POST',rawHeaders:['x-hub-signature','SHA256='+createHmac('sha256',secrets.webhookSecret).update(rawBody).digest('hex')],rawBody});assert.equal(result.status,200);assert.equal(result.accepted,1);
  }
  assert.equal((await transaction(prefund)).status,'reserved');const initial=await read(globalKey);
  const runtime=await createInfobipWhatsAppProduction(options);
  try{
    phase='before-engine';await stage(0,'paid-before-engine');assert.equal((await runtime.dispatch(eventKey('paid-before-engine'))).status,'blocked');
    assert.equal(engines,0);assert.equal(sends,0);assert(freeReads>0);const previousReads=freeReads;
    engineStarted=deferred();phase='after-engine';await stage(1,'paid-after-engine');assert.equal((await runtime.dispatch(eventKey('paid-after-engine'))).status,'cancelled');
    assert.equal(engines,1);assert.equal(sends,0);assert(freeReads>previousReads);
    engineStarted=deferred();phase='accepted';await stage(2,'paid-after-invocation');assert.equal((await runtime.dispatch(eventKey('paid-after-invocation'))).status,'accepted_unconfirmed');
    await bounded(postInvocationWrite);assert.equal(engines,2);assert.equal(sends,1);assert.equal(independentProfileLocks,2);
    for(const [index,fault]of ['before','after'].entries()){
      engineStarted=deferred();phase='engine-commit-'+fault;await stage(index+3,phase);assert.equal((await runtime.dispatch(eventKey('engine-commit-'+fault))).status,'blocked');
      assert.equal(engines,index+3);assert.equal(independentProfileLocks,index+3);assert.equal(sends,1);
      const inbound=await read('crewcheck-infobip-inbound-v1:'+eventKey('engine-commit-'+fault));assert.equal(inbound.engineActive,false);assert.equal(inbound.engineOwner,null);
      assert.equal((await read(key('request',[p.programId,eventKey('engine-commit-'+fault)]))).state,'reserved');
    }
    for(const id of ['paid-before-engine','paid-after-engine','paid-after-invocation','engine-commit-before','engine-commit-after'])await runtime.dispatch(eventKey(id));
    assert.equal(engines,4);assert.equal(independentProfileLocks,4);assert.equal(engineLockProofs,4);assert.equal(sends,1);assert.deepEqual(sqlErrors,[]);assert.deepEqual(commitFaults,['before','after']);
    const global=await read(globalKey),members=finiteCohortState(p,global,at);assert(members);assert.equal(global.reservedMicroUsd,initial.reservedMicroUsd);
    assert.equal(global.finiteReserve.attempts,5);let used=0;
    for(const [i,m]of p.members.entries()){
      const n=i<5?1:0,row=members.get(finiteCohortMemberId(p,m)),account=await read(key('account',[p.programId,m.ownerAccountKey]));
      assert.equal(row.attempts,n);assert.equal(row.usedMicroUsd,n*m.perAttemptMicroUsd);assert.equal(account.reservedMicroUsd,row.usedMicroUsd);used+=row.usedMicroUsd;
    }
    assert.equal(global.finiteReserve.usedMicroUsd,used);
    assert.equal((await read(key('request',[p.programId,eventKey('paid-before-engine')]))).state,'reserved');
    assert.equal((await read(key('request',[p.programId,eventKey('paid-after-engine')]))).state,'reserved');
    assert.equal((await read(key('request',[p.programId,eventKey('paid-after-invocation')]))).state,'send-authorized');
    assert.equal((await transaction(prefund)).status,'denied');assert.deepEqual(await read(globalKey),global);
    console.log(JSON.stringify({suite:'actual MySQL paid cohort invocation transitions',engines,independentProfileLocks,engineLockProofs,freeReads,stubProviderCalls:sends,realProviderCalls:0,externalCalls:0,sqlErrors,commitFaults}));
  }finally{await runtime.dispose();if(postInvocationWrite)await bounded(postInvocationWrite);}
}
