import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { createPilotPoolLifecycle } from '../server/tv/scoped-pool.mjs';
const uri=process.env.TV_TEST_DATABASE_URL;
if(!uri)throw Error('TV_TEST_DATABASE_URL required');
const url=new URL(uri);
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/crewcheck_tv_test')throw Error('Only the isolated loopback test database is allowed');
const options={host:url.hostname,port:Number(url.port||3306),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:'crewcheck_tv_test'};
const lifecycle=createPilotPoolLifecycle({createNative:opts=>mysql.createPool(opts),initialize:async native=>{await native.query('SELECT 1');return native;}});
const pool=await lifecycle.get(uri,options);assert.ok(pool);
try{
 const results=await Promise.all(Array.from({length:8},()=>pool.query('SELECT CONNECTION_ID() AS id')));
 const ids=results.map(([rows])=>rows[0].id);assert.equal(new Set(ids).size,1);
 await new Promise(resolve=>setTimeout(resolve,7200));
 const [rows]=await pool.query('SELECT CONNECTION_ID() AS id');assert.notEqual(rows[0].id,ids[0]);
 console.log('PASS real MySQL: eight concurrent reads used one connection; idle connection closed and later recreated.');
}finally{await pool.end();}
let failed;
const broken=createPilotPoolLifecycle({createNative:opts=>(failed=mysql.createPool(opts)),initialize:async native=>{await native.query('SELECT 1');throw Error('intentional-schema-probe-failure');}});
assert.equal(await broken.get(uri,options),null);await assert.rejects(failed.query('SELECT 1'));
console.log('PASS real MySQL: initialization failure closes an already connected pool.');
