import assert from 'node:assert/strict';
import {readOperationalHistoryScope as scope,recordOperationalGateObservation as record,readOperationalGateHistory as read} from '../../server/concierge/operational-history.mjs';
const NOW=Date.parse('2099-10-06T06:00:00Z'),email='history@example.invalid',owner='CC-SYNTHETIC-HISTORY';
export function fixture(){
 let now=NOW,revision=NOW-60000,publicId=owner,states=new Map();const queries=[],publications=[];
 const roster={year:2099,month:10,base:'GRU',rank:'CCM',rawText:'',days:[{date:'06/10/2099',dayNumber:6,month:10,year:2099,dayOfWeek:'',type:'VOO',pairingCode:'TEST123',dutyReport:'05:30',dutyDebrief:'10:00',isNextDay:false,continuityInferred:false,base:'GRU',rawText:'',legs:[{id:'synthetic-leg',flightNumber:'LA1234',origin:'GRU',destination:'BSB',departureTime:'06:30',arrivalTime:'08:30',workType:'OP'}]}]};
 async function query(sql,args){queries.push(sql);
  if(sql.startsWith('SELECT p.public_id'))return [[{public_id:publicId,must_change_password:0}]];
  if(sql.startsWith('SELECT id,owner_email,roster_key,roster,active,updated_at'))return [publications.length?publications:[{id:'synthetic-roster',owner_email:email,roster_key:`${roster.year}-${String(roster.month).padStart(2,'0')}`,roster,active:true,updated_at:new Date(revision).toISOString()}]];
  if(sql.startsWith('SELECT id FROM crewcheck_platform_rosters'))return [[{id:'synthetic-roster'}]];
  if(sql.includes('r.id,r.owner_email')){assert.match(sql,/FOR UPDATE$/);return [[{account_email:email,account_public_id:publicId,id:'synthetic-roster',owner_email:email,roster_key:`${roster.year}-${String(roster.month).padStart(2,'0')}`,roster,fingerprint:'a'.repeat(64),active:1,revision_seconds:revision/1000}]];}
  if(sql.startsWith('SELECT JSON_OBJECT')){
   const record=states.get(args.at(-1));if(!record)return [[]];
   if(sql.includes("'version'"))return [[{payload:Object.fromEntries(['version','email','owner','field','scope','source','conflict'].map(k=>[k,record[k]??null]))}]];
   const archiveKey=args[0].match(/archive\."([a-f0-9]+)"/)?.[1],entry=record.archive?.[archiveKey];
   if(!entry)return [[{payload:{email:record.email,owner:record.owner,identity:null}}]];
   const start=Number(args[2].match(/\[(\d+)\]/)?.[1]||0);
   return [[{payload:{email:record.email,owner:record.owner,identity:entry.identity,total:entry.observations.length,observations:entry.observations.slice(start,start+100)}}]];
  }
  if(sql.startsWith('SELECT payload')){assert.match(sql,/FOR UPDATE$/);const sqlJson=value=>Array.isArray(value)?value.map(sqlJson):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sqlJson(value[k])])):value;return [states.has(args[0])?[{payload:sqlJson(states.get(args[0]))}]:[]];}
  if(sql.startsWith('INSERT IGNORE INTO crewcheck_telegram_state')){if(!states.has(args[0]))states.set(args[0],JSON.parse(args[1]));return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO crewcheck_telegram_state')){states.set(args[0],JSON.parse(args[1]));return [{affectedRows:1}];}
  throw Error('Unexpected SQL '+sql);
 }
 const db={query,async getConnection(){let snapshot;return {query,async beginTransaction(){snapshot=structuredClone(states);},async commit(){snapshot=null;},async rollback(){if(snapshot){states.clear();for(const [key,value]of snapshot)states.set(key,value);}},release(){}};}};
 const context={email,owner};const opts=()=>({enabled:true,now,lockSource:true});
 return {db,context,states,queries,roster,publications,set now(v){now=v;},set revision(v){revision=v;},set owner(v){publicId=v;},
 scope:()=>scope(db,context,opts()),read:()=>read(db,context,opts()),
 async write(gate,offset,expectedScope,transform=x=>x){const current=expectedScope||await scope(db,context,opts());const i=current.identity;const at=NOW+offset;
  const observation={ok:true,provider:'custom',...i,gate,sourceReceivedAt:at+100,secret:'MUST_NOT_PERSIST',departureGateUpdate:{schema:'crewcheck.departure-gate-update.v1',...i,gate,updatedAt:new Date(at).toISOString(),secret:'MUST_NOT_PERSIST'}};
  return record(db,context,{expectedScope:current,field:'gate',observation:transform(observation)},{enabled:true,clock:()=>now});}
 };
}
