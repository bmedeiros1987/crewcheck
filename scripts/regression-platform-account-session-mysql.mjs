import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import mysql from 'mysql2/promise';
import ts from 'typescript';
import { accountSessionClaims, readAccountSessionProfile } from '../server/account-session.mjs';
import { createBillingAdmission } from '../server/billing-admission.mjs';
import { mysqlAdapter } from '../server/mysql-platform-adapter.mjs';
import { PLATFORM_PLAN_IDS, readPlatformEntitlement } from '../server/platform-entitlement.mjs';
import { withTransaction } from '../server/profile-locks.mjs';
import { issueJwt, requestToken, sendJson, userFromProfile, verifyJwt } from '../server/v139/common.mjs';
import { verifiedStayLease } from '../shared/stay-alarm-lease-policy.mjs';

const root = process.env.CREWCHECK_BILLING_INTENT_QA_ROOT;
assert.equal(process.env.CREWCHECK_BILLING_INTENT_QA, 'isolated-mysql');
assert.match(root || '', /^\/tmp\/crewcheck-billing-intent-qa\.[A-Za-z0-9]{8}$/);
assert.equal(fs.realpathSync(root), root);
assert.equal(fs.readFileSync(path.join(root, '.owned-qa'), 'utf8').trim(), 'billing-intent-qa-owned');
const database = 'crewcheck_account_session_qa';
const native = mysql.createPool({socketPath:path.join(root,'mysql.sock'),user:'root',password:'',database,connectionLimit:12,dateStrings:true});
const db = mysqlAdapter(native);
const secret = 'synthetic-account-generation-test-only';
process.env.CREWCHECK_AUTH_SECRET = secret;
process.env.CREWCHECK_AUTH_REQUIRED = 'false'; // No email-header fallback for these reads.
process.env.CREWCHECK_ADMIN_EMAILS = 'admin-account@example.invalid';
process.env.CREWCHECK_TRUST_LEGACY_PREMIUM_PROFILE = 'false';
let attemptedNetwork = 0;
globalThis.fetch = () => { attemptedNetwork++; throw Error('Provider network disabled'); };
const owner = 'session-owner@example.invalid';
const other = 'session-other@example.invalid';
const oldId = 'CC-SYNTH-OLD';
const newId = 'CC-SYNTH-NEW';

function loadFunctions(file, names, constants, dependencies, entry) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file,'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  const declarations = ast.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => constants.includes(item.name.getText(ast))));
  assert.equal(functions.length,names.length);
  assert.equal(declarations.length,constants.length);
  const source = [...declarations, ...functions].map(node => node.getText(ast).replace(/^export /,'')).join('\n');
  return new Function(...Object.keys(dependencies), `${source}\nreturn ${entry};`)(...Object.values(dependencies));
}

function quotaRoute(currentMonthKey) {
  return loadFunctions('server/platform.mjs', [
    'env','authSecret','verifyJwt','requestToken','safeEmail','platformAdmin','platformAccountSession','assertCurrentAccount',
    'withCurrentAccount','accountBillingProfile','subscriptionStatus','consumePlatformUsage','refundPlatformUsage','refundTelegramQuota',
  ], ['quotaReservations'], {
    pool: async()=>db, crypto, accountSessionClaims, readAccountSessionProfile, withTransaction, readPlatformEntitlement,
    currentMonthKey, planLimit:()=>1, unlimitedEmails:()=>[],
    ensureProfile: () => assert.fail('HTTP quota must use the signed generation without creating a profile'),
  }, '{consumePlatformUsage,refundPlatformUsage}');
}

