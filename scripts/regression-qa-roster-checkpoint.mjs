import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('client/src/lib/qaRosterCheckpoint.ts','utf8'),{compilerOptions:{target:99,module:99}}).outputText;
const {captureQaRosterCheckpoint:capture,verifyQaRosterCheckpoint:verify,rehearseQaRosterCheckpoint:restore}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const owner='synthetic-qa',reads=[],key='crewcheck_local_history_v11_'+owner;
function roster(month,base){return {crewId:'SYNTHETIC-001',crewName:'SYNTHETIC ONLY',year:2026,month,base,rank:'CC',airline:'SYNTHETIC',rawText:'SYNTHETIC FIXTURE NOT OPERATIONAL',days:[{date:`01/${String(month).padStart(2,'0')}/2026`,type:'CRM',dutyReport:'08:00',dutyDebrief:'09:00',legs:[],base},{date:`02/${String(month).padStart(2,'0')}/2026`,type:'DO',legs:[],base}]};}
for(const base of ['BSB','GRU','CGH']){
 const october=roster(10,base),november=roster(11,base),december=roster(12,base);
 const map=new Map([[key,JSON.stringify([{id:'oct',createdAt:'2026-10-01T00:00:00Z',sourceFileName:'SYNTHETIC.pdf',roster:october},{id:'dec',roster:december}])],['crewcheck_auth_token','DO_NOT_EXPORT_CREDENTIAL'],['crewcheck_local_history_v11_other-account','DO_NOT_READ_OTHER_ACCOUNT']]);
 const storage={getItem:k=>{reads.push(k);assert.equal(k,key);return map.get(k)||null;}};const session={owner,token:'synthetic-session-only',isCurrent:()=>true};const input={session,storage,periods:['2026-10','2026-11'],displayed:{roster:november,source:'SYNTHETIC DISPLAY'},build:'synthetic-checkpoint'};
 const snapshot=await capture(input),text=JSON.stringify(snapshot);assert(!/DO_NOT_|synthetic-session-only|other-account|2026-12/.test(text));assert.equal(snapshot.body.entries.length,2);assert.deepEqual(map.get('crewcheck_auth_token'),'DO_NOT_EXPORT_CREDENTIAL');
 const memory=await restore(text,owner);assert.deepEqual(memory.periods,['2026-10','2026-11']);assert.deepEqual(memory.read('2026-10')[0].roster,october);assert.deepEqual(memory.read('2026-11')[0].roster,november);memory.read('2026-11')[0].roster.base='MUTATED';assert.equal(memory.read('2026-11')[0].roster.base,base);assert.deepEqual(memory.read('2026-12'),[]);
 await assert.rejects(verify(text,'another-account'));const tampered=JSON.parse(text);tampered.body.entries[0].roster.base='XXX';await assert.rejects(verify(JSON.stringify(tampered),owner),/integridade/);
 await assert.rejects(capture({...input,periods:['2026-09','2026-11']}),/competência/);await assert.rejects(capture({...input,storage:{getItem(){throw Error('SYNTHETIC_BLOCKED');}}}));
 let fences=0;await assert.rejects(capture({...input,session:{...session,isCurrent:()=>++fences===1}}),/sessão mudou/);await assert.rejects(capture({...input,session:{...session,token:null}}),/sessão mudou/);
 await assert.rejects(capture({...input,displayed:{source:'SYNTHETIC',roster:{...november,token:'FORBIDDEN'}}}),/não permitido/);
 assert.equal(map.size,3,'capture/rehearsal cannot mutate or create application records');
}
const credentialFields=['access_token','ACCESS-TOKEN','refresh_token','client_secret','api_key','apiKey','id_token','bearer_token','jwt'];
const scoped={session:{owner,token:'SYNTHETIC_SESSION_ONLY',isCurrent:()=>true},storage:{getItem:k=>{assert.equal(k,key);return null;}},periods:['2026-11'],displayed:{source:'SYNTHETIC',roster:roster(11,'BSB')},build:'synthetic-checkpoint'};
for(const field of credentialFields){
 const unsafe={...roster(11,'BSB'),metadata:{[field]:'SYNTHETIC_CREDENTIAL_MUST_NOT_EXPORT'}};
 await assert.rejects(capture({...scoped,displayed:{source:'SYNTHETIC',roster:unsafe}}),/não permitido/,field+' displayed');
 await assert.rejects(capture({...scoped,storage:{getItem:k=>{assert.equal(k,key);return JSON.stringify([{roster:unsafe}]);}}}),/não permitido/,field+' history');
 const forged=await capture(scoped);forged.body.entries[0].roster.metadata={[field]:'SYNTHETIC_CREDENTIAL_MUST_NOT_EXPORT'};forged.sha256=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(forged.body)))).toString('hex');
 await assert.rejects(verify(JSON.stringify(forged),owner),/não permitido/,field+' reopened despite matching checksum');
}
assert(reads.length>0);console.log('PASS QA checkpoint: exact own-key reads only, Oct/Nov BSB/GRU/CGH roundtrip in memory, integrity/account/session/storage failures, 9 standard credential-key variants refused in displayed/history/reopened data, no credential export or account/cloud writes; synthetic only');
