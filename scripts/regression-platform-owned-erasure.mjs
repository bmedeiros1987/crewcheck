import assert from 'node:assert/strict';import fs from 'node:fs';
import{platformOwnedErasureStatements}from'../server/platform-owned-erasure.mjs';
import{mysqlAdapter}from'../server/mysql-platform-adapter.mjs';
const A='erasure-a@example.invalid',B='erasure-b@example.invalid',C='erasure-c@example.invalid';
const statements=platformOwnedErasureStatements(A);assert.equal(statements.length,8);
for(const value of['',null,A+' ',"x' OR 1=1",A.toUpperCase()])assert.throws(()=>platformOwnedErasureStatements(value));
const migration=fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql','utf8'),tables=statements.map(([sql])=>sql.match(/^DELETE FROM (\w+)/)[1]);
for(const table of tables)assert(migration.includes('CREATE TABLE IF NOT EXISTS '+table));
if(process.env.TELEGRAM_BINDING_QA!=='isolated-mysql'){console.log('PASS scoped platform cleanup statement contract: 8 known tables, owner validation; MySQL execution not run');process.exit(0);}
const factory=await(await import('./fixtures/telegram-binding-mysql.mjs')).telegramBindingMysqlFactory(),f=await factory.make(),db=mysqlAdapter(f.pool);
let cases=0;
const insert=async(sql,p)=>f.pool.query(sql,p);
const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await f.pool.query('SELECT * FROM '+table+' ORDER BY '+(table.endsWith('routine_preferences')?'owner_email':'id')))[0]])));
async function cleanup({fail=false}={}){const c=await db.connect();try{await c.query('BEGIN');for(const [sql,p]of statements){await c.query(sql,p);if(fail&&sql.includes('gym_preferences'))throw Error('synthetic cleanup failure');}await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
try{
 for(const table of tables)await f.pool.query(migration.match(new RegExp('CREATE TABLE IF NOT EXISTS '+table+'[\\s\\S]*?;'))[0]);
 for(const [n,email]of[['a',A],['b',B]]){
  await insert("INSERT INTO crewcheck_platform_addresses(id,owner_email,label,address_kind,formatted_address) VALUES(?,?,?,'home',?)",[n,email,'SYNTHETIC','SYNTHETIC ADDRESS']);
  await insert('INSERT INTO crewcheck_platform_user_hotels(id,owner_email,hotel_name) VALUES(?,?,?)',[n,email,'SYNTHETIC HOTEL']);
  await insert('INSERT INTO crewcheck_platform_gym_preferences(id,owner_email,gym_key,gym_name) VALUES(?,?,?,?)',[n,email,'SYNTHETIC','SYNTHETIC GYM']);
  await insert("INSERT INTO crewcheck_platform_routine_preferences(owner_email,activities,constraints) VALUES(?,'[]','{}')",[email]);
  await insert("INSERT INTO crewcheck_platform_finance_configs(id,scope,owner_email,effective_from,salary_rules,per_diem_rules,created_by) VALUES(?,'user',?,'2026-01-01','{}','{}',?)",[n,email,email]);
  await insert("INSERT INTO crewcheck_platform_flight_follows(id,owner_email,flight_number,flight_date) VALUES(?,?,'CC101','2026-11-16')",[n,email]);
  await insert("INSERT INTO crewcheck_platform_swap_analyses(id,requester_email,roster_key,offered_duty,requested_duty,rules_version,result) VALUES(?,?,'2026-11','{}','{}','SYNTHETIC','{}')",[n,email]);
 }
 for(const [id,owner,peer]of[['owned-a',A,B],['peer-a',B,A],['unrelated',B,C]])await insert("INSERT INTO crewcheck_platform_schedule_comparisons(id,owner_email,peer_email,owner_roster_key,peer_roster_key,permissions,result) VALUES(?,?,?,'2026-11','2026-11','{}','{}')",[id,owner,peer]);
 for(const scope of['act','system'])await insert("INSERT INTO crewcheck_platform_finance_configs(id,scope,owner_email,effective_from,salary_rules,per_diem_rules,created_by) VALUES(?,?,NULL,'2026-01-01','{}','{}','SYNTHETIC_SYSTEM')",[scope,scope]);
 const before=await snapshot();await assert.rejects(cleanup({fail:true}));assert.deepEqual(await snapshot(),before);cases++;
 await cleanup();const after=await snapshot();for(const [table,rows]of Object.entries(after)){assert(!rows.some(r=>r.owner_email===A||r.requester_email===A||r.peer_email===A),table);assert(rows.some(r=>r.owner_email===B||r.requester_email===B),table);}assert.equal(after.crewcheck_platform_schedule_comparisons.length,1);assert.equal(after.crewcheck_platform_finance_configs.length,3);cases++;
 await cleanup();assert.deepEqual(await snapshot(),after);cases++;
 console.log(`PASS omitted platform-owned cleanup: ${cases} isolated MySQL scenarios across 8 actual migration tables; rollback, other owner/global tariffs preserved, comparison references removed, repeat stable; no route/full erasure or physical file cleanup attested`);
}finally{await factory.close();}