function platformRoute(databaseProvider = async () => db, effects = {}) {
  return loadFunctions('server/platform.mjs', [
    'env','authSecret','verifyJwt','requestToken','safeEmail','platformAdmin','platformAccountSession','normalizeText',
    'readBody','ensureProfile','publicProfile','subscriptionStatus','withAccountProfile','handleProfile','handleBillingStatus',
    'assertCurrentAccount','withCurrentAccount','accountBillingProfile','requireBillingAccount','handleGooglePurchase','handleAsaasCheckout',
    'handleBillingCancel','accountDeletionSubscription','handleAccountDeletion','handleAdminUnlimited','sha256',
    'enforcePlatformMethod','handlePlatformRoute',
  ], ['PLATFORM_METHOD_POLICIES'], {
    pool:databaseProvider, crypto, accountSessionClaims, readAccountSessionProfile, withTransaction, sendJson, createBillingAdmission,
    PLAN_IDS:PLATFORM_PLAN_IDS, readPlatformEntitlement, normalizeTimezone: value => value || 'UTC',
    normalizeLocale: value => value || 'pt-BR', DEFAULT_TIMEZONE:'UTC', unlimitedEmails:() => [],
    currentMonthKey: () => '2032-11', planLimit:plan => plan === 'free' ? 1 : 60,
    planCatalog:() => [{id:'free'},{id:'premium_monthly',value:19.90},{id:'premium_annual',value:179.90}],
    RELEASE_JOURNAL_PATH:null, FINANCIAL_FX_PATH:null, FINANCIAL_LEDGER_PATH:null, FINANCIAL_UPCOMING_PATH:null, FINANCIAL_CAPTURE_PATH:null,
    publicId: () => assert.fail('Protected routes must not generate an unexpected profile ID'),
    GOOGLE_PLAY_PRODUCTS: new Map([['synthetic.monthly','premium_monthly']]),
    verifyGooglePlaySubscription: () => assert.fail('Unexpected mock Google verification'),
    asaasRequest: () => assert.fail('Unexpected mock Asaas request'),
    ...effects,
  }, 'handlePlatformRoute');
}

function authRoute(databaseProvider = async () => native) {
  return loadFunctions('server/v139/auth.mjs', ['normalizeCrewFunction','me','handleAuthRoute'], ['CREW_FUNCTIONS'], {
    accountSessionClaims, readAccountSessionProfile, mysqlAdapter, verifyJwt, requestToken, verifiedStayLease,
    withTransaction, sendJson, userFromProfile, dbPool:databaseProvider, cleanText: (value,max) => String(value).trim().slice(0,max),
  }, 'handleAuthRoute');
}

function signedClaims(changes) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = encode({alg:'HS256',typ:'JWT'}) + '.' + encode({email:owner,sub:newId,iss:'crewcheck',aud:'crewcheck-web',exp:Math.floor(Date.now()/1000)+600,...changes});
  return payload + '.' + crypto.createHmac('sha256',secret).update(payload).digest('base64url');
}

async function call(route, endpoint, token, { method = 'GET', body, headers = {} } = {}) {
  const req = body === undefined ? {} : Readable.from([JSON.stringify(body)]);
  Object.assign(req,{method,headers:{...headers,...(token ? {authorization:'Bearer '+token} : {})}});
  const res = {
    headers:{}, setHeader(key,value){this.headers[key.toLowerCase()] = value;},
    writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},
    end(payload){this.body=JSON.parse(payload);},
  };
  assert.equal(await route(req,res,new URL('https://example.invalid'+endpoint)),true);
  assert.equal(res.headers['cache-control'],'no-store');
  return res;
}

function authenticated(res) {
  assert.equal(res.status,200);
  assert.equal(res.body.ok,true);
  assert.equal(res.body.token,undefined);
  assert.equal(res.headers['set-cookie'],undefined);
  return res.body;
}

function rejected(res) {
  assert.equal(res.status,401);
  assert.equal(res.body.code,'AUTH_REQUIRED');
  for (const field of ['billing','profile','user','usage','stayAlarmLease','token','plans']) assert.equal(res.body[field],undefined);
  assert.equal(res.headers['set-cookie'],undefined);
}

async function seed(email,id,displayName,plan='free') {
  await native.execute('INSERT INTO crewcheck_platform_profiles(email,public_id,display_name,plan) VALUES(?,?,?,?)',[email,id,displayName,plan]);
  if (plan !== 'free') {
    await native.execute("INSERT INTO crewcheck_platform_subscriptions(email,provider,plan,status,product_id,current_period_end) VALUES(?,'asaas',?,'active','synthetic.product','2099-01-01 00:00:00')",[email,plan]);
    await native.execute("INSERT INTO crewcheck_platform_usage(email,month_key,usage_kind,used) VALUES(?,'2032-11','wakeup_call',5)",[email]);
  }
}

async function erase(email) {
  for (const table of ['crewcheck_platform_usage','crewcheck_platform_subscriptions','crewcheck_platform_profiles']) {
    await native.execute(`DELETE FROM ${table} WHERE email=?`,[email]);
  }
}

