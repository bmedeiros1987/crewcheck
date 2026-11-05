import {eraseWhatsAppAccountState} from '../server/whatsapp-lifecycle.mjs';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
// Called only by the existing owned Unix-socket, clean-HEAD MySQL harness.
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {createInfobipSqlBudget} from '../server/infobip-whatsapp-sql-budget.mjs';
import {startCanonicalWhatsAppChallenge,completeCanonicalWhatsAppLink} from '../server/whatsapp-link-proof.mjs';
export async function runLinkIdentityMysqlScenarios({run,db,reset,email,owner,make,event,eventKey,recipient,password,salt,epoch}) {
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const phoneHash=value=>createHmac('sha256',salt).update(value).digest('hex');
 for(const isolation of ['READ COMMITTED','REPEATABLE READ']) {
  // Session settings affect task-owned ephemeral QA connections only.
  const isolated={async getConnection(){const c=await db.getConnection();await c.query('SET SESSION TRANSACTION ISOLATION LEVEL '+isolation);return c;}};
  const tx=createInfobipSqlBudget(isolated);
  const start=(target,id,code)=>tx(c=>startCanonicalWhatsAppChallenge(c,{email:target,publicId:id,codeHash:hash(code)}));
  const proof=(code,phone)=>tx(c=>completeCanonicalWhatsAppLink(c,{phone,codeHash:hash(code),phoneHash:phoneHash(phone),phoneCipher:'SYNTHETIC'}));
  await run('canonical two owners one phone with actual '+isolation,async()=>{
   await reset();await db.query('DELETE FROM crewcheck_whatsapp_links');
   const other='other-link@synthetic.invalid';await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?,NOW(3))',[other,'synthetic-other-link']);
   await start(email,owner,'a');await start(other,'synthetic-other-link','b');
   const result=await Promise.allSettled([proof('a','12025550111'),proof('b','12025550111')]);
   assert.equal(result.filter(r=>r.status==='fulfilled'&&r.value.linked).length,1);
   const [links]=await db.query('SELECT email,phone_hash FROM crewcheck_whatsapp_links');assert.equal(links.length,1);assert.equal(links[0].phone_hash,phoneHash('12025550111'));
   const loser=links[0].email===email?['b',other]:['a',email];assert.equal((await proof(loser[0],'12025550111')).linked,false);
  });
  await run('canonical one owner two phones and stale generation with actual '+isolation,async()=>{
   await reset();await db.query('DELETE FROM crewcheck_whatsapp_links');await start(email,owner,'same');
   const result=await Promise.allSettled([proof('same','12025550112'),proof('same','12025550113')]);assert.equal(result.filter(r=>r.status==='fulfilled'&&r.value.linked).length,1);
   assert.equal((await db.query('SELECT email FROM crewcheck_whatsapp_links'))[0].length,1);
   await start(email,owner,'stale');await db.query('DELETE FROM crewcheck_platform_profiles WHERE email=?',[email]);await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?,NOW(3))',[email,'synthetic-recreated']);
   assert.equal((await proof('stale','12025550114')).linked,false);
  });
  await run('canonical final link lock blocks replacement until send transaction ends '+isolation,async()=>{
   await reset();await start(email,owner,'replacement');
   const blocker=await isolated.getConnection();await blocker.beginTransaction();
   await blocker.query('SELECT phone_hash FROM crewcheck_whatsapp_links WHERE email=? FOR UPDATE',[email]);
   await blocker.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]);
   let finished=false;const changing=proof('replacement','12025550115').finally(()=>{finished=true;});
   try {await new Promise(r=>setTimeout(r,50));assert.equal(finished,false);await blocker.commit();assert.equal((await changing).linked,true);}
   finally{await blocker.rollback();blocker.release();await changing.catch(()=>{});}
  });
  await run('canonical committed replacement with lost acknowledgement cannot replay '+isolation,async()=>{
   await reset();await start(email,owner,'unknown-commit');let failCommit=true;
   const lost={async getConnection(){const c=await isolated.getConnection();return {
    query:(...args)=>c.query(...args),beginTransaction:()=>c.beginTransaction(),rollback:()=>c.rollback(),release:()=>c.release(),destroy:()=>c.destroy(),
    async commit(){await c.commit();if(failCommit){failCommit=false;throw Error('SYNTHETIC_COMMIT_ACK_LOST');}},
   };}};
   await assert.rejects(createInfobipSqlBudget(lost)(c=>completeCanonicalWhatsAppLink(c,{phone:recipient,phoneHash:phoneHash(recipient),phoneCipher:'SYNTHETIC',codeHash:hash('unknown-commit')})));
   const [before]=await db.query('SELECT email,phone_hash,linked_at,updated_at FROM crewcheck_whatsapp_links');
   assert.equal((await proof('unknown-commit',recipient)).linked,false);
   const [after]=await db.query('SELECT email,phone_hash,linked_at,updated_at FROM crewcheck_whatsapp_links');assert.deepEqual(after,before);
   assert.equal((await db.query('SELECT email FROM crewcheck_whatsapp_link_codes'))[0].length,0);
  });
  for(const mode of ['same-phone','A-B-A','clock-backward']) await run('canonical frozen DB clock '+mode+' rejects old queued binding '+isolation,async()=>{
   await reset();const raw=await isolated.getConnection();
   // SET timestamp is only used on this task-owned QA session. Never used by
   // production code; reset it before releasing the session back to this pool.
   await raw.query('SET timestamp=?',[epoch/1000]);
   const fixed=createInfobipSqlBudget({async getConnection(){return {
    query:(...args)=>raw.query(...args),beginTransaction:()=>raw.beginTransaction(),commit:()=>raw.commit(),rollback:()=>raw.rollback(),release(){},destroy:()=>raw.destroy(),
   };}});
   const reproof=async(code,phone)=>{
    await fixed(c=>startCanonicalWhatsAppChallenge(c,{email,publicId:owner,codeHash:hash(code)}));
    assert.equal((await fixed(c=>completeCanonicalWhatsAppLink(c,{phone,phoneHash:phoneHash(phone),phoneCipher:'SYNTHETIC',codeHash:hash(code)}))).linked,true);
   };
   try {
    await reproof('initial-fixed',recipient);
    const [[before]]=await db.query('SELECT linked_at,updated_at FROM crewcheck_whatsapp_links WHERE email=?',[email]);
    const {store,receive}=make();
    assert.equal((await receive({method:'POST',rawHeaders:['Authorization','Basic '+Buffer.from('synthetic:'+password).toString('base64')],rawBody:Buffer.from(JSON.stringify({results:[event]}))})).accepted,1);
    if(mode==='A-B-A')await reproof('middle-fixed','12025550116');
    if(mode==='clock-backward')await raw.query('SET timestamp=?',[epoch/1000-1]);
    await reproof('final-fixed',recipient);
    const [[after]]=await db.query('SELECT linked_at,updated_at FROM crewcheck_whatsapp_links WHERE email=?',[email]);
    assert(after.linked_at>before.linked_at);assert.equal(after.updated_at,after.linked_at);
    let calls=0;await store.exerciseDispatch(eventKey,{concierge:async()=>{calls++;return 'SYNTHETIC';},send:async()=>{calls++;return {status:'accepted_unconfirmed'};}});
    assert.equal(calls,0,'old generation never reaches engine or send, including same phone and fixed clock');
   } finally {await raw.query('SET timestamp=0');raw.release();}
  });
  await run('canonical expiry after target lock wait rolls back replacement '+isolation,async()=>{
   await reset();const raw=await isolated.getConnection(),blocker=await isolated.getConnection();
   await raw.query('SET timestamp=?',[epoch/1000]);
   const target='12025550117',other='expired-target@synthetic.invalid';
   await db.query("INSERT INTO crewcheck_whatsapp_links(email,phone_hash,phone_cipher,phone_last4,consent_concierge,consent_alerts,linked_at,revoked_at,updated_at) VALUES(?,?,?, ?,0,0,'2031-01-01','2031-01-01','2031-01-01')",[other,phoneHash(target),'SYNTHETIC','0117']);
   let enter;const entered=new Promise(r=>enter=r);let expireAfterTarget=false;
   const fixed=createInfobipSqlBudget({async getConnection(){return {
    async query(sql,args){
     if(expireAfterTarget&&sql.startsWith('SELECT email,revoked_at')){enter();const result=await raw.query(sql,args);await raw.query('SET timestamp=?',[epoch/1000+601]);return result;}
     return raw.query(sql,args);
    },beginTransaction:()=>raw.beginTransaction(),commit:()=>raw.commit(),rollback:()=>raw.rollback(),release(){},destroy:()=>raw.destroy(),
   };}});
   try {
    await fixed(c=>startCanonicalWhatsAppChallenge(c,{email,publicId:owner,codeHash:hash('expires-at-lock')}));
    const [before]=await db.query('SELECT email,phone_hash,linked_at,updated_at,revoked_at FROM crewcheck_whatsapp_links ORDER BY email');
    await blocker.beginTransaction();await blocker.query('SELECT email FROM crewcheck_whatsapp_links WHERE phone_hash=? FOR UPDATE',[phoneHash(target)]);
    expireAfterTarget=true;
    const completing=fixed(c=>completeCanonicalWhatsAppLink(c,{phone:target,phoneHash:phoneHash(target),phoneCipher:'SYNTHETIC',codeHash:hash('expires-at-lock')}));
    const rejected=assert.rejects(completing);
    await entered;await blocker.rollback();await rejected;
    const [after]=await db.query('SELECT email,phone_hash,linked_at,updated_at,revoked_at FROM crewcheck_whatsapp_links ORDER BY email');assert.deepEqual(after,before);
    assert.equal((await db.query('SELECT email FROM crewcheck_whatsapp_link_codes WHERE email=?',[email]))[0].length,1);
   } finally {await blocker.rollback();blocker.release();await raw.query('SET timestamp=0');raw.release();}
  });
  await run('OFF-host account deletion rollback and same-email recreation cannot inherit phone '+isolation,async()=>{
   await reset();await start(email,owner,'off-deletion');const client=await mysqlAdapter(isolated).connect();
   try {
    await client.query('BEGIN');await client.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE',[email]);
    await eraseWhatsAppAccountState(email,{client});
    const erased=await client.query('SELECT revoked_at,consent_concierge FROM crewcheck_whatsapp_links WHERE email=$1',[email]);assert(erased.rows[0].revoked_at);assert.equal(Number(erased.rows[0].consent_concierge),0);
    assert.equal((await client.query('SELECT email FROM crewcheck_whatsapp_link_codes WHERE email=$1',[email])).rows.length,0);
    await client.query('ROLLBACK');
    const [[restored]]=await db.query('SELECT revoked_at FROM crewcheck_whatsapp_links WHERE email=?',[email]);assert.equal(restored.revoked_at,null);
    assert.equal((await db.query('SELECT email FROM crewcheck_whatsapp_link_codes WHERE email=?',[email]))[0].length,1);
    await client.query('BEGIN');await client.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE',[email]);
    await eraseWhatsAppAccountState(email,{client});await client.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1',[email]);await client.query('COMMIT');
    await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?,NOW(3))',[email,'synthetic-recreated-after-delete']);
    assert.equal((await proof('off-deletion',recipient)).linked,false);
    const {receive}=make();assert.equal((await receive({method:'POST',rawHeaders:['Authorization','Basic '+Buffer.from('synthetic:'+password).toString('base64')],rawBody:Buffer.from(JSON.stringify({results:[event]}))})).denied,1);
   } finally {await client.query('ROLLBACK');client.release();}
  });
  await run('canonical invalid/max generation denies independently of SQL strict mode '+isolation,async()=>{
   for(const invalid of ['9999-12-31 23:59:59.999','0000-00-00 00:00:00.000',null]){
    await reset();await start(email,owner,'invalid-generation');const raw=await isolated.getConnection();
    const [[settings]]=await raw.query('SELECT @@SESSION.sql_mode AS mode');
    try{
     await raw.query("SET SESSION sql_mode=''");
     await raw.query('UPDATE IGNORE crewcheck_whatsapp_links SET linked_at=?,updated_at=? WHERE email=?',[invalid,invalid,email]);
     const [before]=await raw.query('SELECT email,phone_hash,linked_at,updated_at FROM crewcheck_whatsapp_links');
     await assert.rejects(proof('invalid-generation','12025550118'));
     const [after]=await raw.query('SELECT email,phone_hash,linked_at,updated_at FROM crewcheck_whatsapp_links');assert.deepEqual(after,before);
     assert.equal((await raw.query('SELECT email FROM crewcheck_whatsapp_link_codes WHERE email=?',[email]))[0].length,1);
    }finally{await raw.query('SET SESSION sql_mode=?',[settings.mode]);raw.release();}
   }
  });
 }
}
