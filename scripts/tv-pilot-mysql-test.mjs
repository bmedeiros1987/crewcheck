import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { createPilotStore } from '../server/tv/pilot-store.mjs';
import { createDeviceService } from '../server/tv/devices.mjs';
const uri = process.env.TV_TEST_DATABASE_URL;
if (!uri) throw Error('TV_TEST_DATABASE_URL required');
const url = new URL(uri);
if (!['127.0.0.1','localhost'].includes(url.hostname) || url.pathname !== '/crewcheck_tv_test') throw Error('Test database must be loopback/crewcheck_tv_test');
const pool = mysql.createPool({uri, connectionLimit:12});
function adapter(raw, release) {
  return {async query(sql, params=[]) {
    const ordered=[]; const translated=sql.replace(/\$(\d+)/g, (_,n)=>{ordered.push(params[Number(n)-1]);return '?';});
    const [rows]=await raw.query(translated,ordered);
    return {rows:Array.isArray(rows)?rows:[]};
  },release:release||(()=>{})};
}
const db=adapter(pool); db.connect=async()=>{const c=await pool.getConnection();return adapter(c,()=>c.release());};
const store=createPilotStore(async()=>db);
try {
  await store.initialize(); await store.initialize(); await store.check();
  await store.transaction(s=>{s.testCounter=0;});
  await Promise.all(Array.from({length:10},()=>store.transaction(async s=>{const n=s.testCounter;await new Promise(r=>setTimeout(r,3));s.testCounter=n+1;})));
  assert.equal(await store.transaction(s=>s.testCounter),10);
  await assert.rejects(store.transaction(s=>{s.testCounter=999;throw Error('rollback');}));
  assert.equal(await store.transaction(s=>s.testCounter),10);
  const devices=createDeviceService({store,pairingOrigin:'https://pilot.example.test',accountAllowed:id=>id==='pilot@example.test'});
  const code=await devices.begin('lg-webos');await devices.approve('pilot@example.test',code.userCode);
  const results=await Promise.allSettled([devices.poll(code.deviceCode),devices.poll(code.deviceCode)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const c=results.find(r=>r.status==='fulfilled').value;
  assert.equal((await devices.authorize(c.token)).userId,'pilot@example.test');
  await devices.revoke('pilot@example.test',c.deviceId);
  await assert.rejects(devices.authorize(c.token),e=>e.status===401);
  console.log('MySQL real: concurrent transactions, rollback, atomic single-use pairing and revocation PASS.');
} finally {await pool.end();}