function pauseAfterProfileRead(onRead) {
  return {
    getConnection:async () => {
      const connection = await native.getConnection();
      return {
        async query(sql, bindings) {
          const result = await connection.query(sql, bindings);
          if (sql.startsWith('SELECT * FROM crewcheck_platform_profiles') && !sql.includes(' FOR ') && bindings?.[0]===owner) {
            await onRead();
          }
          return result;
        },
        release: () => connection.release(), destroy: () => connection.destroy(),
      };
    },
  };
}

const billing = '/api/platform/billing/status';
const profile = '/api/platform/profile';
const me = '/api/auth/me';
const platform = platformRoute();
const auth = authRoute();
const tokenFor = (id,email=owner) => issueJwt({id,email,role:'free',plan:'free'});

try {
  const [[where]] = await native.query('SELECT DATABASE() AS name, @@datadir AS datadir');
  assert.equal(where.name,database);
  assert.equal(path.resolve(where.datadir),path.join(root,'data'));
  const ddl = fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql','utf8');
  for (const table of ['crewcheck_platform_profiles','crewcheck_platform_subscriptions','crewcheck_platform_usage']) {
    await native.query(ddl.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}[\\s\\S]*?;`))[0]);
  }
  await native.query('CREATE TABLE crewcheck_platform_accounts(email VARCHAR(254) PRIMARY KEY,must_change_password TINYINT(1)) ENGINE=InnoDB');

  await seed(owner,oldId,'Original synthetic');
  await seed(other,'CC-SYNTH-OTHER','Unrelated synthetic','premium_annual');
  const original = tokenFor(oldId);
  const obsolete = signedClaims({sub:Buffer.from(owner).toString('base64url').slice(0,18)});
  assert.equal(authenticated(await call(platform,billing,original)).plan,'free');
  assert.equal(authenticated(await call(auth,me,original)).user.rank,null);
  assert.equal((await native.query("SHOW TABLES LIKE 'crewcheck_platform_profile_functions'"))[0].length,0,'refresh must not create optional schema');
  for (const [handler,url] of [[platform,billing],[platform,profile],[auth,me]]) rejected(await call(handler,url,obsolete));
  console.log('PASS current session before erasure and ambiguous legacy session without identity binding rejected.');

  await erase(owner);
  for (const [handler,url] of [[platform,billing],[platform,profile],[auth,me]]) rejected(await call(handler,url,original));
  assert.equal((await native.execute('SELECT email FROM crewcheck_platform_profiles WHERE email=?',[owner]))[0].length,0,'old reads must not resurrect the profile');

  await seed(owner,newId,'Replacement synthetic','premium_monthly');
  await native.execute('INSERT INTO crewcheck_platform_accounts(email,must_change_password) VALUES(?,1)',[owner]);
  await native.query('CREATE TABLE crewcheck_platform_profile_functions(email VARCHAR(254) PRIMARY KEY,crew_function VARCHAR(64)) ENGINE=InnoDB');
  await native.execute('INSERT INTO crewcheck_platform_profile_functions(email,crew_function) VALUES(?,?)',[owner,'Copiloto']);
  const current = tokenFor(newId);
  for (const [handler,url] of [[platform,billing],[platform,profile],[auth,me]]) {
    for (const old of [original,obsolete,tokenFor('CC-SYNTH-OTHER'),tokenFor(newId,other),tokenFor(newId.toLowerCase())]) rejected(await call(handler,url,old));
  }
  rejected(await call(platform,profile,original,{method:'PATCH',body:{displayName:'Old session edit'}}));
  const fresh = authenticated(await call(platform,profile,current,{method:'PATCH',body:{displayName:'Current session edit',timezone:'UTC'}}));
  assert.equal(fresh.profile.publicId,newId);
  assert.equal(fresh.profile.displayName,'Current session edit');
  assert.equal(fresh.billing.usage.used,5);
  const who = authenticated(await call(auth,me,current));
  assert.equal(who.user.id,newId);
  assert.equal(who.user.mustChangePassword,true);
  assert.equal(who.user.rank,'Copiloto');
  assert.ok(who.stayAlarmLease?.sessionExpiresAt > who.stayAlarmLease?.serverNow);
  console.log('PASS erasure/recreation, nonmatching IDs, old refresh/PATCH, canonical rank/lease/entitlement and no cookie or token refresh.');

  const secondDevice = signedClaims({sub:newId,iat:Math.floor(Date.now()/1000)-1});
  const parallel = await Promise.all([current,secondDevice,original,obsolete].flatMap(ticket => [billing,profile,me].map(endpoint =>
    call(endpoint===me ? auth : platform,endpoint,ticket).then(response => ({ticket,response}))
  )));
  for (const {ticket,response} of parallel) (ticket === current || ticket === secondDevice ? authenticated : rejected)(response);
  const cookie = 'crewcheck_auth_token='+encodeURIComponent(current);
  assert.equal(authenticated(await call(platform,billing,null,{headers:{cookie}})).plan,'premium_monthly');
  for (const claims of [{aud:'crewcheck-visitor',role:'visitor'},{iss:'unrelated'},{sub:null},{exp:1},{exp:'9999999999'}]) {
    const invalid = signedClaims(claims);
    rejected(await call(platform,billing,invalid));
    rejected(await call(auth,me,invalid));
  }
  rejected(await call(platform,billing,null,{headers:{'x-crewcheck-email':owner}}));
  rejected(await call(platform,billing,null,{headers:{cookie:'crewcheck_auth_token=%broken'}}));
  assert.equal((await call(platformRoute(async()=>null),billing,current)).body.code,'DATABASE_OFFLINE');
  assert.equal((await call(authRoute(async()=>null),me,current)).status,503);
  console.log('PASS concurrent valid multi-device and invalid prior generation reads, legacy cookie, expiry, visitor, header and outage responses.');

  const races = [billing,profile,me];
  for (const [i,endpoint] of races.entries()) {
    const previous = (await native.execute('SELECT public_id FROM crewcheck_platform_profiles WHERE email=?',[owner]))[0][0].public_id;
    const raceDb = pauseAfterProfileRead(async () => {
      await erase(owner);
      await seed(owner,`CC-RACE-${i}`,`Replacement ${i}`,'premium_annual');
    });
    const route = endpoint === me ? authRoute(async()=>raceDb) : platformRoute(async()=>mysqlAdapter(raceDb));
    rejected(await call(route,endpoint,tokenFor(previous)));
    const latest = authenticated(await call(platform,profile,tokenFor(`CC-RACE-${i}`)));
    assert.equal(latest.profile.publicId,`CC-RACE-${i}`);
    assert.equal(latest.billing.plan,'premium_annual');
  }
  // Exercise the mounted dispatcher with an authenticated canonical current ID and synthetic stale authority.
  const routeCases = [
    ['/api/platform/billing/google-play/verify',{productId:'synthetic.monthly',purchaseToken:'QA_ONLY'}],
    ['/api/platform/billing/asaas/checkout',{plan:'premium_monthly',cpfCnpj:'00000000000'}],
    ['/api/platform/billing/cancel',{}],
    ['/api/platform/admin/unlimited',{email:other}],
    ['/api/platform/account/delete',{confirmation:'EXCLUIR'}],
  ];
  for (const [url,body] of routeCases) {
    for (const old of [original,obsolete,tokenFor('CC-RACE-2',other),null]) {
      rejected(await call(platform,url,old,{method:'POST',body:{...body,email:other},headers:{'x-crewcheck-email':owner}}));
    }
  }
  const ownerPlan = async () => (await native.execute('SELECT plan FROM crewcheck_platform_profiles WHERE email=?',[owner]))[0][0].plan;
  assert.equal(await ownerPlan(),'premium_annual');
  const replaced = tokenFor('CC-RACE-2');
  const verifyExpired = platformRoute(async()=>db,{verifyGooglePlaySubscription:async () => {
    // Replacing the profile while the simulated provider read is in flight
    // must disqualify its old owner from obtaining any purchase response.
    await erase(owner);
    await seed(owner,'CC-FINAL-QA','New synthetic generation');
    return {payload:{externalAccountIdentifiers:{obfuscatedExternalAccountId:'CC-RACE-2'}}};
  }, saveGoogleSubscription: async (store,email,_token,_verified,expectedId) => {
    const profile = await readAccountSessionProfile(store,{email,publicId:expectedId});
    if (!profile) throw Object.assign(Error('Synthetic identity removed'),{code:'GOOGLE_ACCOUNT_MISMATCH',status:409});
    assert.fail('No write for a profile generation that no longer exists');
  }});
  const late = await call(verifyExpired,routeCases[0][0],replaced,{method:'POST',body:routeCases[0][1]});
  assert.equal(late.status,409);
  assert.equal(late.body.needsAcknowledgement,undefined);
  assert.equal(await ownerPlan(),'free');
  const finalToken = tokenFor('CC-FINAL-QA');
  assert.equal(authenticated(await call(platform,billing,finalToken)).plan,'free');
  assert.equal((await call(platform,routeCases[3][0],finalToken,{method:'POST',body:{email:other}})).status,403);
  const quotaMonth = '2032-12';
  let month = quotaMonth;
  const quota = quotaRoute(() => month);
  const quotaRequest = token => ({headers:{authorization:'Bearer '+token}});
  const liveQuotaRequest = quotaRequest(finalToken);
  const usedFor = async monthKey => Number((await native.execute('SELECT used FROM crewcheck_platform_usage WHERE email=? AND month_key=? AND usage_kind=?',[owner,monthKey,'wakeup_call']))[0][0]?.used || 0);
  const staleReservation = await quota.consumePlatformUsage(quotaRequest(replaced));
  assert.equal(staleReservation.status,401);
  assert.equal(await usedFor(quotaMonth),0);
  assert.equal((await quota.consumePlatformUsage(liveQuotaRequest)).allowed,true);
  assert.equal(await usedFor(quotaMonth),1);
  assert.equal((await quota.refundPlatformUsage(quotaRequest(finalToken))).refunded,false);
  assert.equal((await quota.consumePlatformUsage(quotaRequest(finalToken))).status,429);
  month = '2033-01';
  assert.equal((await quota.refundPlatformUsage(liveQuotaRequest)).monthKey,quotaMonth);
  assert.equal((await quota.refundPlatformUsage(liveQuotaRequest)).refunded,false);
  assert.equal(await usedFor(quotaMonth),0);
  assert.equal((await quota.consumePlatformUsage(liveQuotaRequest)).allowed,true);
  await erase(owner);
  await seed(owner,'CC-QUOTA-NEW','Replacement quota');
  const replacementQuota = quotaRequest(tokenFor('CC-QUOTA-NEW'));
  assert.equal((await quota.consumePlatformUsage(replacementQuota)).allowed,true);
  assert.equal((await quota.refundPlatformUsage(liveQuotaRequest)).refunded,false);
  assert.equal(await usedFor(month),1);
  assert.equal((await quota.refundPlatformUsage(replacementQuota)).refunded,true);
  assert.equal(await usedFor(month),0);
  console.log('PASS HTTP quota rejects stale admission, compensates the original month once and leaves replacement quota intact.');
  console.log('PASS 20 mounted billing write authority cases, provider-read replacement, and legitimate recovery on current generation.');
  await native.execute(
    "INSERT INTO crewcheck_platform_subscriptions(email,provider,plan,status,provider_ref) VALUES(?,'asaas','premium_monthly','canceled','sub_QA_SAME')",
    [owner],
  );
  const reactivatedDuringDeletion = {
    ...db,
    connect:async() => {
      const client=await db.connect();
      let capturedSubscription = false;
      return {...client, async query(sql, params) {
        const result = await client.query(sql, params);
        if (sql.startsWith('SELECT provider,provider_ref,status') && !sql.endsWith('FOR UPDATE')) capturedSubscription=true;
        if (capturedSubscription && sql==='COMMIT') {
          await native.execute("UPDATE crewcheck_platform_subscriptions SET status='active' WHERE email=?",[owner]);
          capturedSubscription=false;
        }
        return result;
      }};
    },
  };
  const deletionRoute = platformRoute(async()=>reactivatedDuringDeletion, {
    eraseWhatsAppAccountState: () => assert.fail('State must survive a changed cancellation precondition'),
  });
  const refused = await call(deletionRoute,routeCases[4][0],tokenFor('CC-QUOTA-NEW'),{method:'POST',body:routeCases[4][1]});
  assert.equal(refused.status,409);
  assert.equal(refused.body.code,'BILLING_PROVIDER_RECONCILIATION_REQUIRED');
  assert.equal((await native.execute('SELECT status FROM crewcheck_platform_subscriptions WHERE email=?',[owner]))[0][0].status,'active');
  assert.equal(await ownerPlan(),'free');
  console.log('PASS account deletion stops before cleanup when its cancellation precondition changes on the same contract.');

  const checkout = '/api/platform/billing/asaas/checkout';
  const monthly = { plan:'premium_monthly', cpfCnpj:'00000000000' };
  const submitCheckout = (route, token, body = monthly) => call(route, checkout, token, { method:'POST', body });
  const intentFor = async email => (await native.execute(
    'SELECT operation_id,state,provider_ref FROM crewcheck_billing_contracting_intents WHERE owner_email=?', [email],
  ))[0][0];
  const subscriptionFor = async email => (await native.execute(
    'SELECT plan,status,provider_ref FROM crewcheck_platform_subscriptions WHERE email=?', [email],
  ))[0][0];
  const checkoutAccount = async label => {
    const email = `checkout-${label.toLowerCase()}@example.invalid`;
    const publicId = `CC-CHECKOUT-${label}`;
    await seed(email,publicId,'Synthetic Checkout');
    return { email, publicId, token:tokenFor(publicId,email) };
  };
  const missing = await checkoutAccount('MISSING');
  const missingSchemaCheckout = platformRoute(async () => db, {
    asaasRequest: async (url, options) => {
      if (options?.method === 'POST') attemptedNetwork++;
      assert.ok(url.startsWith('/customers?'));
      return { data:[] };
    },
  });
  assert.equal((await submitCheckout(missingSchemaCheckout,missing.token)).body.code,'CHECKOUT_CONFIRMATION_UNCERTAIN');
  assert.equal(await subscriptionFor(missing.email),undefined);
  assert.equal(attemptedNetwork,0,'missing schema must block every provider write');
  const checkoutDdl = fs.readFileSync('migrations/20261115_022_billing_contracting_intents_mysql.sql','utf8');
  const intentStatements = checkoutDdl.match(/CREATE TABLE IF NOT EXISTS [\s\S]*?;/g);
  assert.equal(intentStatements.length,2);
  for (const statement of intentStatements) await native.query(statement);

  const racingCheckout = await checkoutAccount('PARALLEL');
  let enteredCustomerWrite, releaseCustomerWrite;
  const customerWriteStarted = new Promise(resolve => { enteredCustomerWrite=resolve; });
  const waitForContenders = new Promise(resolve => { releaseCustomerWrite=resolve; });
  const dispatched = [];
  const parallelRoute = platformRoute(async () => db, {
    asaasRequest: async (url, options) => {
      if (options?.method !== 'POST') {
        assert.ok(url.startsWith('/customers?') || url.startsWith('/subscriptions/sub_QA_CHECKOUT'));
        return { data:[] };
      }
      dispatched.push(url);
      assert.equal((await intentFor(racingCheckout.email)).state,'dispatching','claim is visible on another connection before the provider write');
      if (url === '/customers') {
        enteredCustomerWrite();
        await waitForContenders;
        return { id:'cus_QA_CHECKOUT',externalReference:racingCheckout.publicId };
      }
      assert.equal(url,'/subscriptions');
      assert.equal(JSON.parse(options.body).cycle,'MONTHLY');
      return { id:'sub_QA_CHECKOUT' };
    },
  });
  const firstCheckout = submitCheckout(parallelRoute,racingCheckout.token);
  await Promise.race([customerWriteStarted,firstCheckout.then(() => assert.fail('First checkout should reach the held customer write'))]);
  try {
    const samePlan = await submitCheckout(parallelRoute,racingCheckout.token);
    assert.equal(samePlan.status,202);
    assert.equal(samePlan.body.code,'CHECKOUT_IN_PROGRESS');
    assert.equal(samePlan.body.checkoutUrl,null);
    const otherPlan = await submitCheckout(parallelRoute,racingCheckout.token,{ ...monthly,plan:'premium_annual' });
    assert.equal(otherPlan.status,409);
    assert.equal(otherPlan.body.code,'BILLING_PROVIDER_RECONCILIATION_REQUIRED');
    assert.deepEqual(dispatched,['/customers']);
  } finally {
    releaseCustomerWrite();
  }
  assert.equal((await firstCheckout).body.checkoutState,'pending');
  assert.deepEqual(dispatched,['/customers','/subscriptions']);
  const finished = await intentFor(racingCheckout.email);
  assert.equal(finished.state,'created');
  assert.equal(finished.provider_ref,'sub_QA_CHECKOUT');
  assert.equal((await subscriptionFor(racingCheckout.email)).status,'pending');
  const reused = await submitCheckout(parallelRoute,racingCheckout.token);
  assert.equal(reused.body.reused,true);
  assert.deepEqual(dispatched,['/customers','/subscriptions']);
  console.log('PASS mounted Asaas checkout commits admission before all provider writes, serializes competing plans and safely reuses pending checkout.');

  for (const label of ['TIMEOUT','INSERT']) {
    const account = await checkoutAccount(label);
    const providerRef = `sub_QA_${label}`;
    const faultDb = label === 'TIMEOUT' ? db : {
      ...db,
      async connect() {
        const connection = await db.connect();
        return { ...connection, async query(sql,params) {
          if (sql.startsWith('INSERT INTO crewcheck_platform_subscriptions')) throw Error('Synthetic pending insert failure');
          return connection.query(sql,params);
        } };
      },
    };
    let writes = 0;
    const faultRoute = platformRoute(async () => faultDb, {
      asaasRequest: async (url, options) => {
        if (options?.method !== 'POST') {
          assert.ok(url.startsWith('/customers?'));
          return { data:[{ id:'cus_QA_EXISTING',externalReference:account.publicId }] };
        }
        writes++;
        assert.equal(url,'/subscriptions');
        assert.equal((await intentFor(account.email)).state,'dispatching');
        if (label === 'TIMEOUT') throw Error('Synthetic provider response lost after dispatch');
        return { id:providerRef };
      },
    });
    for (let attempt=0;attempt<2;attempt++) {
      const result = await submitCheckout(faultRoute,account.token);
      assert.equal(result.status,503);
      assert.equal(result.body.code,'CHECKOUT_CONFIRMATION_UNCERTAIN');
      assert.equal(result.body.checkoutUrl,null);
    }
    assert.equal(writes,1,'retry must not repeat an uncertain or recorded provider write');
    assert.equal(await subscriptionFor(account.email),undefined);
    const evidence = await intentFor(account.email);
    assert.equal(evidence.state,label === 'TIMEOUT' ? 'uncertain' : 'created');
    assert.equal(evidence.provider_ref,label === 'TIMEOUT' ? null : providerRef);
    const [[entries]] = await native.execute(
      'SELECT COUNT(*) AS count FROM crewcheck_billing_intent_evidence WHERE operation_id=?', [evidence.operation_id],
    );
    assert.equal(Number(entries.count),1);
    const billingAfterError = authenticated(await call(platform,billing,account.token));
    assert.equal(billingAfterError.premiumAccess,false);
  }
  console.log('PASS timeout and failed local insert retain evidence, never repeat provider dispatch and never grant Premium.');

  const replacedDuringCheckout = await checkoutAccount('REPLACED');
  const replacementId = 'CC-CHECKOUT-NEW';
  const replacementWrites = [];
  const replacementRoute = platformRoute(async () => db, {
    asaasRequest: async (url, options) => {
      if (options?.method !== 'POST') return { data:[] };
      replacementWrites.push(url);
      assert.equal(url,'/customers');
      assert.equal((await intentFor(replacedDuringCheckout.email)).state,'dispatching');
      await erase(replacedDuringCheckout.email);
      await seed(replacedDuringCheckout.email,replacementId,'Recreated synthetic account');
      return { id:'cus_QA_OLD_GENERATION',externalReference:replacedDuringCheckout.publicId };
    },
  });
  rejected(await submitCheckout(replacementRoute,replacedDuringCheckout.token));
  const replacementToken = tokenFor(replacementId,replacedDuringCheckout.email);
  assert.equal((await submitCheckout(replacementRoute,replacementToken)).body.code,'CHECKOUT_CONFIRMATION_UNCERTAIN');
  assert.deepEqual(replacementWrites,['/customers']);
  assert.equal(await subscriptionFor(replacedDuringCheckout.email),undefined);
  assert.equal((await intentFor(replacedDuringCheckout.email)).state,'uncertain');
  console.log('PASS replacement between provider writes stops subscription dispatch and keeps old evidence isolated.');
  assert.equal(attemptedNetwork,0);
  console.log('PASS replacement committed during each in-flight billing, profile or me read: no replacement data from old session; local MySQL only.');
} finally {
  await native.end();
}
