import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { createNativeDeliveryQueue } from '../server/native-push/outbox.mjs';
import { createNativePushSender } from '../server/native-push/sender.mjs';
import { createNativeRegistryPlatformAdapter, deleteNativeAccountWithRegistry, mutateNativeInstallation, NATIVE_PACKAGE, NATIVE_PROJECT } from '../server/native-push/registry.mjs';
import { mysqlAdapter } from '../server/mysql-platform-adapter.mjs';

const fixtureUrl = process.env.NATIVE_PUSH_TEST_MYSQL_URL;
const url = new URL(fixtureUrl || 'mysql://invalid/');
assert.equal(process.env.NATIVE_PUSH_SQL_DISPOSABLE, '1', 'disposable fixture only');
assert.equal(url.protocol, 'mysql:');
assert(['127.0.0.1', 'localhost'].includes(url.hostname), 'loopback only');
assert.equal(url.search, '', 'no socket override or connection parameters');
assert.equal(url.hash, '');
assert(/^\/crewcheck_native_fixture_[a-z0-9_]+$/.test(url.pathname));
assert.equal(decodeURIComponent(url.username), 'native_fixture');

const pool = mysql.createPool({uri:fixtureUrl,connectionLimit:8});
const {registryDb} = createNativeRegistryPlatformAdapter(mysqlAdapter(pool));
const key = crypto.randomBytes(32);
const protection = {
  seal(value, context) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
    return {format:'native-token-aes256gcm-v1',iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url')};
  },
  open(envelope, context) {
    const decipher = crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64url'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(envelope.tag,'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64url')),decipher.final()]).toString('utf8');
  },
};
const NOW = 1_700_000_000_000;
const timing = {scheduledAt:NOW,expiresAt:NOW+60_000};
const settings = {enabled:true,db:registryDb,protection,clock:()=>NOW};
const queue = createNativeDeliveryQueue(settings);
const scope = name => ({identity:{ownerId:`delivery-owner-${name}`,email:`delivery-${name}@example.test`},
  installationId:`delivery-install-${name}`,eventKey:`fixture-event-${name}`});
const token = name => `SYNTHETIC_DELIVERY_TOKEN_${name}`;
async function register(name) {
  const {identity,installationId} = scope(name);
  await pool.query('INSERT INTO crewcheck_platform_profiles(email,public_id) VALUES(?,?)',[identity.email,identity.ownerId]);
  await mutateNativeInstallation(registryDb,{identity,installationId,mutationId:`fixture-register-${name}`,project:NATIVE_PROJECT,package:NATIVE_PACKAGE,
    action:'register',generation:1,tokenRevision:1,expectedRevision:0,expectedConsentRevision:0,consent:true,token:token(name)},{protection,now:NOW});
  return scope(name);
}
function edit(where, action, db = registryDb) {
  const {identity,installationId} = where;
  return mutateNativeInstallation(db,{identity,installationId,mutationId:`fixture-${action}`,project:NATIVE_PROJECT,package:NATIVE_PACKAGE,
    action,generation:1,tokenRevision:2,expectedRevision:1,expectedConsentRevision:1,consent:false,
    ...(action==='rotate'?{token:token('rotated')}:{} )},{protection,now:NOW+1});
}
function commitBoundary(at, hook) {
  let transactions = 0;
  return {async getConnection() {
    const c = await registryDb.getConnection(), number = ++transactions;
    return { ...c, async commit() { if (number === at) await hook(c); else await c.commit(); } };
  }};
}
const forbidden = () => { throw Error('Unexpected attempt or database access'); };
let unexpected = 0;
const noSend = () => { unexpected++; return forbidden(); };
let requests = 0;
function sender(forQueue, where, onRequest = () => {}) {
  return createNativePushSender({enabled:true,withAuthorizedDelivery:forQueue.authorityFor(where),getAccessToken:async()=> 'synthetic.oauth-token',
    clock:()=>NOW,request:async (_url, options) => {
      requests++;
      await onRequest(JSON.parse(options.body).message);
      return {status:200,json:async()=>({name:`projects/${NATIVE_PROJECT}/messages/fixture-response`})};
    }});
}

try {
  const off = createNativeDeliveryQueue({db:new Proxy({},{get:forbidden}),clock:forbidden});
  const poison = new Proxy({},{get:forbidden});
  assert.deepEqual(await off.enqueue(poison,poison),{state:'disabled',received:null});
  await off.authorityFor(poison)(poison,noSend);

  const single = await register('single');
  const both = await Promise.all([queue.enqueue(single,timing),queue.enqueue(single,timing)]);
  assert.equal(both[0].id,both[1].id);
  await assert.rejects(queue.enqueue(single,{...timing,expiresAt:timing.expiresAt+1}),{code:'NATIVE_DELIVERY_EVENT_REUSED'});
  const send = sender(queue,single,message=>assert.equal(message.token,token('single')));
  const outcomes = await Promise.all([send(both[0].id),send(both[0].id)]);
  assert.equal(outcomes.filter(x=>x.state==='accepted_unconfirmed').length,1);
  assert(outcomes.every(x=>x.received===null));
  assert.equal(requests,1);

  const [left,right] = await Promise.all([register('other-left'),register('other-right')]);
  const crossAccount = await Promise.all([queue.enqueue(left,timing),queue.enqueue(right,timing)]);
  assert(crossAccount.every(job=>job.state==='queued'));
  assert.notEqual(crossAccount[0].id,crossAccount[1].id);
  await queue.authorityFor(right)(crossAccount[0].id,noSend);
  assert.equal((await queue.enqueue(right,timing)).state,'queued');

  for (const action of ['revoke','rotate']) {
    const where = await register(action);
    const entry = await queue.enqueue(where,timing);
    const db = commitBoundary(1,async connection=>{await connection.commit();await edit(where,action);});
    const raced = createNativeDeliveryQueue({...settings,db});
    await raced.authorityFor(where)(entry.id,noSend);
    assert.equal((await queue.enqueue(where,timing)).state,'cancelled');
  }

  const wrong = await register('wrong-token');
  const unavailable = createNativeDeliveryQueue({...settings,protection:{open:()=>token('incorrect')}});
  const wrongJob = await queue.enqueue(wrong,timing);
  await unavailable.authorityFor(wrong)(wrongJob.id,noSend);
  assert.equal((await queue.enqueue(wrong,timing)).state,'cancelled');

  const badAad = await register('wrong-aad');
  const aadJob = await queue.enqueue(badAad,timing);
  const wrongAad = createNativeDeliveryQueue({...settings,protection:{open:(sealed,context)=>protection.open(sealed,context+'!')}});
  await wrongAad.authorityFor(badAad)(aadJob.id,noSend);
  assert.equal((await queue.enqueue(badAad,timing)).state,'cancelled');

  const inconsistent = await register('inconsistent');
  const inconsistentJob = await queue.enqueue(inconsistent,timing);
  await queue.authorityFor(inconsistent)(inconsistentJob.id,async()=>({state:'accepted_unconfirmed',providerAccepted:false,received:null}));
  assert.equal((await queue.enqueue(inconsistent,timing)).state,'uncertain');

  const before = await register('lost-before');
  const beforeJob = await queue.enqueue(before,timing);
  const lostClaim = createNativeDeliveryQueue({...settings,db:commitBoundary(1,async c=>{await c.commit();throw Error('fixture claim ACK lost');})});
  assert.equal((await sender(lostClaim,before)(beforeJob.id)).state,'blocked');
  assert.equal((await queue.enqueue(before,timing)).state,'dispatching');
  await createNativeDeliveryQueue(settings).authorityFor(before)(beforeJob.id,noSend);

  const after = await register('lost-after');
  const afterJob = await queue.enqueue(after,timing);
  const lostResult = createNativeDeliveryQueue({...settings,db:commitBoundary(2,async()=>{throw Error('fixture completion failed');})});
  assert.equal((await sender(lostResult,after)(afterJob.id)).state,'uncertain');
  assert.equal((await queue.enqueue(after,timing)).state,'dispatching');
  await createNativeDeliveryQueue(settings).authorityFor(after)(afterJob.id,noSend);
  assert.equal(requests,2,'both lost ACKs still permit only the single already-issued attempt');

  const locked = await register('locked');
  const lockedJob = await queue.enqueue(locked,timing);
  let releaseTransport, sawTransport, sawProfileQuery;
  const hold = new Promise(resolve=>{releaseTransport=resolve;});
  const started = new Promise(resolve=>{sawTransport=resolve;});
  const lookedUp = new Promise(resolve=>{sawProfileQuery=resolve;});
  const observeRevoke = {async getConnection() {
    const c = await registryDb.getConnection();
    return {...c,query(sql,params) {
      const result = c.query(sql,params);
      if (sql.startsWith('SELECT public_id FROM crewcheck_platform_profiles')) sawProfileQuery();
      return result;
    }};
  }};
  const finishing = sender(queue,locked,async()=>{sawTransport();await hold;})(lockedJob.id);
  await Promise.race([started,finishing.then(()=>{throw Error('fixture never reached transport');})]);
  const revocation = edit(locked,'revoke',observeRevoke);
  try {
    await Promise.race([lookedUp,revocation.then(()=>{throw Error('fixture never queried the profile');})]);
    assert.equal(await Promise.race([revocation.then(()=>false),new Promise(resolve=>setTimeout(()=>resolve(true),40))]),true,
      'revocation waits on the same profile lock while the bounded callback runs');
  } finally { releaseTransport(); }
  assert.equal((await finishing).state,'accepted_unconfirmed');
  assert.equal((await revocation).active,false);

  const erased = await register('erased');
  const erasedJob = await queue.enqueue(erased,timing);
  await assert.rejects(deleteNativeAccountWithRegistry(pool,erased.identity,async()=>{}),{code:'NATIVE_ACCOUNT_DELETION_NOT_CONFIRMED'});
  assert.equal((await queue.enqueue(erased,timing)).id,erasedJob.id,'rolled back deletion preserves queue');
  await deleteNativeAccountWithRegistry(pool,erased.identity,async c=>c.query('DELETE FROM crewcheck_platform_profiles WHERE email=?',[erased.identity.email]));
  const digest = crypto.createHash('sha256').update(erased.identity.ownerId).digest('hex');
  const [outbox] = await pool.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key LIKE ?',[`crewcheck-native-push:outbox:${digest}:%`]);
  assert.equal(outbox.length,0,'successful deletion erases job and dedupe state');
  await pool.query('INSERT INTO crewcheck_platform_profiles(email,public_id) VALUES(?,?)',[erased.identity.email,'delivery-owner-recreated']);
  await assert.rejects(queue.authorityFor(erased)(erasedJob.id,noSend),{code:'NATIVE_SESSION_REVOKED'});
  assert.equal(unexpected,0,'no rejected, stale or already claimed job reached the callback');

  const [stored] = await pool.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key LIKE ?',['crewcheck-native-push:outbox:%']);
  assert(stored.length>0);
  assert(stored.every(row=>!row.payload.includes('SYNTHETIC_DELIVERY_TOKEN')&&!row.payload.includes('@example.test')));
  console.log('PASS actual disposable MySQL delivery queue: durable claim, duplicate admission, rotation/revoke fence, token binding, lost commits, worker recreation and scoped cleanup; simulated transport only');
} finally { await pool.end(); }
